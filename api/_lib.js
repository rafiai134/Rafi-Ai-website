// Shared helpers. Files starting with "_" are NOT public routes on Vercel.

const mem = (globalThis.__rafi = globalThis.__rafi || {});
const KV_URL = process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const hasKV = Boolean(KV_URL && KV_TOKEN);

export function config() {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY),
    storage: hasKV,
    whatsapp: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
    shopify: Boolean(process.env.SHOPIFY_STORE && process.env.SHOPIFY_TOKEN)
  };
}

/* ---------- AUTH ---------- */
export function auth(req, res) {
  const token = req.headers["x-admin-token"];
  if (!process.env.ADMIN_TOKEN) {
    res.status(500).json({ error: "ADMIN_TOKEN is not set on the server." });
    return false;
  }
  if (token !== process.env.ADMIN_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/* ---------- STORAGE (Upstash Redis, falls back to memory) ---------- */
async function kv(cmd) {
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(cmd)
  });
  return r.json();
}

export async function kvGet(key, fallback = null) {
  if (!hasKV) return mem[key] ?? fallback;
  const j = await kv(["GET", key]);
  return j.result ? JSON.parse(j.result) : fallback;
}

export async function kvSet(key, value) {
  if (!hasKV) {
    mem[key] = value;
    return;
  }
  await kv(["SET", key, JSON.stringify(value)]);
}

/* ---------- ACTIVITY + APPROVAL QUEUE ---------- */
export async function log(text, agent = "core") {
  const list = await kvGet("activity", []);
  list.unshift({ t: Date.now(), text, agent });
  await kvSet("activity", list.slice(0, 40));
}

export async function addAction(type, summary, payload) {
  const list = await kvGet("actions", []);
  const item = {
    id: "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    type,
    summary,
    payload,
    status: "pending",
    t: Date.now()
  };
  list.unshift(item);
  await kvSet("actions", list.slice(0, 60));
  await log("Approval needed: " + summary, type);
  return item;
}

/* ---------- CONTACTS ---------- */
export const digits = (s) => String(s || "").replace(/\D/g, "");

export async function resolveContact(nameOrNumber) {
  const raw = String(nameOrNumber || "").trim();
  if (digits(raw).length >= 8) return { name: raw, phone: digits(raw) };
  const contacts = await kvGet("contacts", {});
  const key = raw.toLowerCase();
  const hit = Object.entries(contacts).find(([n]) => n.toLowerCase() === key);
  return hit ? { name: hit[0], phone: hit[1] } : null;
}

/* ---------- OPENAI ---------- */
export async function openai(body) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5", ...body })
  });
  const data = await r.json();
  if (!r.ok) {
    const err = new Error(data?.error?.message || `OpenAI error ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

export function extractText(data) {
  if (data.output_text) return data.output_text;
  for (const item of data.output || []) {
    if (item.type === "message") {
      for (const c of item.content || []) {
        if (c.type === "output_text" && c.text) return c.text;
      }
    }
  }
  return "";
}

/* ---------- WHATSAPP (Meta Cloud API) ---------- */
export async function waSend(to, text) {
  if (!config().whatsapp) {
    return { ok: false, note: "WhatsApp API is not connected yet." };
  }
  const r = await fetch(
    `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: digits(to),
        type: "text",
        text: { body: text }
      })
    }
  );
  const data = await r.json();
  if (!r.ok) return { ok: false, note: data?.error?.message || "WhatsApp send failed" };
  return { ok: true, note: "Message sent." };
}

/* ---------- SHOPIFY (creates DRAFT products only) ---------- */
export async function shopifyDraft({ title, price, description }) {
  if (!config().shopify) {
    return { ok: false, note: "Shopify store is not connected yet. Nothing was created." };
  }
  const r = await fetch(
    `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/products.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product: {
          title,
          body_html: description || "",
          status: "draft",
          variants: [{ price: String(price || 0) }]
        }
      })
    }
  );
  const data = await r.json();
  if (!r.ok) return { ok: false, note: JSON.stringify(data.errors || data).slice(0, 200) };
  return { ok: true, note: "Draft product created in Shopify." };
}

/* ---------- ORDER MATH (shared) ---------- */
export function calcOrder({ quantity, unitCost, shipping = 0, sellingPrice, feePercent = 4, adPerUnit = 0 }) {
  const qty = Number(quantity);
  const cost = Number(unitCost);
  const ship = Number(shipping);
  const sell = Number(sellingPrice);
  const ad = Number(adPerUnit);
  if ([qty, cost, ship, sell, ad].some((n) => !Number.isFinite(n) || n < 0) || qty <= 0) {
    return null;
  }
  const totalCost = (cost + ship) * qty;
  const revenue = sell * qty;
  const fees = (revenue * Number(feePercent)) / 100;
  const ads = ad * qty;
  const profit = revenue - totalCost - fees - ads;
  const r2 = (n) => Number(n.toFixed(2));
  return {
    quantity: qty,
    totalCost: r2(totalCost),
    revenue: r2(revenue),
    fees: r2(fees),
    ads: r2(ads),
    profit: r2(profit),
    marginPercent: revenue > 0 ? r2((profit / revenue) * 100) : 0,
    warning: profit <= 0 ? "Loss or zero profit" : profit / revenue < 0.15 ? "Margin below 15%" : null
  };
}
