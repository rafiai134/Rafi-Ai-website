import {
  auth, config, openai, extractText, addAction, log,
  kvGet, kvSet, resolveContact, calcOrder, digits
} from "./_lib.js";
import { hasGemini, runGemini } from "./gemini.js";
import { buildSystem } from "./_profile.js";

const PLATFORMS = {
  whatsapp: "https://web.whatsapp.com/",
  chatgpt: "https://chatgpt.com/",
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
    description: "Open a website for the user in the browser (a link on the dashboard). NOT for opening apps or sites on the owner's phone: use device_command (open_app / open_url) for that.",
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
    description: "Only for business work (supplier, Shopify, order research): assign a task to one of Rafi AI's visual agents. Agents: core, supplier, shopify, whatsapp. NEVER use this for anything on the owner's Android phone (opening apps or websites, home, back, taps, typing, WhatsApp on the phone): use device_command for those. This creates a visible agent movement/task event; it does not claim external work is completed.",
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
    description: "Queue ONE command for the user's Android phone (Rafi AI Companion app). Commands: home, back, recents, notifications, open_app (appName like 'WhatsApp' or packageName), open_url (url), tap (x,y), tap_text (text = visible button/label), type_text (text), scroll, whatsapp_send (to = contact name as the owner says it, OR a phone number with country code; text = message). The phone itself looks names up in its own contacts. For multi-step jobs, call this several times in order and give each later step a delayMs (milliseconds from now) so the app/page can load first, e.g. open_url (0), type_text (delayMs 7000), tap_text 'Send' (delayMs 9500). Never claim success until the device reports it.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", enum: Object.keys(DEVICE_COMMANDS) },
        appName: { type: "string" },
        packageName: { type: "string" },
        url: { type: "string" },
        to: { type: "string" },
        x: { type: "number" }, y: { type: "number" }, text: { type: "string" },
        delayMs: { type: "number" }
      },
      required: ["command"]
    }
  },
  {
    type: "function",
    name: "look_camera",
    description: "Look at the owner through his device camera (the website opens the camera preview, takes ONE picture and answers). Use when he says things like 'look at me', 'what do you see', 'how do I look', or asks you to check his camera. question = what to look for (optional).",
    parameters: {
      type: "object",
      properties: { question: { type: "string" } }
    }
  },
  {
    type: "function",
    name: "remember_fact",
    description: "Save something about the owner's life, family, work, plans or preferences so you remember it in every future conversation. Use when he tells you something personal or says 'remember this'. fact = one short sentence.",
    parameters: {
      type: "object",
      properties: { fact: { type: "string" } },
      required: ["fact"]
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
  let contactName = null;
  if (command === "whatsapp_send") {
    if (!args.text) return { ok: false, note: "text is required." };
    const who = String(args.to || args.phone || "").trim();
    if (!who) return { ok: false, note: "Who should the message go to? (contact name or number)" };
    const c = await resolveContact(who);
    if (c && c.phone) phone = digits(c.phone);
    else contactName = who.slice(0, 80); // the phone looks this name up in its own contacts
  }

  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Number(v) : null);
  const q = await kvGet("device_queue", []);
  const now = Date.now();
  const delay = Math.min(Math.max(Number(args.delayMs) || 0, 0), 60000);
  // strictly increasing createdAt so the phone always runs steps in the order they were queued
  const newest = q.reduce((mx, x) => Math.max(mx, x.createdAt || 0), 0);
  const item = {
    id: "d" + now.toString(36) + Math.random().toString(36).slice(2, 6),
    command,
    args: {
      packageName: args.packageName || null,
      appName: args.appName || null,
      url: args.url || null,
      phone,
      contactName,
      x: num(args.x),
      y: num(args.y),
      text: args.text ? String(args.text).slice(0, 2000) : null
    },
    status: "pending",
    createdAt: Math.max(now, newest + 1),
    runAfter: delay ? now + delay : 0
  };
  q.unshift(item);
  await kvSet("device_queue", q.slice(0, 80));
  await log("Android command queued: " + command + (args.appName ? " " + args.appName : "") + (args.url ? " " + args.url : "") + (contactName ? " to " + contactName : "") + (delay ? " (+" + Math.round(delay / 1000) + "s)" : ""), "device");
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
    case "look_camera": {
      ui.push({ type: "camera", question: String(args.question || "").slice(0, 300) });
      return { ok: true, note: "The website will open the camera preview, take one picture and answer by itself. Just tell the owner briefly that you are looking." };
    }
    case "remember_fact": {
      const fact = String(args.fact || "").trim().slice(0, 300);
      if (!fact) return { error: "fact is required" };
      const memory = await kvGet("memory", []);
      memory.unshift({ fact, t: Date.now() });
      await kvSet("memory", memory.slice(0, 100));
      await log("Remembered: " + fact.slice(0, 60), "core");
      return { ok: true };
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
You are Rafi AI, the personal assistant, companion and business agent of the owner (dropshipping: Alibaba suppliers, Shopify store, WhatsApp).
Reply in the language the user speaks. Default to Urdu script for Urdu/Roman-Urdu; Hindi speech -> answer in Urdu script unless asked otherwise.
Replies are read aloud, so keep them short (1-3 sentences) unless asked for detail.
You know the owner personally (see the profile below). Use that knowledge naturally; do not recite it.

Rules:
- Use tools for actions. Website/dashboard messages, supplier messages and Shopify listings only go into the approval queue. Tell the user they must tap APPROVE. Never say something was sent/created before approval.
- You cannot read live Alibaba results, prices, stock or shipping. Never invent them. Give the search link and ask the user for supplier details.
- PHONE CONTROL: the owner's Android phone is controlled through the installed Rafi AI Companion. ANY request about the phone (open/turn on/launch an app or website, home, back, recents, notifications, tap, type, scroll, dark mode, WhatsApp on the phone) MUST use device_command. Never answer such a request with delegate_agent or open_platform, and never just say a task was given to an agent.
  * "open WhatsApp / YouTube / Gmail / Chrome / Camera / Gallery / Settings / any installed app" -> open_app with appName (English app name).
  * "open a website" (ChatGPT https://chatgpt.com, Alibaba https://www.alibaba.com, Shopify https://admin.shopify.com, any other site) -> open_url with the full url.
  * "send WhatsApp message X to person Y" -> device_command whatsapp_send (to = the contact name exactly as the owner said it, or a number; text = the message as the owner said). The phone looks the name up in its own contacts, so NEVER ask the owner for a number just because the name is not saved here. The owner's own spoken command is the approval for phone actions.
  * "write/ask something in ChatGPT" -> open_url https://chatgpt.com/ (delayMs 0), then type_text with the message (delayMs 7000), then tap_text "Send" (delayMs 9500).
  * other actions inside an app -> several device_command calls in order with increasing delayMs: open_app, then tap_text (visible button text), type_text, scroll, back.
  * Say briefly what you queued. The phone reports back afterwards; never claim success before that. If the tool says the bridge is not configured or that only temporary memory is used, tell the owner honestly.
- CAMERA: if the owner asks you to look at him / check what you see, call look_camera. You only see through the camera when he has switched it on; never claim to watch him otherwise.
- MEMORY: when the owner tells you something about his life or asks you to remember something, call remember_fact.
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
  { re: /gallery|گیلری/i, name: "Gallery" },
  { re: /settings|سیٹنگ/i, name: "Settings" },
  { re: /instagram|انسٹاگرام/i, name: "Instagram" },
  { re: /facebook|فیس\s*بک/i, name: "Facebook" },
  { re: /tiktok|ٹک\s*ٹاک/i, name: "TikTok" }
];

/* Websites the local fallback sends to the phone's browser */
const SITE_WORDS = [
  { re: /chat\s*g\s*p\s*t|چیٹ\s*(?:جی|جے|گی)\s*پی\s*(?:ٹی|ٹے)|چیٹ\s*جی\s*ٹی|چیٹ\s*جی|चैट\s*(?:जी|जे)\s*पी\s*टी|चैटजीपीटी/i, name: "ChatGPT", url: PLATFORMS.chatgpt },
  { re: /ali\s*baba|علی\s*بابا|अलीबाबा/i, name: "Alibaba", url: PLATFORMS.alibaba },
  { re: /ali\s*express|علی\s*ایکسپریس/i, name: "AliExpress", url: PLATFORMS.aliexpress },
  { re: /shopify|شاپفائی|शॉपिफाई/i, name: "Shopify", url: PLATFORMS.shopify },
  { re: /amazon|ایمیزون/i, name: "Amazon", url: PLATFORMS.amazon },
  { re: /google\s*maps|\bmaps\b|میپس|نقشہ/i, name: "Maps", url: PLATFORMS.maps }
];

/* Pull the message text out of a spoken command: quoted text, or what follows a verb like "write/say/ask" or a colon */
function extractMessageText(message) {
  const q = String(message).match(/["“«]([^"”»]+)["”»]/);
  if (q) return q[1].trim();
  const t = String(message).match(/(?:لکھ دو|لکھو|لکھیں|کہہ دو|کہو|بولو|پوچھو|پوچھیں|likho|bolo|poocho|ask|saying|that|:)\s*(.+)$/i);
  return t ? t[1].trim() : null;
}

/* phoneOnly=true: only clear, deterministic phone commands are handled here (fast, no AI needed);
   anything else returns {unknown:true} so the AI can handle it. */
async function localFallback(message, ui, phoneOnly = false) {
  const m = String(message || "").toLowerCase();
  const short = String(message || "").trim().length <= 45;
  const UNKNOWN = { unknown: true, reply: "", ui };
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
    ui.push({ type: "agent_move", agent: command === "whatsapp_send" ? "whatsapp" : "core", task: "Phone: " + command + (args && args.appName ? " " + args.appName : "") });
    const extra = r.persistent ? "" : " (خبردار: Redis ڈیٹا بیس جڑا نہیں، اس لیے فون کو شاید کمانڈ نہ پہنچے۔)";
    return { reply: okText + extra, tool: r, ui };
  };
  // Several phone steps in order; each step's delay (ms) is added to the previous one.
  const macro = async (steps, okText) => {
    let acc = 0, last = null;
    for (const s of steps) {
      acc += s.delay || 0;
      last = await queueDevice(s.command, { ...s.args, delayMs: acc });
      if (!last.ok) return { reply: "فون کی کمانڈ نہیں بھیج سکا: " + last.note, tool: last, ui };
    }
    ui.push({ type: "agent_move", agent: "core", task: "Phone: " + steps.map((s) => s.command).join(" > ") });
    return { reply: okText, tool: last, ui };
  };
  const normNum = (n) => {
    let d = String(n).replace(/[^\d]/g, "");
    if (/^0\d{10}$/.test(d)) d = "92" + d.slice(1);
    return d;
  };

  // "Look at me" -> the website opens the camera and answers with what it sees.
  if (/(?:مجھے|مجھ کو|میری طرف|مجھ پر)\s*(?:دیکھو|دیکھ)|کیمرے\s*سے\s*دیکھو|کیمرہ\s*دیکھو|کیمرے\s*میں\s*دیکھو|look at me|what do you see/i.test(message)) {
    ui.push({ type: "camera", question: "" });
    return { reply: "ٹھیک ہے سر، کیمرہ کھول کر دیکھ رہا ہوں۔", ui };
  }

  if (short || !phoneOnly) {
    if (/\bhome\b|گھر|ہوم/.test(m)) return dev("home", {}, "فون کو Home پر بھیج رہا ہوں۔");
    if (/\bback\b|واپس|بیک/.test(m)) return dev("back", {}, "فون پر Back کمانڈ بھیج رہا ہوں۔");
    if (/recents|recent apps|حالیہ ایپس|ریسنٹ/.test(m)) return dev("recents", {}, "Recent Apps کمانڈ بھیج رہا ہوں۔");
    if (/notification|notifications|نوٹیفکیشن/.test(m)) return dev("notifications", {}, "Notifications کھولنے کی کمانڈ بھیج رہا ہوں۔");
  }

  // Save a contact once: "علی کا نمبر 03001234567 محفوظ کرو" -> later "علی کو لکھو: سلام" works by name.
  if (/محفوظ|save|یاد رکھ/i.test(message)) {
    const sm = message.match(/(.+?)\s*(?:کا|کی|ka|ki)?\s*(?:نمبر|number)\s*[:：]?\s*(\+?\d[\d\s\-]{7,}\d)/i);
    if (sm) {
      const name = sm[1].replace(/whats\s*app|واٹس\s*ایپ|پر|save|contact|کانٹیکٹ|رافی|rafi/gi, "").trim();
      if (name) {
        const contacts = (await kvGet("contacts", {})) || {};
        contacts[name] = normNum(sm[2]);
        await kvSet("contacts", contacts);
        await log("Contact saved: " + name, "whatsapp");
        return { reply: name + " کا نمبر محفوظ کر لیا۔ اب نام سے پیغام بھیج سکتا ہوں۔", ui };
      }
    }
  }

  const wantsSend = /send|سینڈ|بھیج|میسج|میس|message|لکھ|کہو|بولو|پوچھ|\bask\b|sms|ایس\s*ایم\s*ایس/i.test(message);
  const siteHit = SITE_WORDS.find((s) => s.re.test(message));

  // Message into ChatGPT on the phone: open it, wait for it to load, type, press Send.
  if (wantsSend && siteHit && siteHit.name === "ChatGPT") {
    const text = extractMessageText(message);
    if (!text) {
      if (phoneOnly) return UNKNOWN;
      return { reply: "ChatGPT میں لکھنے کے لیے متن بھی بتائیں۔ مثال: چیٹ جی پی ٹی میں لکھو: پاکستان کا دارالحکومت کیا ہے", ui };
    }
    return macro([
      { command: "open_url", args: { url: PLATFORMS.chatgpt }, delay: 0 },
      { command: "type_text", args: { text }, delay: 7000 },
      { command: "tap_text", args: { text: "Send" }, delay: 2500 }
    ], "ChatGPT فون پر کھول کر پیغام لکھ رہا ہوں، تقریباً دس سیکنڈ لگیں گے۔");
  }

  // WhatsApp message from the phone: needs a number (or a saved contact name) and the text.
  if (wantsSend && /whats\s*app|واٹس|व्हाट्स|میسج|message|sms|ایس\s*ایم\s*ایس/i.test(message)) {
    const contacts = (await kvGet("contacts", {})) || {};
    let to = null;
    const numM = message.match(/\+?\d[\d\s\-]{7,}\d/);
    if (numM) to = normNum(numM[0]);
    if (!to) {
      const nm = Object.keys(contacts).find((n) => n && m.includes(String(n).toLowerCase()));
      if (nm) to = nm;
    }
    const text = extractMessageText(message);
    if (to && text) return dev("whatsapp_send", { to, text }, "واٹس ایپ پیغام فون سے بھیجنے کی کمانڈ بھیج رہا ہوں۔");
    if (phoneOnly) return UNKNOWN; // let the AI work out the contact name and the text
    if (!to && text) return { reply: "یہ نام میرے پاس محفوظ نہیں۔ ایک بار لکھیں: علی کا نمبر 03001234567 محفوظ کرو۔ پھر ہمیشہ نام سے پیغام بھیج دوں گا۔", ui };
    if (to && !text) return { reply: "پیغام کا متن بھی بتائیں۔ مثال: واٹس ایپ پر علی کو لکھو: سلام", ui };
    return {
      reply: "پہلے نمبر محفوظ کریں: علی کا نمبر 03001234567 محفوظ کرو۔ پھر لکھیں: واٹس ایپ پر علی کو لکھو: سلام",
      ui
    };
  }

  // Any phone app mentioned without sending words -> open that app on the phone.
  const app = APP_WORDS.find((a) => a.re.test(message));
  if (app && !wantsSend && (short || !phoneOnly)) return dev("open_app", { appName: app.name }, app.name + " فون پر کھول رہا ہوں۔");

  // Websites -> open in the phone's browser through the companion app.
  if (siteHit && !wantsSend && (short || !phoneOnly)) return dev("open_url", { url: siteHit.url }, siteHit.name + " فون کے براؤزر میں کھول رہا ہوں۔");

  if (phoneOnly) return UNKNOWN;

  if (/supplier|سپلائر|alibaba|علی بابا/.test(m)) { const t = await pushAgent("supplier", message); return { reply: "Supplier Agent کو task دے دیا ہے۔", taskId: t.id, ui }; }
  if (/shopify|store|اسٹور|شاپفائی/.test(m)) { const t = await pushAgent("shopify", message); return { reply: "Shopify Agent کو task دے دیا ہے۔", taskId: t.id, ui }; }
  if (/agent|ایجنٹ|delegate|کام کرو|task/.test(m)) { const t = await pushAgent("core", message); return { reply: "Rafi Core نے task queue میں ڈال دیا ہے۔", taskId: t.id, ui }; }
  const hit = Object.keys(PLATFORMS).find(k => m.includes(k));
  if (hit && /open|کھولو|کھول/.test(m)) { ui.push({ type: "open", label: hit, url: PLATFORMS[hit] }); await log("Local fallback opening " + hit, "core"); return { reply: hit + " کھولنے کا لنک تیار ہے۔", ui }; }
  return { unknown: true, reply: "یہ کمانڈ سمجھنے کے لیے AI سروس چاہیے۔ فی الحال یہ کام کرتے ہیں: Home، Back، ایپ کھولنا، ویب سائٹ کھولنا، ChatGPT میں لکھنا، اور واٹس ایپ پیغام (نمبر یا محفوظ نام کے ساتھ)۔", ui };
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

    // Google Gemini is the brain when its key is set (free tier); otherwise OpenAI; otherwise local controls.
    if (hasGemini()) {
      // Clear, simple phone commands run instantly without waiting for the AI.
      const quick = await localFallback(message, ui, true);
      if (quick && !quick.unknown) return res.status(200).json(quick);

      let memory = [];
      try { memory = await kvGet("memory", []); } catch (e) { /* ignore */ }
      const text = await runGemini({ message, history, ui, runTool, instructions: buildSystem(INSTRUCTIONS, memory), tools });
      return res.status(200).json({ reply: text || "ٹھیک ہے۔", ui });
    }

    if (!config().openai) {
      return res.status(200).json(await localFallback(message, ui));
    }

    let memory = [];
    try { memory = await kvGet("memory", []); } catch (e) { /* ignore */ }
    const instructions = buildSystem(INSTRUCTIONS, memory);

    const past = Array.isArray(history)
      ? history
          .slice(-12)
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
      : [];

    let input = [...past, { role: "user", content: message.slice(0, 4000) }];
    let reply = "";

    for (let i = 0; i < 8; i++) {
      const data = await callAI({ instructions, input, tools });
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
    // Never return a 500 to the UI: fall back to local controls. Phone commands work without AI credit.
    const detail = String((e && e.message) || e || "unknown").replace(/AIza[0-9A-Za-z_\-]+/g, "AIza...").slice(0, 160);
    const reason = e && (e.status === 429 || e.status === 402)
      ? "AI credit/limit unavailable. Local Rafi controls remain online."
      : "AI service unavailable. Local Rafi controls remain online.";
    let fallback = { reply: "", ui };
    try { fallback = await localFallback(message, ui); } catch (e2) { console.error("fallback error", e2); }
    const reply = fallback.unknown || !fallback.reply
      ? "AI سروس جواب نہیں دے رہی۔ وجہ: " + detail
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
