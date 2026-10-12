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

/* Google retires models often. Ask Google which models this key can use right now and try them newest first. */
let modelCache = { at: 0, list: [] };
async function discoverModels(key) {
  if (modelCache.list.length && Date.now() - modelCache.at < 10 * 60 * 1000) return modelCache.list;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(8000)
    });
    const d = await r.json().catch(() => ({}));
    const found = (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter((n) => /flash/i.test(n) && !/lite|image|tts|audio|live|embed|robot|computer|native|vision-only/i.test(n))
      .map((n) => {
        const v = /gemini-(\d+(?:\.\d+)?)/.exec(n);
        return { n, v: v ? parseFloat(v[1]) : 0, pre: /preview|exp/i.test(n) ? 1 : 0 };
      })
      .sort((a, b) => b.v - a.v || a.pre - b.pre)
      .map((x) => x.n);
    if (found.length) {
      modelCache = { at: Date.now(), list: found.slice(0, 6) };
      return modelCache.list;
    }
  } catch (e) {}
  return [];
}

async function callGemini(body) {
  const key = process.env.GEMINI_API_KEY;
  const found = await discoverModels(key);
  const models = [...new Set([process.env.GEMINI_MODEL, ...found, "gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash"].filter(Boolean))].slice(0, 8);
  const errors = [];
  let lastErr;
  for (const model of models) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      });
    } catch (e) {
      const err = new Error(`${model}: request failed or timed out`);
      err.status = 504;
      errors.push(err.message);
      lastErr = err;
      continue;
    }
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      if (found.includes(model)) modelCache = { at: Date.now(), list: [model, ...found.filter((x) => x !== model)] };
      return data;
    }
    const msg = `${model}: ` + ((data.error && data.error.message) || ("HTTP " + r.status));
    errors.push(msg.slice(0, 120));
    const err = new Error(msg);
    err.status = r.status;
    lastErr = err;
    modelCache.at = 0; // force re-discovery next time
    // try the next model on any model-specific failure: 400/403/404/429/5xx. Stop only on a bad key (401).
    if (r.status === 401) throw err;
  }
  const all = new Error(errors.join(" | ").slice(0, 500));
  all.status = lastErr && lastErr.status;
  throw all;
}

export async function geminiPing() {
  try {
    await callGemini({ contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 16 } });
    return { ok: true, models: modelCache.list };
  } catch (e) {
    return { ok: false, status: e.status || null, message: String(e.message || e).replace(/AIza[0-9A-Za-z_\-]+/g, "AIza...").slice(0, 500) };
  }
}

/* Plain text generation (used for camera vision: contents may include inlineData images). */
export async function geminiGenerate({ system, contents, maxOutputTokens = 1024 }) {
  const data = await callGemini({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { maxOutputTokens }
  });
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  return parts.map((p) => p.text || "").join("").trim();
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

  for (let i = 0; i < 5; i++) {
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
