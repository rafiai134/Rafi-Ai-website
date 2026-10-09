import { openai, config } from "./_lib.js";
import { hasGemini, geminiPing } from "./gemini.js";

// Diagnostic only: tells whether the AI keys work. Returns no secrets.
export default async function handler(req, res) {
  const out = { geminiKey: hasGemini(), openaiKey: Boolean(config().openai) };
  if (out.geminiKey) out.gemini = await geminiPing();
  if (out.openaiKey) {
    try {
      await openai({ instructions: "Reply with one word.", input: "hi", max_output_tokens: 16 });
      out.openai = { ok: true };
    } catch (e) {
      out.openai = { ok: false, status: (e && e.status) || null, message: String((e && e.message) || e || "").replace(/sk-[A-Za-z0-9_\-]+/g, "sk-...").slice(0, 200) };
    }
  }
  return res.status(200).json(out);
}
