import { openai, config } from "./_lib.js";

// Diagnostic only: tells whether the OpenAI key works. Returns no secrets.
export default async function handler(req, res) {
  const c = config();
  if (!c.openai) return res.status(200).json({ openaiKey: false, note: "OPENAI_API_KEY is not set on the server." });
  try {
    await openai({ instructions: "Reply with one word.", input: "hi", max_output_tokens: 16 });
    return res.status(200).json({ openaiKey: true, ok: true });
  } catch (e) {
    const message = String((e && e.message) || e || "").replace(/sk-[A-Za-z0-9_\-]+/g, "sk-...").slice(0, 200);
    return res.status(200).json({ openaiKey: true, ok: false, status: (e && e.status) || null, message });
  }
}
