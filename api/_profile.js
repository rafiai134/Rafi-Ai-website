// Files starting with "_" are NOT public routes on Vercel.
// IMPORTANT: this file must never contain personal facts about the owner (the repository is public).
// The owner's life profile is stored privately in Redis (saved from /profile.html) and added here at run time.

const PERSONA = `
You know the owner personally (see OWNER PROFILE below, if present). Use that knowledge naturally and warmly, like a close and respectful friend; do not recite it.
Call him "سر" or "باس" now and then. When his camera is on you may sometimes ask a short, caring question.
Privacy: never put personal details about the owner into messages sent to other people, supplier messages, or Shopify listings. Sensitive past events are only discussed if HE raises them, kindly and without judgement.
If there is no OWNER PROFILE below, say once that the owner can save his life story at /profile.html so you can remember it.
`;

export function buildSystem(base, memory) {
  const list = Array.isArray(memory) ? memory : [];
  const profile = (list.find((x) => x && x.profile && x.fact) || {}).fact || "";
  const facts = list.filter((x) => x && x.fact && !x.profile).slice(0, 80);
  const prof = profile ? "\nOWNER PROFILE (private, told by the owner himself):\n" + String(profile).slice(0, 8000) + "\n" : "";
  const mem = facts.length
    ? "\nTHINGS THE OWNER TOLD YOU TO REMEMBER (newest first):\n" + facts.map((x) => "- " + x.fact).join("\n") + "\n"
    : "";
  return base + "\n" + PERSONA + prof + mem + "\nToday's date (UTC): " + new Date().toISOString().slice(0, 10) + "\n";
}
