// Vision through the backup OpenAI-compatible provider (Groq by default). Key from env or private Redis.
import { kvGet } from "./_lib.js";

async function getKey() {
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;
  try { return (await kvGet("llm_key", "")) || ""; } catch (e) { return ""; }
}
function baseUrl(k) {
  if (process.env.LLM_BASE_URL) return process.env.LLM_BASE_URL.replace(/\/+$/, "");
  if (/^sk-or-/.test(k)) return "https://openrouter.ai/api/v1";
  return "https://api.groq.com/openai/v1";
}

export async function hasBackupKey() { return Boolean(await getKey()); }

export async function visionCompat({ system, mime, data, prompt, maxTokens = 400 }) {
  const k = await getKey();
  if (!k) throw new Error("no backup key");
  const base = baseUrl(k);
  let ids = [];
  try {
    const r = await fetch(base + "/models", { headers: { authorization: "Bearer " + k }, signal: AbortSignal.timeout(8000) });
    const d = await r.json().catch(() => ({}));
    ids = (d.data || []).map((m) => m.id).filter(Boolean);
  } catch (e) {}
  const prefs = [/llama-4-scout/, /qwen.*3\.8/, /qwen.*vl/, /llama-4-maverick/, /vision|vl\b/i];
  const picked = [];
  for (const p of prefs) for (const id of ids) if (p.test(id) && !/whisper|tts|guard|embed|orpheus|safeguard/i.test(id) && !picked.includes(id)) picked.push(id);
  if (!picked.length) picked.push("meta-llama/llama-4-scout-17b-16e-instruct", "qwen/qwen3.8-27b");
  const errors = [];
  for (const model of picked.slice(0, 3)) {
    try {
      const r = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + k },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.4,
          messages: [
            { role: "system", content: system },
            { role: "user", content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mime};base64,${data}` } }
            ] }
          ]
        }),
        signal: AbortSignal.timeout(25000)
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "")
          .replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        if (text) return text;
        errors.push(model + ": empty");
        continue;
      }
      errors.push((model + ": " + ((j.error && j.error.message) || r.status)).slice(0, 100));
    } catch (e) { errors.push(model + ": timeout"); }
  }
  throw new Error(errors.join(" | ").slice(0, 300));
}
