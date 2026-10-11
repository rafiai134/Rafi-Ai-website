/* Rafi AI talk.js: human-like conversation.
   1) After Rafi speaks (reply, or a question he asked after looking at you) the microphone opens by itself
      so you can simply answer. No button, no "Yes sir" in between.
   2) A message that starts with "میری کہانی:" is saved PRIVATELY as the owner profile (never sent to chat). */
(function () {
  var origAfter = window.afterSpeak;
  window.afterSpeak = function () {
    try { if (origAfter) origAfter.apply(this, arguments); } catch (e) {}
    try {
      if (typeof voiceArmed === "undefined" || !voiceArmed) return;
      if (typeof busy !== "undefined" && busy) return;
      if (document.hidden) return;
      setTimeout(function () {
        if (typeof listening !== "undefined" && listening) return;
        if (typeof busy !== "undefined" && busy) return;
        window.__quietListen = true;
        window.startListening();
      }, 700);
    } catch (e) {}
  };

  var origSend = window.sendMessage;
  var PROFILE = /^\s*(میری کہانی|میری پروفائل|پروفائل)\s*[:：\-]?\s*([\s\S]{40,})$/;
  window.sendMessage = function (textOverride) {
    var inp = document.getElementById("messageInput");
    var msg = String(textOverride != null ? textOverride : (inp ? inp.value : "")).trim();
    var m = PROFILE.exec(msg);
    if (m) {
      if (inp) inp.value = "";
      var text = m[2].trim().slice(0, 8000);
      api("profile", { method: "POST", body: { text: text } }).then(function () {
        var ok = "ٹھیک ہے سر، آپ کی کہانی میں نے پرائیویٹ طور پر محفوظ کر لی ہے۔ اب میں آپ کو بہتر جانتا ہوں۔";
        try { addMsg(ok, "bot"); } catch (e) {}
        try { speak(ok); } catch (e) {}
      }).catch(function (e) {
        try { addMsg("کہانی محفوظ نہیں ہو سکی: " + (e && e.message ? e.message : ""), "bot err"); } catch (_) {}
      });
      return;
    }
    return origSend.apply(this, arguments);
  };
})();
