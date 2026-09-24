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
      unitCost,
      shippingCost,
      sellingPrice
    } = req.body || {};

    const qty = Number(quantity);
    const cost = Number(unitCost);
    const shipping = Number(shippingCost);
    const selling = Number(sellingPrice);

    if (!productName || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({
        error: "Product name and valid quantity are required"
      });
    }

    if (
      !Number.isFinite(cost) ||
      cost < 0 ||
      !Number.isFinite(shipping) ||
      shipping < 0 ||
      !Number.isFinite(selling) ||
      selling < 0
    ) {
      return res.status(400).json({
        error: "Valid cost, shipping and selling price are required"
      });
    }

    const productTotal = cost * qty;
    const shippingTotal = shipping * qty;
    const totalCost = productTotal + shippingTotal;
    const totalRevenue = selling * qty;
    const estimatedProfit = totalRevenue - totalCost;

    return res.status(200).json({
      productName,
      quantity: qty,
      unitCost: Number(cost.toFixed(2)),
      shippingCostPerUnit: Number(shipping.toFixed(2)),
      sellingPricePerUnit: Number(selling.toFixed(2)),
      productTotal: Number(productTotal.toFixed(2)),
      shippingTotal: Number(shippingTotal.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      estimatedProfit: Number(estimatedProfit.toFixed(2)),
      approvalRequired: true,
      approved: false,
      status: "Waiting for human approval"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Approval check failed"
    });
  }
      }
