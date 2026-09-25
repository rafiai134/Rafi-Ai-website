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
      supplierPrice,
      shippingCost,
      sellingPrice,
      stock,
      deliveryTime
    } = req.body || {};

    if (!productName) {
      return res.status(400).json({
        error: "Product name is required"
      });
    }

    const qty = Number(quantity);
    const price = Number(supplierPrice);
    const shipping = Number(shippingCost);
    const selling = Number(sellingPrice);

    if (
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isFinite(shipping) ||
      shipping < 0 ||
      !Number.isFinite(selling) ||
      selling < 0
    ) {
      return res.status(400).json({
        error: "Valid order numbers are required"
      });
    }

    const productTotal = price * qty;
    const shippingTotal = shipping * qty;
    const totalCost = productTotal + shippingTotal;
    const totalRevenue = selling * qty;
    const estimatedProfit = totalRevenue - totalCost;

    return res.status(200).json({
      productName,
      quantity: qty,
      supplierPrice: Number(price.toFixed(2)),
      shippingCostPerUnit: Number(shipping.toFixed(2)),
      sellingPricePerUnit: Number(selling.toFixed(2)),
      productTotal: Number(productTotal.toFixed(2)),
      shippingTotal: Number(shippingTotal.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      estimatedProfit: Number(estimatedProfit.toFixed(2)),
      stock: stock || "Not provided",
      deliveryTime: deliveryTime || "Not provided",
      approvalRequired: true,
      approved: false,
      status: "Order prepared — waiting for human approval"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Order preparation failed"
    });
  }
}
