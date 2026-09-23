export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const formData = await req.formData();

    const image = formData.get("image");
    const prompt = formData.get("prompt");

    if (!image) {
      return res.status(400).json({
        error: "Image is required"
      });
    }

    if (!prompt) {
      return res.status(400).json({
        error: "Edit instruction is required"
      });
    }

    const openaiForm = new FormData();

    openaiForm.append("model", "gpt-image-2");
    openaiForm.append("image", image);
    openaiForm.append("prompt", prompt);

    const response = await fetch(
      "https://api.openai.com/v1/images/edits",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: openaiForm
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Image editing failed"
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error"
    });
  }
        }
