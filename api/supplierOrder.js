export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      productName,
      quantity,
      supplierName,
      totalCost,
      approved
    } = req.body || {};

    if (!productName || !supplierName) {
      return res.status(400).json({
        error: "Product name and supplier name are required"
      });
    }

    if (approved !== true) {
      return res.status(403).json({
        error: "Human approval is required before supplier order"
      });
    }

    return res.status(200).json({
      productName,
      quantity: Number(quantity || 0),
      supplierName,
      totalCost: Number(totalCost || 0),
      approved: true,
      supplierOrderPlaced: false,
      status:
        "Human approval confirmed. Supplier API connection is required before placing the order."
    });

  } catch (error) {
    return res.status(500).json({
      error:
        error.message || "Supplier order preparation failed"
    });
  }
}
