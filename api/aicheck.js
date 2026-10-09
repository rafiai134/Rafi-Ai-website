import { openai, config } from "./_lib.js";
import { hasGemini, geminiPing, runGemini } from "./gemini.js";

const S = { type: "string" }, N = { type: "number" };
const testTools = [
  { name: "open_platform", description: "Open a website link.", parameters: { type: "object", properties: { name: S }, required: ["name"] } },
  { name: "calc_order", description: "Calculate profit.", parameters: { type: "object", properties: { quantity: N, unitCost: N, shipping: N, sellingPrice: N, adPerUnit: N }, required: ["quantity", "unitCost", "sellingPrice"] } },
  { name: "delegate_agent", description: "Assign a business task.", parameters: { type: "object", properties: { agent: { type: "string", enum: ["core", "supplier", "shopify", "whatsapp"] }, task: S }, required: ["agent", "task"] } },
  { name: "device_command", description: "Queue ONE command for the user's Android phone.", parameters: { type: "object", properties: { command: { type: "string", enum: ["home", "back", "open_app", "open_url", "tap_text", "type_text"] }, appName: S, packageName: S, url: S, to: S, x: N, y: N, text: S, delayMs: N }, required: ["command"] } }
];

// Diagnostic only: tells whether the AI keys work. Returns no secrets.
export default async function handler(req, res) {
  const out = { geminiKey: hasGemini(), openaiKey: Boolean(config().openai) };
  const t0 = Date.now();
  if (out.geminiKey) {
    out.gemini = await geminiPing();
    out.geminiMs = Date.now() - t0;
    if (req.query && req.query.tools) {
      const calls = [];
      const t1 = Date.now();
      try {
        const text = await runGemini({
          message: "Open WhatsApp on my phone",
          history: [],
          ui: [],
          runTool: async (name, args) => { calls.push({ name, args }); return { ok: true }; },
          instructions: "You control the owner's Android phone. For any phone request call device_command. Reply in Urdu.",
          tools: testTools
        });
        out.toolTest = { ok: true, ms: Date.now() - t1, calls, reply: String(text).slice(0, 120) };
      } catch (e) {
        out.toolTest = { ok: false, ms: Date.now() - t1, status: e.status || null, message: String(e.message || e).replace(/AIza[0-9A-Za-z_\-]+/g, "AIza...").slice(0, 300) };
      }
    }
  }
  if (!req.query || !req.query.tools) {
    if (out.openaiKey) {
      try {
        await openai({ instructions: "Reply with one word.", input: "hi", max_output_tokens: 16 });
        out.openai = { ok: true };
      } catch (e) {
        out.openai = { ok: false, status: (e && e.status) || null, message: String((e && e.message) || e || "").replace(/sk-[A-Za-z0-9_\-]+/g, "sk-...").slice(0, 200) };
      }
    }
  }
  return res.status(200).json(out);
}
