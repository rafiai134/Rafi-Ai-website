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
  $("voiceStatus").textContent = "● READY";
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
  { id:"core", name:"RAFI", color:"#5de4ff", seat:0 },
  { id:"supplier", name:"SUPPLIER", color:"#ff9b55", seat:1 },
  { id:"shopify", name:"SHOPIFY", color:"#61e8a2", seat:2 },
  { id:"whatsapp", name:"WHATSAPP", color:"#d69cff", seat:3 }
];
const agentWorking = { core:false, supplier:false, shopify:false, whatsapp:false };
const agentMotion = {};
const office = $("office"), octx = office.getContext("2d");
let tick = 0;

// A small top-down office floor, deliberately irregular like the reference video.
// Walls, door openings, desks and tiny residents are the scene; no UI cards or routing lines.
const ROOMS = [
  {id:0,x:72,y:42,w:500,h:148, label:"RAFI CORE", color:"#5de4ff", door:{x:322,y:190}, people:[{x:245,y:112,rot:0},{x:385,y:112,rot:0}]},
  {id:1,x:88,y:190,w:238,h:132, label:"SUPPLIER", color:"#ff9b55", door:{x:218,y:190}, people:[{x:205,y:258,rot:0}]},
  {id:2,x:326,y:190,w:228,h:132, label:"SHOPIFY", color:"#61e8a2", door:{x:456,y:190}, people:[{x:448,y:258,rot:0}]},
  {id:3,x:554,y:112,w:190,h:210, label:"WHATSAPP", color:"#d69cff", door:{x:554,y:220}, people:[]}
];

function wall(r){
  const x=r.x,y=r.y,w=r.w,h=r.h,d=r.door,g=34;
  octx.save();
  octx.strokeStyle="rgba(126,204,235,.48)"; octx.lineWidth=3;
  octx.beginPath();
  // wall with a physical doorway gap
  if(d.y===y+h){
    octx.moveTo(x,y);octx.lineTo(x+w,y);octx.lineTo(x+w,y+h);
    octx.moveTo(x+w,y+h);octx.lineTo(d.x+g/2,y+h);
    octx.moveTo(d.x-g/2,y+h);octx.lineTo(x,y+h);octx.lineTo(x,y);
  } else if(d.y===y){
    octx.moveTo(x,y);octx.lineTo(d.x-g/2,y);
    octx.moveTo(d.x+g/2,y);octx.lineTo(x+w,y);octx.lineTo(x+w,y+h);octx.lineTo(x,y+h);octx.lineTo(x,y);
  } else if(d.x===x){
    octx.moveTo(x,y);octx.lineTo(x+w,y);octx.lineTo(x+w,y+h);octx.lineTo(x,y+h);
    octx.moveTo(x,y);octx.lineTo(x,y+d.y-y-g/2);
    octx.moveTo(x,y+d.y-y+g/2);octx.lineTo(x,y+h);
  } else {
    octx.moveTo(x,y);octx.lineTo(x+w,y);octx.lineTo(x+w,y+d.y-y-g/2);
    octx.moveTo(x+w,y+d.y-y+g/2);octx.lineTo(x+w,y+h);octx.lineTo(x,y+h);octx.lineTo(x,y);
  }
  octx.stroke();

  // Door leaf + swing arc
  octx.strokeStyle="rgba(116,222,255,.72)"; octx.lineWidth=1.5;
  octx.beginPath();
  if(d.y===y+h){ octx.moveTo(d.x-g/2,d.y);octx.lineTo(d.x-g/2,d.y-g);octx.quadraticCurveTo(d.x,d.y-g*1.55,d.x+g/2,d.y-g);octx.stroke(); }
  else if(d.y===y){ octx.moveTo(d.x-g/2,d.y);octx.lineTo(d.x-g/2,d.y+g);octx.quadraticCurveTo(d.x,d.y+g*1.55,d.x+g/2,d.y+g);octx.stroke(); }
  else if(d.x===x){ octx.moveTo(d.x,d.y-g/2);octx.lineTo(d.x+g,d.y-g/2);octx.quadraticCurveTo(d.x+g*1.55,d.y,d.x+g,d.y+g/2);octx.stroke(); }
  else { octx.moveTo(d.x,d.y-g/2);octx.lineTo(d.x-g,d.y-g/2);octx.quadraticCurveTo(d.x-g*1.55,d.y,d.x-g,d.y+g/2);octx.stroke(); }
  octx.restore();
}

function floor(r){
  octx.save();
  octx.fillStyle="rgba(14,42,59,.96)";octx.fillRect(r.x,r.y,r.w,r.h);
  octx.strokeStyle="rgba(107,193,225,.045)";octx.lineWidth=1;
  for(let xx=r.x+10;xx<r.x+r.w;xx+=18){octx.beginPath();octx.moveTo(xx,r.y);octx.lineTo(xx,r.y+r.h);octx.stroke();}
  for(let yy=r.y+10;yy<r.y+r.h;yy+=18){octx.beginPath();octx.moveTo(r.x,yy);octx.lineTo(r.x+r.w,yy);octx.stroke();}
  octx.restore();
}

function desk(x,y,rot=0){
  octx.save();octx.translate(x,y);octx.rotate(rot);
  octx.fillStyle="#213f51";octx.strokeStyle="rgba(133,207,232,.38)";octx.lineWidth=1;
  octx.fillRect(-24,-10,48,20);octx.strokeRect(-24,-10,48,20);
  octx.fillStyle="#081b29";octx.fillRect(-17,-8,34,9);
  octx.fillStyle="#31566b";octx.fillRect(-7,11,14,8);
  octx.restore();
}
function chair(x,y,rot=0){
  octx.save();octx.translate(x,y);octx.rotate(rot);
  octx.fillStyle="#35586a";octx.fillRect(-6,-5,12,11);octx.fillRect(-4,6,8,5);octx.restore();
}
function shelf(x,y,w=34,h=10){
  octx.fillStyle="#26485a";octx.fillRect(x,y,w,h);
  octx.fillStyle="#7aa7ba";for(let i=0;i<4;i++)octx.fillRect(x+4+i*7,y+3,4,3);
}
function plant(x,y){
  octx.fillStyle="#6a4a32";octx.fillRect(x-4,y+5,8,7);
  octx.fillStyle="#2f9b78";octx.beginPath();octx.arc(x,y,6,0,6.28);octx.arc(x+6,y+2,5,0,6.28);octx.arc(x-5,y+3,5,0,6.28);octx.fill();
}
function drawRobot(x,y,a,scale=.28){
  const s=scale,b=agentWorking[a.id]?Math.sin(tick*.2)*1.2:0;
  octx.save();octx.translate(x,y+b);octx.shadowBlur=agentWorking[a.id]?10:3;octx.shadowColor=a.color;
  octx.fillStyle="rgba(0,0,0,.38)";octx.beginPath();octx.ellipse(0,9*s,10*s,3*s,0,0,6.28);octx.fill();
  // tiny humanoid resident, not a large robot
  octx.fillStyle="#d9edf4";octx.strokeStyle=a.color;octx.lineWidth=1*s;
  octx.beginPath();octx.arc(0,-7*s,5.5*s,0,6.28);octx.fill();octx.stroke();
  octx.fillStyle="#183246";octx.fillRect(-4*s,-8*s,8*s,4*s);
  octx.fillStyle=a.color;octx.fillRect(-2.4*s,-7*s,1.5*s,1.3*s);octx.fillRect(.9*s,-7*s,1.5*s,1.3*s);
  octx.fillStyle="#29495b";octx.fillRect(-5*s,-1*s,10*s,10*s);octx.strokeRect(-5*s,-1*s,10*s,10*s);
  octx.strokeStyle=a.color;octx.lineWidth=1.5*s;octx.beginPath();octx.moveTo(-3*s,9*s);octx.lineTo(-4*s,14*s);octx.moveTo(3*s,9*s);octx.lineTo(4*s,14*s);octx.stroke();
  octx.restore();
}
function roomFurniture(r,index){
  if(index===0){
    desk(r.x+170,r.y+63);chair(r.x+170,r.y+84);desk(r.x+315,r.y+63);chair(r.x+315,r.y+84);
    desk(r.x+245,r.y+118);chair(r.x+245,r.y+139);shelf(r.x+24,r.y+24,86,10);shelf(r.x+r.w-120,r.y+24,82,10);plant(r.x+25,r.y+r.h-25);
  } else if(index===1){
    desk(r.x+115,r.y+70);chair(r.x+115,r.y+92);desk(r.x+190,r.y+70);chair(r.x+190,r.y+92);shelf(r.x+18,r.y+20,68,10);plant(r.x+r.w-25,r.y+r.h-25);
  } else if(index===2){
    desk(r.x+90,r.y+70);chair(r.x+90,r.y+92);desk(r.x+168,r.y+70);chair(r.x+168,r.y+92);shelf(r.x+20,r.y+20,64,10);plant(r.x+r.w-25,r.y+r.h-25);
  } else {
    desk(r.x+62,r.y+72);chair(r.x+62,r.y+94);desk(r.x+130,r.y+72);chair(r.x+130,r.y+94);
    desk(r.x+96,r.y+150);chair(r.x+96,r.y+171);shelf(r.x+18,r.y+20,70,10);shelf(r.x+18,r.y+184,70,10);plant(r.x+r.w-28,r.y+r.h-28);
  }
}
function drawRoom(r,i){
  floor(r); roomFurniture(r,i); wall(r);
  octx.fillStyle="rgba(215,242,252,.78)";octx.font="600 7px Arial";octx.fillText(r.label,r.x+12,r.y+13);
  octx.fillStyle=r.color;octx.globalAlpha=.8;octx.beginPath();octx.arc(r.x+r.w-12,r.y+12,2.5,0,6.28);octx.fill();octx.globalAlpha=1;
}
function drawOffice(){
  const W=office.width,H=office.height;octx.clearRect(0,0,W,H);
  const bg=octx.createLinearGradient(0,0,W,H);bg.addColorStop(0,"#02070c");bg.addColorStop(.5,"#061724");bg.addColorStop(1,"#02070c");
  octx.fillStyle=bg;octx.fillRect(0,0,W,H);

  // Shared office footprint — one irregular workplace, not four cards.
  octx.fillStyle="rgba(8,24,36,.85)";octx.fillRect(58,26,704,308);
  octx.strokeStyle="rgba(96,190,220,.13)";octx.lineWidth=1;octx.strokeRect(58,26,704,308);

  ROOMS.forEach((r,i)=>drawRoom(r,i));

  // Tiny hallway markings only; no agent-to-agent neon routing lines.
  octx.fillStyle="rgba(84,190,220,.12)";
  octx.fillRect(305,190,22,132); octx.fillRect(554,204,20,18);

  AGENTS.forEach((a,i)=>{
    const m=agentMotion[a.id];
    if(m){
      drawRobot(m.x,m.y,a,.32);
      octx.fillStyle=a.color;octx.font="600 7px Arial";octx.textAlign="center";octx.fillText(m.label,m.x,m.y-12);octx.textAlign="left";
    } else {
      const r=ROOMS[i], p=r.people[0] || {x:r.x+r.w/2,y:r.y+r.h/2};
      drawRobot(p.x,p.y,a,.28);
    }
  });

  // The four residents are physically in their rooms; the core has a subtle central glow.
  octx.save();octx.shadowBlur=16;octx.shadowColor="#54dcff";octx.fillStyle="#5de4ff";octx.globalAlpha=.8;
  octx.beginPath();octx.arc(316,207,4,0,6.28);octx.fill();octx.restore();
  tick++;
}
function officeLoop(){ drawOffice(); requestAnimationFrame(officeLoop); }
officeLoop();

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
