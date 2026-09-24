export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      productName,
      supplierPrice,
      shippingCost,
      sellingPrice,
      competition
    } = req.body || {};

    if (!productName) {
      return res.status(400).json({
        error: "Product name is required"
      });
    }

    const price = Number(supplierPrice || 0);
    const shipping = Number(shippingCost || 0);
    const selling = Number(sellingPrice || 0);

    const totalCost = price + shipping;
    const profit = selling - totalCost;

    const profitMargin =
      selling > 0
        ? (profit / selling) * 100
        : 0;

    return res.status(200).json({
      product: productName,
      supplierPrice: price,
      shippingCost: shipping,
      totalCost: Number(totalCost.toFixed(2)),
      sellingPrice: selling,
      profit: Number(profit.toFixed(2)),
      profitMargin: Number(profitMargin.toFixed(2)),
      competition: competition || "Not provided",
      status: "Product research calculation ready"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Product research failed"
    });
  }
}
