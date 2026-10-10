import { auth, kvGet, log } from "./_lib.js";
import { hasGemini, geminiGenerate } from "./gemini.js";
import { buildSystem } from "./_profile.js";

const VISION_RULES = `
You are Rafi AI, the owner's personal AI companion. Right now you can SEE the owner through his own camera, which he switched on himself (a preview and a red indicator are visible to him, and he can stop it at any time).
Rules:
- Reply in Urdu script, in 1 or 2 short sentences (it is read aloud). Be warm and respectful, call him "سر" or "باس" sometimes.
- Describe or answer only what is really visible. Never invent details. If the picture is dark or unclear, say so.
- Do not identify other people by face. You may say how many people are visible.
- Never mention that frames are stored; they are not stored.
`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!auth(req, res)) return;
  if (!hasGemini()) return res.status(200).json({ reply: "کیمرہ دیکھنے کے لیے GEMINI_API_KEY ضروری ہے۔" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(body.image || ""));
  if (!m) return res.status(400).json({ error: "A JPEG/PNG/WEBP image (data URL) is required." });
  if (m[2].length > 2_000_000) return res.status(413).json({ error: "Image is too large." });

  try {
    const memory = await kvGet("memory", []);
    const system = buildSystem(VISION_RULES, memory);
    const question = String(body.question || "").slice(0, 500);
    const prompt = body.proactive
      ? "This is a periodic check-in frame. Say at most ONE short friendly sentence: a comment, or one caring question about what he is doing or how he feels. If there is nothing worth saying, reply with exactly: NOTHING"
      : (question || "Look at me and tell me what you see, then ask me one short friendly question.");
    const reply = await geminiGenerate({
      system,
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: m[1], data: m[2] } }, { text: prompt }] }],
      maxOutputTokens: 1024
    });
    if (!body.proactive) { try { await log("Camera look: answered", "core"); } catch (e) { /* ignore */ } }
    return res.status(200).json({ reply: reply || "NOTHING" });
  } catch (e) {
    const detail = String((e && e.message) || e || "").replace(/AIza[0-9A-Za-z_\-]+/g, "AIza...").slice(0, 200);
    return res.status(200).json({ reply: "", error: detail });
  }
}
