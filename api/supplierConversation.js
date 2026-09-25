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

    return res.status(200).json({
      conversationId: id,
      messages: conversations[id],
      status: "Conversation saved"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Conversation failed"
    });
  }
        }
