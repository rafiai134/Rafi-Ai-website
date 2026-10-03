/* Rafi AI — microphone behaviour fix.
   1) Nothing listens (and nothing beeps) until you say "Hello Rafi" or tap START AI.
      Android Chrome plays a system beep every time speech recognition (re)starts, so the
      always-on wake-word listener is OFF by default on phones. A "WAKE" switch turns it on.
   2) "Hello Rafi" / tap  ->  Rafi answers "Yes sir"  ->  then the mic opens for the command. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ||
    (window.matchMedia && matchMedia('(pointer:coarse)').matches);
  var KEY = 'rafi_wake';
  var yesBusy = false;

  function wakeOn() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (e) {}
    return !mobile; // default: ON for computers, OFF for phones
  }
  function setWake(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {} }

  /* ---- wake listener: only when enabled, never while "Yes sir" is being spoken ---- */
  var baseWake = window.startWakeWord;
  window.startWakeWord = function () {
    if (!wakeOn() || yesBusy) return;
    return baseWake && baseWake.apply(this, arguments);
  };
  function killWake() {
    try { if (typeof wakeRec !== 'undefined' && wakeRec) { wakeRec.onend = null; wakeRec.onerror = null; wakeRec.onresult = null; wakeRec.abort(); } } catch (e) {}
    try { wakeListening = false; clearTimeout(wakeRetry); } catch (e) {}
  }

  /* ---- "Yes sir" ---- */
  function voiceEn() {
    try {
      var vs = speechSynthesis.getVoices();
      return vs.filter(function (v) { return /^en-(US|GB|IN|PK)/i.test(v.lang); })[0] || null;
    } catch (e) { return null; }
  }
  function yes(done) {
    var fin = false;
    function end() { if (fin) return; fin = true; yesBusy = false; done(); }
    yesBusy = true;
    try { if (window.RafiOffice) RafiOffice.say('core', 'YES SIR', '', 2); } catch (e) {}
    var on = $('speakOn');
    if (!('speechSynthesis' in window) || (on && !on.checked)) { setTimeout(end, 150); return; }
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance('Yes sir');
      u.lang = 'en-US'; u.rate = 1.0; u.pitch = 0.9;
      var v = voiceEn(); if (v) u.voice = v;
      u.onstart = function () { try { setCore('speaking', 'YES SIR'); } catch (e) {} };
      u.onend = u.onerror = function () { try { setCore(null, 'RAFI AI'); } catch (e) {} setTimeout(end, 120); };
      setTimeout(function () { speechSynthesis.speak(u); }, 60);
      setTimeout(end, 2500); // safety
    } catch (e) { end(); }
  }

  var greetListen = window.startListening; // (greeting.js wrapper -> original)
  window.startListening = function () {
    if (yesBusy) return;
    var args = arguments, self = this;
    if (window.RafiGreeting && RafiGreeting.due()) return greetListen.apply(self, args); // full morning greeting
    yes(function () { greetListen.apply(self, args); });
  };

  /* ---- WAKE switch in the chat tools row ---- */
  function buildSwitch() {
    var spans = document.querySelectorAll('.chat-tools .toggle'), old = null;
    for (var i = 0; i < spans.length; i++) if (/WAKE/i.test(spans[i].textContent)) { old = spans[i]; break; }
    var lab = document.createElement('label');
    lab.className = 'toggle';
    lab.innerHTML = '<input id="wakeOn" type="checkbox"> WAKE: “RAFI AI”';
    if (old && old.parentNode) old.parentNode.replaceChild(lab, old);
    else { var row = document.querySelector('.chat-tools'); if (row) row.appendChild(lab); else return; }
    var cb = $('wakeOn');
    cb.checked = wakeOn();
    cb.addEventListener('change', function () {
      setWake(cb.checked);
      if (cb.checked) {
        // user gesture: allowed to arm the microphone now
        if (typeof armVoiceSilent === 'function') armVoiceSilent();
      } else {
        killWake();
        var vs = $('voiceStatus'); if (vs) vs.textContent = '● TAP TO TALK';
      }
    });
    if (!wakeOn()) { var vs = $('voiceStatus'); if (vs) vs.textContent = '● TAP TO TALK'; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildSwitch);
  else buildSwitch();

  /* computers only: if the mic was allowed before and wake is on, listen hands-free right away */
  function rearm() {
    try {
      if (!mobile && wakeOn() && localStorage.getItem('rafi_mic_granted') === '1' && typeof armVoiceSilent === 'function') armVoiceSilent();
    } catch (e) {}
  }
  if (document.readyState === 'complete') setTimeout(rearm, 400);
  else window.addEventListener('load', function () { setTimeout(rearm, 400); });
})();
