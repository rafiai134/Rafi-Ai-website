import Busboy from "busboy";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const bb = Busboy({
      headers: req.headers
    });

    let prompt = "";
    let imageBuffer = null;
    let imageInfo = null;

    bb.on("field", (name, value) => {
      if (name === "prompt") {
        prompt = value;
      }
    });

    bb.on("file", (name, file, info) => {
      if (name !== "image") {
        file.resume();
        return;
      }

      imageInfo = info;

      const chunks = [];

      file.on("data", (chunk) => {
        chunks.push(chunk);
      });

      file.on("end", () => {
        imageBuffer = Buffer.concat(chunks);
      });
    });

    bb.on("finish", async () => {
      try {
        if (!imageBuffer) {
          return res.status(400).json({
            error: "Image is required"
          });
        }

        if (!prompt) {
          return res.status(400).json({
            error: "Edit instruction is required"
          });
        }

        const imageBlob = new Blob(
          [imageBuffer],
          {
            type: imageInfo?.mimeType || "image/png"
          }
        );

        const form = new FormData();

        form.append("model", "gpt-image-2");
        form.append("image", imageBlob, "image.png");
        form.append("prompt", prompt);

        const response = await fetch(
          "https://api.openai.com/v1/images/edits",
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: form
          }
        );

        const data = await response.json();

        if (!response.ok) {
          return res.status(response.status).json({
            error:
              data.error?.message ||
              "OpenAI image editing failed"
          });
        }

        return res.status(200).json(data);

      } catch (error) {
        return res.status(500).json({
          error: error.message ||
            "Image editing failed"
        });
      }
    });

    req.pipe(bb);

  } catch (error) {
    return res.status(500).json({
      error: error.message ||
        "Server error"
    });
  }
}
