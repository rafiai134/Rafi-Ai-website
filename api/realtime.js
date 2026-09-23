export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk)
      );
    }

    const sdp = Buffer.concat(chunks).toString("utf8");

    if (!sdp.trim()) {
      return res.status(400).json({
        error: "SDP offer is missing"
      });
    }

    const form = new FormData();

    form.set("sdp", sdp);

    form.set(
      "session",
      JSON.stringify({
        type: "realtime",
        model: "gpt-realtime-2.1",
        audio: {
          output: {
            voice: "marin"
          }
        }
      })
    );

    const response = await fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: form
      }
    );

    const result = await response.text();

    if (!response.ok) {
      return res.status(response.status).send(result);
    }

    return res.status(200).send(result);

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Realtime call failed"
    });
  }
      }
