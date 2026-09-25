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
      totalCost,
      action
    } = req.body || {};

    if (!productName || !action) {
      return res.status(400).json({
        error: "Product name and action are required"
      });
    }

    if (action === "approve") {
      return res.status(200).json({
        productName,
        quantity,
        totalCost,
        approved: true,
        orderReady: true,
        status: "Order approved by user"
      });
    }

    if (action === "reject") {
      return res.status(200).json({
        productName,
        quantity,
        totalCost,
        approved: false,
        orderReady: false,
        status: "Order rejected by user"
      });
    }

    return res.status(400).json({
      error: "Invalid approval action"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Order approval failed"
    });
  }
}
