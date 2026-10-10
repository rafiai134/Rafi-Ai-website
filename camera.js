/* Rafi AI camera v2: no buttons. Camera and listening switch on by themselves when the site opens.
   - Small live preview with a red dot (always visible; tap it to switch the camera off/on).
   - Rafi looks by himself every ~60 s and may say one short thing or ask one question.
   - Rafi also looks when the AI asks for it ({type:"camera"}) e.g. "how are my clothes?".
   Frames go to the server only for that question and are not stored. */
(function () {
  var stream = null, video = null, timer = null, looks = 0, box = null, statusEl = null, started = false;
  var MAX_LOOKS = 120, EVERY_MS = 60000;

  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text) e.textContent = text;
    return e;
  }
  function say(text) {
    try { addMsg(text, "bot"); } catch (e) {}
    try { speak(text); } catch (e) {}
  }

  function build() {
    box = el("div", "position:fixed;left:10px;bottom:10px;z-index:9999;width:96px;border:1px solid #3de0ff;border-radius:12px;background:#06121d;padding:4px;color:#9be9ff;font:11px system-ui;display:none");
    video = el("video", "width:100%;border-radius:8px;background:#000;transform:scaleX(-1);display:block");
    video.setAttribute("playsinline", "");
    video.muted = true;
    var dot = el("div", "margin-top:3px;color:#ff4d4d;font-weight:700;text-align:center", "● LIVE");
    statusEl = el("div", "min-height:12px;text-align:center;opacity:.8", "");
    box.appendChild(video); box.appendChild(dot); box.appendChild(statusEl);
    box.addEventListener("click", function () { stream ? stop() : start(); });
    document.body.appendChild(box);
  }

  async function start() {
    if (stream) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      box.style.display = "block";
      watchOn();
      return true;
    } catch (e) {
      stream = null;
      return false;
    }
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (video) video.srcObject = null;
    if (box) box.style.display = "none";
  }

  function frame() {
    if (!stream || !video.videoWidth) return null;
    var c = document.createElement("canvas");
    var w = 640, h = Math.round(video.videoHeight * (w / video.videoWidth));
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(video, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.7);
  }

  async function ask(question, proactive) {
    var img = frame();
    if (!img) return "";
    try {
      var d = await api("vision", { method: "POST", body: { image: img, question: question || "", proactive: !!proactive } });
      return d.reply || "";
    } catch (e) { return ""; }
  }

  async function lookOnce(question) {
    if (!stream) { var ok = await start(); if (!ok) { say("کیمرے کی اجازت نہیں ملی۔ برائزر میں Allow کریں۔"); return; } await new Promise(function (r) { setTimeout(r, 900); }); }
    var reply = await ask(question, false);
    if (reply && reply !== "NOTHING") say(reply);
  }

  function watchOn() {
    if (timer) return;
    looks = 0;
    // first look shortly after the camera starts: a natural greeting
    setTimeout(async function () {
      if (!stream || (typeof busy !== "undefined" && busy)) return;
      var r = await ask("", true);
      if (r && r !== "NOTHING") say(r);
    }, 3500);
    timer = setInterval(async function () {
      if (!stream) return;
      if (typeof busy !== "undefined" && busy) return;
      if (document.hidden) return;
      looks++;
      var reply = await ask("", true);
      if (reply && reply !== "NOTHING") say(reply);
      if (looks >= MAX_LOOKS) { stop(); }
    }, EVERY_MS);
  }

  function hookUi() {
    if (typeof runAgentUi !== "function") return;
    var orig = runAgentUi;
    runAgentUi = function (ui) {
      try {
        (ui || []).forEach(function (u) { if (u && u.type === "camera") setTimeout(function () { lookOnce(u.question || ""); }, 400); });
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  }

  /* voice: arm the always-listening wake mode without pressing anything */
  function armVoice() {
    try { if (typeof armVoiceSilent === "function" && typeof voiceArmed !== "undefined" && !voiceArmed) armVoiceSilent(); } catch (e) {}
  }

  build();
  hookUi();
  window.RafiCamera = { start: start, stop: stop, look: lookOnce };

  function boot() {
    if (started) return; started = true;
    start().then(function () { setTimeout(armVoice, 800); });
  }
  // try right away; if the browser needs a touch first, the first touch anywhere does it
  setTimeout(boot, 1200);
  setTimeout(armVoice, 2500);
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function () { boot(); armVoice(); if (!stream) start(); }, { once: true, passive: true });
  });
})();
