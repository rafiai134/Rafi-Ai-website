// Bulk-import phone contacts (picked on the phone with the browser's Contact Picker) into private Redis.
import { auth, kvGet, kvSet, log } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!auth(req, res)) return;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const list = Array.isArray(body.contacts) ? body.contacts.slice(0, 500) : [];
  const map = (await kvGet("contacts", {})) || {};
  let added = 0;
  for (const c of list) {
    const name = String((c && c.name) || "").trim().slice(0, 60);
    const phone = String((c && c.phone) || "").replace(/\D/g, "");
    if (!name || phone.length < 8 || phone.length > 15) continue;
    if (Object.keys(map).length >= 2500 && !(name in map)) break;
    map[name] = phone;
    added++;
  }
  await kvSet("contacts", map);
  try { await log("Contacts imported: " + added, "core"); } catch (e) { /* ignore */ }
  return res.status(200).json({ ok: true, added, total: Object.keys(map).length });
}
