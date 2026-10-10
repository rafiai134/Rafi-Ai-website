/* Rafi AI camera: Rafi can SEE the owner (only after the owner switches it on).
   - Button "CAMERA": opens the front camera with a visible preview + red indicator.
   - "LOOK": Rafi looks at one frame and answers, then asks a short question.
   - "WATCH": every ~90 s Rafi looks and may say one short thing; auto-stops after 20 looks.
   Frames are sent to the server only for that one question and are not stored. */
(function () {
  var stream = null, video = null, timer = null, looks = 0, panel = null, status = null;
  var MAX_LOOKS = 20, EVERY_MS = 90000;

  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text) e.textContent = text;
    return e;
  }

  function say(text) {
    try { addMsg(text, "bot"); } catch (e) { /* ignore */ }
    try { speak(text); } catch (e) { /* ignore */ }
  }

  function build() {
    var btn = el("button", "position:fixed;left:12px;bottom:12px;z-index:9999;padding:10px 14px;border-radius:999px;border:1px solid #3de0ff;background:#06121d;color:#9be9ff;font:600 13px system-ui;letter-spacing:.5px", "👁 CAMERA");
    btn.id = "rafiCamBtn";
    btn.addEventListener("click", function () { stream ? stop() : start(); });
    document.body.appendChild(btn);

    panel = el("div", "display:none;position:fixed;left:12px;bottom:60px;z-index:9999;width:170px;border:1px solid #3de0ff;border-radius:12px;background:#06121d;padding:8px;color:#9be9ff;font:12px system-ui");
    video = el("video", "width:100%;border-radius:8px;background:#000;transform:scaleX(-1)");
    video.setAttribute("playsinline", "");
    video.muted = true;
    var dot = el("div", "margin:6px 0;color:#ff4d4d;font-weight:700", "● CAMERA ON");
    status = el("div", "min-height:14px;margin-bottom:6px;opacity:.85", "");
    var row = el("div", "display:flex;gap:6px");
    var look = el("button", "flex:1;padding:6px;border-radius:8px;border:1px solid #3de0ff;background:#0b2a3b;color:#9be9ff", "LOOK");
    var watch = el("button", "flex:1;padding:6px;border-radius:8px;border:1px solid #3de0ff;background:#0b2a3b;color:#9be9ff", "WATCH");
    var off = el("button", "flex:1;padding:6px;border-radius:8px;border:1px solid #ff4d4d;background:#2a0b0b;color:#ff9b9b", "STOP");
    look.addEventListener("click", function () { lookOnce(""); });
    watch.addEventListener("click", function () { timer ? unwatch() : watchOn(watch); });
    off.addEventListener("click", stop);
    row.appendChild(look); row.appendChild(watch); row.appendChild(off);
    panel.appendChild(video); panel.appendChild(dot); panel.appendChild(status); panel.appendChild(row);
    document.body.appendChild(panel);
    panel._watch = watch;
  }

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say("اس براؤزر میں کیمرہ نہیں چل سکتا۔"); return false; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      panel.style.display = "block";
      document.getElementById("rafiCamBtn").textContent = "👁 CAMERA ON";
      return true;
    } catch (e) {
      stream = null;
      say("کیمرے کی اجازت نہیں ملی۔ براؤزر میں Allow دبائیں۔");
      return false;
    }
  }

  function unwatch() {
    if (timer) { clearInterval(timer); timer = null; }
    if (panel && panel._watch) panel._watch.textContent = "WATCH";
  }

  function stop() {
    unwatch();
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (video) video.srcObject = null;
    if (panel) panel.style.display = "none";
    var b = document.getElementById("rafiCamBtn"); if (b) b.textContent = "👁 CAMERA";
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
    status.textContent = proactive ? "" : "دیکھ رہا ہوں…";
    try {
      var d = await api("vision", { method: "POST", body: { image: img, question: question || "", proactive: !!proactive } });
      status.textContent = d.error ? "AI error" : "";
      return d.reply || "";
    } catch (e) {
      status.textContent = "";
      return "";
    }
  }

  async function lookOnce(question) {
    if (!stream) { var ok = await start(); if (!ok) return; await new Promise(function (r) { setTimeout(r, 900); }); }
    var reply = await ask(question, false);
    if (reply && reply !== "NOTHING") say(reply);
    else if (!reply) say("ابھی تصویر نہیں سمجھ سکا، دوبارہ LOOK دبائیں۔");
  }

  function watchOn(btn) {
    looks = 0;
    btn.textContent = "WATCHING";
    timer = setInterval(async function () {
      if (!stream) { unwatch(); return; }
      if (typeof busy !== "undefined" && busy) return;
      looks++;
      var reply = await ask("", true);
      if (reply && reply !== "NOTHING") say(reply);
      if (looks >= MAX_LOOKS) { unwatch(); say("نگرانی خود بخود روک دی۔ دوبارہ چاہیں تو WATCH دبائیں۔"); }
    }, EVERY_MS);
  }

  /* the server (AI) can ask for a look: ui item {type:"camera", question} */
  function hookUi() {
    if (typeof runAgentUi !== "function") return;
    var orig = runAgentUi;
    runAgentUi = function (ui) {
      try {
        (ui || []).forEach(function (u) { if (u && u.type === "camera") setTimeout(function () { lookOnce(u.question || ""); }, 400); });
      } catch (e) { /* ignore */ }
      return orig.apply(this, arguments);
    };
  }

  build();
  hookUi();
  window.RafiCamera = { start: start, stop: stop, look: lookOnce };
})();
