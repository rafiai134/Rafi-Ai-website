// Google Gemini adapter (free-tier friendly). Same tools as the OpenAI path, via Gemini function calling.

function toGeminiSchema(s) {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (s && typeof s === "object") {
    const o = {};
    for (const [k, v] of Object.entries(s)) {
      if (k === "type" && typeof v === "string") o[k] = v.toUpperCase();
      else o[k] = toGeminiSchema(v);
    }
    return o;
  }
  return s;
}

export const hasGemini = () => Boolean(process.env.GEMINI_API_KEY);

async function callGemini(body) {
  const key = process.env.GEMINI_API_KEY;
  const models = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"].filter(Boolean);
  let lastErr;
  for (const model of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return data;
    const err = new Error((data.error && data.error.message) || ("Gemini HTTP " + r.status));
    err.status = r.status;
    lastErr = err;
    // only a missing/invalid model is worth retrying with the next name
    if (r.status !== 404 && r.status !== 400) throw err;
  }
  throw lastErr;
}

export async function geminiPing() {
  try {
    await callGemini({ contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 16 } });
    return { ok: true };
  } catch (e) {
    return { ok: false, status: e.status || null, message: String(e.message || e).replace(/AIza[0-9A-Za-z_\-]+/g, "AIza...").slice(0, 200) };
  }
}

export async function runGemini({ message, history, ui, runTool, instructions, tools }) {
  const declarations = tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) }));

  let past = Array.isArray(history)
    ? history
        .slice(-12)
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content.slice(0, 2000) }] }))
    : [];
  while (past.length && past[0].role !== "user") past.shift();

  const contents = [...past, { role: "user", parts: [{ text: String(message).slice(0, 4000) }] }];

  for (let i = 0; i < 8; i++) {
    const data = await callGemini({
      systemInstruction: { parts: [{ text: instructions }] },
      contents,
      tools: [{ functionDeclarations: declarations }]
    });
    const cand = data.candidates && data.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) return parts.map((p) => p.text || "").join("").trim();

    contents.push({ role: "model", parts });
    const responses = [];
    for (const c of calls) {
      const name = c.functionCall.name;
      const result = await runTool(name, c.functionCall.args || {}, ui);
      responses.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return "";
}
