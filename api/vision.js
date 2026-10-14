import { auth, kvGet, log } from "./_lib.js";
import { geminiGenerate } from "./gemini.js";
import { visionCompat, hasBackupKey } from "./_vision_llm.js";
import { buildSystem } from "./_profile.js";

const VISION_RULES = `
You are Rafi AI, the owner's personal AI companion. Right now you can SEE the owner through his own camera, which he switched on himself (a preview and a red indicator are visible to him, and he can stop it at any time).
This is the phone's FRONT camera, so you only see him and what is in front of the screen; you cannot see behind him or behind the phone.
Rules:
- Reply in Urdu script, in 1 or 2 short sentences (it is read aloud). Be warm and respectful, call him "سر" or "باس" sometimes.
- Describe or answer only what is really visible. Never invent details. If the picture is dark or unclear, say so.
- Do not identify other people by face. You may say how many people are visible.
- Never mention that frames are stored; they are not stored.
`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!auth(req, res)) return;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(body.image || ""));
  if (!m) return res.status(400).json({ error: "A JPEG/PNG/WEBP image (data URL) is required." });
  if (m[2].length > 2_000_000) return res.status(413).json({ error: "Image is too large." });

  let memory = [];
  try { memory = await kvGet("memory", []); } catch (e) { /* ignore */ }
  const system = buildSystem(VISION_RULES, memory);
  const question = String(body.question || "").slice(0, 500);
  const prompt = body.proactive
    ? "This is a periodic check-in frame. Say at most ONE short friendly sentence: a comment, or one caring question about what he is doing or how he feels. If there is nothing worth saying, reply with exactly: NOTHING"
    : (question || "Look at me and tell me what you see, then ask me one short friendly question.");

  let reply = "";
  let firstErr = "";
  if (process.env.GEMINI_API_KEY) {
    try {
      reply = await geminiGenerate({
        system,
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: m[1], data: m[2] } }, { text: prompt }] }],
        maxOutputTokens: 1024
      });
    } catch (e) { firstErr = String((e && e.message) || e); }
  }
  if (!reply && (await hasBackupKey())) {
    try {
      reply = await visionCompat({ system, mime: m[1], data: m[2], prompt });
      firstErr = "";
    } catch (e2) { firstErr = (firstErr ? firstErr.slice(0, 100) + " || " : "") + String((e2 && e2.message) || e2); }
  }
  if (!reply && firstErr) {
    const detail = firstErr.replace(/AIza[0-9A-Za-z_\-]+/g, "AIza...").slice(0, 250);
    return res.status(200).json({ reply: "", error: detail });
  }
  if (!body.proactive) { try { await log("Camera look: answered", "core"); } catch (e) { /* ignore */ } }
  return res.status(200).json({ reply: reply || "NOTHING" });
}
