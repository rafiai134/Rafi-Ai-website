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
    setCore(null, "Tap to talk");
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

function startListening() {
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
    listening = true;
    $("mic").classList.add("on");
    setCore("listening", "Listening…");
  };
  rec.onend = () => {
    listening = false;
    $("mic").classList.remove("on");
    if (!busy) setCore(null, "Tap to talk");
  };
  rec.onerror = () => {
    listening = false;
    $("mic").classList.remove("on");
    setCore(null, "Tap to talk");
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

$("mic").addEventListener("click", () => (listening ? stopListening() : startListening()));
$("core").addEventListener("click", () => (listening ? stopListening() : startListening()));

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
    setCore(null, "Tap to talk");
    afterSpeak();
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = $("lang").value;
  const v = pickVoice(u.lang);
  if (v) u.voice = v;
  u.onstart = () => setCore("speaking", "Speaking…");
  u.onend = () => { setCore(null, "Tap to talk"); afterSpeak(); };
  u.onerror = () => { setCore(null, "Tap to talk"); afterSpeak(); };
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
  { id: "core", name: "Rafi", x: 24, y: 30, color: "#4fd8ff" },
  { id: "supplier", name: "Supplier", x: 104, y: 30, color: "#ff8a3d" },
  { id: "shopify", name: "Shopify", x: 24, y: 78, color: "#4dffb2" },
  { id: "whatsapp", name: "WhatsApp", x: 104, y: 78, color: "#c084fc" }
];
const agentWorking = { core: false, supplier: false, shopify: false, whatsapp: false };

const office = $("office");
const octx = office.getContext("2d");
let tick = 0;

function px(x, y, w, h, color) { octx.fillStyle = color; octx.fillRect(x, y, w, h); }

function drawOffice() {
  px(0, 0, 192, 120, "#0a2038");
  for (let y = 0; y < 120; y += 8) for (let x = 0; x < 192; x += 8) {
    if ((x + y) % 16 === 0) px(x, y, 8, 8, "#0c2846");
  }
  px(0, 58, 192, 3, "#16466f");   // wall between rooms
  px(94, 0, 3, 120, "#16466f");

  AGENTS.forEach((a) => {
    const work = agentWorking[a.id];
    px(a.x - 4, a.y + 14, 36, 8, "#1c5a8f");                       // desk
    px(a.x + 4, a.y + 4, 20, 10, "#031321");                       // monitor
    px(a.x + 5, a.y + 5, 18, 8, work && tick % 2 ? a.color : "#0b3b63");
    const bob = work ? (tick % 2) : 0;
    px(a.x + 10, a.y + 22 + bob, 8, 8, a.color);                   // body
    px(a.x + 11, a.y + 16 + bob, 6, 6, "#f2d0b0");                 // head
    px(a.x + 11, a.y + 15 + bob, 6, 2, "#2b1a0e");                 // hair
  });
}

function triggerAgentMove(agentId, task) {
  const agent = AGENTS.find((a) => a.id === agentId);
  if (!agent) return;
  agentWorking[agentId] = true;
  renderAgents([]);
  const canvas = office;
  const start = { x: agent.x, y: agent.y };
  const targets = {
    core: { x: 24, y: 30 },
    supplier: { x: 104, y: 30 },
    shopify: { x: 24, y: 78 },
    whatsapp: { x: 104, y: 78 }
  };
  const target = targets[agentId] || start;
  let progress = 0;
  const original = { x: agent.x, y: agent.y };
  const step = () => {
    progress += 0.04;
    const p = Math.min(progress, 1);
    agent.x = original.x + (target.x - original.x) * p;
    agent.y = original.y + (target.y - original.y) * p;
    drawOffice();
    if (p < 1) requestAnimationFrame(step);
    else {
      setTimeout(() => {
        agent.x = original.x;
        agent.y = original.y;
        agentWorking[agentId] = false;
        drawOffice();
        renderAgents([]);
      }, 900);
    }
  };
  drawOffice();
  requestAnimationFrame(step);
  if (task) addMsg("🤖 " + agent.name + " کو task ملا: " + task);
}

function runAgentUi(ui) {
  if (!Array.isArray(ui)) return;
  ui.filter((x) => x && x.type === "agent_move").forEach((x) => {
    triggerAgentMove(x.agent || "core", x.task || "");
  });
}

function renderAgentTasks() {
  const list = $("agentList");
  if (!list || !Array.isArray(state.agentTasks)) return;
  const byAgent = { core: [], supplier: [], shopify: [], whatsapp: [] };
  state.agentTasks.forEach((t) => {
    if (byAgent[t.agent]) byAgent[t.agent].push(t);
  });
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
    const label = a.id === "core" ? "Ready" : n ? `${n} waiting for you` : "Idle";
    li.innerHTML = `<i class="${a.id !== "core" && n ? "work" : "idle"}"></i><b></b><span></span>`;
    li.querySelector("b").textContent = a.name;
    li.querySelector("span").textContent = label;
    list.appendChild(li);
  });
}

setInterval(() => { tick++; drawOffice(); }, 400);
(function loopRadar() { drawRadar(); requestAnimationFrame(loopRadar); })();

/* =========================
   START
========================= */
addMsg("السلام علیکم! میں Rafi AI ہوں۔ بولنے کے لیے گولے پر ٹیپ کریں یا لکھیں۔");
renderAgents([]);
drawOffice();
refresh();
setInterval(() => { if (TOKEN && !document.hidden) refresh(); }, 6000);
