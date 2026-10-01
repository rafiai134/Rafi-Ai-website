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
    setCore(null, "RAFI AI");
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
   VOICE / SILENT WAKE
========================= */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let listening = false;
let wakeListening = false;
let wakeRec = null;
let wakeRetry = null;
let voiceArmed = false;

async function armVoiceSilent() {
  if (!SR) return;
  try {
    if (navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      localStorage.setItem("rafi_mic_granted", "1");
    }
  } catch {}
  voiceArmed = true;
  $("mic").classList.remove("on");
  $("voiceStatus").textContent = "● READY";
  setCore(null, "RAFI AI");
  startWakeWord();
}

function startListening() {
  if (!SR || listening || busy) return;
  if (wakeRec && wakeListening) { try { wakeRec.stop(); } catch {} }
  if (speechSynthesis) speechSynthesis.cancel();
  rec = new SR();
  rec.lang = $("lang").value;
  rec.interimResults = false;
  rec.continuous = false;
  rec.onstart = () => { listening = true; };
  rec.onend = () => {
    listening = false;
    if (voiceArmed && !busy) setTimeout(startWakeWord, 250);
  };
  rec.onerror = () => {
    listening = false;
    if (voiceArmed && !busy) setTimeout(startWakeWord, 500);
  };
  rec.onresult = e => sendMessage(e.results[0][0].transcript);
  try { rec.start(); } catch {}
}

function stopVoiceEngine() {
  voiceArmed = false;
  listening = false;
  wakeListening = false;
  clearTimeout(wakeRetry);
  try { wakeRec?.stop(); } catch {}
  try { rec?.stop(); } catch {}
}

async function toggleVoice() {
  // Button only grants/restarts voice. No beeps and no ON/OFF animation.
  if (!voiceArmed) await armVoiceSilent();
}

$("mic").addEventListener("click", toggleVoice);
$("core").addEventListener("click", toggleVoice);

function startWakeWord() {
  if (!SR || !voiceArmed || wakeListening || listening || busy || location.protocol !== "https:") return;
  wakeRec = new SR();
  wakeRec.lang = "en-US";
  wakeRec.continuous = true;
  wakeRec.interimResults = false;
  wakeRec.onstart = () => {
    wakeListening = true;
    $("mic").classList.remove("on");
    $("voiceStatus").textContent = "● READY";
    setCore(null, "RAFI AI");
  };
  wakeRec.onend = () => {
    wakeListening = false;
    clearTimeout(wakeRetry);
    if (voiceArmed && !listening && !busy) wakeRetry = setTimeout(startWakeWord, 500);
  };
  wakeRec.onerror = e => {
    wakeListening = false;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      voiceArmed = false;
      $("voiceStatus").textContent = "● VOICE PERMISSION";
      setCore(null, "RAFI AI");
      return;
    }
    if (voiceArmed) wakeRetry = setTimeout(startWakeWord, 900);
  };
  wakeRec.onresult = e => {
    for (let i=e.resultIndex;i<e.results.length;i++) {
      if (!e.results[i].isFinal) continue;
      const heard=e.results[i][0].transcript.trim();
      const match=/\b(hello|hey|hi)?\s*rafi(?:\s+ai)?\b/i.test(heard) ||
        /ہیلو?\s*رافی(?:\s*(?:آئی|آئی|ai))?/i.test(heard);
      if (!match) continue;
      try { wakeRec.stop(); } catch {}
      const command=heard
        .replace(/^.*?\b(hello|hey|hi)?\s*rafi(?:\s+ai)?\b/i,"")
        .replace(/^.*?ہیلو?\s*رافی(?:\s*(?:آئی|آئی|ai))?/i,"")
        .trim();
      if (command) sendMessage(command);
      else setTimeout(startListening,120);
      break;
    }
  };
  try { wakeRec.start(); } catch {}
}

function enableWakeWord() {
  if (!SR) {
    $("voiceStatus").textContent = "● VOICE UNSUPPORTED";
    return;
  }
  // Start silently when permission already exists; otherwise request it once.
  armVoiceSilent();
}

if (SR) {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && voiceArmed && !busy && !listening && !wakeListening) startWakeWord();
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
  u.onstart = () => setCore("speaking", "RAFI AI");
  u.onend = () => { setCore(null, "RAFI AI"); afterSpeak(); };
  u.onerror = () => { setCore(null, "Listening for Rafi"); afterSpeak(); };
  speechSynthesis.speak(u);
}

function afterSpeak() {
  // Return to the wake-word listener; never open the command microphone
  // automatically after a reply.
  if (voiceArmed && !busy) setTimeout(startWakeWord, 450);
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
  { id: "core", name: "RAFI CORE", color: "#4fd8ff", seat: 0 },
  { id: "supplier", name: "SUPPLIER", color: "#ff914d", seat: 1 },
  { id: "shopify", name: "SHOPIFY", color: "#4dffb3", seat: 2 },
  { id: "whatsapp", name: "WHATSAPP", color: "#c084fc", seat: 3 }
];
const agentWorking = { core: false, supplier: false, shopify: false, whatsapp: false };
const agentMotion = {};
const office = $("office");
const octx = office.getContext("2d");
let tick = 0;

const ROOM_LAYOUT = [
  {
    x: 72, y: 30, w: 320, h: 132, label: "RAFI CORE",
    door: { x: 360, y: 162 }, station: { x: 250, y: 103 }
  },
  {
    x: 430, y: 30, w: 318, h: 132, label: "SUPPLIER",
    door: { x: 460, y: 162 }, station: { x: 580, y: 103 }
  },
  {
    x: 150, y: 190, w: 300, h: 132, label: "SHOPIFY",
    door: { x: 360, y: 190 }, station: { x: 295, y: 255 }
  },
  {
    x: 410, y: 190, w: 300, h: 132, label: "WHATSAPP",
    door: { x: 440, y: 190 }, station: { x: 555, y: 255 }
  }
];

function roomPath(r, gap) {
  const d = r.door;
  const left = r.x, right = r.x + r.w, top = r.y, bottom = r.y + r.h;
  const horizontalDoor = d.y === bottom || d.y === top;
  const half = gap / 2;
  octx.beginPath();
  if (horizontalDoor) {
    const y = d.y;
    octx.moveTo(left, top); octx.lineTo(right, top); 
    octx.moveTo(left, bottom); octx.lineTo(d.x-half, bottom);
    octx.moveTo(d.x+half, bottom); octx.lineTo(right, bottom);
  } else {
    octx.moveTo(left, top); octx.lineTo(left, bottom);
    octx.moveTo(right, top); octx.lineTo(right, d.y-half);
    octx.moveTo(right, d.y+half); octx.lineTo(right, bottom);
  }
}

function drawDoor(r) {
  const d = r.door, isBottom = d.y >= r.y + r.h - 2;
  octx.save();
  octx.strokeStyle = "rgba(112,215,255,.75)";
  octx.lineWidth = 2;
  octx.globalAlpha = .8;
  octx.beginPath();
  if (isBottom) {
    octx.moveTo(d.x-13, d.y); octx.lineTo(d.x-13, d.y-13);
    octx.quadraticCurveTo(d.x, d.y-26, d.x+13, d.y-13);
    octx.stroke();
    octx.strokeStyle = "rgba(84,220,255,.22)";
    octx.beginPath(); octx.moveTo(d.x-13,d.y); octx.lineTo(d.x+13,d.y); octx.stroke();
  } else {
    octx.moveTo(d.x, d.y-13); octx.lineTo(d.x+13, d.y-13);
    octx.quadraticCurveTo(d.x+26, d.y, d.x+13, d.y+13);
    octx.stroke();
  }
  octx.restore();
}

function drawDesk(x,y,color,rot=0) {
  octx.save(); octx.translate(x,y); octx.rotate(rot);
  octx.fillStyle="#17374d"; octx.strokeStyle="rgba(120,205,235,.35)";
  octx.lineWidth=1; octx.fillRect(-28,-12,56,24); octx.strokeRect(-28,-12,56,24);
  octx.fillStyle="#071a2a"; octx.fillRect(-20,-9,40,12);
  octx.strokeStyle=color; octx.globalAlpha=.55; octx.strokeRect(-20,-9,40,12);
  octx.globalAlpha=1; octx.fillStyle="#294c62"; octx.fillRect(-9,14,18,6);
  octx.restore();
}

function drawChair(x,y,rot=0) {
  octx.save(); octx.translate(x,y); octx.rotate(rot);
  octx.fillStyle="#31566d"; octx.fillRect(-7,-6,14,13); octx.fillRect(-5,7,10,5);
  octx.restore();
}

function drawPlant(x,y) {
  octx.save(); octx.fillStyle="#1c6d66"; octx.beginPath();octx.arc(x,y-5,7,0,6.28);octx.arc(x+6,y,6,0,6.28);octx.arc(x-5,y,6,0,6.28);octx.fill();
  octx.fillStyle="#734f35";octx.fillRect(x-5,y+4,10,7);octx.restore();
}

function drawCabinet(x,y,w=22,h=30) {
  octx.fillStyle="#18354a";octx.fillRect(x,y,w,h);
  octx.strokeStyle="rgba(125,200,225,.28)";octx.strokeRect(x,y,w,h);
  octx.fillStyle="#6d9ab0";octx.fillRect(x+5,y+7,4,2);octx.fillRect(x+5,y+17,4,2);
}

function drawRobot(x,y,a,scale=.34) {
  const s=scale, moving=agentWorking[a.id], bob=moving?Math.sin(tick*.22)*1.4:0;
  octx.save(); octx.translate(x,y+bob);
  octx.shadowBlur=moving?12:5; octx.shadowColor=a.color;
  octx.fillStyle="rgba(0,0,0,.38)";
  octx.beginPath();octx.ellipse(0,8*s,10*s,3*s,0,0,6.28);octx.fill();
  octx.fillStyle="#28475b";octx.strokeStyle=a.color;octx.lineWidth=1.3*s;
  octx.fillRect(-5*s,-1*s,10*s,9*s);octx.strokeRect(-5*s,-1*s,10*s,9*s);
  octx.strokeStyle=a.color;octx.lineWidth=2*s;octx.lineCap="round";
  octx.beginPath();octx.moveTo(-3*s,8*s);octx.lineTo(-4*s,14*s);octx.moveTo(3*s,8*s);octx.lineTo(4*s,14*s);octx.stroke();
  octx.fillStyle="#d8eef7";octx.beginPath();octx.arc(0,-6*s,6*s,0,6.28);octx.fill();octx.stroke();
  octx.fillStyle="#071522";octx.fillRect(-4*s,-7*s,8*s,4*s);
  octx.fillStyle=a.color;octx.fillRect(-2.5*s,-6*s,1.5*s,1.5*s);octx.fillRect(1*s,-6*s,1.5*s,1.5*s);
  octx.restore();
}

function drawRoom(r,a) {
  octx.save();
  // Floor area
  const g=octx.createLinearGradient(r.x,r.y,r.x+r.w,r.y+r.h);
  g.addColorStop(0,"rgba(22,55,76,.92)");g.addColorStop(1,"rgba(8,28,45,.94)");
  octx.fillStyle=g;octx.fillRect(r.x,r.y,r.w,r.h);

  // Tile floor
  octx.strokeStyle="rgba(110,205,235,.045)";octx.lineWidth=1;
  for(let x=r.x+10;x<r.x+r.w;x+=18){octx.beginPath();octx.moveTo(x,r.y);octx.lineTo(x,r.y+r.h);octx.stroke();}
  for(let y=r.y+10;y<r.y+r.h;y+=18){octx.beginPath();octx.moveTo(r.x,y);octx.lineTo(r.x+r.w,y);octx.stroke();}

  // Furniture / office clutter like a real top-down room
  drawDesk(r.x+92,r.y+47,a.color,-.04); drawChair(r.x+92,r.y+67);
  drawDesk(r.x+185,r.y+49,a.color,.02); drawChair(r.x+185,r.y+69);
  drawDesk(r.x+95,r.y+104,a.color,.02); drawChair(r.x+95,r.y+124);
  drawCabinet(r.x+r.w-42,r.y+20,24,34);
  drawCabinet(r.x+r.w-42,r.y+r.h-52,24,34);
  drawPlant(r.x+25,r.y+r.h-26);

  // Small wall display / whiteboard
  octx.fillStyle="#23485e";octx.fillRect(r.x+18,r.y+16,70,12);
  octx.strokeStyle="rgba(140,225,245,.28)";octx.strokeRect(r.x+18,r.y+16,70,12);
  octx.fillStyle=a.color;octx.globalAlpha=.75;octx.fillRect(r.x+24,r.y+21,28,2);octx.fillRect(r.x+57,r.y+21,21,2);octx.globalAlpha=1;

  // Open wall with a real doorway
  octx.strokeStyle="rgba(116,210,235,.52)";octx.lineWidth=3;roomPath(r,28);octx.stroke();
  drawDoor(r);

  // tiny room sign, integrated into the floor plan
  octx.fillStyle="rgba(220,245,255,.72)";octx.font="600 7px Arial";octx.fillText(a.name,r.x+100,r.y+18);
  octx.restore();
}

function drawOffice(){
  const W=office.width,H=office.height;
  octx.clearRect(0,0,W,H);
  const bg=octx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,"#02070d");bg.addColorStop(.5,"#061827");bg.addColorStop(1,"#02070d");
  octx.fillStyle=bg;octx.fillRect(0,0,W,H);

  // Shared office floor + corridor, not four separate UI boxes.
  octx.fillStyle="rgba(20,62,82,.42)";octx.fillRect(55,16,710,328);
  octx.strokeStyle="rgba(90,190,220,.16)";octx.lineWidth=1;octx.strokeRect(55,16,710,328);

  // Central hallway / meeting area
  octx.fillStyle="rgba(16,44,61,.92)";octx.fillRect(330,150,160,60);
  octx.strokeStyle="rgba(110,210,240,.25)";octx.strokeRect(330,150,160,60);
  for(let x=340;x<485;x+=22){octx.fillStyle="rgba(84,220,255,.08)";octx.fillRect(x,178,12,3);}

  ROOM_LAYOUT.forEach((r,i)=>drawRoom(r,AGENTS[i]));

  // Central orchestration lines run through the office, like a live routing layer.
  const nexus={x:410,y:180};
  ROOM_LAYOUT.forEach((r,i)=>{
    const d=r.door;
    octx.save();octx.strokeStyle=AGENTS[i].color;octx.globalAlpha=.34;octx.lineWidth=1.2;
    octx.setLineDash([5,5]);octx.beginPath();octx.moveTo(d.x,d.y);octx.lineTo(nexus.x,nexus.y);octx.stroke();octx.setLineDash([]);
    const p=((tick*.018)+i*.2)%1;
    const px=d.x+(nexus.x-d.x)*p,py=d.y+(nexus.y-d.y)*p;
    octx.globalAlpha=.9;octx.fillStyle=AGENTS[i].color;octx.beginPath();octx.arc(px,py,2,0,6.28);octx.fill();octx.restore();
  });

  // Rafi core at the center of the office.
  octx.save();octx.translate(nexus.x,nexus.y);octx.shadowBlur=20;octx.shadowColor="#54dcff";
  octx.strokeStyle="#54dcff";octx.globalAlpha=.45;octx.beginPath();octx.arc(0,0,23,0,6.28);octx.stroke();
  octx.globalAlpha=.14;octx.beginPath();octx.arc(0,0,32,0,6.28);octx.stroke();
  octx.fillStyle="#63e5ff";octx.globalAlpha=.9;octx.beginPath();octx.arc(0,0,5,0,6.28);octx.fill();
  octx.globalAlpha=.75;octx.fillStyle="#9ed4e8";octx.font="600 7px Arial";octx.textAlign="center";octx.fillText("RAFI",0,43);octx.textAlign="left";octx.restore();

  // Four small residents stay inside their actual rooms unless delegated.
  AGENTS.forEach(a=>{
    const m=agentMotion[a.id];
    if(m){
      drawRobot(m.x,m.y,a,.38);
      octx.fillStyle=a.color;octx.font="600 7px Arial";octx.textAlign="center";octx.fillText(m.label,m.x,m.y-12);octx.textAlign="left";
    }else{
      const r=ROOM_LAYOUT[a.seat], s=r.station;
      drawRobot(s.x,s.y,a,.34);
    }
  });

  // Status lights in each room.
  AGENTS.forEach(a=>{
    const r=ROOM_LAYOUT[a.seat];
    octx.fillStyle=a.color;octx.globalAlpha=agentWorking[a.id]?.9:.45;
    octx.beginPath();octx.arc(r.x+r.w-16,r.y+14,3,0,6.28);octx.fill();octx.globalAlpha=1;
  });
}

function triggerAgentMove(agentId, task) {
  const agent = AGENTS.find((a) => a.id === agentId);
  if (!agent) return;
  const room = ROOM_LAYOUT[agent.seat];
  agentWorking[agentId] = true;

  const nexus = { x: 410, y: 180 };
  const door = { x: room.door.x, y: room.door.y };
  const station = { x: room.station.x, y: room.station.y };
  const work = {
    x: nexus.x + (agent.seat % 2 ? 48 : -48),
    y: nexus.y + (agent.seat > 1 ? 18 : -18)
  };
  const path = [station, door, nexus, work, nexus, door, station];
  let segment = 0, progress = 0;
  const speed = agentId === "core" ? .075 : .052;

  const step = () => {
    progress += speed;
    const p = Math.min(progress, 1);
    const from = path[segment], to = path[segment + 1];
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len, ny = dx / len;
    const arc = Math.sin(p * Math.PI) * 5;
    agentMotion[agentId] = {
      x: from.x + dx*p + nx*arc,
      y: from.y + dy*p + ny*arc,
      label: segment < 2 ? "LEAVING ROOM" : segment === 2 ? "WORKING" : segment === 3 ? "HANDOFF" : "RETURNING"
    };
    drawOffice();
    if(p<1) return requestAnimationFrame(step);
    if(segment<path.length-2){ segment++; progress=0; return requestAnimationFrame(step); }
    setTimeout(()=>{ delete agentMotion[agentId]; agentWorking[agentId]=false; drawOffice(); },500);
  };
  if(task) addMsg("🤖 " + agent.name + " کو task ملا: " + task);
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
