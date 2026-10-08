/* Rafi AI — spoken greeting + quick-open commands.
   On first activation (START AI tap, or the wake word) Rafi greets: good morning/afternoon,
   day, time, live temperature, then asks what task to do — and opens the command mic. */
(function () {
  'use strict';
  var GAP = 2 * 3600 * 1000, KEY = 'rafi_last_greet', POS = 'rafi_pos';
  var FALLBACK = { lat: 24.8607, lon: 67.0011 }; // Karachi, used if location is unavailable
  var greeting = false, tok = 0;
  var $ = function (id) { return document.getElementById(id); };
  var DAYS = ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'];
  var ANDROID = /Android/i.test(navigator.userAgent || '');

  function lastGreet() { try { return +localStorage.getItem(KEY) || 0; } catch (e) { return 0; } }
  function stamp() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} }
  function shouldGreet() { return Date.now() - lastGreet() > GAP; }

  function hello(h) {
    if (h >= 5 && h < 12) return 'صبح بخیر';
    if (h >= 12 && h < 16) return 'دوپہر بخیر';
    if (h >= 16 && h < 20) return 'شام بخیر';
    return 'السلام علیکم';
  }
  function sky(code) {
    if (code === 0) return 'صاف';
    if (code <= 2) return 'ہلکے بادلوں والا';
    if (code === 3) return 'ابر آلود';
    if (code === 45 || code === 48) return 'دھند والا';
    if (code >= 51 && code <= 57) return 'ہلکی پھوار والا';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'بارش والا';
    if (code >= 71 && code <= 77) return 'برفیلا';
    if (code >= 95) return 'گرج چمک والا';
    return 'ملا جلا';
  }

  function getPos() {
    return new Promise(function (resolve) {
      var cached = null;
      try { cached = JSON.parse(localStorage.getItem(POS) || 'null'); } catch (e) {}
      var done = false;
      function finish(p, fb) { if (done) return; done = true; resolve({ p: p, fallback: fb }); }
      if (cached && cached.lat) finish(cached, false);
      if (!navigator.geolocation) return finish(cached || FALLBACK, !cached);
      var to = setTimeout(function () { finish(cached || FALLBACK, !cached); }, 2500);
      navigator.geolocation.getCurrentPosition(function (r) {
        var p = { lat: r.coords.latitude, lon: r.coords.longitude };
        try { localStorage.setItem(POS, JSON.stringify(p)); } catch (e) {}
        clearTimeout(to); finish(p, false);
      }, function () { clearTimeout(to); finish(cached || FALLBACK, !cached); }, { timeout: 2400, maximumAge: 3600000 });
    });
  }
  function weather(pos) {
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 3500);
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pos.lat + '&longitude=' + pos.lon + '&current=temperature_2m,weather_code&timezone=auto';
    return fetch(url, ctl ? { signal: ctl.signal } : {})
      .then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(to); return j && j.current ? { t: Math.round(j.current.temperature_2m), code: j.current.weather_code } : null; })
      .catch(function () { clearTimeout(to); return null; });
  }

  function compose(w) {
    var d = new Date(), h = d.getHours(), m = d.getMinutes(), h12 = h % 12 || 12;
    var parts = [hello(h) + ' سر!'];
    parts.push('آج ' + DAYS[d.getDay()] + ' ہے، اور ابھی ' + h12 + (m ? ' بج کر ' + m + ' منٹ' : ' بجے') + ' ہیں۔');
    if (w) {
      parts.push('موسم ' + sky(w.code) + ' ہے اور درجہ حرارت ' + w.t + ' ڈگری سینٹی گریڈ ہے۔');
      if (w.t >= 35) parts.push('گرمی کافی زیادہ ہے، پانی پیتے رہیے گا۔');
      else if (w.t <= 12) parts.push('سردی ہے، اپنا خیال رکھیے گا۔');
      if ((w.code >= 61 && w.code <= 67) || (w.code >= 80 && w.code <= 82) || w.code >= 95) parts.push('باہر جائیں تو چھتری ساتھ رکھیے گا۔');
    }
    try {
      if (typeof state !== 'undefined' && state && state.actions) {
        var n = state.actions.filter(function (a) { return a.status === 'pending'; }).length;
        if (n) parts.push('آپ کے ' + n + ' کام منظوری کے منتظر ہیں۔');
      }
    } catch (e) {}
    parts.push('حکم کیجیے سر، آج کون سا کام کروں؟');
    return parts.join(' ');
  }

  function say(text, my, end) {
    var on = $('speakOn');
    if (!('speechSynthesis' in window) || (on && !on.checked)) { setTimeout(end, 300); return; }
    var parts = text.match(/[^۔.!?؟]+[۔.!?؟]*/g) || [text], i = 0;
    try { speechSynthesis.cancel(); } catch (e) {}
    function next() {
      if (my !== tok) return;
      if (i >= parts.length) return end();
      var s = parts[i++].trim();
      if (!s) return next();
      var u = new SpeechSynthesisUtterance(s);
      u.lang = 'ur-PK';
      var v = (typeof pickVoice === 'function') ? pickVoice(u.lang) : null;
      if (v) u.voice = v;
      u.rate = 0.95;
      u.onstart = function () { if (my === tok && typeof setCore === 'function') setCore('speaking', 'RAFI AI'); };
      u.onend = next; u.onerror = next;
      speechSynthesis.speak(u);
    }
    setTimeout(next, 80);
  }

  function greet(done) {
    greeting = true; stamp();
    var my = ++tok;
    if (typeof setCore === 'function') setCore('thinking', '…');
    try { if (window.RafiOffice) RafiOffice.say('core', 'GOOD DAY SIR', '', 3); } catch (e) {}
    getPos().then(function (r) {
      return weather(r.p);
    }).then(function (w) {
      if (my !== tok) return;
      var text = compose(w);
      if (typeof addMsg === 'function') addMsg(text, 'bot');
      say(text, my, function () {
        if (my !== tok) return;
        greeting = false;
        if (typeof setCore === 'function') setCore(null, 'RAFI AI');
        if (done) setTimeout(done, 200);
      });
    });
  }

  /* any tap on the orb / mic during the greeting interrupts it (and lets the mic open) */
  ['core', 'mic'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('click', function () { if (greeting) { tok++; greeting = false; } }, true);
  });

  var origStart = window.startListening;
  if (typeof origStart === 'function') {
    window.startListening = function () {
      if (greeting) return;
      if (shouldGreet()) { greet(function () { origStart.apply(window, []); }); return; }
      return origStart.apply(this, arguments);
    };
  }

  /* ---------- quick-open commands (ChatGPT, WhatsApp ...) ----------
     Computers only. On an Android phone these requests go to the server instead,
     which sends them to the Rafi AI Companion app (it opens the real app / site on the phone). */
  var SITES = [
    { re: /chat\s*gpt|چیٹ\s*جی\s*پی\s*ٹی|چیٹ\s*جی\s*ٹی|चैट\s*जी\s*पी\s*टी|चैटजीपीटी/i, name: 'ChatGPT', url: 'https://chatgpt.com/' },
    { re: /whats\s*app|واٹس\s*ایپ|व्हाट्स\s*ऐप|व्हाट्सअप|वॉट्सऐप/i, name: 'WhatsApp', url: 'https://web.whatsapp.com/' },
    { re: /gmail|جی\s*میل|जीमेल/i, name: 'Gmail', url: 'https://mail.google.com/' },
    { re: /youtube|یوٹیوب|यूट्यूब/i, name: 'YouTube', url: 'https://www.youtube.com/' },
    { re: /shopify|شاپفائی|शॉपिफाई/i, name: 'Shopify', url: 'https://admin.shopify.com/' },
    { re: /alibaba|علی\s*بابا|अलीबाबा/i, name: 'Alibaba', url: 'https://www.alibaba.com/' }
  ];
  var OPENRE = /open|go to|کھول|چلو|جاؤ|جاو|खोल|चलो|जाओ/i;
  if (typeof window.sendMessage === 'function') {
    var prevSend = window.sendMessage;
    window.sendMessage = function (textOverride) {
      try {
        var inp = $('messageInput');
        var m = String(textOverride !== undefined && textOverride !== null ? textOverride : (inp ? inp.value : '')).trim();
        var isBusy = (typeof busy !== 'undefined') && busy;
        if (!ANDROID && m && !isBusy && OPENRE.test(m)) {
          for (var i = 0; i < SITES.length; i++) {
            if (SITES[i].re.test(m)) {
              var s = SITES[i];
              if (inp) { inp.value = ''; inp.style.height = 'auto'; }
              addMsg(m, 'me');
              addMsg(s.name + ' کھول رہا ہوں۔ اگر براؤزر نے روک دیا ہو تو نیچے بٹن دبائیں۔', 'bot', [{ url: s.url, label: s.name }]);
              try { if (window.RafiOffice) RafiOffice.task(s.name === 'WhatsApp' ? 'whatsapp' : s.name === 'Shopify' ? 'shopify' : s.name === 'Alibaba' ? 'supplier' : 'core', 'Open ' + s.name); } catch (e) {}
              try { window.open(s.url, '_blank', 'noopener'); } catch (e) {}
              return;
            }
          }
        }
      } catch (e) {}
      return prevSend.apply(this, arguments);
    };
  }

  /* NOTE: the microphone is never armed automatically any more (that caused the
     "tung tung" beeps on phones as soon as the page opened). voicefix.js decides. */
  window.RafiGreeting = { due: shouldGreet, run: greet };
})();
