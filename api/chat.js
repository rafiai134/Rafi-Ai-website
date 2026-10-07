import {
  auth, config, openai, extractText, addAction, log,
  kvGet, kvSet, resolveContact, calcOrder, digits
} from "./_lib.js";

const PLATFORMS = {
  whatsapp: "https://web.whatsapp.com/",
  alibaba: "https://www.alibaba.com/",
  aliexpress: "https://www.aliexpress.com/",
  shopify: "https://admin.shopify.com/",
  gmail: "https://mail.google.com/",
  youtube: "https://www.youtube.com/",
  maps: "https://maps.google.com/",
  amazon: "https://www.amazon.com/"
};

const DEVICE_COMMANDS = {
  home: "Go to Android home screen.",
  back: "Press Android back.",
  recents: "Open Android recent apps.",
  notifications: "Open Android notifications.",
  open_app: "Open an installed Android app by name (appName) or package name.",
  open_url: "Open a URL in the Android browser.",
  tap: "Tap the Android screen at x,y.",
  tap_text: "Find visible text/button label and tap it.",
  type_text: "Type text into the focused (or first) text field.",
  scroll: "Scroll the current Android screen.",
  whatsapp_send: "Send a WhatsApp message from the phone to a phone number."
};

const tools = [
  {
    type: "function",
    name: "open_platform",
    description: "Open a website/app for the user. Names: " + Object.keys(PLATFORMS).join(", "),
    parameters: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"]
    }
  },
  {
    type: "function",
    name: "search_alibaba",
    description: "Give the user an Alibaba search link for a product. Cannot read live results.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "save_contact",
    description: "Save a contact name and phone number (with country code).",
    parameters: {
      type: "object",
      properties: { name: { type: "string" }, phone: { type: "string" } },
      required: ["name", "phone"]
    }
  },
  {
    type: "function",
    name: "send_whatsapp",
    description: "Queue a WhatsApp message for the user's approval (website/dashboard flow). 'to' is a saved contact name or phone number. For sending directly from the user's phone use device_command whatsapp_send instead.",
    parameters: {
      type: "object",
      properties: { to: { type: "string" }, text: { type: "string" } },
      required: ["to", "text"]
    }
  },
  {
    type: "function",
    name: "draft_supplier_message",
    description: "Prepare a message for a supplier and queue it for approval.",
    parameters: {
      type: "object",
      properties: { supplier: { type: "string" }, text: { type: "string" } },
      required: ["supplier", "text"]
    }
  },
  {
    type: "function",
    name: "list_on_shopify",
    description: "Queue a Shopify DRAFT product for approval.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        price: { type: "number" },
        description: { type: "string" }
      },
      required: ["title", "price"]
    }
  },
  {
    type: "function",
    name: "calc_order",
    description: "Calculate cost, fees and profit for an order.",
    parameters: {
      type: "object",
      properties: {
        quantity: { type: "number" },
        unitCost: { type: "number" },
        shipping: { type: "number" },
        sellingPrice: { type: "number" },
        adPerUnit: { type: "number" }
      },
      required: ["quantity", "unitCost", "sellingPrice"]
    }
  },
  {
    type: "function",
    name: "delegate_agent",
    description: "Assign a task to one of Rafi AI's visual agents. Agents: core, supplier, shopify, whatsapp. Use this when the user asks Rafi to have an agent work on a task. This creates a visible agent movement/task event; it does not claim external work is completed.",
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", enum: ["core", "supplier", "shopify", "whatsapp"] },
        task: { type: "string" }
      },
      required: ["agent", "task"]
    }
  },
  {
    type: "function",
    name: "device_command",
    description: "Queue ONE command for the user's Android phone (Rafi AI Companion app). Commands: home, back, recents, notifications, open_app (appName like 'WhatsApp' or packageName), open_url (url), tap (x,y), tap_text (text = visible button/label), type_text (text), scroll, whatsapp_send (to = saved contact name or phone number, text = message). For multi-step jobs inside an app, call this several times in order: open_app, then tap_text / type_text / scroll. Never claim success until the device reports it.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", enum: Object.keys(DEVICE_COMMANDS) },
        appName: { type: "string" },
        packageName: { type: "string" },
        url: { type: "string" },
        to: { type: "string" },
        x: { type: "number" }, y: { type: "number" }, text: { type: "string" }
      },
      required: ["command"]
    }
  }
];

async function queueDevice(command, args) {
  args = args || {};
  if (!process.env.DEVICE_TOKEN) return { ok: false, note: "Android bridge is not configured yet (DEVICE_TOKEN missing on the server)." };
  if (!Object.keys(DEVICE_COMMANDS).includes(command)) return { ok: false, note: "Command not allowed." };
  if (command === "open_app" && !args.packageName && !args.appName) return { ok: false, note: "appName or packageName is required." };
  if (command === "open_url" && !args.url) return { ok: false, note: "url is required." };
  if (command === "tap" && (!Number.isFinite(Number(args.x)) || !Number.isFinite(Number(args.y)))) return { ok: false, note: "x and y are required." };
  if ((command === "tap_text" || command === "type_text") && !args.text) return { ok: false, note: "text is required." };

  let phone = null;
  if (command === "whatsapp_send") {
    if (!args.text) return { ok: false, note: "text is required." };
    const c = await resolveContact(args.to || args.phone || "");
    if (!c || !c.phone) return { ok: false, note: `No saved contact or number for "${args.to || ""}". Ask the user for the phone number with country code.` };
    phone = digits(c.phone);
  }

  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Number(v) : null);
  const q = await kvGet("device_queue", []);
  const item = {
    id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    command,
    args: {
      packageName: args.packageName || null,
      appName: args.appName || null,
      url: args.url || null,
      phone,
      x: num(args.x),
      y: num(args.y),
      text: args.text ? String(args.text).slice(0, 2000) : null
    },
    status: "pending",
    createdAt: Date.now()
  };
  q.unshift(item);
  await kvSet("device_queue", q.slice(0, 80));
  await log("Android command queued: " + command, "device");
  const persistent = config().storage;
  return {
    ok: true,
    persistent,
    note: persistent
      ? "Android command queued. It runs on the phone within a few seconds; the phone reports back when finished."
      : "Android command queued in temporary memory only (no Redis database is connected), so the phone may never receive it."
  };
}

async function runTool(name, args, ui) {
  switch (name) {
    case "open_platform": {
      const url = PLATFORMS[String(args.name || "").toLowerCase()];
      if (!url) return { error: "Unknown platform" };
      ui.push({ type: "open", label: args.name, url });
      await log("Opening " + args.name, "core");
      return { ok: true, note: "Link shown to user." };
    }
    case "search_alibaba": {
      const url = "https://www.alibaba.com/trade/search?SearchText=" + encodeURIComponent(args.query);
      ui.push({ type: "open", label: "Alibaba: " + args.query, url });
      await log("Alibaba search: " + args.query, "supplier");
      return { ok: true, note: "Search link shown. Live results are not readable by the assistant." };
    }
    case "save_contact": {
      const contacts = await kvGet("contacts", {});
      contacts[args.name] = digits(args.phone);
      await kvSet("contacts", contacts);
      await log("Contact saved: " + args.name, "whatsapp");
      return { ok: true };
    }
    case "send_whatsapp": {
      const c = await resolveContact(args.to);
      if (!c) return { error: `No contact named "${args.to}". Ask the user for the number.` };
      await addAction("whatsapp", `WhatsApp to ${c.name}`, { to: c.phone, name: c.name, text: args.text });
      return { ok: true, note: "Queued. Waiting for user approval. Not sent yet." };
    }
    case "draft_supplier_message": {
      await addAction("supplier_message", `Supplier message: ${args.supplier}`, {
        supplier: args.supplier,
        text: args.text
      });
      return { ok: true, note: "Queued for approval. Not sent." };
    }
    case "list_on_shopify": {
      await addAction("shopify_listing", `Shopify draft: ${args.title}`, args);
      return { ok: true, note: "Queued for approval. Nothing created yet." };
    }
    case "delegate_agent": {
      const allowed = ["core", "supplier", "shopify", "whatsapp"];
      if (!allowed.includes(args.agent)) return { error: "Unknown agent" };
      const task = String(args.task || "").slice(0, 500);
      const tasks = await kvGet("agent_tasks", []);
      const item = {
        id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        agent: args.agent,
        task,
        status: "queued",
        createdAt: Date.now()
      };
      tasks.unshift(item);
      await kvSet("agent_tasks", tasks.slice(0, 100));
      ui.push({ type: "agent_move", agent: args.agent, task, taskId: item.id });
      await log("Agent " + args.agent + " received task: " + task, args.agent);
      return { ok: true, taskId: item.id, note: "Task assigned and stored in the agent queue. External work is not claimed complete." };
    }
    case "device_command": {
      const r = await queueDevice(args.command, args);
      if (r && r.ok) {
        const agent = args.command === "whatsapp_send" ? "whatsapp" : "core";
        ui.push({ type: "agent_move", agent, task: "Phone: " + args.command + (args.appName ? " " + args.appName : "") });
      }
      return r;
    }
    case "calc_order": {
      const r = calcOrder(args);
      return r || { error: "Invalid numbers" };
    }
    default:
      return { error: "Unknown tool" };
  }
}

const INSTRUCTIONS = `
You are Rafi AI, the personal assistant and business agent of the owner (dropshipping: Alibaba suppliers, Shopify store, WhatsApp).
Reply in the language the user speaks. Default to Urdu script for Urdu/Roman-Urdu; Hindi speech -> answer in Urdu script unless asked otherwise.
Replies are read aloud, so keep them short (1-3 sentences) unless asked for detail.

Rules:
- Use tools for actions. Website/dashboard messages, supplier messages and Shopify listings only go into the approval queue. Tell the user they must tap APPROVE. Never say something was sent/created before approval.
- You cannot read live Alibaba results, prices, stock or shipping. Never invent them. Give the search link and ask the user for supplier details.
- PHONE CONTROL: the owner's Android phone is controlled through the installed Rafi AI Companion. Use device_command:
  * "open WhatsApp / YouTube / any app" -> open_app with appName.
  * "send WhatsApp message X to person Y" -> device_command whatsapp_send (to = contact name or number, text = the message exactly as the owner said). The owner's own spoken command is the approval for phone actions. If the contact is unknown, ask for the number with country code, then save_contact.
  * actions inside an app -> several device_command calls in order: open_app, then tap_text (visible button text), type_text, scroll, back.
  * Say briefly what you queued. The phone reports back afterwards; never claim success before that. If the tool says the bridge is not configured, tell the owner the phone companion setup is not finished.
- Never place orders or make payments, and never type passwords, card numbers or OTP codes on the phone. Never ask for passwords or API keys.
- For profit questions call calc_order and mention fees and any warning.
`;

/* Phone-app names the local fallback understands (English + Urdu spellings) */
const APP_WORDS = [
  { re: /whats\s*app|واٹس\s*ایپ|واٹس\s*اپ|व्हाट्स\s*ऐप|व्हाट्सअप/i, name: "WhatsApp" },
  { re: /you\s*tube|یوٹیوب|यूट्यूब/i, name: "YouTube" },
  { re: /chrome|کروم/i, name: "Chrome" },
  { re: /gmail|جی\s*میل/i, name: "Gmail" },
  { re: /camera|کیمرہ|کیمرا/i, name: "Camera" },
  { re: /settings|سیٹنگ/i, name: "Settings" },
  { re: /instagram|انسٹاگرام/i, name: "Instagram" },
  { re: /facebook|فیس\s*بک/i, name: "Facebook" },
  { re: /tiktok|ٹک\s*ٹاک/i, name: "TikTok" }
];

async function localFallback(message, ui) {
  const m = String(message || "").toLowerCase();
  const pushAgent = async (agent, task) => {
    const tasks = await kvGet("agent_tasks", []);
    const item = { id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), agent, task: String(task).slice(0, 500), status: "queued", createdAt: Date.now() };
    tasks.unshift(item); await kvSet("agent_tasks", tasks.slice(0, 100));
    ui.push({ type: "agent_move", agent, task: item.task, taskId: item.id });
    await log("Local fallback assigned " + agent + ": " + item.task, agent);
    return item;
  };
  // Queue a phone command and answer honestly based on what really happened.
  const dev = async (command, args, okText) => {
    const r = await queueDevice(command, args);
    if (!r.ok) return { reply: "فون کی کمانڈ نہیں بھیج سکا: " + r.note, tool: r, ui };
    ui.push({ type: "agent_move", agent: "core", task: "Phone: " + command + (args && args.appName ? " " + args.appName : "") });
    const extra = r.persistent ? "" : " (خبردار: Redis ڈیٹا بیس جڑا نہیں، اس لیے فون کو شاید کمانڈ نہ پہنچے۔)";
    return { reply: okText + extra, tool: r, ui };
  };

  if (/\bhome\b|گھر|ہوم/.test(m)) return dev("home", {}, "فون کو Home پر بھیج رہا ہوں۔");
  if (/\bback\b|واپس|بیک/.test(m)) return dev("back", {}, "فون پر Back کمانڈ بھیج رہا ہوں۔");
  if (/recents|recent apps|حالیہ ایپس|ریسنٹ/.test(m)) return dev("recents", {}, "Recent Apps کمانڈ بھیج رہا ہوں۔");
  if (/notification|notifications|نوٹیفکیشن/.test(m)) return dev("notifications", {}, "Notifications کھولنے کی کمانڈ بھیج رہا ہوں۔");

  // Any phone app mentioned without sending words -> open that app on the phone.
  const wantsSend = /send|بھیج|میسج|message|لکھ/.test(m);
  const app = APP_WORDS.find((a) => a.re.test(message));
  if (app && !wantsSend) return dev("open_app", { appName: app.name }, app.name + " فون پر کھول رہا ہوں۔");

  if (/supplier|سپلائر|alibaba|علی بابا/.test(m)) { const t = await pushAgent("supplier", message); return { reply: "Supplier Agent کو task دے دیا ہے۔", taskId: t.id, ui }; }
  if (/shopify|store|اسٹور|شاپفائی/.test(m)) { const t = await pushAgent("shopify", message); return { reply: "Shopify Agent کو task دے دیا ہے۔", taskId: t.id, ui }; }
  if (/whatsapp|واٹس.?ایپ|message|میسج/.test(m)) { const t = await pushAgent("whatsapp", message); return { reply: "WhatsApp Agent کو task دے دیا ہے۔ (واٹس ایپ پیغام بھیجنے کے لیے AI سروس چاہیے۔)", taskId: t.id, ui }; }
  if (/agent|ایجنٹ|delegate|کام کرو|task/.test(m)) { const t = await pushAgent("core", message); return { reply: "Rafi Core نے task queue میں ڈال دیا ہے۔", taskId: t.id, ui }; }
  const hit = Object.keys(PLATFORMS).find(k => m.includes(k));
  if (hit && /open|کھولو|کھول/.test(m)) { ui.push({ type: "open", label: hit, url: PLATFORMS[hit] }); await log("Local fallback opening " + hit, "core"); return { reply: hit + " کھولنے کا لنک تیار ہے۔", ui }; }
  return { reply: "Rafi AI core online ہے۔ AI credit کے بغیر بھی agent delegation، Android commands اور dashboard controls دستیاب ہیں۔", ui, generic: true };
}

/* Call OpenAI; if the configured model is not available to this key, retry once with gpt-4.1 */
async function callAI(body) {
  try {
    return await openai(body);
  } catch (e) {
    if ((e.status === 400 || e.status === 404) && /model/i.test(String(e.message))) {
      return await openai({ ...body, model: "gpt-4.1" });
    }
    throw e;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!auth(req, res)) return;

  // Declared OUTSIDE try so the catch block can use them (before, this crashed with a 500).
  const ui = [];
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const message = body.message;
  const history = body.history;

  try {
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    if (!config().openai) {
      return res.status(200).json(await localFallback(message, ui));
    }

    const past = Array.isArray(history)
      ? history
          .slice(-12)
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
      : [];

    let input = [...past, { role: "user", content: message.slice(0, 4000) }];
    let reply = "";

    for (let i = 0; i < 8; i++) {
      const data = await callAI({ instructions: INSTRUCTIONS, input, tools });
      const calls = (data.output || []).filter((o) => o.type === "function_call");

      if (!calls.length) {
        reply = extractText(data);
        break;
      }

      input = [...input, ...data.output];
      for (const c of calls) {
        let args = {};
        try { args = JSON.parse(c.arguments || "{}"); } catch { /* ignore */ }
        const result = await runTool(c.name, args, ui);
        input.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify(result) });
      }
    }

    return res.status(200).json({ reply: reply || "ٹھیک ہے۔", ui });
  } catch (e) {
    console.error("chat error", e);
    // Never return a 500 to the UI: fall back to local controls and say WHY the AI failed.
    const detail = String((e && e.message) || e || "unknown").slice(0, 160);
    const reason = e && (e.status === 429 || e.status === 402)
      ? "AI credit/limit unavailable. Local Rafi controls remain online."
      : "AI service unavailable. Local Rafi controls remain online.";
    let fallback = { reply: "", ui };
    try { fallback = await localFallback(message, ui); } catch (e2) { console.error("fallback error", e2); }
    const reply = fallback.generic || !fallback.reply
      ? "AI سروس جواب نہیں دے رہی۔ وجہ: " + detail + " — OpenAI key، credit اور OPENAI_MODEL چیک کریں۔"
      : fallback.reply;
    return res.status(200).json({
      reply,
      ui: fallback.ui || ui,
      localFallback: true,
      notice: reason,
      detail
    });
  }
}
