/* Rafi AI voice upgrade. Loaded after script.js and shares its globals. */
(function () {
  var g = function (id) { return document.getElementById(id); };
  var starting = false;
  var speakingNow = false;
  var speakToken = 0;

  /* ---------- 0. Bug fix ----------
     ROOM_LAYOUT was never defined, so any agent task threw an error BEFORE
     the reply was spoken. Define it, and make the agent animation unable to
     block speech ever again. */
  if (typeof ROOM_LAYOUT === 'undefined') {
    window.ROOM_LAYOUT = ROOMS.map(function (r) {
      var p = (r.people && r.people[0]) || { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      return { door: { x: r.door.x, y: r.door.y }, station: { x: p.x, y: p.y } };
    });
  }
  var _runAgentUi = window.runAgentUi;
  window.runAgentUi = function (ui) {
    try { _runAgentUi(ui); } catch (e) { console.warn('agent ui', e); }
  };

  /* ---------- 1. Wake word: tolerant matching ---------- */
  var WAKE_EN = /\b(?:(?:hey|hello|hi|ok|okay)\s+)?(?:raf+[iye]+|rafay|rapi|ravi)\b(?:\s*(?:a\.?\s?i|eye|ay)\b\.?)?/i;
  var WAKE_UR = /(?:(?:\u06c1\u06cc\u0644\u0648|\u0627\u0631\u06d2|\u0627\u0648\u06a9\u06d2)\s*)?(?:\u0631\u0627\u0641\u06cc|\u0631\u0641\u06cc|\u0631\u0627\u067e\u06be\u06cc)(?:\s*(?:\u0622\u0626\u06cc|\u0627\u06d2 \u0622\u0626\u06cc|\u0627\u06cc \u0622\u0626\u06cc|ai))?/i;

  function findWake(heard) {
    var m = WAKE_EN.exec(heard) || WAKE_UR.exec(heard);
    if (!m) return null;
    var cmd = heard.slice(m.index + m[0].length).replace(/^[\s,.:;!?\u060c\u06d4-]+/, '').trim();
    return { command: cmd };
  }

  window.startWakeWord = function () {
    var okProto = location.protocol === 'https:' || location.hostname === 'localhost';
    if (!SR || !voiceArmed || wakeListening || listening || starting || busy || !okProto) return;
    try { if (wakeRec) { wakeRec.onend = null; wakeRec.onerror = null; wakeRec.onresult = null; wakeRec.abort(); } } catch (e) {}

    var r = new SR();
    wakeRec = r;
    r.lang = 'en-US';
    r.continuous = true;
    r.interimResults = false;
    r.maxAlternatives = 3;

    r.onstart = function () {
      wakeListening = true;
      g('mic').classList.remove('on');
      g('voiceStatus').textContent = '\u25cf SAY \u201cRAFI AI\u201d';
      setCore(null, 'RAFI AI');
    };
    r.onend = function () {
      wakeListening = false;
      clearTimeout(wakeRetry);
      if (voiceArmed && !listening && !starting && !busy) wakeRetry = setTimeout(startWakeWord, 500);
    };
    r.onerror = function (e) {
      wakeListening = false;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        voiceArmed = false;
        g('voiceStatus').textContent = '\u25cf VOICE PERMISSION';
        setCore(null, 'RAFI AI');
        return;
      }
      if (voiceArmed) wakeRetry = setTimeout(startWakeWord, 900);
    };
    r.onresult = function (e) {
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        for (var j = 0; j < e.results[i].length; j++) {
          var w = findWake(e.results[i][j].transcript.trim());
          if (!w) continue;
          try { r.stop(); } catch (_) {}
          // The wake listener is English-only. For Urdu/Hindi, anything heard after the
          // wake word is garbled, so open the real command mic in the chosen language.
          var english = g('lang').value.indexOf('en') === 0;
          if (w.command && english) sendMessage(w.command);
          else setTimeout(startListening, 150);
          return;
        }
      }
    };
    try { r.start(); } catch (e) {}
  };

  /* ---------- 2. Command mic: clear feedback + live text ---------- */
  window.startListening = function () {
    if (!SR || listening || starting || busy) return;
    starting = true;
    setTimeout(function () { starting = false; }, 4000); // safety net
    speakToken++; speakingNow = false;
    if (window.speechSynthesis) speechSynthesis.cancel();
    try { if (wakeRec) wakeRec.stop(); } catch (e) {}

    setTimeout(function () {
      var r = new SR();
      rec = r;
      r.lang = g('lang').value;
      r.interimResults = true;
      r.continuous = false;
      r.maxAlternatives = 1;
      var finalText = '', interim = '';
      var inp = g('messageInput');

      r.onstart = function () {
        starting = false; listening = true;
        setCore('listening', 'LISTENING\u2026');
        g('voiceStatus').textContent = '\u25cf LISTENING';
        g('mic').classList.add('on');
      };
      r.onresult = function (e) {
        interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t; else interim += t;
        }
        inp.value = (finalText + interim).trim(); // live preview
      };
      r.onerror = function (e) {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          voiceArmed = false;
          g('voiceStatus').textContent = '\u25cf VOICE PERMISSION';
          addMsg('\u0645\u0627\u0626\u06cc\u06a9 \u06a9\u06cc \u0627\u062c\u0627\u0632\u062a \u0646\u06c1\u06cc\u06ba \u0645\u0644\u06cc\u06d4 \u0628\u0631\u0627\u0626\u0632\u0631 \u0633\u06cc\u0679\u0646\u06af\u0632 \u0645\u06cc\u06ba Microphone \u06a9\u0648 Allow \u06a9\u0631\u06cc\u06ba\u06d4', 'bot err');
        } else if (e.error === 'network') {
          addMsg('\u0627\u0646\u0679\u0631\u0646\u06cc\u0679 \u06a9\u0627 \u0645\u0633\u0626\u0644\u06c1 \u06c1\u06d2\u060c \u0622\u0648\u0627\u0632 \u0646\u06c1\u06cc\u06ba \u0633\u0646\u06cc \u062c\u0627 \u0633\u06a9\u06cc\u06d4', 'bot err');
        }
      };
      r.onend = function () {
        starting = false; listening = false;
        g('mic').classList.remove('on');
        var text = (finalText || interim).trim();
        inp.value = '';
        if (text) { sendMessage(text); return; }
        setCore(null, 'RAFI AI');
        g('voiceStatus').textContent = '\u25cf SAY “RAFI AI”';
        if (voiceArmed && !busy) setTimeout(startWakeWord, 300);
      };
      try { r.start(); } catch (e) { starting = false; }
    }, 200);
  };

  /* ---------- 3. Tap orb / mic = talk now ---------- */
  function tapTalk() {
    if (listening) { try { rec.stop(); } catch (e) {} return; } // STOP AI
    if (window.speechSynthesis && (speechSynthesis.speaking || speakingNow)) {
      speakToken++; speakingNow = false; speechSynthesis.cancel(); // interrupt Rafi
      setCore(null, 'RAFI AI');
    }
    if (voiceArmed) { startListening(); return; }
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (voiceArmed) { clearInterval(t); startListening(); }
      else if (tries > 30) clearInterval(t);
    }, 150);
  }
  g('mic').addEventListener('click', tapTalk);
  g('core').addEventListener('click', tapTalk);

  /* ---------- 4. Spoken reply: clean, chunked, right language ---------- */
  function cleanForSpeech(t) {
    return String(t)
      .replace(/https?:\/\/\S+/g, ' link ')
      .replace(/[`*_#>~|]+/g, ' ')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
      .replace(/\s*\n+\s*/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function chunks(t) {
    var parts = t.match(/[^\u06d4.!?\u061f]+[\u06d4.!?\u061f]*/g) || [t];
    var out = [], cur = '';
    parts.forEach(function (p) {
      p = p.trim();
      if (!p) return;
      if (cur && (cur + ' ' + p).length > 160) { out.push(cur); cur = p; }
      else cur = cur ? cur + ' ' + p : p;
    });
    if (cur) out.push(cur);
    return out;
  }
  function langFor(t) {
    var ar = (t.match(/[\u0600-\u06FF]/g) || []).length;
    var de = (t.match(/[\u0900-\u097F]/g) || []).length;
    var la = (t.match(/[A-Za-z]/g) || []).length;
    var sel = g('lang').value;
    if (ar >= de && ar > la) return 'ur-PK';
    if (de > ar && de > la) return 'hi-IN';
    return sel.indexOf('en') === 0 ? sel : 'en-US';
  }

  window.speak = function (text) {
    var clean = cleanForSpeech(text || '');
    if (!g('speakOn').checked || !('speechSynthesis' in window) || !clean) {
      // busy is still true right now, so resume the wake listener a moment later
      setTimeout(function () { setCore(null, 'RAFI AI'); afterSpeak(); }, 80);
      return;
    }
    speechSynthesis.cancel();
    var my = ++speakToken, list = chunks(clean), i = 0;
    speakingNow = true;
    function finish() {
      if (my !== speakToken) return;
      speakingNow = false;
      setCore(null, 'RAFI AI');
      afterSpeak();
    }
    function next() {
      if (my !== speakToken) return;
      if (i >= list.length) return finish();
      var u = new SpeechSynthesisUtterance(list[i++]);
      u.lang = langFor(u.text);
      var v = pickVoice(u.lang);
      if (v) u.voice = v;
      u.rate = 0.95;
      u.onstart = function () { if (my === speakToken) setCore('speaking', 'RAFI AI'); };
      u.onend = next;
      u.onerror = next;
      speechSynthesis.speak(u);
    }
    setTimeout(next, 60); // Chrome can drop speak() called right after cancel()
  };

  /* ---------- 5. Watchdog: always come back to listening for the wake word ---------- */
  setInterval(function () {
    if (voiceArmed && !busy && !listening && !wakeListening && !starting && !speakingNow && !document.hidden) {
      startWakeWord();
    }
  }, 4000);
})();
