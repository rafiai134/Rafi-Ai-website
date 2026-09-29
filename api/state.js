import { auth, config, kvGet, kvSet, log, waSend, shopifyDraft } from "./_lib.js";

async function execute(action) {
  const p = action.payload || {};
  switch (action.type) {
    case "whatsapp": {
      const r = await waSend(p.to, p.text);
      await log(r.ok ? `WhatsApp sent to ${p.name || p.to}` : `WhatsApp not sent: ${r.note}`, "whatsapp");
      return r;
    }
    case "shopify_listing": {
      const r = await shopifyDraft(p);
      await log(r.ok ? `Shopify draft created: ${p.title}` : `Shopify: ${r.note}`, "shopify");
      return r;
    }
    case "supplier_message": {
      await log(`Supplier message approved: ${p.supplier}`, "supplier");
      return { ok: true, note: "Approved. Copy the text and send it in the supplier chat.", copy: p.text };
    }
    case "order": {
      await log(`Order approved: ${p.productName}`, "supplier");
      return { ok: true, note: "Order approved and recorded. Supplier API is not connected, so place it manually." };
    }
    default:
      return { ok: false, note: "Unknown action type" };
  }
}

export default async function handler(req, res) {
  if (!auth(req, res)) return;

  if (req.method === "GET") {
    const [actions, activity, inbox, contacts] = await Promise.all([
      kvGet("actions", []),
      kvGet("activity", []),
      kvGet("inbox", []),
      kvGet("contacts", {})
    ]);
    return res.status(200).json({
      config: config(),
      actions: actions.slice(0, 20),
      activity: activity.slice(0, 15),
      inbox: inbox.slice(0, 8),
      contacts: Object.keys(contacts)
    });
  }

  if (req.method === "POST") {
    const { id, decision } = req.body || {};
    if (!id || !["approve", "reject"].includes(decision)) {
      return res.status(400).json({ error: "id and decision (approve/reject) are required" });
    }

    const actions = await kvGet("actions", []);
    const action = actions.find((a) => a.id === id);
    if (!action) return res.status(404).json({ error: "Action not found" });
    if (action.status !== "pending") {
      return res.status(409).json({ error: "Already " + action.status });
    }

    if (decision === "reject") {
      action.status = "rejected";
      await log("Rejected: " + action.summary, action.type);
    } else {
      // Mark first so a double tap cannot run the action twice.
      action.status = "running";
      await kvSet("actions", actions);
      const result = await execute(action);
      action.status = result.ok ? "done" : "failed";
      action.result = result;
    }

    await kvSet("actions", actions);
    return res.status(200).json({ action });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
