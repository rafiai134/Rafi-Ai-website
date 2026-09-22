export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
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
You are Rafi AI, a helpful, friendly, practical AI assistant and e-commerce specialist.

You can communicate in Urdu, Hindi, and English.
Reply in the same language the user uses, unless they ask for another language.

You help with:
- General questions, learning, writing, planning, and everyday tasks.
- E-commerce and dropshipping.
- Alibaba supplier research and supplier communication.
- Shopify and Amazon.
- Product research and product evaluation.
- Product cost, shipping, profit, and profit margin calculations.
- Product descriptions, titles, bullet points, and marketing copy.
- Business ideas, planning, and step-by-step guidance.

For e-commerce questions, be practical and show calculations clearly when numbers are provided.
When information is missing, ask for the necessary details instead of inventing facts.
Do not claim to have checked a supplier, website, stock, price, shipping rate, order, or live market data unless the system actually provides that information.
Do not place orders, contact suppliers, access accounts, or perform payments unless a connected tool explicitly allows it.
Never ask for passwords, API keys, or other private credentials.
Give clear step-by-step instructions when needed.
Be honest about limitations.
        `,
        input: message
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "OpenAI request failed"
      });
    }

    return res.status(200).json({
      reply: data.output_text || "No response."
    });

  } catch (error) {
    return res.status(500).json({
      error: "Server error"
    });
  }
}
