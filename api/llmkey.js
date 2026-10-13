// Stores the backup AI key (Groq / OpenRouter / any OpenAI-compatible) privately in Redis.
import { auth, kvGet, kvSet, log } from "./_lib.js";

export default async function handler(req, res) {
  if (!auth(req, res)) return;
  if (req.method === "GET") {
    const k = await kvGet("llm_key", "");
    return res.status(200).json({ set: Boolean(k || process.env.LLM_API_KEY) });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const key = String(body.key || "").trim();
  if (key.length < 20 || key.length > 300 || !/^[A-Za-z0-9_\-.]+$/.test(key)) {
    return res.status(400).json({ error: "Key looks wrong" });
  }
  await kvSet("llm_key", key);
  await log("Backup AI key saved privately", "core");
  return res.status(200).json({ ok: true });
}
