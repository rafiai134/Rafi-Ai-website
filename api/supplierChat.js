export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      supplierMessage,
      productName,
      supplierPrice,
      quantity,
      shippingCost,
      deliveryTime
    } = req.body || {};

    if (!supplierMessage) {
      return res.status(400).json({
        error: "Supplier message is required"
      });
    }

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },

        body: JSON.stringify({
          model: "gpt-5",

          instructions: `
You are Rafi AI Supplier Communication Assistant.

Understand the supplier's message and prepare a professional reply.

Focus on:
- Product price
- Quantity
- MOQ
- Shipping cost
- Delivery time
- Stock availability
- Product quality
- Tracking
- Negotiation

Never invent supplier information.
Never place an order or make a payment.

If important information is missing, ask the supplier for it.

Reply professionally and clearly.
`,

          input: `
Product: ${productName || "Not provided"}
Quantity: ${quantity || "Not provided"}
Supplier price: ${supplierPrice || "Not provided"}
Shipping: ${shippingCost || "Not provided"}
Delivery time: ${deliveryTime || "Not provided"}

Supplier message:
${supplierMessage}

Prepare the reply that Rafi AI should send to the supplier.
`
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "OpenAI request failed"
      });
    }

    return res.status(200).json({
      reply: data.output_text || "No reply generated."
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Supplier chat failed"
    });
  }
          }
