import { auth, calcOrder, addAction } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!auth(req, res)) return;

  const { productName, quantity, unitCost, shipping, sellingPrice, adPerUnit, feePercent, submit } =
    req.body || {};

  if (!productName) return res.status(400).json({ error: "Product name is required" });

  const result = calcOrder({ quantity, unitCost, shipping, sellingPrice, adPerUnit, feePercent });
  if (!result) return res.status(400).json({ error: "Valid numbers are required" });

  // Only queue for approval when the user presses "Send for approval".
  if (submit === true) {
    const action = await addAction("order", `Order: ${productName} x${result.quantity}`, {
      productName,
      ...result
    });
    return res.status(200).json({ productName, ...result, queued: true, actionId: action.id });
  }

  return res.status(200).json({ productName, ...result, queued: false });
}
