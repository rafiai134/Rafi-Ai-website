/* Rafi AI talk.js: human-like conversation.
   1) After Rafi speaks the microphone opens by itself so you can simply answer.
   2) "میری کہانی: ..." saves the owner profile PRIVATELY (never sent to chat).
   3) "groq key: ..." saves the backup AI key privately.
   4) "contacts" (or "کانٹیکٹس") opens the phone's own contact picker once; all picked contacts are saved privately,
      so "ندیم کو واٹس ایپ کرو" works with no typing of numbers. */
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

  function normPhone(raw) {
    var plus = /^\s*\+/.test(raw);
    var d = String(raw || "").replace(/\D/g, "");
    if (!d) return "";
    if (plus) return d;
    if (d.indexOf("00") === 0) return d.slice(2);
    if (d.charAt(0) === "0") return "92" + d.slice(1); // Pakistan local format
    return d;
  }

  async function importContacts() {
    if (!("contacts" in navigator) || !("ContactsManager" in window)) {
      tell("اس برائزر میں کانٹیکٹ چننے کا آپشن نہیں۔ Android کے Chrome میں کھولیں۔", true);
      return;
    }
    var picked;
    try {
      picked = await navigator.contacts.select(["name", "tel"], { multiple: true });
    } catch (e) {
      tell("کانٹیکٹس نہیں چنے گئے: " + (e && e.message ? e.message : ""), true);
      return;
    }
    var list = [];
    (picked || []).forEach(function (c) {
      var name = (c.name && c.name[0]) || "";
      var tel = (c.tel && c.tel[0]) || "";
      var phone = normPhone(tel);
      if (name && phone) list.push({ name: name, phone: phone });
    });
    if (!list.length) { tell("کوئی کانٹیکٹ نہیں چنا گیا۔", true); return; }
    var added = 0;
    try {
      for (var i = 0; i < list.length; i += 150) {
        var r = await api("contactsimport", { method: "POST", body: { contacts: list.slice(i, i + 150) } });
        added += (r && r.added) || 0;
      }
      tell("ٹھیک ہے سر، " + added + " کانٹیکٹس پرائیویٹ طور پر محفوظ ہو گئے۔ اب نام بول کر واٹس ایپ پیغام بھیج سکتا ہوں۔");
    } catch (e) {
      tell("کانٹیکٹس محفوظ نہیں ہو سکے: " + (e && e.message ? e.message : ""), true);
    }
  }

  var origSend = window.sendMessage;
  var PROFILE = /^\s*(میری کہانی|میری پروفائل|پروفائل)\s*[:：\-]?\s*([\s\S]{40,})$/;
  var KEYMSG = /^\s*(?:گروک کی|گروک|groq key|llm key|backup key)\s*[:：\-]?\s*([A-Za-z0-9_\-.]{20,300})\s*$/i;
  var CONTACTS = /^\s*(?:contacts?|کانٹیکٹس|کونٹیکٹس|کانٹیکٹ|کونٹیکٹ)(?:\s*(?:import|امپورٹ|لاؤ|سیو|محفوظ))?\s*$/i;
  window.sendMessage = function (textOverride) {
    var inp = document.getElementById("messageInput");
    var msg = String(textOverride != null ? textOverride : (inp ? inp.value : "")).trim();
    if (CONTACTS.test(msg)) {
      if (inp) inp.value = "";
      importContacts(); // must start inside this tap so the browser allows the picker
      return;
    }
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
