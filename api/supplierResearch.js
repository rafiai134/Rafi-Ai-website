export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      supplierName,
      productName,
      unitPrice,
      moq,
      stock,
      shippingCost,
      deliveryTime
    } = req.body || {};

    if (!supplierName || !productName) {
      return res.status(400).json({
        error: "Supplier name and product name are required"
      });
    }

    const price = Number(unitPrice || 0);
    const shipping = Number(shippingCost || 0);

    const estimatedUnitCost = price + shipping;

    return res.status(200).json({
      supplier: supplierName,
      product: productName,
      unitPrice: price,
      shippingCost: shipping,
      estimatedUnitCost: Number(
        estimatedUnitCost.toFixed(2)
      ),
      minimumOrderQuantity: Number(moq || 0),
      stock: stock || "Not provided",
      deliveryTime: deliveryTime || "Not provided",
      supplierCheck: {
        priceAvailable: price > 0,
        shippingAvailable: shipping >= 0,
        stockAvailable: Boolean(stock),
        deliveryTimeAvailable: Boolean(deliveryTime)
      },
      status: "Supplier research foundation ready"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Supplier research failed"
    });
  }
      }
