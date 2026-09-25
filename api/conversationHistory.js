let history = {};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      conversationId,
      role,
      content
    } = req.body || {};

    if (!conversationId || !role || !content) {
      return res.status(400).json({
        error: "Conversation ID, role and content are required"
      });
    }

    if (!history[conversationId]) {
      history[conversationId] = [];
    }

    history[conversationId].push({
      role,
      content,
      createdAt: new Date().toISOString()
    });

    return res.status(200).json({
      conversationId,
      messages: history[conversationId],
      status: "Conversation history saved"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "History failed"
    });
  }
}
