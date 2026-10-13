/* Rafi AI talk.js: human-like conversation.
   1) After Rafi speaks (reply, or a question he asked after looking at you) the microphone opens by itself
      so you can simply answer. No button, no "Yes sir" in between.
   2) A message that starts with "میری کہانی:" is saved PRIVATELY as the owner profile (never sent to chat).
   3) "گروک کی: <key>" saves the backup AI key privately (Redis), never shown in chat. */
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

  function tell(t, err) {
    try { addMsg(t, err ? "bot err" : "bot"); } catch (e) {}
    if (!err) { try { speak(t); } catch (e) {} }
  }

  var origSend = window.sendMessage;
  var PROFILE = /^\s*(میری کہانی|میری پروفائل|پروفائل)\s*[:：\-]?\s*([\s\S]{40,})$/;
  var KEYMSG = /^\s*(?:گروک کی|گروک|groq key|llm key|backup key)\s*[:：\-]?\s*([A-Za-z0-9_\-.]{20,300})\s*$/i;
  window.sendMessage = function (textOverride) {
    var inp = document.getElementById("messageInput");
    var msg = String(textOverride != null ? textOverride : (inp ? inp.value : "")).trim();
    var m = PROFILE.exec(msg);
    if (m) {
      if (inp) inp.value = "";
      var text = m[2].trim().slice(0, 8000);
      api("profile", { method: "POST", body: { text: text } }).then(function () {
        tell("ٹھیک ہے سر، آپ کی کہانی میں نے پرائیویٹ طور پر محفوظ کر لی ہے۔ اب میں آپ کو بہتر جانتا ہوں۔");
      }).catch(function (e) {
        tell("کہانی محفوظ نہیں ہو سکی: " + (e && e.message ? e.message : ""), true);
      });
      return;
    }
    var k = KEYMSG.exec(msg);
    if (k) {
      if (inp) inp.value = "";
      api("llmkey", { method: "POST", body: { key: k[1] } }).then(function () {
        tell("ٹھیک ہے سر، بیک اپ AI کی key پرائیویٹ طور پر محفوظ ہو گئی۔ اب مجھ سے کوئی سوال پوچھیں۔");
      }).catch(function (e) {
        tell("key محفوظ نہیں ہو سکی: " + (e && e.message ? e.message : ""), true);
      });
      return;
    }
    return origSend.apply(this, arguments);
  };
})();
