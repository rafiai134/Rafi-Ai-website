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
  // Architectural room/station — not a generic box.
  const room = [
    {x:18,y:18,w:372,h:150},{x:430,y:18,w:372,h:150},
    {x:18,y:192,w:372,h:150},{x:430,y:192,w:372,h:150}
  ][a.seat];
  octx.save();
  octx.strokeStyle = a.color;
  octx.globalAlpha = .32;
  octx.lineWidth = 1.5;
  octx.strokeRect(room.x,room.y,room.w,room.h);
  octx.globalAlpha = .08;
  octx.fillStyle = a.color;
  octx.fillRect(room.x+1,room.y+1,room.w-2,room.h-2);
  octx.globalAlpha = 1;
  octx.fillStyle = a.color;
  octx.font = "600 10px Arial";
  octx.fillText(a.name,room.x+15,room.y+18);
  octx.fillStyle = "#6f8ea7";
  octx.font = "8px Arial";
  octx.fillText(["VOICE / ORCHESTRATION","SUPPLIER RESEARCH","STORE AUTOMATION","COMMUNICATIONS"][a.seat],room.x+15,room.y+31);

  // floor light strips
  octx.fillStyle = "rgba(84,220,255,.16)";
  octx.fillRect(room.x+15,room.y+room.h-15,room.w-30,1);
  octx.fillStyle = a.color;
  octx.globalAlpha = .55;
  octx.fillRect(room.x+15,room.y+room.h-15,90,1);
  octx.restore();
}

function drawRobot(x,y,a,scale=1){
  const s=scale, moving=agentWorking[a.id];
  const bob=moving?Math.sin(tick*.28)*4:0;
  octx.save();
  octx.translate(x,y+bob);
  octx.shadowBlur=moving?26:14;
  octx.shadowColor=a.color;

  // antenna + signal
  octx.strokeStyle=a.color;octx.lineWidth=2;
  octx.beginPath();octx.moveTo(0,-34*s);octx.lineTo(0,-46*s);octx.stroke();
  octx.fillStyle=a.color;octx.beginPath();octx.arc(0,-49*s,3*s,0,6.28);octx.fill();

  // head
  octx.fillStyle="#b9ecff";
  octx.strokeStyle=a.color;octx.lineWidth=2;
  octx.beginPath();octx.roundRect(-24*s,-32*s,48*s,34*s,8*s);octx.fill();octx.stroke();
  // visor
  octx.fillStyle="#061b30";
  octx.beginPath();octx.roundRect(-18*s,-25*s,36*s,18*s,5*s);octx.fill();
  octx.fillStyle=a.color;
  octx.beginPath();octx.arc(-8*s,-16*s,3*s,0,6.28);octx.arc(8*s,-16*s,3*s,0,6.28);octx.fill();

  // torso
  octx.fillStyle="#0b2c47";
  octx.strokeStyle=a.color;
  octx.beginPath();octx.roundRect(-29*s,5*s,58*s,52*s,9*s);octx.fill();octx.stroke();
  octx.fillStyle=a.color;
  octx.beginPath();octx.arc(0,25*s,6*s,0,6.28);octx.fill();

  // arms
  octx.strokeStyle=a.color;octx.lineWidth=7*s;octx.lineCap="round";
  octx.beginPath();octx.moveTo(-27*s,15*s);octx.lineTo(-42*s,38*s);octx.moveTo(27*s,15*s);octx.lineTo(42*s,38*s);octx.stroke();
  // legs
  octx.beginPath();octx.moveTo(-15*s,57*s);octx.lineTo(-18*s,84*s);octx.moveTo(15*s,57*s);octx.lineTo(18*s,84*s);octx.stroke();
  octx.lineWidth=5*s;
  octx.beginPath();octx.moveTo(-23*s,84*s);octx.lineTo(-10*s,84*s);octx.moveTo(10*s,84*s);octx.lineTo(23*s,84*s);octx.stroke();

  octx.restore();
}

function drawOffice() {
  const W=office.width,H=office.height;
  octx.clearRect(0,0,W,H);
  const bg=octx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,"#03101e");bg.addColorStop(.5,"#061b2c");bg.addColorStop(1,"#020c18");
  octx.fillStyle=bg;octx.fillRect(0,0,W,H);

  // subtle floor grid
  octx.strokeStyle="rgba(84,220,255,.08)";octx.lineWidth=1;
  for(let x=0;x<=W;x+=28){octx.beginPath();octx.moveTo(x,0);octx.lineTo(x,H);octx.stroke();}
  for(let y=0;y<=H;y+=28){octx.beginPath();octx.moveTo(0,y);octx.lineTo(W,y);octx.stroke();}

  const rooms=[
    {x:18,y:18,w:372,h:150,a:AGENTS[0],label:"RAFI CORE / VOICE"},
    {x:430,y:18,w:372,h:150,a:AGENTS[1],label:"SUPPLIER / RESEARCH"},
    {x:18,y:192,w:372,h:150,a:AGENTS[2],label:"SHOPIFY / STORE"},
    {x:430,y:192,w:372,h:150,a:AGENTS[3],label:"WHATSAPP / COMMS"}
  ];

  // Four architectural rooms with doors and ceiling lights
  rooms.forEach(r=>{
    octx.strokeStyle=r.a.color;octx.globalAlpha=.28;octx.lineWidth=1.5;octx.strokeRect(r.x,r.y,r.w,r.h);
    octx.globalAlpha=1;
    octx.fillStyle="rgba(84,220,255,.03)";octx.fillRect(r.x+2,r.y+2,r.w-4,r.h-4);
    octx.fillStyle=r.a.color;octx.globalAlpha=.65;octx.fillRect(r.x+16,r.y+9,80,2);
    octx.globalAlpha=1;
    octx.font="600 9px Arial";octx.fillStyle=r.a.color;octx.fillText(r.label,r.x+15,r.y+27);
    octx.strokeStyle="rgba(84,220,255,.15)";octx.strokeRect(r.x+18,r.y+40,r.w-36,r.h-62);
    // workstation
    octx.fillStyle="#08263f";octx.fillRect(r.x+45,r.y+76,110,34);
    octx.strokeStyle="rgba(84,220,255,.22)";octx.strokeRect(r.x+45,r.y+76,110,34);
    octx.fillStyle="#0c4265";octx.fillRect(r.x+55,r.y+84,42,20);
    // door
    octx.strokeStyle=r.a.color;octx.globalAlpha=.5;octx.strokeRect(r.x+r.w-35,r.y+r.h-35,18,34);octx.globalAlpha=1;
  });

  // Central command nexus + four visible routed lines
  const cx=W/2,cy=H/2;
  octx.save();
  octx.shadowBlur=18;octx.shadowColor="#54dcff";
  octx.strokeStyle="#54dcff";octx.globalAlpha=.7;octx.lineWidth=2;
  rooms.forEach((r,i)=>{
    const sx=r.x+r.w/2,sy=i<2?r.y+r.h:r.y;
    octx.beginPath();octx.moveTo(sx,sy);octx.lineTo(cx,cy);octx.stroke();
    octx.fillStyle="#54dcff";octx.beginPath();octx.arc(sx,sy,3,0,6.28);octx.fill();
  });
  octx.globalAlpha=.9;octx.beginPath();octx.arc(cx,cy,34,0,6.28);octx.stroke();
  octx.globalAlpha=.18;octx.beginPath();octx.arc(cx,cy,48,0,6.28);octx.stroke();
  octx.globalAlpha=1;octx.fillStyle="#54dcff";octx.font="600 8px Arial";octx.textAlign="center";octx.fillText("RAFI COMMAND NEXUS",cx,cy+3);
  octx.restore();

  // Seats + robots
  AGENTS.forEach(a=>drawSeat(a));
  AGENTS.forEach(a=>{
    const m=agentMotion[a.id];
    if(m){
      drawRobot(m.x,m.y,a,1.0);
      octx.fillStyle=a.color;octx.font="600 8px Arial";octx.textAlign="center";
      octx.fillText(m.label||"TASK",m.x,m.y-58);
      octx.textAlign="left";
    }else{
      const room=rooms[a.seat];
      drawRobot(room.x+220,room.y+82,a,.72);
    }
  });
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
