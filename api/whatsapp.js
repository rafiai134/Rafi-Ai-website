import crypto from "node:crypto";
import { kvGet, kvSet, log, addAction, openai, extractText, waSend, config as status } from "./_lib.js";

// Raw body is needed to verify Meta's signature (Vercel reads this export).
export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  /* Meta calls this once to verify the webhook */
  if (req.method === "GET") {
    const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
    if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method !== "POST") return res.status(405).end();

  const raw = await readRaw(req);

  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    const sig = String(req.headers["x-hub-signature-256"] || "");
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const ok = sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return res.status(401).end();
  } else {
    // Without the app secret anyone could fake messages and spend your OpenAI credit.
    return res.status(500).json({ error: "WHATSAPP_APP_SECRET is not set." });
  }

  try {
    const body = JSON.parse(raw.toString("utf8") || "{}");
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msgs = value?.messages || [];
    const names = value?.contacts || [];

    for (const m of msgs) {
      if (m.type !== "text") continue;
      const from = m.from;
      const name = names.find((c) => c.wa_id === from)?.profile?.name || from;
      const text = m.text?.body || "";

      const inbox = await kvGet("inbox", []);
      inbox.unshift({ t: Date.now(), from, name, text });
      await kvSet("inbox", inbox.slice(0, 50));
      await log(`WhatsApp from ${name}: ${text.slice(0, 60)}`, "whatsapp");

      if (!status().openai) continue;

      const earlier = inbox
        .filter((x) => x.from === from)
        .slice(0, 6)
        .reverse()
        .map((x) => `${x.name}: ${x.text}`)
        .join("\n");

      const data = await openai({
        instructions:
          "You reply to WhatsApp messages on behalf of the owner of a small online store. " +
          "Reply in the sender's language, short and polite. Never promise prices, stock, refunds " +
          "or delivery dates. If unsure, say the owner will confirm shortly.",
        input: `Conversation so far:\n${earlier}\n\nWrite the next reply.`
      });
      const reply = extractText(data).trim();
      if (!reply) continue;

      if (process.env.WA_AUTO_REPLY === "1") {
        const r = await waSend(from, reply);
        await log(r.ok ? `Auto-replied to ${name}` : `Auto-reply failed: ${r.note}`, "whatsapp");
      } else {
        await addAction("whatsapp", `Reply to ${name}`, { to: from, name, text: reply });
      }
    }
  } catch (e) {
    console.error("whatsapp webhook", e);
  }

  // Always answer 200 so Meta does not retry.
  return res.status(200).json({ received: true });
  }
