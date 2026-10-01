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

const DEVICE_COMMANDS = { home:"Go to Android home screen.", back:"Press Android back.", recents:"Open Android recent apps.", notifications:"Open Android notifications.", open_app:"Open an installed Android app by package name.", open_url:"Open a URL in the Android browser.", tap:"Tap the Android screen at x,y.", tap_text:"Find visible text and tap it.", type_text:"Type text into the focused field.", scroll:"Scroll the current Android screen." };

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
    description: "Queue a WhatsApp message for the user's approval. 'to' is a saved contact name or phone number.",
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
    description: "Queue a safe Android device command for the installed Rafi AI Companion. Supported commands: home, back, recents, notifications, open_app, open_url. Never claim it succeeded until the device reports completion.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", enum: ["home", "back", "recents", "notifications", "open_app", "open_url", "tap", "tap_text", "type_text", "scroll"] },
        packageName: { type: "string" },
        url: { type: "string" },
        x: { type: "number" }, y: { type: "number" }, text: { type: "string" }
      },
      required: ["command"]
    }
  }
];

async function queueDevice(command,args) {
  if (!process.env.DEVICE_TOKEN) return {ok:false,note:"Android bridge is not configured yet."};
  if (!Object.keys(DEVICE_COMMANDS).includes(command)) return {ok:false,note:"Command not allowed."};
  if (command==="open_app" && !args.packageName) return {ok:false,note:"packageName is required."};
  if (command==="open_url" && !args.url) return {ok:false,note:"url is required."};
  if (command==="tap" && (!Number.isFinite(Number(args.x)) || !Number.isFinite(Number(args.y)))) return {ok:false,note:"x and y are required."};
  if (command==="tap_text" && !args.text) return {ok:false,note:"text is required."};
  if (command==="type_text" && !args.text) return {ok:false,note:"text is required."};
  const q=await kvGet("device_queue",[]);
  const item={id:"d"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),command,args:{packageName:args.packageName||null,url:args.url||null,x:Number.isFinite(Number(args.x))?Number(args.x):null,y:Number.isFinite(Number(args.y))?Number(args.y):null,text:args.text||null},status:"pending",createdAt:Date.now()};
  q.unshift(item); await kvSet("device_queue",q.slice(0,80)); await log("Android command queued: "+command,"device");
  return {ok:true,note:"Android command queued."};
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
    case "device_command": return queueDevice(args.command,args);
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
- Use tools for actions. Messages, supplier messages and Shopify listings only go into the approval queue. Tell the user they must tap APPROVE. Never say something was sent/created before approval.
- You cannot read live Alibaba results, prices, stock or shipping. Never invent them. Give the search link and ask the user for supplier details.
- Phone control is available through the installed Rafi AI Android Companion. Use device_command for navigation, opening apps/URLs, tapping coordinates/text, typing into focused fields, and scrolling. Never claim success until the device reports it.
- Messages and business transactions require explicit approval.
- Never place orders or make payments. Never ask for passwords or API keys.
- For profit questions call calc_order and mention fees and any warning.
`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!auth(req, res)) return;

  try {
    if (!config().openai) return res.status(500).json({ error: "OPENAI_API_KEY is not set." });

    const { message, history } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    const past = Array.isArray(history)
      ? history
          .slice(-12)
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
      : [];

    let input = [...past, { role: "user", content: message.slice(0, 4000) }];
    const ui = [];
    let reply = "";

    for (let i = 0; i < 5; i++) {
      const data = await openai({ instructions: INSTRUCTIONS, input, tools });
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
    const msg = e.status === 429
      ? "OpenAI کی حد یا کریڈٹ ختم ہو گیا ہے۔ بلنگ چیک کریں۔"
      : e.message || "Server error";
    return res.status(e.status || 500).json({ error: msg });
  }
}
