const $ = (id) => document.getElementById(id);

let TOKEN = localStorage.getItem("rafi_token") || "";
let history = [];
let busy = false;
let state = { actions: [], activity: [], inbox: [], contacts: [], config: {}, agentTasks: [], device: {} };

/* =========================
   API + LOGIN
========================= */
async function api(path, opts = {}) {
  const res = await fetch("/api/" + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": TOKEN,
      ...(opts.headers || {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    showLogin("ٹوکن غلط ہے");
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function showLogin(err = "") {
  $("login").hidden = false;
  $("loginError").textContent = err;
  $("tokenInput").focus();
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  TOKEN = $("tokenInput").value.trim();
  if (!TOKEN) return;
  localStorage.setItem("rafi_token", TOKEN);
  $("login").hidden = true;
  $("tokenInput").value = "";
  await refresh();
});

/* =========================
   CLOCK
========================= */
setInterval(() => {
  $("clock").textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}, 1000);

/* =========================
   CHAT
========================= */
const box = $("chatMessages");

function addMsg(text, kind = "bot", links = []) {
  const div = document.createElement("div");
  div.className = "msg " + kind;
  div.textContent = text;
  if (links.length) {
    const row = document.createElement("div");
    row.className = "links";
    links.forEach((l) => {
      const a = document.createElement("a");
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Open " + l.label;
      row.appendChild(a);
    });
    div.appendChild(row);
  }
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function setCore(mode, label) {
  const core = $("core");
  core.classList.remove("listening", "thinking", "speaking");
  if (mode) core.classList.add(mode);
  $("coreState").textContent = label;
}

async function sendMessage(textOverride) {
  const input = $("messageInput");
  const message = (textOverride ?? input.value).trim();
  if (!message || busy) return;

  busy = true;
  input.value = "";
  input.style.height = "auto";
  addMsg(message, "me");
  setCore("thinking", "Thinking…");
  agentWorking.core = true;

  try {
    const data = await api("chat", { method: "POST", body: { message, history: history.slice(-12) } });
    history.push({ role: "user", content: message }, { role: "assistant", content: data.reply });
    addMsg(data.reply, "bot", data.ui || []);
    runAgentUi(data.ui || []);

    const first = (data.ui || []).find((u) => u.type === "open");
    if (first) window.open(first.url, "_blank", "noopener"); // may be blocked; the button stays visible

    refresh();
    speak(data.reply);
  } catch (err) {
    if (err.message !== "Unauthorized") addMsg(err.message, "bot err");
    setCore(null, "Listening for Rafi");
  } finally {
    busy = false;
    agentWorking.core = false;
    $("messageInput").focus();
  }
}

$("send").addEventListener("click", () => sendMessage());
$("messageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
$("messageInput").addEventListener("input", (e) => {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
});
$("clear").addEventListener("click", () => {
  history = [];
  box.innerHTML = "";
  addMsg("چیٹ صاف ہو گئی۔ بتائیں، کیا کرنا ہے؟");
});

/* =========================
   VOICE (browser speech)
========================= */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let listening = false;
let wakeListening = false;
let wakeRec = null;
let wakeRetry = null;

function startListening() {
  if (wakeRec && wakeListening) {
    try { wakeRec.stop(); } catch {}
    wakeListening = false;
  }
  if (!SR) {
    addMsg("اس براؤزر میں آواز پہچاننے کی سہولت نہیں۔ Chrome استعمال کریں۔", "bot err");
    return;
  }
  if (listening || busy) return;
  if (window.speechSynthesis) speechSynthesis.cancel();

  rec = new SR();
  rec.lang = $("lang").value;
  rec.interimResults = false;
  rec.continuous = false;

  rec.onstart = () => {
    localStorage.setItem("rafi_mic_granted", "1");
    listening = true;
    $("mic").classList.add("on");
    setCore("listening", "Listening…");
  };
  rec.onend = () => {
    listening = false;
    $("mic").classList.remove("on");
    if (!busy) {
      setCore(null, "Listening for Rafi");
      if (localStorage.getItem("rafi_mic_granted") === "1") setTimeout(startWakeWord, 350);
    }
  };
  rec.onerror = () => {
    listening = false;
    $("mic").classList.remove("on");
    setCore(null, "Listening for Rafi");
    if (localStorage.getItem("rafi_mic_granted") === "1") setTimeout(startWakeWord, 500);
  };
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    sendMessage(text);
  };
  try { rec.start(); } catch { /* already started */ }
}

function stopListening() {
  if (rec && listening) rec.stop();
}

$("mic").addEventListener("click", async () => {
  if (listening) return stopListening();
  try {
    if (navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      localStorage.setItem("rafi_mic_granted", "1");
    }
  } catch {}
  startListening();
});
$("core").addEventListener("click", () => (listening ? stopListening() : startListening()));

// Wake phrase: once microphone permission is granted, Rafi keeps a lightweight
// continuous recognizer listening for "Hello Rafi AI" / "ہیلو رافی AI".
function startWakeWord() {
  if (!SR || wakeListening || listening || busy || location.protocol !== "https:") return;
  wakeRec = new SR();
  wakeRec.lang = $("lang").value === "en-US" ? "en-US" : "en-US";
  wakeRec.continuous = true;
  wakeRec.interimResults = false;
  wakeRec.onstart = () => { wakeListening = true; };
  wakeRec.onend = () => {
    wakeListening = false;
    clearTimeout(wakeRetry);
    wakeRetry = setTimeout(startWakeWord, 700);
  };
  wakeRec.onerror = (e) => {
    wakeListening = false;
    if (e.error !== "not-allowed" && e.error !== "service-not-allowed") {
      clearTimeout(wakeRetry);
      wakeRetry = setTimeout(startWakeWord, 1200);
    }
  };
  wakeRec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (!e.results[i].isFinal) continue;
      const heard = e.results[i][0].transcript.trim();
      if (/\b(hello|hey|hi)\s+rafi(?:\s+ai)?\b/i.test(heard) || /ہیلو\s*رافی(?:\s*آئی|\s*ai)?/i.test(heard)) {
        try { wakeRec.stop(); } catch {}
        const command = heard
          .replace(/^.*?\b(hello|hey|hi)\s+rafi(?:\s+ai)?\b/i, "")
          .replace(/^.*?ہیلو\s*رافی(?:\s*آئی|\s*ai)?/i, "")
          .trim();
        if (command) sendMessage(command);
        else setTimeout(startListening, 120);
        break;
      }
    }
  };
  try { wakeRec.start(); } catch {}
}

async function enableWakeWord() {
  if (!SR || !navigator.mediaDevices?.getUserMedia) return;
  if (localStorage.getItem("rafi_mic_granted") === "1") return startWakeWord();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    localStorage.setItem("rafi_mic_granted", "1");
    startWakeWord();
  } catch {
    // The browser may require the user to allow microphone access once.
  }
}

if (SR) {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !listening && !busy && !wakeListening) startWakeWord();
  });
  window.addEventListener("load", enableWakeWord);
}


/* =========================
   SPEECH OUTPUT
========================= */
function pickVoice(lang) {
  const voices = speechSynthesis.getVoices();
  const base = lang.split("-")[0];
  return (
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang.startsWith(base)) ||
    (base === "ur" ? voices.find((v) => v.lang.startsWith("hi")) : null) ||
    null
  );
}

function speak(text) {
  if (!$("speakOn").checked || !("speechSynthesis" in window)) {
    setCore(null, "Listening for Rafi");
    afterSpeak();
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = $("lang").value;
  const v = pickVoice(u.lang);
  if (v) u.voice = v;
  u.onstart = () => setCore("speaking", "Speaking…");
  u.onend = () => { setCore(null, "Listening for Rafi"); afterSpeak(); };
  u.onerror = () => { setCore(null, "Listening for Rafi"); afterSpeak(); };
  speechSynthesis.speak(u);
}

function afterSpeak() {
  if ($("convo").checked) setTimeout(startListening, 400);
}

if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => {};

/* =========================
   STATE: approvals, feeds, pills
========================= */
async function refresh() {
  if (!TOKEN) return showLogin();
  try {
    state = await api("state");
    render();
  } catch { /* login shown or offline */ }
}

function render() {
  document.querySelectorAll(".pill").forEach((p) => {
    const on = state.config[p.dataset.k];
    p.classList.toggle("on", !!on);
    p.classList.toggle("off", !on);
  });

  const pending = state.actions.filter((a) => a.status === "pending");
  $("rdPending").textContent = pending.length;
  $("rdInbox").textContent = state.inbox.length;
  $("rdContacts").textContent = state.contacts.length;

  const ap = $("approvals");
  ap.innerHTML = "";
  const shown = state.actions.filter((a) => a.status === "pending" || a.result).slice(0, 6);
  if (!shown.length) ap.innerHTML = '<p class="empty">Nothing waiting.</p>';

  shown.forEach((a) => {
    const d = document.createElement("div");
    d.className = "appr";
    const body = a.payload?.text || (a.type === "shopify_listing" ? `${a.payload.title} — ${a.payload.price}` : "") ||
      (a.type === "order" ? `Profit ${a.payload.profit} (${a.payload.marginPercent}%)` : "");
    d.innerHTML = `<b></b><p dir="auto"></p>`;
    d.querySelector("b").textContent = a.summary;
    d.querySelector("p").textContent = body;

    if (a.status === "pending") {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = '<button class="yes" type="button">APPROVE</button><button class="no" type="button">REJECT</button>';
      row.querySelector(".yes").onclick = () => decide(a.id, "approve", row);
      row.querySelector(".no").onclick = () => decide(a.id, "reject", row);
      d.appendChild(row);
    } else {
      const s = document.createElement("div");
      s.className = "done";
      s.textContent = `${a.status}: ${a.result?.note || ""}`;
      d.appendChild(s);
    }
    ap.appendChild(d);
  });

  const inbox = $("inbox");
  inbox.innerHTML = state.inbox.length ? "" : '<p class="empty">No messages yet.</p>';
  state.inbox.forEach((m) => {
    const d = document.createElement("div");
    d.innerHTML = "<b></b> <span></span>";
    d.querySelector("b").textContent = m.name;
    d.querySelector("span").textContent = m.text;
    inbox.appendChild(d);
  });

  const act = $("activity");
  act.innerHTML = state.activity.length ? "" : '<p class="empty">No activity yet.</p>';
  state.activity.forEach((x) => {
    const d = document.createElement("div");
    d.textContent = new Date(x.t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + "  " + x.text;
    act.appendChild(d);
  });

  renderAgents(pending);
  renderAgentTasks();
}

async function decide(id, decision, row) {
  row.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    const { action } = await api("state", { method: "POST", body: { id, decision } });
    if (action.result?.copy) {
      try { await navigator.clipboard.writeText(action.result.copy); } catch { /* ignore */ }
      addMsg("سپلائر کا میسج کاپی ہو گیا۔ اب سپلائر کی چیٹ میں پیسٹ کریں۔");
    }
    await refresh();
  } catch (err) {
    addMsg(err.message, "bot err");
    row.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}

/* =========================
   ORDER CALCULATOR
========================= */
function calcBody(submit) {
  const n = (id) => $(id).value;
  return {
    productName: n("cProduct").trim(),
    quantity: n("cQty"),
    unitCost: n("cCost"),
    shipping: n("cShip") || 0,
    sellingPrice: n("cSell"),
    adPerUnit: n("cAd") || 0,
    feePercent: n("cFee") || 4,
    submit
  };
}

async function runCalc(submit) {
  const out = $("calcResult");
  out.textContent = "…";
  try {
    const r = await api("order", { method: "POST", body: calcBody(submit) });
    out.textContent =
      `Total cost: ${r.totalCost}\nRevenue: ${r.revenue}\nFees: ${r.fees}\nAds: ${r.ads}\n` +
      `Profit: ${r.profit} (${r.marginPercent}%)` +
      (r.warning ? `\n⚠ ${r.warning}` : "") +
      (r.queued ? "\nSent to the approval list." : "");
    if (r.queued) refresh();
  } catch (err) {
    out.textContent = err.message;
  }
}

$("calcForm").addEventListener("submit", (e) => { e.preventDefault(); runCalc(false); });
$("calcSubmit").addEventListener("click", () => {
  if ($("calcForm").reportValidity()) runCalc(true);
});

/* =========================
   RADAR (left HUD)
========================= */
const radar = $("radar");
const rctx = radar.getContext("2d");
let sweep = 0;
const blips = Array.from({ length: 6 }, () => ({ a: Math.random() * 6.28, r: 0.25 + Math.random() * 0.65 }));

function drawRadar() {
  const w = radar.width, c = w / 2;
  rctx.clearRect(0, 0, w, w);
  rctx.strokeStyle = "rgba(79,216,255,.35)";
  rctx.lineWidth = 1;
  [0.3, 0.55, 0.8, 0.98].forEach((k) => { rctx.beginPath(); rctx.arc(c, c, c * k, 0, 6.283); rctx.stroke(); });
  rctx.beginPath(); rctx.moveTo(c, 4); rctx.lineTo(c, w - 4); rctx.moveTo(4, c); rctx.lineTo(w - 4, c); rctx.stroke();

  const g = rctx.createConicGradient ? rctx.createConicGradient(sweep, c, c) : null;
  if (g) {
    g.addColorStop(0, "rgba(79,216,255,.55)");
    g.addColorStop(0.12, "rgba(79,216,255,0)");
    g.addColorStop(1, "rgba(79,216,255,0)");
    rctx.fillStyle = g;
    rctx.beginPath(); rctx.arc(c, c, c * 0.98, 0, 6.283); rctx.fill();
  }
  rctx.strokeStyle = "#4fd8ff";
  rctx.beginPath(); rctx.moveTo(c, c); rctx.lineTo(c + Math.cos(sweep) * c * 0.98, c + Math.sin(sweep) * c * 0.98); rctx.stroke();

  blips.forEach((b) => {
    rctx.fillStyle = "#ff8a3d";
    rctx.beginPath(); rctx.arc(c + Math.cos(b.a) * c * b.r, c + Math.sin(b.a) * c * b.r, 3, 0, 6.283); rctx.fill();
  });
  sweep += 0.03;
}

/* =========================
   PIXEL OFFICE (agents)
========================= */
const AGENTS = [
  { id: "core", name: "RAFI CORE", x: 90, y: 68, color: "#4fd8ff", seat: 0 },
  { id: "supplier", name: "SUPPLIER", x: 510, y: 68, color: "#ff8a3d", seat: 1 },
  { id: "shopify", name: "SHOPIFY", x: 90, y: 210, color: "#4dffb2", seat: 2 },
  { id: "whatsapp", name: "WHATSAPP", x: 510, y: 210, color: "#c084fc", seat: 3 }
];
const agentWorking = { core: false, supplier: false, shopify: false, whatsapp: false };
const agentMotion = {};
const office = $("office");
const octx = office.getContext("2d");
let tick = 0;

function px(x, y, w, h, color) { octx.fillStyle = color; octx.fillRect(x, y, w, h); }

function drawSeat(a) {
  const w = 145, h = 104;
  px(a.x - 16, a.y + 38, w, 8, "#16466f");
  px(a.x + 8, a.y + 18, 92, 8, "#0c3558");
  px(a.x + 18, a.y - 2, 74, 40, "#031321");
  px(a.x + 23, a.y + 3, 64, 30, agentWorking[a.id] && tick % 2 ? a.color : "#0b3b63");
  px(a.x + 27, a.y + 7, 12, 3, "rgba(255,255,255,.35)");
  px(a.x + 50, a.y + 7, 27, 3, "rgba(255,255,255,.18)");
  octx.font = "bold 11px Arial";
  octx.fillStyle = a.color;
  octx.fillText(a.name, a.x + 18, a.y + 58);
  octx.font = "9px Arial";
  octx.fillStyle = "#7f9ab2";
  octx.fillText(agentWorking[a.id] ? "WORKING / MOVING" : "READY / SEATED", a.x + 18, a.y + 73);
}

function drawBot(x, y, a, scale = 1) {
  const bob = agentWorking[a.id] ? Math.sin(tick * .35) * 3 : 0;
  const s = scale;
  octx.save();
  octx.shadowBlur = agentWorking[a.id] ? 18 : 8;
  octx.shadowColor = a.color;
  px(x + 12*s, y + 32*s + bob, 30*s, 38*s, a.color);
  px(x + 17*s, y + 10*s + bob, 20*s, 24*s, "#dffcff");
  px(x + 14*s, y + 7*s + bob, 26*s, 8*s, "#071b2e");
  px(x + 20*s, y + 17*s + bob, 4*s, 4*s, a.color);
  px(x + 30*s, y + 17*s + bob, 4*s, 4*s, a.color);
  px(x + 5*s, y + 38*s + bob, 8*s, 22*s, a.color);
  px(x + 42*s, y + 38*s + bob, 8*s, 22*s, a.color);
  octx.restore();
}

function drawOffice() {
  const W = office.width, H = office.height;
  octx.clearRect(0, 0, W, H);
  px(0, 0, W, H, "#061a2e");
  for (let y = 0; y < H; y += 20) for (let x = 0; x < W; x += 20) {
    if ((x + y) % 40 === 0) px(x, y, 20, 20, "#09233c");
  }
  px(W/2 - 2, 0, 4, H, "#16466f");
  px(0, H/2 - 2, W, 4, "#16466f");

  const center = {x: W/2 - 45, y: H/2 - 42};
  octx.beginPath();
  octx.arc(W/2, H/2, 58, 0, Math.PI*2);
  octx.strokeStyle = "rgba(84,220,255,.25)";
  octx.stroke();
  octx.font = "bold 10px Arial";
  octx.fillStyle = "#54dcff";
  octx.fillText("RAFI COMMAND CORE", center.x, center.y + 76);

  AGENTS.forEach(drawSeat);

  for (const a of AGENTS) {
    const m = agentMotion[a.id];
    if (m) {
      drawBot(m.x, m.y, a, 1.15);
      octx.font = "9px Arial";
      octx.fillStyle = a.color;
      octx.fillText(m.label || "TASK", m.x - 4, m.y - 8);
    } else {
      drawBot(a.x + 45, a.y + 46, a, .72);
    }
  }
}

function triggerAgentMove(agentId, task) {
  const agent = AGENTS.find((a) => a.id === agentId);
  if (!agent) return;
  agentWorking[agentId] = true;
  renderAgents([]);
  const seatPoint = { x: agent.x + 45, y: agent.y + 42 };
  const corePoint = { x: office.width / 2 - 24, y: office.height / 2 - 24 };
  const workPoint = agentId === "core"
    ? { x: corePoint.x, y: corePoint.y }
    : { x: corePoint.x + (agent.seat % 2 ? 70 : -70), y: corePoint.y + (agent.seat > 1 ? 55 : -55) };
  const path = [seatPoint, corePoint, workPoint, seatPoint];
  let segment = 0, progress = 0;
  const step = () => {
    progress += .055;
    const p = Math.min(progress, 1);
    const from = path[segment], to = path[segment + 1];
    agentMotion[agentId] = {
      x: from.x + (to.x - from.x) * p,
      y: from.y + (to.y - from.y) * p,
      label: segment === 0 ? "DELEGATING" : segment === 1 ? "WORKING" : "RETURNING"
    };
    drawOffice();
    if (p < 1) return requestAnimationFrame(step);
    if (segment < path.length - 2) {
      segment++;
      progress = 0;
      return requestAnimationFrame(step);
    }
    setTimeout(() => {
      delete agentMotion[agentId];
      agentWorking[agentId] = false;
      drawOffice();
      renderAgents([]);
    }, 700);
  };
  if (task) addMsg("🤖 " + agent.name + " کو task ملا: " + task);
  requestAnimationFrame(step);
}

function runAgentUi(ui) {
  if (!Array.isArray(ui)) return;
  ui.filter((x) => x && x.type === "agent_move").forEach((x) => triggerAgentMove(x.agent || "core", x.task || ""));
}

function renderAgentTasks() {
  const byAgent = { core: [], supplier: [], shopify: [], whatsapp: [] };
  state.agentTasks.forEach((t) => { if (byAgent[t.agent]) byAgent[t.agent].push(t); });
  document.querySelectorAll(".flow-agent").forEach((el) => {
    const key = el.classList.contains("supplier-agent") ? "supplier" :
      el.classList.contains("commerce-agent") ? "shopify" :
      el.classList.contains("comms-agent") ? "whatsapp" : "core";
    const task = byAgent[key]?.find((t) => t.status === "queued");
    el.classList.toggle("has-task", !!task);
    el.title = task ? task.task : "No queued task";
  });
}

function renderAgents(pending) {
  const typeToAgent = { whatsapp: "whatsapp", shopify_listing: "shopify", supplier_message: "supplier", order: "supplier" };
  const counts = { core: 0, supplier: 0, shopify: 0, whatsapp: 0 };
  pending.forEach((a) => { const k = typeToAgent[a.type]; if (k) counts[k]++; });
  Object.keys(counts).forEach((k) => { if (k !== "core") agentWorking[k] = counts[k] > 0; });
  const list = $("agentList");
  list.innerHTML = "";
  AGENTS.forEach((a) => {
    const li = document.createElement("li");
    const n = counts[a.id];
    const queued = state.agentTasks?.some((t) => t.agent === a.id && t.status === "queued");
    li.innerHTML = `<i class="${n || queued ? "work" : "idle"}"></i><b></b><span></span>`;
    li.querySelector("b").textContent = a.name;
    li.querySelector("span").textContent = n ? `${n} approval(s)` : queued ? "Task queued" : "Idle";
    list.appendChild(li);
  });
}

setInterval(() => { tick++; drawOffice(); }, 100);
(function loopRadar() { drawRadar(); requestAnimationFrame(loopRadar); })();

/* =========================
   START
========================= */
addMsg("السلام علیکم! میں Rafi AI ہوں۔ بولنے کے لیے گولے پر ٹیپ کریں یا لکھیں۔");
renderAgents([]);
drawOffice();
refresh();
setInterval(() => { if (TOKEN && !document.hidden) refresh(); }, 6000);
