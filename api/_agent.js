// Phone agent: the AI reads the phone screen (read_screen), decides ONE next action, the phone does it,
// then reads the screen again - until the goal is done. State lives in KV key "agent".
import { kvGet, kvSet, log, resolveContact, digits } from "./_lib.js";

const MAX_STEPS = 30;
const MAX_AGE_MS = 10 * 60 * 1000;
const ALLOWED = ["home", "back", "recents", "notifications", "open_app", "open_url", "tap", "tap_text", "type_text", "scroll", "scroll_up", "enter", "whatsapp_send"];

const SYSTEM = `You control an Android phone (Xiaomi/MIUI) for its owner by looking at the screen and choosing ONE next action at a time.
You receive: the GOAL, the HISTORY of actions already done with their results, and the CURRENT SCREEN.
Screen format: first line "app: <package>", then one line per element: label|flags|x,y   (flags: c=clickable, e=editable text field, s=scrollable; x,y = centre to tap).
Actions (command + args):
- open_app {appName}  (e.g. Gallery, WhatsApp, Chrome, Settings, Contacts, Phone, Camera, Jazz Cash)
- open_url {url}
- tap_text {text}  (exact visible label; preferred when the label is unique)
- tap {x,y}  (use for unlabeled things such as the first photo thumbnail, or when labels repeat)
- type_text {text}  (types into the focused/first text field; tap the field first)
- enter {}  (press Enter/Search/Send on the keyboard)
- scroll {}  (scroll down/forward)   scroll_up {}  (scroll back/up)
- back {}  home {}  recents {}  notifications {}
- whatsapp_send {to, text}  (to = contact name or number; sends a WhatsApp message directly)
Return ONLY one JSON object, no other text:
{"done":false,"command":"tap_text","args":{"text":"Gallery"},"say":""}
When the goal is complete, or cannot be completed: {"done":true,"say":"<short Urdu sentence in Urdu script saying what was done or why it could not>"}.
Rules:
- Do exactly what the goal says, nothing more. Never press home/back unless it helps the goal.
- If the screen is not the app you need, open_app first.
- Look at the screen carefully: if the thing you need is not visible, scroll, or open the right tab/menu.
- For "first picture/photo/video" in Gallery: open the Gallery, open the Photos/Albums list if needed, tap the first thumbnail by coordinates.
- For a date/older item: scroll until the date label appears, then tap the item.
- To search a contact/number inside an app: tap the search field, type_text, then tap the matching result.
- To save a number: open Contacts (or Phone dialer), use the add/new contact button, fill the fields, tap Save.
- NEVER confirm payments, money transfers, purchases, deleting accounts or data, or posting publicly unless the goal says so explicitly. If a confirmation is needed, finish with done:true and say you stopped for the owner to confirm.
- If an action failed or the screen did not change, try a different way (another label, coordinates, scroll). If you keep failing, finish with done:true and explain.
- Never repeat the same action more than twice in a row.`;

function num(v) { return Number.isFinite(Number(v)) && v !== null && v !== undefined ? Number(v) : null; }

async function llmKey() {
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;
  try { return (await kvGet("llm_key", "")) || ""; } catch (e) { return ""; }
}

async function ask(user) {
  const key = await llmKey();
  if (!key) throw new Error("no AI key");
  const or = /^sk-or-/.test(key);
  const url = (process.env.LLM_BASE_URL ? process.env.LLM_BASE_URL.replace(/\/+$/, "") : or ? "https://openrouter.ai/api/v1" : "https://api.groq.com/openai/v1") + "/chat/completions";
  const models = process.env.LLM_MODEL ? [process.env.LLM_MODEL]
    : or ? ["meta-llama/llama-3.3-70b-instruct"] : ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"];
  let lastErr = "";
  for (const model of models) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({ model, temperature: 0.2, max_tokens: 500, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }),
        signal: AbortSignal.timeout(9000)
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { lastErr = model + ": " + ((d.error && d.error.message) || r.status); continue; }
      const txt = String(d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || "");
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) { lastErr = model + ": no JSON"; continue; }
      return JSON.parse(m[0]);
    } catch (e) { lastErr = model + ": " + String(e.message || e); }
  }
  throw new Error(lastErr.slice(0, 200));
}

async function enqueue(command, args, delay) {
  args = args || {};
  let phone = null, contactName = null;
  if (command === "whatsapp_send") {
    const who = String(args.to || args.phone || "").trim();
    if (/^[+\d][\d\s-]{6,}$/.test(who)) phone = digits(who);
    else {
      const c = await resolveContact(who);
      if (c && c.phone) phone = digits(c.phone); else contactName = who.slice(0, 80);
    }
  }
  const q = await kvGet("device_queue", []);
  const now = Date.now();
  const newest = q.reduce((mx, x) => Math.max(mx, x.createdAt || 0), 0);
  q.unshift({
    id: "a" + now.toString(36) + Math.random().toString(36).slice(2, 6),
    command,
    args: {
      packageName: args.packageName || null,
      appName: args.appName || null,
      url: args.url || null,
      phone, contactName,
      x: num(args.x), y: num(args.y),
      text: args.text ? String(args.text).slice(0, 2000) : null
    },
    status: "pending",
    createdAt: Math.max(now, newest + 1),
    runAfter: delay ? now + delay : 0,
    agent: true
  });
  await kvSet("device_queue", q.slice(0, 80));
}

async function stop(st, msg) {
  st.active = false;
  st.finishedAt = Date.now();
  await kvSet("agent", st);
  await log("Phone task finished: " + String(msg || "").slice(0, 160), "core");
}

export async function startAgent(goal) {
  goal = String(goal || "").trim().slice(0, 600);
  if (!goal) return { ok: false, note: "goal is required." };
  if (!process.env.DEVICE_TOKEN) return { ok: false, note: "Android bridge is not configured yet." };
  const st = { active: true, goal, steps: 0, history: [], screen: "", startedAt: Date.now() };
  await kvSet("agent", st);
  await log("Phone task started: " + goal.slice(0, 120), "core");
  await enqueue("read_screen", {}, 0);
  return { ok: true, note: "Phone task started. Rafi will look at the phone screen and do it step by step; progress shows in the Activity stream. Tell the owner briefly (in Urdu) that you started; do not claim it is finished." };
}

// Called by /api/device when the phone reports a result for a queued item.
export async function agentOnResult(item) {
  if (!item || !item.agent) return;
  const st = await kvGet("agent", null);
  if (!st || !st.active) return;
  if (Date.now() - st.startedAt > MAX_AGE_MS) return stop(st, "time limit reached");

  if (item.command === "read_screen") {
    if (item.status !== "done") return stop(st, "phone could not read the screen (" + String(item.result || "").slice(0, 60) + "). Install the newest Companion app and make sure Accessibility is on.");
    st.screen = String(item.result || "").slice(0, 3800);
    if (st.steps >= MAX_STEPS) return stop(st, "step limit reached");

    const user = "GOAL: " + st.goal + "\n\nHISTORY (last actions):\n" + (st.history.length ? st.history.join("\n") : "(none yet)") + "\n\nCURRENT SCREEN:\n" + st.screen;
    let d;
    try { d = await ask(user); }
    catch (e) { return stop(st, "AI error: " + String(e.message || e)); }

    if (d.done) return stop(st, d.say || "done");
    const command = String(d.command || "");
    if (!ALLOWED.includes(command)) return stop(st, "AI chose an unknown action: " + command.slice(0, 40));
    const args = d.args && typeof d.args === "object" ? d.args : {};
    const sig = command + JSON.stringify(args);
    st.sigs = (st.sigs || []).slice(-3);
    if (st.sigs.length >= 3 && st.sigs.every((s) => s === sig)) return stop(st, "stuck repeating the same action; stopped");
    st.sigs.push(sig);
    st.steps++;
    st.last = sig.slice(0, 200);
    await kvSet("agent", st);
    await enqueue(command, args, 0);
    return;
  }

  const brief = item.command + " " + JSON.stringify(Object.fromEntries(Object.entries(item.args || {}).filter(([, v]) => v !== null && v !== "")));
  st.history.push(brief.slice(0, 140) + " -> " + item.status + ": " + String(item.result || "").slice(0, 80));
  st.history = st.history.slice(-12);
  await kvSet("agent", st);
  const slow = ["open_app", "open_url", "whatsapp_send", "home", "recents"].includes(item.command);
  await enqueue("read_screen", {}, slow ? 3500 : 1800);
}
