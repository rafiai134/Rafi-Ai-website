import { auth, kvGet, kvSet, log } from "./_lib.js";

// Private owner profile. Stored in Redis (not in the code). Needs the same admin token as the rest of the app.
export default async function handler(req, res) {
  if (!auth(req, res)) return;
  const memory = (await kvGet("memory", [])) || [];

  if (req.method === "GET") {
    const p = memory.find((x) => x && x.profile);
    return res.status(200).json({ text: p ? p.fact : "", length: p ? String(p.fact).length : 0 });
  }

  if (req.method === "POST") {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const text = String(body.text || "").trim().slice(0, 8000);
    if (!text) return res.status(400).json({ error: "text is required" });
    const rest = memory.filter((x) => !(x && x.profile));
    rest.unshift({ fact: text, profile: true, t: Date.now() });
    await kvSet("memory", rest.slice(0, 100));
    await log("Owner profile saved (" + text.length + " characters)", "core");
    return res.status(200).json({ ok: true, length: text.length });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
