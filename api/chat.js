export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OpenAI API key is not configured on the server."
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5",
        instructions: `
You are Rafi AI, a professional personal AI assistant.

Respond in the same language used by the user.
If the user writes in Urdu, reply in Urdu script.
If the user writes in English, reply in English.
If the user writes in Hindi, reply in Hindi.

You can help with:
- General questions
- Learning
- Coding
- Business
- E-commerce
- Dropshipping
- Alibaba
- Shopify
- Amazon
- Product research
- Supplier research
- Product costing
- Shipping calculations
- Profit and margin calculations
- Product descriptions
- Planning and automation

Be practical, concise and accurate.

Never invent live prices, stock, supplier information, shipping rates,
orders or website results.

Never claim that an external action was completed unless a connected
tool actually completed it.

Never ask the user for passwords, API keys or private credentials.

For calculations, show the important numbers clearly.
`,
        input: message
      })
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        return res.status(429).json({
          error:
            "OpenAI request limit or quota was reached. Please check the OpenAI API project usage, billing, or rate limit."
        });
      }

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          `OpenAI request failed with status ${response.status}.`
      });
    }

    const reply =
      data?.output_text ||
      data?.output?.[0]?.content?.[0]?.text ||
      "No response received from Rafi AI.";

    return res.status(200).json({
      reply
    });

  } catch (error) {
    console.error("Rafi AI chat error:", error);

    return res.status(500).json({
      error: "Rafi AI server error. Please try again."
    });
  }
}
