let conversations = {};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      conversationId,
      message
    } = req.body || {};

    if (!message) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const id =
      conversationId ||
      `supplier-${Date.now()}`;

    if (!conversations[id]) {
      conversations[id] = [];
    }

    conversations[id].push({
      role: "user",
      content: message
    });

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization":
            `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",

          instructions: `
You are Rafi AI, a professional supplier communication assistant.

Continue the supplier conversation naturally using the previous messages.

Focus on:
- Price
- Quantity
- MOQ
- Shipping
- Delivery time
- Stock
- Quality
- Packaging
- Tracking
- Negotiation

Never invent supplier information.
If information is missing, ask for it.
Never place an order.
Never make a payment.
Never approve spending money.

Give clear and professional replies.
`,

          input: conversations[id]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data.error?.message ||
          "OpenAI request failed"
      });
    }

    const reply =
      data.output_text ||
      "No reply generated.";

    conversations[id].push({
      role: "assistant",
      content: reply
    });

    return res.status(200).json({
      conversationId: id,
      reply: reply,
      messages: conversations[id],
      status: "AI conversation ready"
    });

  } catch (error) {
    return res.status(500).json({
      error:
        error.message ||
        "Supplier conversation failed"
    });
  }
}
