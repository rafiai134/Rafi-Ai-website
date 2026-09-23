export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const form = new FormData();

    form.set("sdp", req.body);

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
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: form
      }
    );

    const answer = await response.text();

    if (!response.ok) {
      return res.status(response.status).send(answer);
    }

    return res.status(200).send(answer);

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Live Call failed"
    });
  }
    }
