/* Rafi AI — Pixel Agent Office v2
   - Human pixel-art staff (no robots), rooms with doors, desks and live monitors
   - Senior Manager sits in his glass cabin; when an order / task arrives he walks
     through the corridor to the right agent's room, briefs them, and walks back.
   Loaded after script.js + voice.js; overrides drawOffice / triggerAgentMove. */
(function () {
  'use strict';
  var cv = document.getElementById('office');
  if (!cv || !cv.getContext) return;

  var LW = 256, LH = 144, SC = 4;
  cv.width = LW * SC;
  cv.height = LH * SC;
  var ctx = cv.getContext('2d');
  var sc = document.createElement('canvas');
  sc.width = LW; sc.height = LH;
  var g = sc.getContext('2d');

  try {
    var st = document.createElement('style');
    st.textContent = '.office-wrap canvas{min-height:0!important;aspect-ratio:16/9;height:auto}';
    document.head.appendChild(st);
  } catch (e) {}

  /* ---------- tiny helpers ---------- */
  function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
  function clock() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }
  function line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    g.fillStyle = c;
    for (var i = 0; i < 64; i++) {
      g.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /* ---------- palette ---------- */
  var WC = '#7ea6bb', WS = '#2c485b', DESK = '#5f849b', DESKF = '#3b5a70', CH = '#233a4c';

  /* ---------- people ---------- */
  var LOOK = {
    mgr:      { hair: '#9aa6b2', skin: '#e0ac86', skin2: '#c48e68', shirt: '#22324f', pants: '#151e33', tie: '#d9434f', glasses: true, style: 'short' },
    core:     { hair: '#1c1c26', skin: '#c68f6a', skin2: '#a9754f', shirt: '#2db7e8', pants: '#243247', style: 'short' },
    supplier: { hair: '#5b3319', skin: '#e5b28c', skin2: '#c99673', shirt: '#f08b3e', pants: '#3a3340', style: 'short' },
    shopify:  { hair: '#2a1a12', skin: '#a96f4b', skin2: '#8c593a', shirt: '#3fd18f', pants: '#263a3a', style: 'short' },
    whatsapp: { hair: '#2b1b3b', skin: '#e7b999', skin2: '#c99b7e', shirt: '#a77be8', pants: '#2b2a4a', style: 'long' }
  };
  var AG = {
    core:     { name: 'RAFI CORE', color: '#5de4ff', seed: 0.3 },
    supplier: { name: 'SUPPLIER',  color: '#ff9b55', seed: 1.7 },
    shopify:  { name: 'SHOPIFY',   color: '#61e8a2', seed: 2.9 },
    whatsapp: { name: 'WHATSAPP',  color: '#d69cff', seed: 3.6 }
  };
  var ORDER = ['core', 'supplier', 'shopify', 'whatsapp'];
  var SEAT = {
    core:     { cx: 110, dy: 36 },
    supplier: { cx: 31,  dy: 110 },
    shopify:  { cx: 111, dy: 110 },
    whatsapp: { cx: 194, dy: 110 }
  };
  var MGR_DESK = { cx: 24, dy: 36 };

  /* standing / walking person, feet anchored at (fx, fy). dir: d u l r. step: 0 idle, 1/2 walk */
  function person(fx, fy, dir, step, L) {
    var x = Math.round(fx) - 4, y = Math.round(fy) - 16, sh = '#10161d', eye = '#101820';
    R(x, y + 15, 8, 1, 'rgba(0,0,0,.35)');
    // legs
    if (dir === 'd' || dir === 'u') {
      var a = step === 1 ? 1 : 0, b = step === 2 ? 1 : 0;
      R(x + 1, y + 11, 3, 3 - a, L.pants); R(x + 1, y + 14 - a, 3, 1, sh);
      R(x + 4, y + 11, 3, 3 - b, L.pants); R(x + 4, y + 14 - b, 3, 1, sh);
    } else if (step) {
      var d = 2;
      var l1 = x + 3 - (step === 1 ? d : -d) + 0, l2 = x + 3 + (step === 1 ? d : -d) + 0;
      R(l1, y + 11, 2, 3, L.pants); R(l1, y + 14, 2, 1, sh);
      R(l2, y + 11, 2, 3, L.pants); R(l2, y + 14, 2, 1, sh);
    } else {
      R(x + 2, y + 11, 4, 3, L.pants); R(x + 2, y + 14, 4, 1, sh);
    }
    // torso + arms
    R(x + 1, y + 6, 6, 5, L.shirt);
    if (dir === 'd' || dir === 'u') {
      var sw = step === 1 ? 1 : 0, sw2 = step === 2 ? 1 : 0;
      R(x, y + 6 + sw, 1, 4, L.shirt); R(x, y + 10 + sw, 1, 1, L.skin);
      R(x + 7, y + 6 + sw2, 1, 4, L.shirt); R(x + 7, y + 10 + sw2, 1, 1, L.skin);
    } else {
      var ax = x + 3 + (step === 1 ? -1 : step === 2 ? 1 : 0);
      R(ax, y + 7, 2, 3, L.shirt); R(ax, y + 10, 2, 1, L.skin);
    }
    // head
    R(x + 1, y, 6, 6, L.skin);
    if (dir === 'd') {
      R(x + 1, y, 6, 2, L.hair); R(x + 1, y + 2, 1, 1, L.hair); R(x + 6, y + 2, 1, 1, L.hair);
      if (L.style === 'long') { R(x, y + 1, 1, 7, L.hair); R(x + 7, y + 1, 1, 7, L.hair); }
      R(x + 2, y + 3, 1, 1, eye); R(x + 5, y + 3, 1, 1, eye);
      if (L.glasses) { R(x + 1, y + 3, 6, 1, '#0e1720'); R(x + 2, y + 3, 1, 1, '#cfe9f5'); R(x + 5, y + 3, 1, 1, '#cfe9f5'); }
      if (L.tie) { R(x + 3, y + 6, 2, 1, '#f2f2f2'); R(x + 3, y + 7, 2, 4, L.tie); }
    } else if (dir === 'u') {
      R(x + 1, y, 6, 6, L.hair);
      if (L.style === 'long') R(x + 1, y + 6, 6, 3, L.hair);
    } else if (dir === 'r') {
      R(x + 1, y, 6, 2, L.hair); R(x + 1, y + 2, 3, 4, L.hair);
      if (L.style === 'long') R(x + 1, y + 2, 3, 7, L.hair);
      R(x + 5, y + 3, 1, 1, eye);
      if (L.glasses) { R(x + 4, y + 3, 3, 1, '#0e1720'); }
    } else {
      R(x + 1, y, 6, 2, L.hair); R(x + 4, y + 2, 3, 4, L.hair);
      if (L.style === 'long') R(x + 4, y + 2, 3, 7, L.hair);
      R(x + 2, y + 3, 1, 1, eye);
      if (L.glasses) { R(x + 1, y + 3, 3, 1, '#0e1720'); }
    }
  }

  /* seated person (front view, behind desk). head top = dy-19 */
  function seated(cx, dy, L, t, working, seed) {
    var y0 = dy - 19;
    R(cx - 5, y0 + 5, 10, 9, CH); R(cx - 5, y0 + 5, 10, 1, '#34506a');
    var by = y0 + (working ? ((t * 7) | 0) % 2 : 0);
    var blink = ((t + seed) % 4.3) < 0.14;
    R(cx - 3, by + 6, 6, 6, L.shirt); R(cx - 4, by + 7, 1, 5, L.shirt); R(cx + 3, by + 7, 1, 5, L.shirt);
    if (L.tie) { R(cx - 1, by + 6, 2, 1, '#f2f2f2'); R(cx - 1, by + 7, 2, 4, L.tie); }
    R(cx - 3, by, 6, 6, L.skin);
    R(cx - 3, by, 6, 2, L.hair); R(cx - 3, by + 2, 1, 1, L.hair); R(cx + 2, by + 2, 1, 1, L.hair);
    if (L.style === 'long') { R(cx - 4, by + 1, 1, 8, L.hair); R(cx + 3, by + 1, 1, 8, L.hair); }
    var e = blink ? L.skin2 : '#101820';
    R(cx - 2, by + 3, 1, 1, e); R(cx + 1, by + 3, 1, 1, e);
    if (L.glasses) { R(cx - 3, by + 3, 6, 1, '#0e1720'); if (!blink) { R(cx - 2, by + 3, 1, 1, '#cfe9f5'); R(cx + 1, by + 3, 1, 1, '#cfe9f5'); } }
  }

  function emptyChair(cx, dy) {
    var y0 = dy - 19;
    R(cx - 5, y0 + 5, 10, 9, CH); R(cx - 5, y0 + 5, 10, 1, '#34506a');
  }

  /* ---------- furniture ---------- */
  function monitor(cx, dy, acc, working, t) {
    R(cx - 6, dy - 8, 12, 8, '#0a131c'); R(cx - 6, dy - 8, 12, 1, '#2c4152');
    R(cx - 5, dy - 7, 10, 6, working ? '#0e2a3f' : '#0a1c2b');
    if (working) {
      for (var i = 0; i < 3; i++) { var l = 2 + ((((t * 5) | 0) + i * 5) % 6); R(cx - 4, dy - 6 + i * 2, l, 1, acc); }
      R(cx + 3, dy - 7, 1, 6, 'rgba(255,255,255,.07)');
    } else {
      R(cx - 1, dy - 5, 2, 2, ((t * 1.2) % 2) < 1 ? acc : '#17394f');
    }
    R(cx - 1, dy - 1, 2, 1, '#2b3b48');
  }
  function desk(cx, dy, acc, working, t, wide) {
    var w = wide ? 30 : 24, x = cx - (w >> 1);
    R(x, dy, w, 7, DESK); R(x, dy, w, 1, '#7ea0b5'); R(x, dy + 7, w, 2, DESKF); R(x, dy + 9, w, 1, 'rgba(0,0,0,.28)');
    R(cx - 4, dy + 3, 8, 2, '#1b2833');
    if (working) { R(cx - 4 + (((t * 18) | 0) % 8), dy + 3, 1, 1, acc); R(cx - 4 + (((t * 13 + 3) | 0) % 8), dy + 4, 1, 1, acc); }
    R(cx + 6, dy + 3, 2, 2, '#26343f');
    R(x + 2, dy + 2, 2, 3, '#e8e8e8'); R(x + 2, dy + 2, 2, 1, '#b9a37c');
    if (wide) {
      monitor(cx - 7, dy, acc, working, t); monitor(cx + 7, dy, acc, working, t);
      R(cx - 4, dy + 7, 8, 2, '#d9b45a');
    } else monitor(cx, dy, acc, working, t);
  }
  function plant(x, y) {
    R(x - 3, y - 4, 6, 4, '#6d4a2f'); R(x - 3, y - 4, 6, 1, '#8a6340');
    R(x - 4, y - 9, 8, 5, '#2f9b62'); R(x - 2, y - 12, 4, 4, '#3dbb78'); R(x - 6, y - 8, 2, 3, '#277f52'); R(x + 4, y - 8, 2, 3, '#277f52');
  }
  function bookshelf(x, y, w) {
    R(x, y, w, 9, '#3b2a20'); R(x + 1, y + 1, w - 2, 3, '#1d130e'); R(x + 1, y + 5, w - 2, 3, '#1d130e');
    var cols = ['#c0504d', '#4f81bd', '#9bbb59', '#f2c14e', '#8064a2', '#4bacc6'];
    for (var i = 0; i < w - 3; i += 2) {
      R(x + 1 + i, y + 1, 1 + (i % 3 === 0 ? 1 : 0), 3, cols[(i / 2 | 0) % 6]);
      R(x + 1 + i, y + 5, 1 + (i % 4 === 0 ? 1 : 0), 3, cols[((i / 2 | 0) + 3) % 6]);
    }
  }
  function rack(x, y, t, seed) {
    R(x, y, 9, 18, '#16212c'); R(x, y, 9, 1, '#31475a');
    for (var i = 0; i < 5; i++) {
      R(x + 1, y + 2 + i * 3, 7, 2, '#0c141c');
      R(x + 2, y + 2 + i * 3, 1, 1, ((t * 3 + i * 1.7 + seed) % 2) < 1.2 ? '#5de4ff' : '#1b4e5e');
      R(x + 4, y + 2 + i * 3, 1, 1, ((t * 5 + i + seed) % 3) < 1 ? '#61e8a2' : '#1e5a43');
    }
  }
  function wallScreen(x, y, w, h, t, c) {
    R(x, y, w, h, '#06101a'); R(x, y, w, 1, '#2f4a5e'); R(x, y + h - 1, w, 1, '#2f4a5e');
    for (var i = 0; i < w - 4; i += 3) {
      var bh = 1 + (((Math.sin(t * 2 + i * 0.7) + 1) * (h - 4) / 2.2) | 0);
      R(x + 2 + i, y + h - 2 - bh, 2, bh, c);
    }
  }
  function box(x, y, w, h) {
    R(x, y, w, h, '#b98650'); R(x, y, w, 1, '#d3a46c'); R(x, y + h - 1, w, 1, '#8e6234'); R(x + (w >> 1) - 1, y, 2, h, '#d9b27a');
  }
  function mapPoster(x, y) {
    R(x, y, 18, 8, '#0b2a44'); R(x, y, 18, 1, '#4a7a9a'); R(x, y + 7, 18, 1, '#4a7a9a');
    R(x + 2, y + 2, 4, 3, '#2f9b62'); R(x + 7, y + 2, 3, 4, '#2f9b62'); R(x + 11, y + 3, 5, 3, '#2f9b62');
    R(x + 5, y + 3, 1, 1, '#ff9b55'); R(x + 12, y + 4, 1, 1, '#ff9b55');
  }
  function shopShelf(x, y, w) {
    R(x, y, w, 12, '#2a3b46'); R(x + 1, y + 1, w - 2, 4, '#14202a'); R(x + 1, y + 6, w - 2, 4, '#14202a');
    var cs = ['#ff6b6b', '#ffd166', '#4ecdc4', '#a78bfa', '#61e8a2'];
    for (var i = 0; i < w - 4; i += 4) { R(x + 2 + i, y + 2, 3, 3, cs[(i / 4 | 0) % 5]); R(x + 2 + i, y + 7, 3, 3, cs[((i / 4 | 0) + 2) % 5]); }
  }
  function shopSign(x, y) {
    R(x, y, 22, 8, '#0c3a2a'); R(x, y, 22, 1, '#3fd18f'); R(x, y + 7, 22, 1, '#3fd18f');
    R(x + 3, y + 3, 4, 3, '#3fd18f'); R(x + 4, y + 2, 2, 1, '#3fd18f'); R(x + 10, y + 3, 9, 1, '#9ff0cb'); R(x + 10, y + 5, 6, 1, '#9ff0cb');
  }
  function chatBoard(x, y, w, t) {
    R(x, y, w, 12, '#0a2418'); R(x, y, w, 1, '#2f6a4a'); R(x, y + 11, w, 1, '#2f6a4a');
    R(x + 2, y + 2, 10, 3, '#25d366'); R(x + w - 14, y + 5, 12, 3, '#dcf8c6');
    var k = ((t * 1.6) | 0) % 3;
    R(x + 2, y + 7, 8, 3, '#25d366');
    for (var i = 0; i < 3; i++) R(x + 4 + i * 2, y + 8, 1, 1, i === k ? '#ffffff' : '#7ed6a0');
  }
  function sofa(x, y, w, c1, c2) {
    R(x, y - 5, w, 6, c2); R(x, y, w, 7, c1); R(x - 2, y - 2, 3, 9, c2); R(x + w - 1, y - 2, 3, 9, c2); R(x, y + 7, w, 1, 'rgba(0,0,0,.3)');
  }
  function cooler(x, y, t) {
    R(x + 1, y, 6, 8, '#9fe3ff'); R(x + 1, y, 6, 1, '#d6f4ff');
    R(x, y + 8, 8, 11, '#d8e3ea'); R(x, y + 8, 8, 1, '#ffffff'); R(x + 3, y + 11, 2, 1, '#2a6cb0');
    R(x + 3, y + 1 + (((t * 5) | 0) % 6), 1, 1, '#ffffff');
  }
  function counter(x, y, w) {
    R(x, y, w, 9, '#4a3a2e'); R(x, y, w, 2, '#6a5646');
    R(x + 3, y - 7, 7, 7, '#303b44'); R(x + 4, y - 6, 5, 3, '#0e161d'); R(x + 5, y - 2, 3, 2, '#e8e8e8');
    R(x + w - 10, y - 3, 5, 3, '#e8dfd0');
  }
  function wallClock(x, y) {
    var d = new Date();
    R(x, y, 9, 9, '#2c485b'); R(x + 1, y + 1, 7, 7, '#e8f4f8');
    var cx = x + 4, cy = y + 4;
    var hm = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * 2 * Math.PI, mm = d.getMinutes() / 60 * 2 * Math.PI;
    line(cx, cy, cx + Math.sin(hm) * 2, cy - Math.cos(hm) * 2, '#16212c');
    line(cx, cy, cx + Math.sin(mm) * 3, cy - Math.cos(mm) * 3, '#c0392b');
  }
  function rug(x, y, w, h, c1, c2) { R(x, y, w, h, c1); R(x + 2, y + 2, w - 4, h - 4, c2); }
  function tv(x, y, w, t) {
    R(x, y, w, 9, '#0c1219'); R(x + 1, y + 1, w - 2, 7, '#0f2d46');
    for (var i = 0; i < w - 6; i += 3) { var bh = 1 + (((Math.sin(t * 1.5 + i) + 1) * 2.5) | 0); R(x + 3 + i, y + 7 - bh, 2, bh, '#5de4ff'); }
  }
  function frame(x, y, w, h) { R(x, y, w, h, '#6b4a2b'); R(x + 1, y + 1, w - 2, h - 2, '#cdd9e0'); R(x + 2, y + 2, w - 4, 1, '#8fa5b3'); R(x + 2, y + 4, w - 6, 1, '#8fa5b3'); }
  function trophy(x, y) { R(x, y, 4, 3, '#e8c25a'); R(x + 1, y + 3, 2, 2, '#e8c25a'); R(x - 1, y + 5, 6, 1, '#b8932f'); }

  /* ---------- rooms ---------- */
  var ROOMS = [
    { id: 'mgr',      label: 'SR. MANAGER', x: 6,   y: 6,  w: 72, h: 58, side: 'b', door: 44,  dw: 14, floor: ['#6a5238', '#735a3f'], color: '#ffd27a', glass: true, agent: null },
    { id: 'core',     label: 'RAFI CORE',   x: 78,  y: 6,  w: 92, h: 58, side: 'b', door: 127, dw: 12, floor: ['#12304a', '#163853'], color: '#5de4ff', agent: 'core' },
    { id: 'lounge',   label: 'LOUNGE',      x: 170, y: 6,  w: 80, h: 58, side: 'b', door: 209, dw: 12, floor: ['#2a2750', '#312e5a'], color: '#9aa8ff', agent: null },
    { id: 'supplier', label: 'SUPPLIER',    x: 6,   y: 80, w: 78, h: 58, side: 't', door: 48,  dw: 12, floor: ['#2b2f3a', '#313644'], color: '#ff9b55', agent: 'supplier' },
    { id: 'shopify',  label: 'SHOPIFY',     x: 84,  y: 80, w: 82, h: 58, side: 't', door: 128, dw: 12, floor: ['#16372f', '#1a4036'], color: '#61e8a2', agent: 'shopify' },
    { id: 'whatsapp', label: 'WHATSAPP',    x: 166, y: 80, w: 84, h: 58, side: 't', door: 211, dw: 12, floor: ['#2b2147', '#31264f'], color: '#d69cff', agent: 'whatsapp' }
  ];

  function floorTiles(r) {
    var x0 = r.x + 2, y0 = r.y + 2, x1 = r.x + r.w - 2, y1 = r.y + r.h - 2;
    for (var y = y0; y < y1; y += 8) for (var x = x0; x < x1; x += 8) {
      g.fillStyle = ((((x - x0) >> 3) + ((y - y0) >> 3)) & 1) ? r.floor[1] : r.floor[0];
      g.fillRect(x, y, Math.min(8, x1 - x), Math.min(8, y1 - y));
    }
  }
  function hwall(x, y, w, gap, glass) {
    var segs = gap ? [[x, gap[0] - x], [gap[1], x + w - gap[1]]] : [[x, w]];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (glass) { R(s[0], y, s[1], 2, 'rgba(140,220,255,.42)'); R(s[0], y + 2, s[1], 1, 'rgba(60,120,150,.5)'); }
      else { R(s[0], y, s[1], 2, WC); R(s[0], y + 2, s[1], 1, WS); }
    }
  }
  function vwall(x, y, h, glass) {
    if (glass) { R(x, y, 2, h, 'rgba(140,220,255,.42)'); for (var k = y + 6; k < y + h; k += 12) R(x, k, 2, 1, '#cfeeff'); }
    else { R(x, y, 2, h, WC); R(x + 1, y, 1, h, WS); }
  }
  function walls(r) {
    var x = r.x, y = r.y, w = r.w, h = r.h, gl = !!r.glass;
    var gap = [r.door - (r.dw >> 1), r.door + (r.dw >> 1)];
    hwall(x, y, w, r.side === 't' ? gap : null, false);
    hwall(x, y + h - 2, w, r.side === 'b' ? gap : null, gl);
    vwall(x, y, h, false);
    vwall(x + w - 2, y, h, gl);
    // door jambs
    var jy = r.side === 't' ? y : y + h - 2;
    R(gap[0] - 1, jy, 1, 3, r.color); R(gap[1], jy, 1, 3, r.color);
  }

  function roomProps(r, t) {
    switch (r.id) {
      case 'mgr':
        rug(12, 44, 28, 14, '#7a2f3a', '#8d3a47');
        bookshelf(12, 9, 28); frame(46, 10, 10, 8); frame(60, 10, 10, 8);
        plant(70, 60); sofa(58, 50, 16, '#3d5a80', '#4a6c97');
        break;
      case 'core':
        wallScreen(84, 9, 42, 8, t, '#5de4ff');
        rack(138, 14, t, 0.5); rack(150, 14, t, 1.4); rack(162, 14, t, 2.3);
        plant(160, 60); rug(84, 44, 28, 14, '#16405f', '#1b4d72');
        break;
      case 'lounge':
        tv(180, 10, 28, t); wallClock(238, 10);
        rug(176, 36, 24, 20, '#3d3a78', '#4a4790');
        sofa(178, 30, 20, '#5a4fb0', '#6f63cc');
        cooler(218, 28, t); counter(230, 22, 16);
        plant(186, 61);
        break;
      case 'supplier':
        mapPoster(12, 83); rug(12, 124, 28, 10, '#3a3547', '#443e55');
        box(62, 104, 10, 8); box(72, 104, 10, 8); box(66, 96, 10, 8); box(62, 116, 12, 9); box(74, 118, 8, 7);
        plant(76, 134);
        break;
      case 'shopify':
        shopSign(90, 83); shopShelf(140, 84, 24); rug(90, 124, 28, 10, '#17433a', '#1e5245');
        box(142, 108, 9, 8); R(154, 106, 7, 10, '#3fd18f'); R(156, 104, 3, 2, '#9ff0cb');
        plant(160, 134);
        break;
      case 'whatsapp':
        chatBoard(172, 84, 26, t); chatBoard(222, 84, 24, t + 1.1);
        rug(172, 124, 28, 10, '#352a57', '#40316b'); plant(242, 134);
        R(224, 110, 3, 6, '#14202a'); R(228, 108, 3, 8, '#14202a');
        break;
    }
  }

  /* ---------- manager logistics ---------- */
  var LOC = {
    seat:     { pts: [[24, 33], [44, 33], [44, 72]], face: 'd' },
    core:     { pts: [[127, 46], [127, 72]], face: 'l' },
    supplier: { pts: [[48, 120], [48, 72]], face: 'l' },
    shopify:  { pts: [[128, 120], [128, 72]], face: 'l' },
    whatsapp: { pts: [[211, 120], [211, 72]], face: 'l' },
    lounge:   { pts: [[209, 52], [209, 72]], face: 'r' }
  };
  function routeBetween(a, b) {
    if (a === b) return [];
    var pa = LOC[a].pts.slice(1), pb = LOC[b].pts.slice().reverse(), out = pa.concat(pb), res = [];
    for (var i = 0; i < out.length; i++) {
      var p = out[i], q = res[res.length - 1];
      if (!q || q[0] !== p[0] || q[1] !== p[1]) res.push(p);
    }
    return res;
  }

  var M = { x: 24, y: 33, dir: 'd', step: 0, stepT: 0, loc: 'seat', dest: 'seat', purpose: 'return', state: 'seated', path: [], timer: 0, idleT: 0, job: null };
  var jobs = [];
  var bubbles = [];
  var workUntil = { core: 0, supplier: 0, shopify: 0, whatsapp: 0 };
  var wasWorking = { core: false, supplier: false, shopify: false, whatsapp: false };
  var jobWork = { core: false, supplier: false, shopify: false, whatsapp: false };
  var SPEED = 58;

  function say(who, text, sub, dur, delay, color) {
    var t = clock();
    bubbles = bubbles.filter(function (b) { return b.who !== who; });
    bubbles.push({ who: who, text: text, sub: sub || '', from: t + (delay || 0), until: t + (delay || 0) + (dur || 2.4), color: color || '#5de4ff' });
  }

  function enqueue(agent, task, kind) {
    if (!AG[agent]) agent = 'core';
    if (jobs.length >= 6) jobs.shift();
    jobs.push({ agent: agent, task: String(task || '').slice(0, 80), kind: kind || 'task' });
  }

  function goTo(dest, purpose) {
    M.dest = dest; M.purpose = purpose;
    M.path = routeBetween(M.loc, dest).map(function (p) { return [p[0], p[1]]; });
    if (!M.path.length) { arrive(); return; }
    M.state = 'walk';
  }
  function startJob(job) {
    M.job = job;
    var a = AG[job.agent];
    say('mgr', job.kind === 'order' ? 'NEW ORDER!' : 'NEW TASK!', '', 1.6, 0, '#ffd27a');
    goTo(job.agent, 'job');
  }
  function arrive() {
    M.loc = M.dest; M.step = 0;
    if (M.purpose === 'job') {
      var job = M.job, a = AG[job.agent], t = clock();
      M.state = 'brief'; M.timer = 3.6; M.dir = LOC[M.dest].face;
      say('mgr', (job.kind === 'order' ? 'ORDER ▸ ' : 'TASK ▸ ') + a.name, job.task, 2.6, 0, '#ffd27a');
      say(job.agent, 'ON IT!', '', 2.0, 1.4, a.color);
      workUntil[job.agent] = t + 10; jobWork[job.agent] = true;
    } else if (M.purpose === 'patrol') {
      M.state = 'break'; M.timer = 3.2; M.dir = LOC[M.dest].face;
      say('mgr', 'COFFEE BREAK', '', 2.2, 0.3, '#9aa8ff');
    } else {
      M.state = 'seated'; M.x = LOC.seat.pts[0][0]; M.y = LOC.seat.pts[0][1]; M.dir = 'd'; M.idleT = 0; M.job = null;
    }
  }
  function nextAfterStop() {
    if (jobs.length) startJob(jobs.shift());
    else goTo('seat', 'return');
  }

  function update(dt) {
    var t = clock();
    if (M.state === 'seated') {
      M.idleT += dt;
      if (jobs.length) startJob(jobs.shift());
      else if (M.idleT > 26) { M.idleT = 0; goTo('lounge', 'patrol'); }
    } else if (M.state === 'walk') {
      var tg = M.path[0];
      if (!tg) { arrive(); }
      else {
        var dx = tg[0] - M.x, dy = tg[1] - M.y, dist = Math.sqrt(dx * dx + dy * dy), mv = SPEED * dt;
        if (Math.abs(dx) > Math.abs(dy)) M.dir = dx > 0 ? 'r' : 'l'; else if (dist > 0.01) M.dir = dy > 0 ? 'd' : 'u';
        M.stepT += dt; M.step = 1 + (((M.stepT * 7) | 0) % 2);
        if (mv >= dist) { M.x = tg[0]; M.y = tg[1]; M.path.shift(); if (!M.path.length) arrive(); }
        else { M.x += dx / dist * mv; M.y += dy / dist * mv; }
      }
    } else if (M.state === 'brief') {
      M.timer -= dt; if (M.timer <= 0) nextAfterStop();
    } else if (M.state === 'break') {
      M.timer -= dt; if (M.timer <= 0) nextAfterStop();
    }
    // agent "done" bubbles
    ORDER.forEach(function (id) {
      var w = isWorking(id, t);
      if (wasWorking[id] && !w && jobWork[id]) { say(id, 'DONE ✓', '', 1.8, 0, '#4dffb3'); jobWork[id] = false; }
      wasWorking[id] = w;
    });
  }
  function isWorking(id, t) {
    t = t || clock();
    return workUntil[id] > t || (typeof agentWorking !== 'undefined' && agentWorking && !!agentWorking[id]);
  }

  /* ---------- scene render ---------- */
  function drawScene(t) {
    R(0, 0, LW, LH, '#040b14');
    R(6, 6, 244, 132, '#1b3850');
    // corridor checker
    for (var cy = 64; cy < 80; cy += 8) for (var cxx = 6; cxx < 250; cxx += 8) {
      g.fillStyle = (((cxx - 6) >> 3) + ((cy - 64) >> 3)) & 1 ? '#20425d' : '#1c3a52';
      g.fillRect(cxx, cy, 8, 8);
    }
    R(6, 71, 244, 1, 'rgba(93,228,255,.10)');
    plant(12, 78); plant(244, 78);

    ROOMS.forEach(function (r) { floorTiles(r); });
    ROOMS.forEach(function (r) { walls(r); });
    ROOMS.forEach(function (r) { roomProps(r, t); });

    // manager cabin: desk, chair, manager
    var md = MGR_DESK;
    if (M.state === 'seated') seated(md.cx, md.dy, LOOK.mgr, t, M.job != null || jobs.length > 0, 0.9);
    else emptyChair(md.cx, md.dy);
    desk(md.cx, md.dy, '#ffd27a', M.state === 'seated', t, true);
    trophy(md.cx + 9, md.dy + 1);

    // agents
    ORDER.forEach(function (id) {
      var s = SEAT[id], w = isWorking(id, t);
      seated(s.cx, s.dy, LOOK[id], t, w, AG[id].seed);
      desk(s.cx, s.dy, AG[id].color, w, t, false);
    });

    // standing / walking manager on top
    if (M.state !== 'seated') person(M.x, M.y, M.dir, M.state === 'walk' ? M.step : 0, LOOK.mgr);
  }

  /* ---------- overlay (crisp text at full resolution) ---------- */
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function drawBubble(ax, ay, b) {
    var px = ax * SC, py = ay * SC;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 15px "Chakra Petch",system-ui,sans-serif';
    var w = ctx.measureText(b.text).width, h = 28, sub = b.sub;
    if (sub) {
      if (sub.length > 26) sub = sub.slice(0, 25) + '…';
      ctx.font = '500 15px "Noto Naskh Arabic","Chakra Petch",system-ui,sans-serif';
      w = Math.max(w, ctx.measureText(sub).width); h = 48;
    }
    w += 22;
    var bx = Math.max(4, Math.min(cv.width - w - 4, px - w / 2)), by = Math.max(4, py - h - 12);
    rrect(bx, by, w, h, 8); ctx.fillStyle = 'rgba(4,14,26,.94)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = b.color; ctx.stroke();
    var tx = Math.max(bx + 8, Math.min(bx + w - 8, px));
    ctx.beginPath(); ctx.moveTo(tx - 6, by + h); ctx.lineTo(tx, by + h + 8); ctx.lineTo(tx + 6, by + h); ctx.closePath();
    ctx.fillStyle = 'rgba(4,14,26,.94)'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = b.color; ctx.font = '700 15px "Chakra Petch",system-ui,sans-serif';
    ctx.fillText(b.text, bx + w / 2, by + (sub ? 15 : h / 2 + 1));
    if (sub) { ctx.fillStyle = '#e8f7ff'; ctx.font = '500 15px "Noto Naskh Arabic","Chakra Petch",system-ui,sans-serif'; ctx.fillText(sub, bx + w / 2, by + 34); }
    ctx.restore();
  }
  function headAnchor(who) {
    if (who === 'mgr') {
      return M.state === 'seated' ? [MGR_DESK.cx, MGR_DESK.dy - 19] : [M.x, M.y - 16];
    }
    var s = SEAT[who]; return [s.cx, s.dy - 19];
  }
  function mgrStatus() {
    if (M.state === 'seated') return jobs.length ? 'SR. MANAGER · READING ORDERS' : 'SR. MANAGER · AT DESK';
    if (M.state === 'walk') return M.purpose === 'job' ? 'SR. MANAGER → ' + AG[M.dest].name : M.purpose === 'patrol' ? 'SR. MANAGER · WALKING' : 'SR. MANAGER · BACK TO DESK';
    if (M.state === 'brief') return 'BRIEFING ' + AG[M.dest].name;
    return 'SR. MANAGER · COFFEE BREAK';
  }
  function drawOverlay(t) {
    ctx.save();
    ctx.textBaseline = 'middle';
    // room labels
    ROOMS.forEach(function (r) {
      var lx = (r.x + 5) * SC, ly = (r.y + r.h - 7) * SC;
      ctx.font = '700 13px "Chakra Petch",system-ui,sans-serif';
      var tw = ctx.measureText(r.label).width;
      rrect(lx - 6, ly - 12, tw + 30, 24, 6); ctx.fillStyle = 'rgba(2,10,20,.78)'; ctx.fill();
      var working = r.agent ? isWorking(r.agent, t) : (r.id === 'mgr' ? M.state !== 'seated' : false);
      ctx.beginPath(); ctx.arc(lx + 4, ly, 4, 0, 6.283); ctx.fillStyle = working ? '#ff914d' : '#4dffb3'; ctx.fill();
      ctx.fillStyle = r.color; ctx.textAlign = 'left'; ctx.fillText(r.label, lx + 14, ly + 1);
    });
    // bubbles
    bubbles = bubbles.filter(function (b) { return b.until > t; });
    bubbles.forEach(function (b) {
      if (b.from > t) return;
      var a = headAnchor(b.who); drawBubble(a[0], a[1], b);
    });
    // status strip
    ctx.font = '600 13px "Chakra Petch",system-ui,sans-serif';
    ctx.textAlign = 'left'; ctx.fillStyle = '#8fb8cc';
    ctx.fillText(mgrStatus() + (jobs.length ? '  ·  QUEUE ' + jobs.length : ''), 8 * SC, (LH - 3) * SC);
    var act = ORDER.filter(function (id) { return isWorking(id, t); }).length;
    ctx.textAlign = 'right'; ctx.fillStyle = act ? '#ff914d' : '#4dffb3';
    ctx.fillText('AGENTS ACTIVE ' + act + '/4', (LW - 8) * SC, (LH - 3) * SC);
    ctx.restore();
  }

  function draw() {
    var t = clock();
    drawScene(t);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(sc, 0, 0, cv.width, cv.height);
    drawOverlay(t);
  }

  /* ---------- hooks into the existing app ---------- */
  window.drawOffice = function () {};
  window.triggerAgentMove = function (agentId, task) {
    enqueue(agentId, task, 'task');
    if (task && typeof addMsg === 'function') {
      try { addMsg('🤖 ' + (AG[agentId] ? AG[agentId].name : agentId) + ' کو task ملا: ' + task); } catch (e) {}
    }
  };
  if (typeof window.sendMessage === 'function') {
    var _sm = window.sendMessage, lastOrder = 0;
    window.sendMessage = function (textOverride) {
      try {
        var inp = document.getElementById('messageInput');
        var m = String(textOverride !== undefined && textOverride !== null ? textOverride : (inp ? inp.value : '')).trim();
        var isBusy = (typeof busy !== 'undefined') && busy;
        if (m && !isBusy && Date.now() - lastOrder > 1500) { lastOrder = Date.now(); enqueue('core', m, 'order'); }
      } catch (e) {}
      return _sm.apply(this, arguments);
    };
  }
  window.RafiOffice = {
    order: function (text) { enqueue('core', text, 'order'); },
    task: function (agent, text) { enqueue(agent, text, 'task'); },
    say: function (who, text, sub, dur) { if (AG[who] || who === 'mgr') say(who, text, sub, dur || 3, 0, who === 'mgr' ? '#ffd27a' : AG[who].color); },
    state: M
  };

  var last = 0;
  function loop(ts) {
    var dt = last ? Math.min(0.06, (ts - last) / 1000) : 0.016;
    last = ts;
    try { update(dt); draw(); } catch (e) { if (!loop.err) { loop.err = 1; if (window.console) console.warn('office', e); } }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
