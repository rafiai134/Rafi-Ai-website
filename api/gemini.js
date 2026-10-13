// AI brain adapter. Primary: Google Gemini (function calling). Fallback: any OpenAI-compatible chat API
// (Groq by default, free tier) when LLM_API_KEY is set. Used when Google denies/limits the project.

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

export const hasLLM = () => Boolean(process.env.LLM_API_KEY);
export const hasGemini = () => Boolean(process.env.GEMINI_API_KEY) || hasLLM();

/* ---------- Gemini ---------- */
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
  if (!key) throw new Error("no GEMINI_API_KEY");
  const found = await discoverModels(key);
  const models = [...new Set([process.env.GEMINI_MODEL, ...found, "gemini-flash-latest", "gemini-2.5-flash"].filter(Boolean))].slice(0, 8);
  const errors = [];
  let lastErr;
  let denied = 0;
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
      const err = new Error(`${model}: timeout`);
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
    errors.push(msg.slice(0, 90));
    if (r.status === 403) denied++;
    const err = new Error(msg);
    err.status = r.status;
    lastErr = err;
    modelCache.at = 0;
    if (r.status === 401) throw err;
    // a project-level denial applies to every model: stop early instead of burning time
    if (denied >= 2) break;
  }
  const all = new Error(errors.join(" | ").slice(0, 400));
  all.status = lastErr && lastErr.status;
  all.denied = denied >= 2;
  throw all;
}

export async function geminiPing() {
  try {
    await callGemini({ contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 16 } });
    return { ok: true, models: modelCache.list };
  } catch (e) {
    return { ok: false, status: e.status || null, message: String(e.message || e).replace(/AIza[0-9A-Za-z_\-]+/g, "AIza...").slice(0, 400) };
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

async function runGeminiOnly({ message, history, ui, runTool, instructions, tools }) {
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

/* ---------- OpenAI-compatible fallback (Groq / OpenRouter / Mistral ...) ---------- */
const llmBase = () => (process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
let llmCache = { at: 0, ids: [] };

async function llmModels() {
  if (process.env.LLM_MODEL) return [process.env.LLM_MODEL];
  if (llmCache.ids.length && Date.now() - llmCache.at < 10 * 60 * 1000) return llmCache.ids;
  let ids = [];
  try {
    const r = await fetch(llmBase() + "/models", { headers: { authorization: "Bearer " + process.env.LLM_API_KEY }, signal: AbortSignal.timeout(8000) });
    const d = await r.json().catch(() => ({}));
    ids = (d.data || []).map((m) => m.id).filter((id) => id && !/whisper|tts|guard|embed|playai|orpheus|safeguard|vision-preview|moderation/i.test(id));
  } catch (e) {}
  const prefs = [/gpt-oss-120b/, /llama-3\.3-70b/, /llama-4-maverick/, /llama.*70b/, /qwen/, /gpt-oss-20b/, /llama/];
  const picked = [];
  for (const p of prefs) for (const id of ids) if (p.test(id) && !picked.includes(id)) picked.push(id);
  if (!picked.length) picked.push("llama-3.3-70b-versatile", "openai/gpt-oss-120b");
  llmCache = { at: Date.now(), ids: picked.slice(0, 4) };
  return llmCache.ids;
}

async function callLLM(body) {
  const models = await llmModels();
  const errors = [];
  for (const model of models) {
    let r;
    try {
      r = await fetch(llmBase() + "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + process.env.LLM_API_KEY },
        body: JSON.stringify({ model, ...body }),
        signal: AbortSignal.timeout(25000)
      });
    } catch (e) { errors.push(model + ": timeout"); continue; }
    const data = await r.json().catch(() => ({}));
    if (r.ok) return data;
    errors.push((model + ": " + ((data.error && data.error.message) || r.status)).slice(0, 100));
    llmCache.at = 0;
    if (r.status === 401) break;
  }
  throw new Error(errors.join(" | ").slice(0, 400));
}

async function runCompat({ message, history, ui, runTool, instructions, tools }) {
  const defs = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const past = Array.isArray(history)
    ? history.slice(-12)
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    : [];
  const messages = [{ role: "system", content: instructions }, ...past, { role: "user", content: String(message).slice(0, 4000) }];

  for (let i = 0; i < 5; i++) {
    const data = await callLLM({ messages, tools: defs, tool_choice: "auto", temperature: 0.4, max_tokens: 1024 });
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) return "";
    const calls = msg.tool_calls || [];
    if (!calls.length) return String(msg.content || "").trim();
    messages.push({ role: "assistant", content: msg.content || "", tool_calls: calls });
    for (const c of calls) {
      let args = {};
      try { args = JSON.parse((c.function && c.function.arguments) || "{}"); } catch (e) {}
      const result = await runTool(c.function.name, args, ui);
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }
  return "";
}

/* ---------- entry point used by chat.js ---------- */
let geminiDownUntil = 0;
export async function runGemini(args) {
  let firstErr = null;
  if (process.env.GEMINI_API_KEY && !(hasLLM() && Date.now() < geminiDownUntil)) {
    try {
      return await runGeminiOnly(args);
    } catch (e) {
      firstErr = e;
      if (e && e.denied) geminiDownUntil = Date.now() + 5 * 60 * 1000;
      if (!hasLLM()) throw e;
    }
  }
  if (hasLLM()) {
    try {
      return await runCompat(args);
    } catch (e2) {
      throw new Error((firstErr ? "Gemini: " + String(firstErr.message).slice(0, 120) + " || " : "") + "LLM: " + String(e2.message).slice(0, 200));
    }
  }
  throw firstErr || new Error("No AI key set");
}
