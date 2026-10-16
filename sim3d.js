/* farmily-daily : 우리 하우스 시뮬레이션 3D 화면 (three.js r128)
   sim.js 가 프레임마다 FSIM3D.draw(f, ctx) 를 부릅니다. WebGL 이 안 되면 기존 단면 그림을 씁니다.
   실제 하우스처럼: 아치 파이프·도리·물받이·기초, 측창 감기 축과 개폐기, 방충망, 출입문과 FARMILY 간판(밤에 불 켜짐), 온풍기·비닐 덕트·연통, 유동팬,
   두둑·멀칭·점적, 유인줄로 키우는 토마토(잎·화방·열매), 주변 농로·배수로·이웃 하우스·관리사·전봇대·먼 산,
   시간대별 하늘색·햇빛 색·안개·서리·눈·비 젖음까지 그립니다. */
(function (root) {
  var T = root.THREE, D2R = Math.PI / 180;
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var ok = false;
  if (T) { try { var tc = document.createElement('canvas'); ok = !!(root.WebGLRenderingContext && (tc.getContext('webgl') || tc.getContext('experimental-webgl'))); } catch (e) { ok = false; } }
  var mode = ls('farmily.sim.view') === '2d' ? '2d' : '3d';
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var DIR16 = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
  var DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  function dir16(v) { return v == null ? '' : DIR16[Math.round(((v % 360) + 360) % 360 / 22.5) % 16]; }
  function dir8(v) { return v == null ? '' : DIR8[Math.round(((v % 360) + 360) % 360 / 45) % 8]; }
  function f1(x) { return x == null || isNaN(x) ? '-' : (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function lerp(a, b, f) { return a + (b - a) * f; }
  function tlabel(ms) { var d = new Date(ms + 9 * 3600000); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '(' + DOW[d.getUTCDay()] + ') ' + d.getUTCHours() + ':' + ('0' + d.getUTCMinutes()).slice(-2); }
  function tempColor(t) {
    var st = [[5, [59, 130, 246]], [12, [96, 165, 250]], [18, [74, 222, 128]], [25, [163, 230, 53]], [30, [251, 146, 60]], [35, [239, 68, 68]]];
    if (t <= st[0][0]) return st[0][1];
    for (var i = 1; i < st.length; i++) if (t <= st[i][0]) { var a = st[i - 1], b = st[i], f = (t - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(function (k) { return a[1][k] + (b[1][k] - a[1][k]) * f; }); }
    return st[st.length - 1][1];
  }
  // 해·달 위치 (저정밀 천문 계산, 오차 1~2°) — 3D 하늘 표시용
  function COORD() { var r = document.getElementById('r_sigun'), c = root.FSIM_COORDS && r && root.FSIM_COORDS[r.value]; return c || [36.5, 127.5]; }
  function eqToHor(lat, lon, ra, dec, ms) {
    var n = ms / 86400000 + 2440587.5 - 2451545.0, gmst = (18.697374558 + 24.06570982441908 * n) % 24;
    var ha = (gmst * 15 + lon) * D2R - ra, la = lat * D2R;
    var el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
    var az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
    return { el: el / D2R, az: (az / D2R + 360) % 360 };
  }
  function moonPos(lat, lon, ms) {
    var d = ms / 86400000 + 2440587.5 - 2451543.5;
    var N = (125.1228 - 0.0529538083 * d) * D2R, inc = 5.1454 * D2R, w = (318.0634 + 0.1643573223 * d) * D2R, e = 0.0549;
    var M = ((115.3654 + 13.0649929509 * d) % 360) * D2R, E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    for (var k = 0; k < 4; k++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    var xv = Math.cos(E) - e, yv = Math.sqrt(1 - e * e) * Math.sin(E), v = Math.atan2(yv, xv);
    var xh = Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(inc);
    var yh = Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(inc);
    var zh = Math.sin(v + w) * Math.sin(inc);
    var lonE = Math.atan2(yh, xh), latE = Math.atan2(zh, Math.sqrt(xh * xh + yh * yh)), ep = 23.4393 * D2R;
    var xe = Math.cos(latE) * Math.cos(lonE), ye = Math.cos(latE) * Math.sin(lonE) * Math.cos(ep) - Math.sin(latE) * Math.sin(ep), ze = Math.cos(latE) * Math.sin(lonE) * Math.sin(ep) + Math.sin(latE) * Math.cos(ep);
    var p = eqToHor(lat, lon, Math.atan2(ye, xe), Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)), ms);
    var n2 = ms / 86400000 + 2440587.5 - 2451545.0, gS = ((357.528 + 0.9856003 * n2) % 360) * D2R;
    var sunLon = (280.46 + 0.9856474 * n2 + 1.915 * Math.sin(gS) + 0.02 * Math.sin(2 * gS)) % 360;
    var elong = (((lonE / D2R) - sunLon) % 360 + 360) % 360;
    p.illum = (1 - Math.cos(elong * D2R)) / 2; p.waxing = elong < 180;
    p.name = elong < 20 || elong > 340 ? '그믐·삭' : elong < 70 ? '초승달' : elong < 110 ? '상현달' : elong < 165 ? '보름 전' : elong < 195 ? '보름달' : elong < 250 ? '보름 뒤' : elong < 290 ? '하현달' : '그믐달';
    return p;
  }
  function moonTexture(illum, waxing) {
    var c = document.createElement('canvas'); c.width = c.height = 128; var x = c.getContext('2d');
    x.fillStyle = 'rgba(70,80,110,0.55)'; x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fill();
    var k = 1 - 2 * illum, right = waxing;
    x.fillStyle = '#f8f5e6'; x.beginPath();
    x.ellipse(64, 64, 58, 58, 0, -Math.PI / 2, Math.PI / 2, !right);
    x.ellipse(64, 64, Math.max(0.5, Math.abs(k) * 58), 58, 0, Math.PI / 2, -Math.PI / 2, right ? k > 0 : k < 0);
    x.fill();
    // 바다(어두운 무늬)
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(150,150,140,0.35)';
    [[48, 50, 14], [74, 44, 10], [70, 76, 16], [44, 82, 9]].forEach(function (m) { x.beginPath(); x.arc(m[0], m[1], m[2], 0, Math.PI * 2); x.fill(); });
    return new T.CanvasTexture(c);
  }

  // ---------- 재질 그림(캔버스 텍스처) — 한 번만 만들어 돌려 씀 ----------
  function rng(seed) { var s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  function ctex(size, tileM, fn, alpha) {
    var c = document.createElement('canvas'); c.width = c.height = size; var x = c.getContext('2d'); fn(x, size);
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / tileM, 1 / tileM); t.anisotropy = 4;
    if (alpha) t.premultiplyAlpha = false;
    return t;
  }
  function speckle(x, s, base, cols, n, rmin, rmax, seed) {
    var r = rng(seed); x.fillStyle = base; x.fillRect(0, 0, s, s);
    for (var i = 0; i < n; i++) { x.fillStyle = cols[Math.floor(r() * cols.length)]; var rr = rmin + r() * (rmax - rmin), px = r() * s, py = r() * s; x.globalAlpha = 0.35 + r() * 0.5; x.beginPath(); x.ellipse(px, py, rr, rr * (0.5 + r()), r() * 3, 0, Math.PI * 2); x.fill(); }
    x.globalAlpha = 1;
  }
  function makeTextures() {
    var X = {};
    X.grass = ctex(256, 5, function (x, s) {
      speckle(x, s, '#6c7f44', ['#5b6d38', '#78894c', '#86935a', '#55663a', '#93955e', '#6a7a40', '#8a8253'], 3000, 1, 3.5, 11);
      var r = rng(5); x.strokeStyle = 'rgba(60,85,30,.5)'; x.lineWidth = 1;
      for (var i = 0; i < 700; i++) { var px = r() * s, py = r() * s; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3, py - 3 - r() * 4); x.stroke(); }
    });
    X.soil = ctex(256, 2, function (x, s) { speckle(x, s, '#6b5440', ['#5a4533', '#7a614a', '#4d3b2c', '#836a52', '#62503d'], 3200, 0.8, 3, 23); });
    X.gravel = ctex(256, 2.5, function (x, s) { speckle(x, s, '#8b857a', ['#a09a8f', '#6f6a62', '#b4aea2', '#7d776d', '#5f5a53'], 4200, 1, 3.2, 37); });
    X.road = ctex(256, 4, function (x, s) { speckle(x, s, '#5b5c5e', ['#4c4d4f', '#6a6b6d', '#55565a', '#737476'], 3000, 0.6, 2, 41); });
    X.concrete = ctex(128, 1.5, function (x, s) { speckle(x, s, '#b9b6ae', ['#a9a69e', '#c6c3bb', '#9f9c95'], 900, 0.6, 2, 53); });
    X.mulch = ctex(128, 1, function (x, s) {
      x.fillStyle = '#17191c'; x.fillRect(0, 0, s, s);
      var r = rng(61); for (var i = 0; i < 26; i++) { var y = r() * s; x.strokeStyle = 'rgba(255,255,255,' + (0.04 + r() * 0.07) + ')'; x.lineWidth = 1 + r() * 2; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 12, s * 0.7, y + (r() - 0.5) * 12, s, y); x.stroke(); }
    });
    // 비닐 필름: 거의 투명 + 옅은 주름 줄
    X.film = ctex(256, 3, function (x, s) {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s);
      var r = rng(71); for (var i = 0; i < 60; i++) { var px = r() * s; x.strokeStyle = 'rgba(170,190,210,' + (0.08 + r() * 0.16) + ')'; x.lineWidth = 0.6 + r() * 2.2; x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + (r() - 0.5) * 20, s * 0.33, px + (r() - 0.5) * 20, s * 0.66, px + (r() - 0.5) * 8, s); x.stroke(); }
    });
    // 결로(물방울 맺힌 필름)
    X.drops = ctex(256, 1.2, function (x, s) {
      x.fillStyle = '#e8eef4'; x.fillRect(0, 0, s, s);
      var r = rng(83); for (var i = 0; i < 900; i++) { var rr = 1 + r() * 4, px = r() * s, py = r() * s; var g = x.createRadialGradient(px - rr * 0.3, py - rr * 0.3, 0, px, py, rr); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.7, 'rgba(200,215,230,.6)'); g.addColorStop(1, 'rgba(150,170,190,.2)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, Math.PI * 2); x.fill(); }
    });
    // 방충망(가는 격자) · 차광망(촘촘한 검은 망)
    X.net = ctex(64, 0.12, function (x, s) { x.clearRect(0, 0, s, s); x.strokeStyle = 'rgba(40,50,60,.85)'; x.lineWidth = 1; for (var i = 0; i <= s; i += 4) { x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, s); x.stroke(); x.beginPath(); x.moveTo(0, i + 0.5); x.lineTo(s, i + 0.5); x.stroke(); } }, true);
    X.shade = ctex(64, 0.25, function (x, s) { x.fillStyle = 'rgba(10,12,14,.72)'; x.fillRect(0, 0, s, s); x.fillStyle = 'rgba(0,0,0,.95)'; for (var i = 0; i < s; i += 4) { x.fillRect(i, 0, 2, s); } for (i = 0; i < s; i += 8) x.fillRect(0, i, s, 1.5); }, true);
    // 보온커튼: 누빔 다겹 / 홑겹 부직포
    X.quilt = ctex(128, 1.2, function (x, s) {
      x.fillStyle = '#ece6d6'; x.fillRect(0, 0, s, s);
      x.strokeStyle = 'rgba(150,135,105,.55)'; x.lineWidth = 2; for (var i = 0; i <= s; i += 32) { x.beginPath(); x.moveTo(0, i); x.lineTo(s, i); x.stroke(); }
      x.strokeStyle = 'rgba(150,135,105,.25)'; x.lineWidth = 1; for (i = 16; i <= s; i += 32) { x.setLineDash([3, 3]); x.beginPath(); x.moveTo(0, i); x.lineTo(s, i); x.stroke(); } x.setLineDash([]);
    });
    X.fleece = ctex(128, 1, function (x, s) { speckle(x, s, '#f1efe8', ['#e4e1d8', '#f8f7f2', '#dedbd2'], 1500, 0.6, 2.4, 97); });
    X.leaf = ctex(64, 1, function (x, s) { var g = x.createLinearGradient(0, 0, s, 0); g.addColorStop(0, '#7fae4f'); g.addColorStop(0.5, '#a8cf74'); g.addColorStop(1, '#7fae4f'); x.fillStyle = g; x.fillRect(0, 0, s, s); x.strokeStyle = 'rgba(60,100,40,.45)'; x.lineWidth = 1; for (var i = 6; i < s; i += 10) { x.beginPath(); x.moveTo(s / 2, i); x.lineTo(0, i - 8); x.moveTo(s / 2, i); x.lineTo(s, i - 8); x.stroke(); } x.fillStyle = 'rgba(220,240,190,.7)'; x.fillRect(s / 2 - 1, 0, 2, s); });
    X.leaf.repeat.set(1, 1);
    X.puff = ctex(64, 1, function (x, s) { var g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); }, true);
    X.puff.repeat.set(1, 1);
    X.snowG = ctex(256, 4, function (x, s) { speckle(x, s, '#eef2f6', ['#ffffff', '#dfe6ee', '#e8edf3', '#f8fafc'], 1800, 1, 4, 13); });
    X.frostG = ctex(256, 5, function (x, s) { speckle(x, s, '#a7b3a0', ['#c8d2cf', '#8e9c86', '#e2e9ec', '#9faa98', '#b9c4bd'], 3000, 1, 3.5, 11); });
    return X;
  }
  // 평면 UV 를 m 단위로 바꿈 (텍스처 반복을 실제 크기에 맞추려고)
  function uvM(geo, sx, sy) { var uv = geo.attributes.uv; if (!uv) return geo; for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); uv.needsUpdate = true; return geo; }
  // 여러 도형을 하나로 합침 (인덱스 없는 위치·법선만)
  function merge(list) {
    var P = [], N = [];
    list.forEach(function (g) { var a = g.index ? g.toNonIndexed() : g; a.computeVertexNormals(); var p = a.attributes.position.array, n = a.attributes.normal.array; for (var i = 0; i < p.length; i++) { P.push(p[i]); N.push(n[i]); } });
    var m = new T.BufferGeometry(); m.setAttribute('position', new T.Float32BufferAttribute(P, 3)); m.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); return m;
  }
  // 토마토 겹잎 (잎자루 +x 방향, 길이 약 0.45m, 끝으로 갈수록 처짐)
  function leafGeometry() {
    var pos = [], uv = [], idx = [];
    function droop(d) { return -0.55 * d * d - 0.05 * d; }
    function leaflet(bx, bz, ang, len, wid) {
      var base = pos.length / 3, S = 3, ca = Math.cos(ang), sa = Math.sin(ang);
      for (var k = 0; k <= S; k++) {
        var s = k / S, w = wid * Math.sin(Math.PI * Math.min(1, s * 1.05)) * (s < 0.15 ? s / 0.15 * 0.6 + 0.4 : 1) * 0.5, ax = bx + ca * s * len, az = bz + sa * s * len;
        [-1, 1].forEach(function (sd) { var px = ax - sa * w * sd, pz = az + ca * w * sd, d = Math.hypot(px, pz); pos.push(px, droop(d) + (sd ? 0.012 * Math.abs(w) / wid : 0), pz); uv.push(sd < 0 ? 0 : 1, s); });
      }
      for (k = 0; k < S; k++) { var a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    // 잎자루 (가는 띠)
    var b0 = pos.length / 3; for (var k = 0; k <= 3; k++) { var x = 0.42 * k / 3; pos.push(x, droop(x) + 0.004, -0.006, x, droop(x) + 0.004, 0.006); uv.push(0.5, 0, 0.5, 0); }
    for (k = 0; k < 3; k++) { var a = b0 + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    [[0.1, 0.11, 0.05], [0.2, 0.13, 0.06], [0.3, 0.12, 0.055]].forEach(function (q) { leaflet(q[0], -0.004, -1.05, q[1], q[2]); leaflet(q[0], 0.004, 1.05, q[1], q[2]); });
    leaflet(0.38, 0, 0, 0.14, 0.07);
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // 화방(열매 송이): 줄기에서 바깥(+x)으로 늘어진 꽃대에 열매가 달림
  function trussGeometry(nf, r) {
    var parts = [], rr = new T.Matrix4();
    for (var i = 0; i < nf; i++) {
      var s = new T.IcosahedronGeometry(r * (1 - i * 0.04), 0), t = i / Math.max(1, nf - 1);
      s.scale(1, 0.86, 1);
      rr.makeTranslation(0.05 + t * r * nf * 0.9, -0.02 - t * r * 1.2 - (i % 2) * r * 0.6, (i % 2 ? 1 : -1) * r * 0.8); s.applyMatrix4(rr); parts.push(s);
    }
    var stem = new T.CylinderGeometry(0.004, 0.004, 0.06 + r * nf, 4); stem.rotateZ(Math.PI / 2 - 0.4); stem.translate(0.04 + r * nf * 0.35, 0.0, 0); parts.push(stem);
    return merge(parts);
  }
  function flowerGeometry() {
    var parts = [];
    for (var i = 0; i < 4; i++) { var c = new T.ConeGeometry(0.012, 0.016, 4); c.rotateZ(Math.PI); c.translate(0.04 + i * 0.016, -0.015 - (i % 2) * 0.012, (i % 2 ? 1 : -1) * 0.01); parts.push(c); }
    return merge(parts);
  }

  // ---------- 하늘색 (해 고도·흐림에 따라) ----------
  var SKYK = [  // [고도, 위 하늘, 지평선, 햇빛 색]
    [-18, 0x040814, 0x0d1428, 0x000000], [-10, 0x081129, 0x1a2342, 0x000000], [-5, 0x1c2a58, 0x5a4a6e, 0xff7a4a],
    [-1, 0x3a4f86, 0xe38a5a, 0xff8a4a], [3, 0x4f73b0, 0xf4b072, 0xffa860], [8, 0x4c86c8, 0xf0d2a6, 0xffd2a0],
    [18, 0x3f8ad4, 0xcfe4f2, 0xfff1dc], [40, 0x2f7fd0, 0xbcdcf2, 0xffffff], [90, 0x2a76c8, 0xb4d6f0, 0xffffff]];
  var _c1 = new T.Color(), _c2 = new T.Color();
  function mixHex(a, b, f) { return _c1.setHex(a).lerp(_c2.setHex(b), f).getHex(); }
  function skyCols(el, over, pty) {
    var k = SKYK, i = 0; while (i < k.length - 2 && el > k[i + 1][0]) i++;
    var a = k[i], b = k[i + 1], f = clamp((el - a[0]) / (b[0] - a[0]), 0, 1);
    var top = mixHex(a[1], b[1], f), hor = mixHex(a[2], b[2], f), sun = mixHex(a[3], b[3], f);
    if (over) {  // 흐림·비·눈: 회색으로, 비는 더 어둡게
      var day = clamp((el + 4) / 14, 0, 1), g1 = pty > 0 && pty !== 3 ? 0x7d8792 : pty === 3 ? 0xc3c9d0 : 0x9aa4ae, g2 = pty > 0 && pty !== 3 ? 0xa3abb3 : pty === 3 ? 0xdde1e6 : 0xc6ccd2;
      var n1 = 0x141a26, n2 = 0x252c3a;
      top = mixHex(top, mixHex(n1, g1, day), 0.85); hor = mixHex(hor, mixHex(n2, g2, day), 0.85);
    }
    return { top: top, hor: hor, sun: sun };
  }

  var G = null;

  // ---------- 화면 준비 ----------
  // 간판 그림: 흰 판 위에 FARMILY 로고 (로고 파일을 불러오면 다시 그림)
  var LOGO = null, signTexs = [];
  function paintSign(cv) {
    var x = cv.getContext('2d'), w = cv.width, h = cv.height;
    var g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#eef1f4');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    if (LOGO && LOGO.complete && LOGO.naturalWidth) { var lw = w * 0.86, lh = lw * LOGO.naturalHeight / LOGO.naturalWidth; x.drawImage(LOGO, (w - lw) / 2, (h - lh) / 2, lw, lh); }
    else { x.fillStyle = '#292929'; x.font = 'bold ' + Math.round(h * 0.55) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('FARMILY', w / 2, h / 2); }
  }
  function signTexture() {
    var cv = document.createElement('canvas'); cv.width = 1280; cv.height = 256; paintSign(cv);
    var tx = new T.CanvasTexture(cv); tx.anisotropy = 4; signTexs.push(tx);
    if (!LOGO) {
      LOGO = new Image();
      LOGO.onload = function () { signTexs.forEach(function (t) { paintSign(t.image); t.needsUpdate = true; }); };
      LOGO.src = '/farmily-daily/farmily-logo.svg';
    }
    if (signTexs.length > 4) signTexs.shift();
    return tx;
  }
  function setup() {
    var wrap = document.getElementById('stagewrap');
    var css = document.createElement('style');
    css.textContent = '#ov3d .lb{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font-size:13px;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(15,23,42,.72);color:#fff}'
      + '#ov3d .lb.in{background:rgba(255,255,255,.92);color:#1e293b;font-size:15px;padding:4px 10px;line-height:1.35;text-align:center}'
      + '#ov3d .lb.cp{background:rgba(15,23,42,.45);font-size:12px}'
      + '#ov3d .hud{position:absolute;left:10px;top:10px;background:rgba(15,23,42,.6);color:#fff;border-radius:10px;padding:6px 10px;font-size:13px;line-height:1.55}'
      + '#ov3d .bt{position:absolute;right:8px;top:8px;display:flex;gap:4px;pointer-events:auto}'
      + '#ov3d .bt button{font:inherit;font-size:13px;min-width:34px;height:32px;border:0;border-radius:8px;background:rgba(255,255,255,.88);color:#12341f;cursor:pointer;padding:0 8px}'
      + '#ov3d .hint{position:absolute;left:10px;bottom:8px;font-size:12px;color:#fff;text-shadow:0 1px 2px #000;opacity:.85}'
      + '@media (max-width:600px){#ov3d .hud{display:none}#ov3d .lb{font-size:11px}#ov3d .lb.in{font-size:13px}}';
    document.head.appendChild(css);
    var r = new T.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    var cv = r.domElement; cv.id = 'stage3d'; cv.style.cssText = 'display:none;width:100%;touch-action:pan-y;cursor:grab';
    wrap.appendChild(cv);
    var ov = document.createElement('div'); ov.id = 'ov3d';
    ov.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;display:none;overflow:hidden';
    ov.innerHTML = '<div class="hud" id="o3hud"></div><div class="bt"><button type="button" id="o3l" aria-label="왼쪽으로 돌리기">↺</button><button type="button" id="o3r" aria-label="오른쪽으로 돌리기">↻</button>'
      + '<button type="button" id="o3i" aria-label="확대">＋</button><button type="button" id="o3o" aria-label="축소">－</button><button type="button" id="o3p">시점</button><button type="button" id="o3b" title="밤에도 구조물이 잘 보이게 조명을 밝힘">💡 밝게</button></div>'
      + '<div class="hint">끌어서 돌려 보기 · ＋/－ 확대 · 시점 바꾸기</div>';
    wrap.appendChild(ov);
    var X = makeTextures();
    var scene = new T.Scene();
    scene.fog = new T.Fog(0xbcdcf2, 260, 1500);
    var cam = new T.PerspectiveCamera(50, 16 / 9, 0.1, 4000);
    var hemi = new T.HemisphereLight(0xeaf4ff, 0x5a5030, 0.6); scene.add(hemi);
    var sun = new T.DirectionalLight(0xffffff, 1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    var moon = new T.DirectionalLight(0xb9c6f0, 0); moon.position.set(-60, 90, 50); scene.add(moon);
    // 하늘 돔: 위→지평선 색 + 해 쪽 노을빛
    var skyMat = new T.ShaderMaterial({
      uniforms: { top: { value: new T.Color(0x2f7fd0) }, hor: { value: new T.Color(0xbcdcf2) }, sunC: { value: new T.Color(0xffffff) }, sunD: { value: new T.Vector3(0, 1, 0) }, glow: { value: 0.5 }, gnd: { value: new T.Color(0x4a5a3a) } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunC; uniform vec3 sunD; uniform float glow; uniform vec3 gnd; varying vec3 vD;'
        + 'void main(){ vec3 d = normalize(vD); float h = d.y; vec3 c = mix(hor, top, pow(clamp(h,0.0,1.0), 0.45));'
        + 'float s = max(dot(d, normalize(sunD)), 0.0); float band = exp(-abs(h)*5.0);'
        + 'c += sunC * (pow(s, 6.0) * 0.35 * glow + pow(s, 60.0) * 0.5 * glow) * (0.4 + 0.6*band);'
        + 'if (h < 0.0) c = mix(c, gnd, clamp(-h*6.0, 0.0, 1.0));'
        + 'gl_FragColor = vec4(c, 1.0); }',
      side: T.BackSide, depthWrite: false, fog: false });
    var skyDome = new T.Mesh(new T.SphereGeometry(1800, 32, 16), skyMat); skyDome.renderOrder = -10; skyDome.frustumCulled = false; scene.add(skyDome);
    var gGeo = uvM(new T.PlaneGeometry(3000, 3000), 3000, 3000);
    var groundMat = new T.MeshLambertMaterial({ color: 0xffffff, map: X.grass });
    var ground = new T.Mesh(gGeo, groundMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    // 먼 산 (안개에 묻혀 흐릿하게)
    var mt = new T.Group(), mr = rng(7), mtMat = new T.MeshLambertMaterial({ color: 0x3d5a3a, flatShading: true });
    for (var mi = 0; mi < 30; mi++) {
      var ma = mi / 26 * Math.PI * 2 + mr() * 0.2, md = 1150 + mr() * 400, mh = 28 + mr() * 70, mw = 220 + mr() * 300;
      var cone = new T.Mesh(new T.ConeGeometry(mw, mh, 7, 2), mtMat); cone.position.set(Math.cos(ma) * md, mh / 2 - 6, Math.sin(ma) * md); cone.rotation.y = mr() * 3; cone.scale.z = 0.6 + mr() * 0.5;
      var pa = cone.geometry.attributes.position; for (var vi = 0; vi < pa.count; vi++) if (pa.getY(vi) < mh / 2 - 1) pa.setXYZ(vi, pa.getX(vi) * (0.85 + mr() * 0.3), pa.getY(vi) + (mr() - 0.5) * mh * 0.12, pa.getZ(vi) * (0.85 + mr() * 0.3));
      cone.geometry.computeVertexNormals(); mt.add(cone);
    }
    scene.add(mt);
    var sunBall = new T.Mesh(new T.SphereGeometry(5, 24, 16), new T.MeshBasicMaterial({ color: 0xffd54a, fog: false }));
    var sunHalo = new T.Mesh(new T.SphereGeometry(9, 24, 16), new T.MeshBasicMaterial({ color: 0xffe08a, fog: false, transparent: true, opacity: 0.3, depthWrite: false }));
    scene.add(sunBall); scene.add(sunHalo);
    var moonSpr = new T.Sprite(new T.SpriteMaterial({ map: moonTexture(0.5, true), fog: false, transparent: true, depthWrite: false })); moonSpr.scale.set(16, 16, 1); scene.add(moonSpr);
    var NSt = 700, stp = new Float32Array(NSt * 3);
    for (var si = 0; si < NSt; si++) { var th = Math.random() * Math.PI * 2, ph2 = Math.asin(Math.random() * 0.98 + 0.02); stp[si * 3] = Math.cos(ph2) * Math.cos(th) * 1500; stp[si * 3 + 1] = Math.sin(ph2) * 1500; stp[si * 3 + 2] = Math.cos(ph2) * Math.sin(th) * 1500; }
    var stg = new T.BufferGeometry(); stg.setAttribute('position', new T.BufferAttribute(stp, 3));
    var stars = new T.Points(stg, new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })); stars.frustumCulled = false; scene.add(stars);
    var cmat = new T.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.93, fog: false });
    var clouds = [], cgeo = new T.SphereGeometry(1, 14, 10);
    for (var i = 0; i < 12; i++) {
      var cg = new T.Group(), nb = 5 + (i % 3);
      for (var b = 0; b < nb; b++) { var m = new T.Mesh(cgeo, cmat), rr = 4 + ((i * 7 + b * 3) % 5); m.position.set((b - nb / 2) * 4.2 + ((i + b) % 2) * 1.5, ((b * 5 + i) % 3) * 0.9, ((b * 3 + i) % 4) - 2); m.scale.set(rr * 1.3, rr * 0.55, rr); cg.add(m); }
      scene.add(cg); clouds.push(cg);
    }
    // 비 (빗줄기) · 눈 (눈송이)
    var NR = 1400, rp = new Float32Array(NR * 6), rst = [];
    for (i = 0; i < NR; i++) rst.push({ x: (Math.random() - 0.5) * 90, y: Math.random() * 32, z: (Math.random() - 0.5) * 90 });
    var rg = new T.BufferGeometry(); rg.setAttribute('position', new T.BufferAttribute(rp, 3));
    var rain = new T.LineSegments(rg, new T.LineBasicMaterial({ color: 0xc7dcf5, transparent: true, opacity: 0.6 })); rain.frustumCulled = false; scene.add(rain);
    var NS = 1600, sp0 = new Float32Array(NS * 3), sst = [];
    for (i = 0; i < NS; i++) sst.push({ x: (Math.random() - 0.5) * 90, y: Math.random() * 32, z: (Math.random() - 0.5) * 90, ph: Math.random() * 6.28 });
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp0, 3));
    var snow = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.95 })); snow.frustumCulled = false; scene.add(snow);
    // 외부 기상대: 기둥 + 가로대 위 3컵 풍속계(바람 세기만큼 회전)·화살 풍향계(바람이 불어오는 쪽을 가리킴), 일사 차폐통·태양광판·기록 상자 + 바람자루(공항식)
    var metal = new T.MeshLambertMaterial({ color: 0x9ca3af }), dark = new T.MeshLambertMaterial({ color: 0x374151 }), white = new T.MeshLambertMaterial({ color: 0xf3f4f6 });
    var sens = new T.Group(); scene.add(sens);
    var mast = new T.Mesh(new T.CylinderGeometry(0.04, 0.05, 1, 10), metal); mast.position.y = 0.5; sens.add(mast); mast.castShadow = true;
    var head = new T.Group(); head.scale.setScalar(2.0); sens.add(head);
    var arm = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 1.0, 8), metal); arm.rotation.z = Math.PI / 2; head.add(arm);
    var clamp0 = new T.Mesh(new T.BoxGeometry(0.07, 0.09, 0.07), dark); head.add(clamp0);
    // 3컵 풍속계 (가로대 한쪽 끝)
    var cupPost = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.16, 8), metal); cupPost.position.set(0.5, 0.08, 0); head.add(cupPost);
    var cupBody = new T.Mesh(new T.CylinderGeometry(0.03, 0.035, 0.09, 12), white); cupBody.position.set(0.5, 0.2, 0); head.add(cupBody);
    var cups = new T.Group(); cups.position.set(0.5, 0.27, 0); head.add(cups);
    var cupGeo = new T.SphereGeometry(0.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); cupGeo.rotateZ(Math.PI / 2);
    for (i = 0; i < 3; i++) {
      var cw = new T.Group(); cw.rotation.y = i * Math.PI * 2 / 3; cups.add(cw);
      var spoke = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.12, 6), metal); spoke.rotation.z = Math.PI / 2; spoke.position.x = 0.06; cw.add(spoke);
      var cup = new T.Mesh(cupGeo, new T.MeshLambertMaterial({ color: 0x1f2937, side: T.DoubleSide })); cup.position.set(0.12, 0, 0); cup.rotation.y = Math.PI / 2; cw.add(cup);
    }
    var hubC = new T.Mesh(new T.SphereGeometry(0.018, 10, 8), white); cups.add(hubC);
    // 화살 풍향계 (다른 쪽 끝) — 화살촉이 바람이 불어오는 쪽을 향함
    var vPost = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.16, 8), metal); vPost.position.set(-0.5, 0.08, 0); head.add(vPost);
    var vBody = new T.Mesh(new T.CylinderGeometry(0.028, 0.03, 0.08, 12), white); vBody.position.set(-0.5, 0.2, 0); head.add(vBody);
    var vane = new T.Group(); vane.position.set(-0.5, 0.26, 0); head.add(vane);
    var rod = new T.Mesh(new T.CylinderGeometry(0.007, 0.007, 0.42, 6), metal); rod.rotation.z = Math.PI / 2; rod.position.x = -0.03; vane.add(rod);
    var tip = new T.Mesh(new T.ConeGeometry(0.022, 0.07, 10), dark); tip.rotation.z = -Math.PI / 2; tip.position.x = 0.21; vane.add(tip);
    var finShape = new T.Shape(); finShape.moveTo(0, -0.01); finShape.lineTo(-0.13, -0.04); finShape.lineTo(-0.13, 0.08); finShape.lineTo(-0.03, 0.03); finShape.lineTo(0, 0.01);
    var fin = new T.Mesh(new T.ShapeGeometry(finShape), new T.MeshLambertMaterial({ color: 0xf8fafc, side: T.DoubleSide })); fin.position.x = -0.12; vane.add(fin);
    var cwt = new T.Mesh(new T.SphereGeometry(0.016, 8, 6), dark); cwt.position.x = 0.15; vane.add(cwt);
    var pivot = new T.Mesh(new T.SphereGeometry(0.014, 8, 6), white); vane.add(pivot);
    // 기둥 중간: 온습도 일사 차폐통(흰 접시 여러 겹) · 태양광판 · 기록 상자
    var shield = new T.Group(); shield.scale.setScalar(1.6); sens.add(shield);
    for (i = 0; i < 7; i++) { var pl0 = new T.Mesh(new T.CylinderGeometry(0.11 - i * 0.004, 0.12 - i * 0.004, 0.018, 16), white); pl0.position.y = i * 0.035; pl0.castShadow = true; shield.add(pl0); }
    var shArm = new T.Mesh(new T.BoxGeometry(0.16, 0.02, 0.02), metal); shArm.position.set(0.08, 0.1, 0); shield.add(shArm); shield.children.forEach(function (c) { if (c !== shArm) c.position.x = 0.18; });
    var panel = new T.Group(); panel.scale.setScalar(1.6); sens.add(panel);
    var pv0 = new T.Mesh(new T.BoxGeometry(0.42, 0.02, 0.3), new T.MeshPhongMaterial({ color: 0x1e3a5f, shininess: 90, specular: 0x8899aa })); pv0.rotation.x = 0.6; pv0.position.set(0, 0, 0.12); pv0.castShadow = true; panel.add(pv0);
    var pvF = new T.Mesh(new T.BoxGeometry(0.44, 0.015, 0.32), metal); pvF.rotation.x = 0.6; pvF.position.set(0, -0.012, 0.12); panel.add(pvF);
    var logger = new T.Mesh(new T.BoxGeometry(0.33, 0.42, 0.18), white); logger.castShadow = true; sens.add(logger);
    var conduit = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 1, 6), dark); sens.add(conduit);
    var prop = cups;
    var sockPole = new T.Mesh(new T.CylinderGeometry(0.05, 0.06, 1, 8), metal); sockPole.castShadow = true; scene.add(sockPole);
    var sockYaw = new T.Group(), sockPitch = new T.Group(); sockYaw.scale.setScalar(2.2); sockYaw.add(sockPitch); scene.add(sockYaw);
    var ring = new T.Mesh(new T.TorusGeometry(0.28, 0.025, 6, 16), metal); ring.rotation.y = Math.PI / 2; sockPitch.add(ring);
    for (i = 0; i < 5; i++) { var r0 = 0.28 - i * 0.04, r1 = r0 - 0.04, seg = new T.Mesh(new T.CylinderGeometry(r1, r0, 0.36, 14, 1, true), new T.MeshLambertMaterial({ color: i % 2 ? 0xffffff : 0xf97316, side: T.DoubleSide })); seg.rotation.z = -Math.PI / 2; seg.position.x = 0.18 + i * 0.36; sockPitch.add(seg); }
    var NW = 280, wp = new Float32Array(NW * 6), wst = [];
    for (i = 0; i < NW; i++) wst.push({ x: 0, y: 0, z: 0, l: 0.7 + Math.random() * 0.8 });
    var wg = new T.BufferGeometry(); wg.setAttribute('position', new T.BufferAttribute(wp, 3));
    var wind = new T.LineSegments(wg, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })); wind.frustumCulled = false; scene.add(wind);
    var lbs = {};
    ['in', 'A', 'B', 'R', 'irr', 'ws', 'sun', 'mo', 'N', 'E', 'S', 'W'].forEach(function (k) {
      var d = document.createElement('div'); d.className = 'lb' + (k === 'in' ? ' in' : 'NESW'.indexOf(k) >= 0 ? ' cp' : ''); ov.appendChild(d); lbs[k] = d;
    });
    lbs.N.textContent = '북'; lbs.E.textContent = '동'; lbs.S.textContent = '남'; lbs.W.textContent = '서';
    G = { X: X, moon: moon, moonSpr: moonSpr, stars: stars, moonKey: '', bright: ls('farmily.sim.bright') === '1', wrap: wrap, r: r, cv: cv, ov: ov, scene: scene, cam: cam, hemi: hemi, sun: sun, sunBall: sunBall, sunHalo: sunHalo, clouds: clouds, cmat: cmat,
      skyDome: skyDome, skyMat: skyMat, mtMat: mtMat, mountains: mt, groundMat: groundMat,
      rain: rain, rp: rp, rst: rst, snow: snow, sp0: sp0, sst: sst, sens: sens, head: head, prop: prop, cups: cups, vane: vane, shield: shield, panel: panel, logger: logger, conduit: conduit, mast: mast, sockPole: sockPole, sockYaw: sockYaw, sockPitch: sockPitch, ground: ground, wind: wind, wp: wp, wst: wst, lbs: lbs, hud: ov.querySelector('#o3hud'), house: null, key: '', w: 0,
      orbit: { az: 0, el: 22, dist: 20, preset: 0, tl: new T.Vector3() } };
    controls();
    resize();
  }
  function resize() {
    var w = G.wrap.clientWidth || 900, h = Math.round(clamp(w * 0.6, 260, 540));
    G.w = w; G.r.setSize(w, h); G.cam.aspect = w / h; G.cam.updateProjectionMatrix();
  }
  function controls() {
    var cv = G.cv, pts = {}, last = null;
    function count() { return Object.keys(pts).length; }
    cv.addEventListener('pointerdown', function (e) { pts[e.pointerId] = { x: e.clientX, y: e.clientY, t: e.pointerType }; cv.style.cursor = 'grabbing'; try { cv.setPointerCapture(e.pointerId); } catch (x) {} last = null; });
    cv.addEventListener('pointermove', function (e) {
      var p = pts[e.pointerId]; if (!p) return;
      if (count() === 2) {
        var ids = Object.keys(pts), a = pts[ids[0]], b = pts[ids[1]];
        p.x = e.clientX; p.y = e.clientY;
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (last) zoom(last / Math.max(10, d)); last = d; return;
      }
      var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      G.orbit.az -= dx * 0.35;
      if (p.t === 'mouse') G.orbit.el = clamp(G.orbit.el + dy * 0.25, 3, 86);
    });
    function end(e) { delete pts[e.pointerId]; last = null; if (!count()) cv.style.cursor = 'grab'; }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    G.ov.querySelector('#o3l').onclick = function () { G.orbit.az += 30; };
    G.ov.querySelector('#o3r').onclick = function () { G.orbit.az -= 30; };
    G.ov.querySelector('#o3i').onclick = function () { zoom(1 / 1.25); };
    G.ov.querySelector('#o3o').onclick = function () { zoom(1.25); };
    var bb = G.ov.querySelector('#o3b'); function bl() { bb.textContent = G.bright ? '💡 실제 밝기' : '💡 밝게'; } bl();
    bb.onclick = function () { G.bright = !G.bright; ls('farmily.sim.bright', G.bright ? '1' : '0'); bl(); };
    G.ov.querySelector('#o3p').onclick = function () { if (G.dims) preset((G.orbit.preset + 1) % 3); };
  }
  function zoom(k) { if (!G.dims) return; G.orbit.dist = clamp(G.orbit.dist * k, 2.5, Math.max(G.dims.L, G.dims.NW) * 3 + 60); }
  var PRESETS = ['가까이', '전체', '위에서'];
  function preset(p) {
    var d = G.dims, o = G.orbit, big = Math.max(d.L, d.NW);
    o.preset = p;
    // 늘 북쪽에서 남쪽(한낮의 해 쪽)을 바라봄 — 하우스의 북쪽 끝을 가까이
    var ca0 = Math.cos(d.axis * D2R), es = ca0 >= 0 ? -1 : 1;
    if (p === 0) { o.zc = es * (d.L / 2 - Math.min(d.L / 2, d.NW * 0.9 + 4)) * Math.abs(ca0); o.tl.set(0, d.hr * 0.7, o.zc); o.az = 5; o.el = 15; o.dist = Math.max(d.NW * 2.4, d.hr * 6, 16); }
    else if (p === 1) { o.zc = 0; o.tl.set(0, d.hr * 0.6, 0); o.az = 15; o.el = 18; o.dist = big * 1.05 + 10; }
    else { o.zc = 0; o.tl.set(0, 0, 0); o.az = d.axis + 180 + 1; o.el = 82; o.dist = big * 1.15 + 8; }
    G.ov.querySelector('#o3p').textContent = '시점: ' + PRESETS[p];
  }

  // ---------- 하우스 만들기 ----------
  function dispose(o) { o.traverse(function (m) { if (m.geometry) m.geometry.dispose(); if (m.material) { (Array.isArray(m.material) ? m.material : [m.material]).forEach(function (x) { x.dispose(); }); } }); }
  function build(h, g, lai, stage, crop) {
    if (G.house) { G.scene.remove(G.house); dispose(G.house); }
    var X = G.X;
    var axis = (h.axis || 0) % 180, grp = new T.Group(); grp.rotation.y = -axis * D2R;
    var n = g.n, W = g.W, L = g.L, hs = g.hs, hr = g.hr, NW = n * W, x0 = -NW / 2, multi = n > 1;
    var vh = Math.max(0.1, Math.min(h.ventH, hs - 0.3)), du = Math.min(0.35, (h.roofW || 0.6) / W), rl = L * 0.85;
    var es = Math.cos(axis * D2R) >= 0 ? -1 : 1, zN = es * L / 2;   // 가까이 보는 쪽 끝(출입문·난방기·양액기 자리)
    var baseOp = h.cover === 'glass' ? 0.12 : h.cover === 'po2' ? 0.3 : 0.2;
    var film = new T.MeshPhongMaterial({ color: h.cover === 'glass' ? 0xe9f3fb : 0xf2f7fb, map: h.cover === 'glass' ? null : X.film, transparent: true, opacity: baseOp, side: T.DoubleSide, depthWrite: false, shininess: h.cover === 'glass' ? 120 : 70, specular: 0x888888 });
    function yAt(u) { return hs + (hr - hs) * 4 * u * (1 - u); }
    function patch(xs, u0, u1, z0, z1, off) {
      var seg = 18, pos = [], idx = [], uv = [], s = 0, px = null, py = null;
      for (var k = 0; k <= seg; k++) {
        var u = u0 + (u1 - u0) * k / seg, x = xs + u * W, y = yAt(u) + (off || 0);
        if (px != null) s += Math.hypot(x - px, y - py); px = x; py = y;
        pos.push(x, y, z0, x, y, z1); uv.push(s, z0, s, z1);
      }
      for (k = 0; k < seg; k++) { var a = 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
    }
    function add(o, par) { (par || grp).add(o); return o; }
    function box(w, hh, d, mat, x, y, z, cast) { var m = add(new T.Mesh(new T.BoxGeometry(w, hh, d), mat)); m.position.set(x, y, z); if (cast) m.castShadow = true; m.receiveShadow = true; return m; }
    function cyl(r, len, mat, seg) { return new T.Mesh(new T.CylinderGeometry(r, r, len, seg || 8), mat); }
    function pipeZ(x, y, z0, z1, r, mat) { var m = add(cyl(r, Math.abs(z1 - z0), mat)); m.rotation.x = Math.PI / 2; m.position.set(x, y, (z0 + z1) / 2); return m; }
    function pipeX(x0_, x1_, y, z, r, mat) { var m = add(cyl(r, Math.abs(x1_ - x0_), mat)); m.rotation.z = Math.PI / 2; m.position.set((x0_ + x1_) / 2, y, z); return m; }
    var steel = new T.MeshPhongMaterial({ color: 0xc9d0d6, shininess: 60, specular: 0x666666 });
    var steelD = new T.MeshLambertMaterial({ color: 0x8e979f });
    var conc = new T.MeshLambertMaterial({ color: 0xffffff, map: X.concrete });
    // 단면 모양
    var sh = new T.Shape(); sh.moveTo(x0, 0); sh.lineTo(x0, hs);
    for (var i = 0; i < n; i++) for (var k = 1; k <= 16; k++) { var u = k / 16; sh.lineTo(x0 + i * W + u * W, yAt(u)); }
    sh.lineTo(x0 + NW, 0); sh.lineTo(x0, 0);

    // ── 주변: 마당(자갈)·배수로·농로·이웃 하우스·관리사·전봇대·나무 ──
    var env = add(new T.Group());
    var yard = add(new T.Mesh(uvM(new T.PlaneGeometry(NW + 7, L + 10), NW + 7, L + 10), new T.MeshLambertMaterial({ color: 0xffffff, map: X.gravel })), env); yard.rotation.x = -Math.PI / 2; yard.position.set(0, 0.012, es * 2.5); yard.receiveShadow = true;
    // 배수로 (콘크리트 U자 수로) — 양 옆 긴 쪽
    var ditchWater = new T.MeshPhongMaterial({ color: 0x3a3f36, shininess: 10 });
    [-1, 1].forEach(function (sg) {
      var xd = sg * (NW / 2 + 1.6);
      [-0.28, 0.28].forEach(function (o) { var w = add(new T.Mesh(new T.BoxGeometry(0.08, 0.12, L + 8), conc), env); w.position.set(xd + o, 0.06, es * 1); w.receiveShadow = true; });
      var bt = add(new T.Mesh(new T.PlaneGeometry(0.48, L + 8), ditchWater), env); bt.rotation.x = -Math.PI / 2; bt.position.set(xd, 0.03, es * 1);
      env.userData['ditch' + sg] = bt;
    });
    // 농로 (아스팔트) — 출입문 쪽 끝을 가로질러
    var roadZ = zN + es * 8.5, roadW = 4.2, roadLen = 700;
    var road = add(new T.Mesh(uvM(new T.PlaneGeometry(roadLen, roadW), roadLen, roadW), new T.MeshPhongMaterial({ color: 0xffffff, map: X.road, shininess: 5 })), env); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, roadZ); road.receiveShadow = true;
    var lineM = new T.MeshBasicMaterial({ color: 0xd9d6cc }); [-1, 1].forEach(function (s2) { var ln = add(new T.Mesh(new T.PlaneGeometry(roadLen, 0.1), lineM), env); ln.rotation.x = -Math.PI / 2; ln.position.set(0, 0.025, roadZ + s2 * (roadW / 2 - 0.2)); });
    var puddles = [];
    for (var pq = 0; pq < 5; pq++) { var pd = add(new T.Mesh(new T.CircleGeometry(0.6 + (pq % 3) * 0.4, 16), new T.MeshPhongMaterial({ color: 0x6f7a86, shininess: 120, specular: 0xbbbbbb, transparent: true, opacity: 0.75 })), env); pd.rotation.x = -Math.PI / 2; pd.scale.y = 0.55; pd.position.set(-14 + pq * 7.5, 0.03, roadZ + ((pq % 2) - 0.5) * 1.6); pd.visible = false; puddles.push(pd); }
    // 이웃 하우스 (양 옆으로 두 동씩, 단순하게)
    var nbMat = new T.MeshPhongMaterial({ color: 0xe9eef2, transparent: true, opacity: 0.38, shininess: 60, side: T.DoubleSide, depthWrite: false });
    var nbW = Math.min(8, Math.max(6, W)), nbHs = 1.7, nbHr = 3.3, nbL = Math.max(40, L * 0.9);
    var nbSh = new T.Shape(); nbSh.moveTo(-nbW / 2, 0); nbSh.lineTo(-nbW / 2, nbHs); for (k = 1; k <= 14; k++) { u = k / 14; nbSh.lineTo(-nbW / 2 + u * nbW, nbHs + (nbHr - nbHs) * 4 * u * (1 - u)); } nbSh.lineTo(nbW / 2, 0); nbSh.lineTo(-nbW / 2, 0);
    var nbGeo = new T.ExtrudeGeometry(nbSh, { depth: nbL, bevelEnabled: false }); nbGeo.translate(0, 0, -nbL / 2);
    var nbArch = []; for (k = 0; k <= 14; k++) { u = k / 14; nbArch.push(new T.Vector3(-nbW / 2 + u * nbW, nbHs + (nbHr - nbHs) * 4 * u * (1 - u), 0)); }
    var nbArchGeo = new T.BufferGeometry().setFromPoints(nbArch), nbLineM = new T.LineBasicMaterial({ color: 0xc8d2dc, transparent: true, opacity: 0.4 });
    [-2, -1, 1, 2].forEach(function (q) {
      var xo = Math.sign(q) * (NW / 2 + 4 + nbW / 2) + Math.sign(q) * (Math.abs(q) - 1) * (nbW + 2.5);
      var m = add(new T.Mesh(nbGeo, nbMat), env); m.position.set(xo, 0, es * 3 + (q % 2) * 4);
      for (var a2 = 0; a2 <= 8; a2++) { var ln2 = add(new T.Line(nbArchGeo, nbLineM), env); ln2.position.set(xo, 0, m.position.z - nbL / 2 + a2 * nbL / 8); }
    });
    // 관리사(컨테이너) + 물탱크 + 마당 가로등
    var shedX = x0 - 4.5 - 3, shedZ = zN + es * 3.6;
    var shed = add(new T.Group(), env); shed.position.set(shedX, 0, shedZ);
    var shedMat = new T.MeshLambertMaterial({ color: 0xd7dde2 });
    var sb = add(new T.Mesh(new T.BoxGeometry(6, 2.5, 2.4), shedMat), shed); sb.position.y = 1.25; sb.castShadow = true; sb.receiveShadow = true;
    for (k = 0; k < 12; k++) { var rib = add(new T.Mesh(new T.BoxGeometry(0.05, 2.5, 2.44), new T.MeshLambertMaterial({ color: 0xc3cad0 })), shed); rib.position.set(-2.75 + k * 0.5, 1.25, 0); }
    var roofS = add(new T.Mesh(new T.BoxGeometry(6.4, 0.08, 2.9), new T.MeshLambertMaterial({ color: 0x31588a })), shed); roofS.position.y = 2.58; roofS.rotation.x = 0.04; roofS.castShadow = true;
    var winMat = new T.MeshBasicMaterial({ color: 0x2b3946 });
    var win = add(new T.Mesh(new T.PlaneGeometry(1.1, 0.8), winMat), shed); win.position.set(1.2, 1.5, -es * 1.21); win.rotation.y = es > 0 ? Math.PI : 0;
    var sdoor = add(new T.Mesh(new T.PlaneGeometry(0.9, 2.0), new T.MeshLambertMaterial({ color: 0x8c5a3c })), shed); sdoor.position.set(-1.4, 1.0, -es * 1.21); sdoor.rotation.y = es > 0 ? Math.PI : 0;
    var tank = add(new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 1.9, 20), new T.MeshLambertMaterial({ color: 0x3b7a57 })), env); tank.position.set(shedX + 4.3, 0.95, shedZ); tank.castShadow = true;
    var tankLid = add(new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 0.12, 14), new T.MeshLambertMaterial({ color: 0x2d5f43 })), env); tankLid.position.set(shedX + 4.3, 1.96, shedZ);
    var lampPole = add(cyl(0.07, 5.5, steelD), env); lampPole.position.set(shedX + 2.6, 2.75, shedZ - es * 1.9); lampPole.castShadow = true;
    var lampArm = add(cyl(0.04, 1.2, steelD), env); lampArm.rotation.z = Math.PI / 2; lampArm.position.set(shedX + 3.1, 5.4, shedZ - es * 1.9);
    var bulbMat = new T.MeshBasicMaterial({ color: 0x777777 });
    var bulb = add(new T.Mesh(new T.SphereGeometry(0.16, 10, 8), bulbMat), env); bulb.position.set(shedX + 3.6, 5.3, shedZ - es * 1.9);
    var lamp = new T.PointLight(0xffd9a0, 0, 26, 1.6); lamp.position.copy(bulb.position); env.add(lamp);
    // 전봇대 + 전깃줄 (농로 건너편)
    var poleZ = -es * (L / 2 + 9), poleMat = new T.MeshLambertMaterial({ color: 0x9a968d }), wireMat = new T.LineBasicMaterial({ color: 0x1f2328 });
    var poleXs = []; for (var px0 = -140; px0 <= 140; px0 += 35) poleXs.push(px0);
    poleXs.forEach(function (px1) {
      var pl = add(new T.Mesh(new T.CylinderGeometry(0.13, 0.19, 10, 8), poleMat), env); pl.position.set(px1, 5, poleZ); pl.castShadow = true;
      var arm = add(new T.Mesh(new T.BoxGeometry(1.6, 0.1, 0.1), steelD), env); arm.position.set(px1, 9.4, poleZ); arm.rotation.y = Math.PI / 2;
    });
    [-0.65, 0, 0.65].forEach(function (dz) {
      var pts = []; for (var w2 = 0; w2 < poleXs.length - 1; w2++) for (var s2 = 0; s2 <= 10; s2++) { var t2 = s2 / 10; pts.push(new T.Vector3(lerp(poleXs[w2], poleXs[w2 + 1], t2), 9.45 - 1.1 * 4 * t2 * (1 - t2), poleZ + dz)); }
      add(new T.Line(new T.BufferGeometry().setFromPoints(pts), wireMat), env);
    });
    // 바람막이 나무 (하우스 뒤쪽 끝 너머)
    var trunkM = new T.MeshLambertMaterial({ color: 0x5b4330 }), crownM = new T.MeshLambertMaterial({ color: 0x2f5a2c, flatShading: true }), tr = rng(19);
    for (k = 0; k < 14; k++) {
      var tx = (k - 6.5) * 7 + (tr() - 0.5) * 3, tz = -es * (L / 2 + 14 + tr() * 6), th2 = 5 + tr() * 4;
      var tk = add(new T.Mesh(new T.CylinderGeometry(0.15, 0.22, th2 * 0.45, 6), trunkM), env); tk.position.set(tx, th2 * 0.225, tz); tk.castShadow = true;
      var cr = add(new T.Mesh(new T.IcosahedronGeometry(th2 * 0.32, 0), crownM), env); cr.position.set(tx, th2 * 0.62, tz); cr.scale.set(1, 1.35, 1); cr.castShadow = true;
    }

    // ── 기초·바닥 ──
    var floor = add(new T.Mesh(uvM(new T.PlaneGeometry(NW, L), NW, L), new T.MeshLambertMaterial({ color: 0xffffff, map: X.soil }))); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.015; floor.receiveShadow = true;
    [-1, 1].forEach(function (sg) { box(0.22, 0.18, L + 0.2, conc, sg * (NW / 2 + 0.02), 0.09, 0); box(NW + 0.4, 0.18, 0.22, conc, 0, 0.09, sg * (L / 2 + 0.02)); });

    // ── 지붕 피복 (천창 자리는 비워 둠) ──
    var flaps = [], flapMat = new T.MeshPhongMaterial({ color: 0xe6f0fa, map: X.film, transparent: true, opacity: 0.4, side: T.DoubleSide, depthWrite: false, shininess: 70 });
    for (i = 0; i < n; i++) {
      var xs = x0 + i * W, xc = xs + W / 2;
      if (h.roofVent) {
        add(new T.Mesh(patch(xs, 0, 0.5, -L / 2, L / 2), film));
        add(new T.Mesh(patch(xs, 0.5, 0.5 + du, -L / 2, -rl / 2), film));
        add(new T.Mesh(patch(xs, 0.5, 0.5 + du, rl / 2, L / 2), film));
        add(new T.Mesh(patch(xs, 0.5 + du, 1, -L / 2, L / 2), film));
        var px = xs + (0.5 + du) * W, py = yAt(0.5 + du), len = Math.hypot(px - xc, py - hr), slope = Math.atan2(py - hr, px - xc);
        var pv = new T.Group(); pv.position.set(xc, hr, 0); pv.userData.slope = slope;
        var fm = new T.Mesh(new T.BoxGeometry(len, 0.03, rl), flapMat); fm.position.x = len / 2; pv.add(fm);
        var fframe = new T.Mesh(new T.BoxGeometry(0.05, 0.05, rl), steel); fframe.position.set(len, 0, 0); pv.add(fframe);
        // 천창 개폐 랙(밀대) — 몇 군데
        for (var ra = 0; ra < Math.max(2, Math.round(rl / 6)); ra++) { var rk = new T.Mesh(new T.BoxGeometry(0.03, 0.03, 0.03), steelD); rk.position.set(len * 0.8, -0.03, -rl / 2 + (ra + 0.5) * rl / Math.max(2, Math.round(rl / 6))); pv.add(rk); }
        if (h.net) { var rn = new T.Mesh(patch(xs, 0.5, 0.5 + du, -rl / 2, rl / 2, -0.06), new T.MeshBasicMaterial({ map: X.net, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false })); add(rn); }
        add(pv); flaps.push(pv);
      } else add(new T.Mesh(patch(xs, 0, 1, -L / 2, L / 2), film));
    }
    // 양쪽 박공 (막음 피복) + 박공 샛기둥
    [-1, 1].forEach(function (s) { var gm = add(new T.Mesh(new T.ShapeGeometry(sh), film)); gm.position.z = s * L / 2; });
    // 눈 덮인 지붕 (눈 올 때만)
    var snowMat = new T.MeshLambertMaterial({ color: 0xf7f9fb }), snowRoof = [];
    for (i = 0; i < n; i++) { var sr = add(new T.Mesh(patch(x0 + i * W, 0.16, 0.84, -L / 2, L / 2, 0.04), snowMat)); sr.visible = false; sr.castShadow = true; snowRoof.push(sr); }

    // ── 측창 (아래 0.3m 고정, 그 위로 감아 올림) + 감기 축 + 개폐기 ──
    var pg = new T.PlaneGeometry(1, 1); pg.rotateY(Math.PI / 2);
    var cg = new T.CylinderGeometry(0.035, 0.035, 1, 10); cg.rotateX(Math.PI / 2);
    var rollMat = new T.MeshLambertMaterial({ color: 0xe8edf1 }), netMat = new T.MeshBasicMaterial({ map: X.net, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false });
    var motorMat = new T.MeshLambertMaterial({ color: 0x2f3b46 });
    function sideSet(sg) {
      var x = sg * NW / 2, b = add(new T.Mesh(pg, film)); b.scale.set(1, 0.3, L); b.position.set(x, 0.15, 0);
      var top = add(new T.Mesh(pg, film)); top.position.x = x;
      var roll = add(new T.Mesh(cg, rollMat)); roll.position.x = x + sg * 0.06; roll.scale.z = L; roll.castShadow = true;
      var rollFilm = add(new T.Mesh(new T.CylinderGeometry(0.06, 0.06, L - 0.2, 12, 1, true), new T.MeshLambertMaterial({ color: 0xdfe8ee, transparent: true, opacity: 0.85 }))); rollFilm.rotation.x = Math.PI / 2; rollFilm.position.x = x + sg * 0.06;
      var net = h.net ? add(new T.Mesh(new T.PlaneGeometry(1, 1), netMat)) : null;
      if (net) { net.rotation.y = Math.PI / 2; net.position.x = x - sg * 0.02; net.scale.x = L; }
      // 개폐기: 감기 축 끝(출입문 쪽)에 붙은 모터 + 손잡이 지지대
      var motor = add(new T.Group()); motor.position.set(x + sg * 0.12, 0, zN - es * 0.25);
      var mb = new T.Mesh(new T.BoxGeometry(0.16, 0.22, 0.3), motorMat); mb.castShadow = true; motor.add(mb);
      var mg = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.1, 12), new T.MeshLambertMaterial({ color: 0x4b5563 })); mg.rotation.x = Math.PI / 2; mg.position.z = -es * 0.18; motor.add(mg);
      var guide = add(cyl(0.022, hs, steelD)); guide.position.set(x + sg * 0.12, hs / 2, zN - es * 0.25);
      top.scale.z = L;
      return { x: x, sg: sg, top: top, roll: roll, rollFilm: rollFilm, net: net, motor: motor };
    }
    var sides = { A: sideSet(-1), B: sideSet(1) };

    // ── 뼈대: 아치 파이프(0.6~0.9m 간격) · 도리 · 물받이 · 기둥 · 박공 샛기둥 ──
    var archSp = multi ? 0.9 : 0.6, nz = Math.max(2, Math.round(L / archSp)), archPts = [];
    if (!multi) { archPts.push(new T.Vector3(x0, 0, 0)); archPts.push(new T.Vector3(x0, hs * 0.5, 0)); }
    for (k = 0; k <= 20; k++) { u = k / 20; archPts.push(new T.Vector3((multi ? 0 : x0) + u * W, yAt(u), 0)); }
    if (!multi) { archPts.push(new T.Vector3(x0 + W, hs * 0.5, 0)); archPts.push(new T.Vector3(x0 + W, 0, 0)); }
    var archPath = new T.CurvePath(); for (k = 0; k < archPts.length - 1; k++) archPath.add(new T.LineCurve3(archPts[k], archPts[k + 1]));
    var archGeo = new T.TubeGeometry(archPath, archPts.length * 2, multi ? 0.022 : 0.016, 5, false);
    var cnt = (nz + 1) * n, arches = add(new T.InstancedMesh(archGeo, steel, cnt)), dm = new T.Object3D(), q = 0;
    for (var a = 0; a <= nz; a++) for (i = 0; i < n; i++) { dm.position.set(multi ? x0 + i * W : 0, 0, -L / 2 + a * L / nz); dm.rotation.set(0, 0, 0); dm.scale.set(1, 1, 1); dm.updateMatrix(); arches.setMatrixAt(q++, dm.matrix); }
    arches.instanceMatrix.needsUpdate = true; arches.castShadow = true;
    // 도리(길이 방향 파이프): 용마루·중간·어깨, 측창 아래 고정대
    var purl = [0.5, 0.22, 0.78]; if (W > 6) purl.push(0.36, 0.64);
    for (i = 0; i < n; i++) purl.forEach(function (pu) { pipeZ(x0 + i * W + pu * W, yAt(pu) - 0.03, -L / 2, L / 2, 0.016, steel).castShadow = true; });
    [x0, x0 + NW].forEach(function (xx) { pipeZ(xx, hs, -L / 2, L / 2, 0.02, steel); pipeZ(xx, 0.3, -L / 2, L / 2, 0.018, steel); });
    if (multi) {
      var gutM = new T.MeshPhongMaterial({ color: 0xb8c1c8, shininess: 40 });
      for (i = 1; i < n; i++) { var gx = x0 + i * W; box(0.3, 0.16, L + 0.4, gutM, gx, hs + 0.02, 0, true); }
      var postGeo = new T.BoxGeometry(0.075, hs, 0.075), npz = Math.max(2, Math.round(L / 3)), posts = add(new T.InstancedMesh(postGeo, steel, (n + 1) * (npz + 1))); q = 0;
      for (i = 0; i <= n; i++) for (a = 0; a <= npz; a++) { dm.position.set(x0 + i * W, hs / 2, -L / 2 + a * L / npz); dm.rotation.set(0, 0, 0); dm.updateMatrix(); posts.setMatrixAt(q++, dm.matrix); }
      posts.instanceMatrix.needsUpdate = true; posts.castShadow = true;
      // 트러스 보 (기둥 위 가로 보)
      for (a = 0; a <= npz; a += 2) pipeX(x0, x0 + NW, hs - 0.12, -L / 2 + a * L / npz, 0.025, steelD);
    }
    // 박공 샛기둥·가로대
    [-L / 2, L / 2].forEach(function (z) {
      for (i = 0; i < n; i++) for (var st = 1; st < Math.max(3, Math.round(W / 1.2)); st++) { var su = st / Math.max(3, Math.round(W / 1.2)), sx = x0 + i * W + su * W, hy = yAt(su); var stud = add(cyl(0.017, hy, steel)); stud.position.set(sx, hy / 2, z); }
      pipeX(x0, x0 + NW, Math.min(2.2, hs + 0.3), z, 0.018, steel);
    });
    // 출입문 (가까운 쪽 박공, 가운데 동) — 미닫이 문틀 + 피복 문짝
    var dSpan = Math.floor(n / 2), dxc = x0 + dSpan * W + W / 2, dw = Math.min(2.0, W * 0.32), dhh = Math.min(2.1, yAt(0.5 - dw / W / 2) - 0.1);
    var doorFrame = new T.MeshLambertMaterial({ color: 0x7c8790 });
    [-1, 1].forEach(function (s) { var jb = add(new T.Mesh(new T.BoxGeometry(0.06, dhh, 0.06), doorFrame)); jb.position.set(dxc + s * dw / 2, dhh / 2, zN); });
    var lint = add(new T.Mesh(new T.BoxGeometry(dw * 2 + 0.1, 0.06, 0.06), doorFrame)); lint.position.set(dxc + dw / 2, dhh, zN + es * 0.03);
    var rail = add(new T.Mesh(new T.BoxGeometry(dw * 2 + 0.1, 0.05, 0.05), doorFrame)); rail.position.set(dxc + dw / 2, 0.04, zN + es * 0.03);
    var leaf = add(new T.Group()); leaf.position.set(dxc + dw * 0.55, 0, zN + es * 0.07);
    var lf = new T.Mesh(new T.PlaneGeometry(dw, dhh - 0.08), new T.MeshPhongMaterial({ color: 0xeef4f8, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false })); lf.position.y = dhh / 2; leaf.add(lf);
    var lfF = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(dw, dhh - 0.08, 0.02)), new T.LineBasicMaterial({ color: 0x6b7680 })); lfF.position.y = dhh / 2; leaf.add(lfF);
    var handle = new T.Mesh(new T.BoxGeometry(0.03, 0.18, 0.04), doorFrame); handle.position.set(-dw / 2 + 0.1, 1.0, 0.03 * es); leaf.add(handle);
    var apron = add(new T.Mesh(uvM(new T.PlaneGeometry(dw * 2.2, 2.4), dw * 2.2, 2.4), conc)); apron.rotation.x = -Math.PI / 2; apron.position.set(dxc + dw * 0.4, 0.03, zN + es * 1.2); apron.receiveShadow = true;
    // ── FARMILY 간판: 출입문 위 박공 바깥쪽 (밤에는 불이 들어오는 라이트박스) ──
    var sgW = Math.min(W * 0.55, 4.0), sgH, sgY;
    for (var sgi = 0; sgi < 12; sgi++) { sgH = sgW / 5; sgY = dhh + 0.14 + sgH / 2; if (sgY + sgH / 2 <= yAt(0.5 - sgW / W / 2) - 0.1 || sgW < 1.3) break; sgW *= 0.9; }
    var sgTex = signTexture(), sgOut = es * 0.16;
    var signMat = new T.MeshLambertMaterial({ color: 0xffffff, map: sgTex, emissive: 0x000000, emissiveMap: sgTex });
    var sgFrameMat = new T.MeshPhongMaterial({ color: 0x2b2f34, shininess: 40, specular: 0x444444 });
    var sgBox = add(new T.Mesh(new T.BoxGeometry(sgW + 0.1, sgH + 0.1, 0.12), sgFrameMat)); sgBox.position.set(dxc, sgY, zN + sgOut - es * 0.07); sgBox.castShadow = true;
    var sgFace = add(new T.Mesh(new T.PlaneGeometry(sgW, sgH), signMat)); sgFace.position.set(dxc, sgY, zN + sgOut); sgFace.rotation.y = es > 0 ? 0 : Math.PI;
    [-1, 1].forEach(function (sd) { var br = add(new T.Mesh(new T.BoxGeometry(0.05, 0.05, 0.22), sgFrameMat)); br.position.set(dxc + sd * sgW * 0.38, sgY - sgH / 2 - 0.02, zN + es * 0.05); });
    var sgGlowMat = new T.MeshBasicMaterial({ map: G.X.puff, color: 0xfff6e6, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
    var sgGlow = add(new T.Mesh(new T.PlaneGeometry(sgW * 1.7, sgH * 3.2), sgGlowMat)); sgGlow.position.set(dxc, sgY, zN + es * 0.02); sgGlow.rotation.y = sgFace.rotation.y; sgGlow.renderOrder = 3;
    var signLight = new T.PointLight(0xfff4e0, 0, 9, 1.8); signLight.position.set(dxc, sgY - 0.1, zN + es * 1.4); grp.add(signLight);

    // ── 보온커튼: 단동은 아치를 따라 안쪽에(양옆 감기), 연동은 물받이 높이에 수평 ──
    var curC = [], curO = [];
    if (h.curtain !== 'none') {
      var cm = new T.MeshLambertMaterial({ color: 0xffffff, map: h.curtain === 'multi' ? X.quilt : X.fleece, transparent: true, opacity: h.curtain === 'multi' ? 0.97 : 0.85, side: T.DoubleSide });
      if (!multi) {
        curC.push(add(new T.Mesh(patch(x0, 0.02, 0.98, -L / 2 + 0.2, L / 2 - 0.2, -0.28), cm)));
        [-1, 1].forEach(function (s) { var sc = add(new T.Mesh(new T.PlaneGeometry(L - 0.4, hs - 0.15), cm)); sc.rotation.y = Math.PI / 2; sc.position.set(s * (NW / 2 - 0.2), 0.15 + (hs - 0.15) / 2, 0); curC.push(sc); });
        [-1, 1].forEach(function (s) { var ro = add(cyl(h.curtain === 'multi' ? 0.13 : 0.08, L - 0.4, cm, 12)); ro.rotation.x = Math.PI / 2; ro.position.set(s * (NW / 2 - 0.3), hs - 0.05, 0); ro.castShadow = true; curO.push(ro); });
      } else {
        var cc = add(new T.Mesh(uvM(new T.PlaneGeometry(NW - 0.1, L - 0.1), NW, L), cm)); cc.rotation.x = -Math.PI / 2; cc.position.y = hs - 0.18; curC.push(cc);
        for (i = 0; i < n; i++) { var bo = add(new T.Mesh(new T.BoxGeometry(0.3, 0.22, L - 0.2), cm)); bo.position.set(x0 + i * W + 0.3, hs - 0.25, 0); bo.castShadow = true; curO.push(bo); }
      }
      // 커튼 줄(지지선)
      var cwP = []; for (i = 0; i < n; i++) for (k = 1; k < 6; k++) { var cxw = x0 + i * W + k * W / 6; cwP.push(cxw, multi ? hs - 0.16 : yAt(k / 6) - 0.3, -L / 2, cxw, multi ? hs - 0.16 : yAt(k / 6) - 0.3, L / 2); }
      var cwg = new T.BufferGeometry(); cwg.setAttribute('position', new T.Float32BufferAttribute(cwP, 3)); add(new T.LineSegments(cwg, new T.LineBasicMaterial({ color: 0x9aa3ab, transparent: true, opacity: 0.6 })));
    }
    // ── 차광막 (지붕 바깥, 검은 망) ──
    var shOn = [], shOff = [];
    if (h.shade) {
      var sm = new T.MeshLambertMaterial({ color: 0xffffff, map: X.shade, transparent: true, opacity: clamp(0.35 + (h.shadePct || 50) / 120, 0.4, 0.95), side: T.DoubleSide, depthWrite: false });
      for (i = 0; i < n; i++) {
        var spm = add(new T.Mesh(patch(x0 + i * W, 0, 1, -L / 2, L / 2, 0.32), sm)); spm.castShadow = true; shOn.push(spm);
        var so = add(cyl(0.08, L, new T.MeshLambertMaterial({ color: 0x1f2328 }), 10)); so.rotation.x = Math.PI / 2; so.position.set(x0 + i * W + 0.12, hs + 0.36, 0); shOff.push(so);
      }
      // 차광 지지 파이프
      for (a = 0; a <= nz; a += 6) for (i = 0; i < n; i++) { var sp2 = add(cyl(0.012, 0.32, steelD)); sp2.position.set(x0 + i * W + W / 2, hr + 0.16, -L / 2 + a * L / nz); }
    }

    // ── 하우스 안 공기 (온도 색) ──
    var airMat = new T.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.1, depthWrite: false, side: T.DoubleSide });
    var ag = new T.ExtrudeGeometry(sh, { depth: L - 0.4, bevelEnabled: false }); ag.translate(0, 0, -(L - 0.4) / 2);
    var air = add(new T.Mesh(ag, airMat)); air.scale.set(0.985, 0.975, 1);

    // ── 두둑(검은 멀칭) · 점적 · 유인선 · 작물 ──
    var rowsPer = Math.max(2, Math.round(W / 1.6)), bedW = W / rowsPer, beds = [];
    for (i = 0; i < n; i++) for (k = 0; k < rowsPer; k++) beds.push(x0 + i * W + (k + 0.5) * bedW);
    var bedTopW = Math.min(0.75, bedW * 0.42), bedBotW = Math.min(1.05, bedW * 0.62), bedH = 0.22, zEndA = -L / 2 + 1.2, zEndB = L / 2 - 1.2;
    if (es > 0) zEndB = L / 2 - 2.6; else zEndA = -L / 2 + 2.6;  // 출입문 쪽은 통로·난방기 자리
    var bedLen = zEndB - zEndA, bedZc = (zEndA + zEndB) / 2;
    var bs = new T.Shape(); bs.moveTo(-bedBotW / 2, 0); bs.lineTo(-bedTopW / 2, bedH); bs.quadraticCurveTo(0, bedH + 0.03, bedTopW / 2, bedH); bs.lineTo(bedBotW / 2, 0); bs.lineTo(-bedBotW / 2, 0);
    var bedGeo = new T.ExtrudeGeometry(bs, { depth: bedLen, bevelEnabled: false, curveSegments: 4 }); bedGeo.translate(0, 0, -bedLen / 2);
    var mulchM = new T.MeshPhongMaterial({ color: 0xffffff, map: X.mulch, shininess: 40, specular: 0x333333 });
    var dripMat = new T.MeshBasicMaterial({ color: 0x334155 });
    var lines = [];
    beds.forEach(function (bx) {
      var bm = add(new T.Mesh(bedGeo, mulchM)); bm.position.set(bx, 0.015, bedZc); bm.receiveShadow = true;
      [-1, 1].forEach(function (s) { var dp = add(new T.Mesh(new T.BoxGeometry(0.018, 0.012, bedLen - 0.2), dripMat)); dp.position.set(bx + s * bedTopW * 0.22, bedH + 0.035, bedZc); lines.push(bx + s * bedTopW * 0.28); });
    });
    // 관수 주관(PE 배관) — 출입문 쪽 두둑 끝을 가로지름
    var zHead = es > 0 ? zEndB + 0.25 : zEndA - 0.25;
    pipeX(x0 + 0.4, x0 + NW - 0.4, 0.06, zHead, 0.03, new T.MeshLambertMaterial({ color: 0x1b1d20 }));
    var plH = Math.min(hs * 0.95, 0.5 + lai * 0.55);
    var LC = [0x3f7f2b, 0x4a8c31, 0x579a39, 0x36742a, 0x5f9f3e];
    var ripe = [0xd2231b, 0xdc3a1c, 0xe8641f, 0xee8a2a, 0xc9b23c, 0x7fae3e, 0x6aa339];
    var step = Math.max(0.4, lines.length * bedLen / 950), perRow = Math.max(1, Math.floor(bedLen / step));
    var stemsM = [], leavesM = [], leafC = [], frM = [], frC = [], flM = [], strings = [], wires = [];
    var r1 = rng(101), mt = new T.Matrix4(), qt = new T.Quaternion(), sc3 = new T.Vector3(), ps = new T.Vector3(), eu = new T.Euler();
    function mat(x, y, z, rx, ry, rz, sx, sy, sz) { eu.set(rx, ry, rz); qt.setFromEuler(eu); ps.set(x, y, z); sc3.set(sx, sy, sz); return mt.compose(ps, qt, sc3).clone(); }
    lines.forEach(function (lx, li) {
      var uu = clamp((lx - (x0 + Math.floor((lx - x0) / W) * W)) / W, 0.02, 0.98), roofY = yAt(uu);
      var wireY = Math.min(3.0, roofY - 0.4), ph = Math.max(0.35, Math.min(plH, wireY - bedH - 0.1));
      wires.push(lx, wireY, zEndA + 0.1, lx, wireY, zEndB - 0.1);
      for (var j = 0; j < perRow; j++) {
        var z = zEndA + (j + 0.5) * bedLen / perRow, s = 0.92 + 0.16 * r1(), yb = bedH + 0.02, hh = ph * s, lean = (r1() - 0.5) * 0.08;
        strings.push(lx, yb, z, lx, wireY, z);
        stemsM.push(mat(lx, yb, z, 0, 0, lean, 1, hh, 1));
        var bare = stage === 'harvest' ? hh * 0.32 : stage === 'flower' ? 0.06 : 0.02;   // 수확기엔 아래 잎을 따 줌(하엽 제거)
        var nLv = Math.max(3, Math.round((hh - bare) / 0.2)), rot0 = r1() * 6.28;
        for (var lv = 0; lv < nLv; lv++) {
          var t = (lv + 0.5) / nLv, ly = yb + bare + (hh - bare) * t, sz = (stage === 'early' ? 0.7 : 1.3) * (t > 0.8 ? 1.25 - (t - 0.8) * 2.4 : 0.85 + t * 0.4);
          leavesM.push(mat(lx + lean * (ly - yb), ly, z, (r1() - 0.5) * 0.3, rot0 + lv * 2.4, (r1() - 0.5) * 0.25 + 0.1, sz, sz, sz));
          leafC.push(t < 0.15 && stage === 'harvest' ? 0x6f8f35 : LC[(lv + j + li) % LC.length]);
        }
        if (stage !== 'early') {
          var nT = Math.min(stage === 'harvest' ? 6 : 4, Math.max(1, Math.floor((hh - 0.4) / 0.32))), cherry = crop === 'cherry';
          for (var tt = 0; tt < nT; tt++) {
            var ty = yb + 0.38 + tt * Math.max(0.28, (hh - 0.55) / nT), fromTop = nT - 1 - tt, ang = rot0 + tt * 3.1 + 1.2;
            if (ty > yb + hh - 0.08) break;
            if (fromTop < (stage === 'harvest' ? 1 : 2)) { flM.push(mat(lx, ty, z, 0, ang, -0.2, 1, 1, 1)); continue; }
            frM.push(mat(lx, ty, z, 0, ang, -0.15, 1, 1, 1));
            var stg2 = stage === 'harvest' ? Math.min(ripe.length - 1, Math.max(0, tt - Math.floor(nT * 0.15) + (r1() < 0.3 ? 1 : 0))) : ripe.length - 1;
            frC.push(stage === 'harvest' ? ripe[Math.min(ripe.length - 1, Math.floor(stg2 * ripe.length / Math.max(1, nT - 1)))] : ripe[ripe.length - 1]);
          }
        }
      }
    });
    function inst(geo, mat2, list, colors, cast) {
      if (!list.length) return null;
      var im = add(new T.InstancedMesh(geo, mat2, list.length));
      list.forEach(function (m, ii) { im.setMatrixAt(ii, m); if (colors) im.setColorAt(ii, _c1.setHex(colors[ii])); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      if (cast) im.castShadow = true; im.receiveShadow = true; return im;
    }
    var stemGeo = new T.CylinderGeometry(0.008, 0.012, 1, 5); stemGeo.translate(0, 0.5, 0);
    inst(stemGeo, new T.MeshLambertMaterial({ color: 0x6b9446 }), stemsM, null, false);
    inst(leafGeometry(), new T.MeshLambertMaterial({ color: 0xffffff, map: X.leaf, side: T.DoubleSide }), leavesM, leafC, lines.length * perRow < 700);
    inst(trussGeometry(crop === 'cherry' ? 8 : 4, crop === 'cherry' ? 0.014 : 0.034), new T.MeshPhongMaterial({ color: 0xffffff, shininess: 90, specular: 0x777777 }), frM, frC, false);
    inst(flowerGeometry(), new T.MeshLambertMaterial({ color: 0xf6d21c }), flM, null, false);
    var sgeo = new T.BufferGeometry(); sgeo.setAttribute('position', new T.Float32BufferAttribute(strings, 3));
    add(new T.LineSegments(sgeo, new T.LineBasicMaterial({ color: 0xf2efe6, transparent: true, opacity: 0.55 })));
    var wgeo = new T.BufferGeometry(); wgeo.setAttribute('position', new T.Float32BufferAttribute(wires, 3));
    add(new T.LineSegments(wgeo, new T.LineBasicMaterial({ color: 0x8d969e })));

    // ── 양액기(관수 제어반 + A·B 양액 탱크) — 출입문 옆 ──
    var irr = add(new T.Group()); irr.position.set(x0 + 0.9, 0, zN - es * 1.0);
    var cab = new T.Mesh(new T.BoxGeometry(0.7, 1.3, 0.45), new T.MeshLambertMaterial({ color: 0xe5e8eb })); cab.position.y = 0.65; cab.castShadow = true; irr.add(cab);
    var scr = new T.Mesh(new T.PlaneGeometry(0.3, 0.2), new T.MeshBasicMaterial({ color: 0x1e3a5f })); scr.position.set(0, 0.95, -es * 0.23); scr.rotation.y = es > 0 ? Math.PI : 0; irr.add(scr);
    var irrLed = new T.MeshBasicMaterial({ color: 0x334155 }); var led = new T.Mesh(new T.SphereGeometry(0.03, 8, 6), irrLed); led.position.set(0.22, 1.12, -es * 0.23); irr.add(led);
    [0.55, 0.95].forEach(function (tx2, ti) { var tk2 = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.8, 14), new T.MeshLambertMaterial({ color: ti ? 0x3a6ea5 : 0xf0f0f0, transparent: true, opacity: 0.92 })); tk2.position.set(tx2, 0.4, 0); tk2.castShadow = true; irr.add(tk2); });

    // ── 온풍기 + 연통 + 비닐 덕트 ──
    var heat = null;
    if (h.heater > 0) {
      var hx = x0 + NW - 1.1, hz = zN - es * 1.3, hH = Math.min(1.35, hs * 0.75);
      var hg = add(new T.Group()); hg.position.set(hx, 0, hz);
      var hb = new T.Mesh(new T.BoxGeometry(0.85, hH, 1.6), new T.MeshLambertMaterial({ color: 0x5b6b5e })); hb.position.y = hH / 2; hb.castShadow = true; hb.receiveShadow = true; hg.add(hb);
      var louv = new T.Mesh(new T.PlaneGeometry(0.6, hH * 0.35), new T.MeshLambertMaterial({ color: 0x3a453c })); louv.position.set(0, hH * 0.72, es * 0.81); louv.rotation.y = es > 0 ? 0 : Math.PI; hg.add(louv);
      var flameM = new T.MeshBasicMaterial({ color: 0x331a0c });
      var fwin = new T.Mesh(new T.CircleGeometry(0.07, 12), flameM); fwin.position.set(-0.43, hH * 0.35, 0); fwin.rotation.y = -Math.PI / 2; hg.add(fwin);
      var burner = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.35, 12), new T.MeshLambertMaterial({ color: 0x9aa0a6 })); burner.rotation.x = Math.PI / 2; burner.position.set(0, hH * 0.35, -es * 0.95); hg.add(burner);
      // 연통: 위로 → 박공 쪽으로 → 밖에서 위로, 끝에 갓
      var chY = Math.min(hs - 0.15, hH + 1.0), chM = new T.MeshLambertMaterial({ color: 0x8b9298 });
      var c1 = cyl(0.1, chY - hH, chM, 10); c1.position.set(0.2, hH + (chY - hH) / 2, 0.3 * es); hg.add(c1);
      var run = Math.abs(zN - hz) + 0.6, c2 = cyl(0.1, run, chM, 10); c2.rotation.x = Math.PI / 2; c2.position.set(0.2, chY, 0.3 * es + es * run / 2); hg.add(c2);
      var c3 = cyl(0.1, 1.2, chM, 10); c3.position.set(0.2, chY + 0.6, 0.3 * es + es * run); hg.add(c3);
      var cap = new T.Mesh(new T.ConeGeometry(0.22, 0.18, 10), chM); cap.position.set(0.2, chY + 1.3, 0.3 * es + es * run); hg.add(cap);
      var smoke = [];
      for (k = 0; k < 7; k++) { var sm2 = new T.Sprite(new T.SpriteMaterial({ map: X.puff, color: 0xd9dde2, transparent: true, opacity: 0, depthWrite: false })); sm2.userData.base = new T.Vector3(0.2, chY + 1.45, 0.3 * es + es * run); sm2.userData.ph = k / 7; hg.add(sm2); smoke.push(sm2); }
      var glow = new T.Mesh(new T.SphereGeometry(0.5, 16, 12), new T.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.35, depthWrite: false })); glow.position.set(0, hH + 0.2, 0); hg.add(glow);
      var pl = new T.PointLight(0xff8a3d, 0, 14, 1.5); pl.position.set(0, hH + 0.4, -es * 1.0); hg.add(pl);
      // 비닐 덕트: 각 동 가운데 통로를 따라 (난방 때 부풀고, 꺼지면 납작)
      var ducts = [], ductM = new T.MeshPhongMaterial({ color: 0xf2f6f8, transparent: true, opacity: 0.8, shininess: 80 });
      var dLen = bedLen - 0.6;
      for (i = 0; i < n; i++) {
        var dxk = x0 + i * W + bedW * Math.max(1, Math.floor(rowsPer / 2));
        var dct = add(cyl(0.2, dLen, ductM, 14)); dct.rotation.x = Math.PI / 2; dct.position.set(dxk, 0.2, bedZc); dct.castShadow = true; ducts.push(dct);
      }
      heat = { glow: glow, light: pl, flame: flameM, ducts: ducts, smoke: smoke };
    }
    // ── 유동팬 (지붕 아래 매달림, 길이 방향으로 바람) ──
    var fans = [], fanM = new T.MeshLambertMaterial({ color: 0x9ea7ad }), bladeM = new T.MeshLambertMaterial({ color: 0x5f6870 });
    var nf = Math.max(1, Math.round(L / 16));
    for (i = 0; i < n; i++) for (k = 0; k < nf; k++) {
      var fg = add(new T.Group()), fy = Math.min(yAt(0.5) - 0.55, multi ? hs - 0.45 : 9);
      fg.position.set(x0 + i * W + W / 2, fy, -L / 2 + (k + 0.5) * L / nf);
      var rgf = new T.Mesh(new T.TorusGeometry(0.28, 0.03, 6, 18), fanM); fg.add(rgf);
      var hang = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, yAt(0.5) - fy, 4), fanM); hang.position.y = (yAt(0.5) - fy) / 2; fg.add(hang);
      var hub = new T.Group(); for (var bb = 0; bb < 4; bb++) { var bl2 = new T.Mesh(new T.BoxGeometry(0.06, 0.24, 0.015), bladeM); bl2.position.y = 0.13; bl2.rotation.y = 0.4; var bw = new T.Group(); bw.rotation.z = bb * Math.PI / 2; bw.add(bl2); hub.add(bw); }
      fg.add(hub); fans.push(hub);
    }
    // 환경 센서함 (가운데, 작물 높이)
    var sbx = add(new T.Mesh(new T.BoxGeometry(0.22, 0.3, 0.18), new T.MeshLambertMaterial({ color: 0xf5f5f0 }))); sbx.position.set(x0 + W / 2 + bedW * 0.5 * (rowsPer % 2 ? 1 : 0), 1.4, 0); sbx.castShadow = true;
    var sbw = add(cyl(0.006, Math.max(0.1, yAt(0.5) - 1.55), steelD, 4)); sbw.position.set(sbx.position.x, 1.55 + (yAt(0.5) - 1.55) / 2, 0);

    // 바람 흐름 화살표
    function arrow(c) { var a3 = new T.ArrowHelper(new T.Vector3(1, 0, 0), new T.Vector3(), 1.6, c, 0.55, 0.38); a3.visible = false; add(a3); return a3; }
    var arA = [arrow(0x38bdf8), arrow(0x38bdf8), arrow(0x38bdf8)], arB = [arrow(0x38bdf8), arrow(0x38bdf8), arrow(0x38bdf8)], arR = [];
    if (h.roofVent) for (i = 0; i < n; i++) arR.push(arrow(0xfb923c), arrow(0xfb923c));
    G.scene.add(grp); grp.updateMatrixWorld(true);
    G.house = grp;
    G.dims = { n: n, W: W, L: L, hs: hs, hr: hr, NW: NW, x0: x0, vh: vh, du: du, axis: axis, baseOp: baseOp };
    G.parts = { film: film, flapMat: flapMat, sides: sides, flaps: flaps, curC: curC, curO: curO, shOn: shOn, shOff: shOff, air: air, airMat: airMat, dripMat: dripMat, heat: heat, arA: arA, arB: arB, arR: arR,
      fans: fans, snowRoof: snowRoof, puddles: puddles, ditches: [env.userData['ditch-1'], env.userData.ditch1], lamp: lamp, bulbMat: bulbMat, winMat: winMat, signMat: signMat, signLight: signLight, signGlow: sgGlowMat, irrLed: irrLed, road: road, filmMap: 'film' };
    // 바람 입자 범위
    var half = Math.max(L, NW) / 2 + 18;
    G.wb = { half: half, ymax: hr + 5 };
    G.wst.forEach(function (p) { p.x = (Math.random() * 2 - 1) * half; p.z = (Math.random() * 2 - 1) * half; p.y = 0.3 + Math.random() * (hr + 4.7); });
    // 그림자 범위
    var ext = Math.max(L, NW) / 2 + 9, sc = G.sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = ext * 4 + 120; sc.updateProjectionMatrix();
    // 구름 자리
    var spread = Math.max(L, NW) * 0.7 + 30, hc = Math.max(L, NW) * 0.35 + 22;
    G.clouds.forEach(function (c, ci) { c.position.set(Math.cos(ci * 2.1 + 0.4) * spread, hc + (ci % 3) * 4, Math.sin(ci * 1.7 + 1.1) * spread - spread * 0.3); });
    // 풍향계·바람자루 자리: 가까이 보기 쪽 끝 바깥 모서리
    var mh = hr + 1.6, sp1 = grp.localToWorld(new T.Vector3(x0 + NW + 2.5, 0, es * (L / 2 - 1.5))), sp2b = grp.localToWorld(new T.Vector3(x0 - 2.5, 0, es * (L / 2 - 1.5)));
    G.sens.position.copy(sp1); G.mast.scale.y = mh; G.mast.position.y = mh / 2; G.head.position.y = mh + 0.2;
    G.shield.position.set(0, mh * 0.5, 0); G.panel.position.set(0, mh * 0.68, 0); G.logger.position.set(0, mh * 0.32, 0.1); G.conduit.scale.y = mh * 0.55; G.conduit.position.set(0.05, mh * 0.6, 0.03);
    var sh2 = Math.max(4, hs + 1.5); G.sockPole.scale.y = sh2; G.sockPole.position.set(sp2b.x, sh2 / 2, sp2b.z); G.sockYaw.position.set(sp2b.x, sh2 - 0.1, sp2b.z);
    G.sensTop = new T.Vector3(sp1.x, mh + 2.0, sp1.z);
    preset(G.orbit.preset);
  }

  // ---------- 그리기 ----------
  function place(lb, v, txt) {
    if (txt != null && lb.dataset.t !== txt) { lb.innerHTML = txt; lb.dataset.t = txt; }
    var p = v.clone().project(G.cam);
    if (p.z > 1 || p.x < -1.05 || p.x > 1.05 || p.y < -1.05 || p.y > 1.05) { lb.style.display = 'none'; return; }
    lb.style.display = ''; lb.style.left = ((p.x + 1) / 2 * 100).toFixed(2) + '%'; lb.style.top = ((1 - p.y) / 2 * 100).toFixed(2) + '%';
  }
  function draw(f, c) {
    if (!ok) return;
    if (!G) setup();
    G.cv.style.display = 'block'; G.ov.style.display = 'block';
    var svg = document.getElementById('stage'); if (svg) svg.style.display = 'none';
    if (Math.abs((G.wrap.clientWidth || 900) - G.w) > 2) resize();
    var h = c.house, g = c.geom, dt = c.dt || 0, now = Date.now();
    // 계산 결과(g)의 크기로 만든다 — 입력 직후 계산 전의 옛 크기로 그려지는 것을 막음
    var key = JSON.stringify([g.n, g.W, g.L, g.hs, g.hr, h.axis, h.cover, h.curtain, h.shade, h.shadePct, h.roofVent, h.roofW, h.ventH, h.net, h.heater, c.lai, c.stage, c.crop]);
    if (key !== G.key) { G.key = key; build(h, g, c.lai, c.stage, c.crop); }
    var d = G.dims, P = G.parts, a = d.axis * D2R, ca = Math.cos(a), sa = Math.sin(a);
    // ── 하늘·빛 ──
    var el = f.el, over = f.sky === 4 || f.pty > 0, part = f.sky === 3;
    var isRain = f.pty === 1 || f.pty === 2 || f.pty === 4, isSnow = f.pty === 2 || f.pty === 3;
    var SC = skyCols(el, over, f.pty), topC = SC.top, horC = SC.hor;
    if (el < 2 && G.bright) { topC = mixHex(topC, over ? 0x4b5568 : 0x34497a, 0.8); horC = mixHex(horC, over ? 0x5b6578 : 0x4a5d8c, 0.8); }
    if (part && !over) horC = mixHex(horC, 0xd5dbe0, 0.25);
    var dayF = clamp((el + 2) / 12, 0, 1);
    G.skyMat.uniforms.top.value.setHex(topC); G.skyMat.uniforms.hor.value.setHex(horC); G.skyMat.uniforms.sunC.value.setHex(SC.sun);
    G.skyMat.uniforms.glow.value = over ? 0.15 : el < 12 ? 1.0 : 0.45;
    G.skyMat.uniforms.gnd.value.setHex(mixHex(0x1a2214, 0x5a6a48, dayF));
    G.scene.background = null; G.scene.fog.color.setHex(horC);
    // 안개: 습도 97%↑·바람 약할 때 짙은 안개, 비·눈엔 중간
    var fogK = f.RHo >= 97 && f.ws < 2.5 ? 0.12 : isRain || isSnow ? 0.35 : over ? 0.6 : 1;
    G.scene.fog.near = 60 + 260 * fogK; G.scene.fog.far = 180 + 1400 * fogK;
    G.mtMat.color.setHex(mixHex(mixHex(0x111a17, 0x3d5a3a, dayF), horC, 0.4));
    // 밤: 달빛 정도로 은은하게, '밝게'를 누르면 구조물 확인용으로 환하게
    var mpp = G.sky && G.sky.mp, moonUp = mpp && mpp.el > 0 && !over ? mpp.illum : 0;
    G.moon.intensity = el < 2 ? (G.bright ? 0.7 : 0.08 + 0.3 * moonUp) : 0;
    G.hemi.intensity = Math.max(0.28 + 0.42 * dayF, el < 4 ? (G.bright ? 1.0 : 0.16 + 0.14 * moonUp + 0.2 * clamp((el + 8) / 10, 0, 1)) : 0) * (over ? 1.15 : 1);
    G.hemi.color.setHex(dayF > 0.3 ? mixHex(0xdfeeff, topC, 0.15) : 0x8ea2d8); G.hemi.groundColor.setHex(dayF > 0.3 ? 0x6b5d3a : 0x1c1f2a);
    var ce = Math.cos(Math.max(el, -3) * D2R), sd = new T.Vector3(ce * Math.sin(f.az * D2R), Math.sin(Math.max(el, -3) * D2R), -ce * Math.cos(f.az * D2R));
    var big = Math.max(d.L, d.NW), R = big + 60;
    if (el > 0) { G.sun.visible = true; G.sun.intensity = (0.12 + 0.95 * Math.min(1, (f.G || 0) / 750)) * (over ? 0.55 : 1); G.sun.color.setHex(SC.sun || 0xffffff); G.sun.position.copy(sd).multiplyScalar(R); G.sun.target.position.set(0, 0, 0); }
    else G.sun.visible = false;
    var tw = G.house.localToWorld(G.orbit.tl.clone());
    // 땅: 비 오면 젖어 어둡게, 눈 오면 하얗게, 맑은 새벽 2℃ 이하면 서리
    var frost = !over && f.To <= 2 && el < 12, gcol = 0xc9cfbf;
    if (f.pty === 3 || (f.pty === 2 && f.To < 1)) gcol = 0xf1f4f7; else if (isRain) gcol = 0x8f9883; else if (frost) gcol = mixHex(0xffffff, 0xe6edf5, clamp((2 - f.To) / 4, 0.3, 1));
    var snowG = f.pty === 3 || (f.pty === 2 && f.To < 1), gmap = snowG ? 'snowG' : frost ? 'frostG' : 'grass';
    if (G.groundMap !== gmap) { G.groundMap = gmap; G.groundMat.map = G.X[gmap]; G.groundMat.needsUpdate = true; }
    G.groundMat.color.setHex(snowG ? 0xf4f6f8 : frost ? 0xe9eef2 : gcol);
    P.puddles.forEach(function (pd) { pd.visible = isRain; pd.material.color.setHex(horC); });
    P.ditches.forEach(function (dc) { if (dc) dc.material.color.setHex(isRain ? 0x4f6a7a : 0x3a3f36); });
    P.road.material.color.setHex(isRain ? 0x9aa0a6 : 0xffffff); P.road.material.shininess = isRain ? 90 : 5;
    P.snowRoof.forEach(function (m) { m.visible = (f.pty === 3 || (f.pty === 2 && f.To < 1)) && !(f.Ti > 8 && !f.cur); });
    // 밤 조명: 마당 가로등·관리사 창
    var night = el < -3;
    // 간판: 해 지고 어두워지면(해 높이 0° 아래) 불이 들어오고, 해 질 녘엔 서서히 밝아짐
    var sgOn = clamp((1 - el) / 4, 0, 1);
    if (P.signMat) { P.signMat.emissive.setRGB(0.95 * sgOn, 0.95 * sgOn, 0.95 * sgOn); P.signLight.intensity = 0.9 * sgOn; P.signGlow.opacity = 0.55 * sgOn; }
    P.lamp.intensity = night ? 1.1 : 0; P.bulbMat.color.setHex(night ? 0xfff1c8 : 0x777777); P.winMat.color.setHex(night ? 0xffcf7a : mixHex(0x2b3946, horC, 0.35));
    // 구름: 맑음 2 · 구름많음 6 · 흐림/비/눈 12 (흐리면 낮고 회색)
    var nc = over ? 12 : part ? 6 : 2;
    G.cmat.color.setHex(el > -2 ? (f.pty > 0 ? 0x9ca3af : over ? 0xc9ced6 : mixHex(0xffffff, SC.sun, el < 10 ? 0.35 : 0)) : 0x3f4a5c);
    var tw0 = (Math.sin((f.wd + 180) * D2R)), tz0 = -Math.cos((f.wd + 180) * D2R), cs = 220;
    G.clouds.forEach(function (cl, i) {
      cl.visible = i < nc; if (!cl.visible) return;
      var u = cl.userData; if (u.ox == null) { u.ox = Math.cos(i * 2.1 + 0.4) * cs; u.oz = Math.sin(i * 1.7 + 1.1) * cs; }
      u.ox += tw0 * (0.6 + f.ws * 0.5) * dt; u.oz += tz0 * (0.6 + f.ws * 0.5) * dt;
      if (u.ox > cs) u.ox -= 2 * cs; if (u.ox < -cs) u.ox += 2 * cs; if (u.oz > cs) u.oz -= 2 * cs; if (u.oz < -cs) u.oz += 2 * cs;
      u.alt = (over ? 1.5 : 3) + (i % 4) * (over ? 1.2 : 1.8);  // 화면 하늘 띠 안에 보이도록 고도(°)
    });
    // 비 (1 비, 2 비/눈, 4 소나기) · 눈 (2, 3)
    var wx = Math.sin((f.wd + 180) * D2R) * f.ws, wz = -Math.cos((f.wd + 180) * D2R) * f.ws;
    G.rain.visible = isRain; G.snow.visible = isSnow;
    if (isRain) {
      var rp = G.rp, heavy = f.pty === 4 || (f.rain || 0) >= 3, nAct = heavy ? G.rst.length : Math.round(G.rst.length * 0.6), vy = 9;
      G.rst.forEach(function (q, i) {
        var j = i * 6; if (i >= nAct) { rp[j] = rp[j + 3] = 0; rp[j + 1] = rp[j + 4] = -5; rp[j + 2] = rp[j + 5] = 0; return; }
        q.y -= vy * dt; q.x += wx * 0.5 * dt; q.z += wz * 0.5 * dt;
        if (q.y < 0) { q.y += 32; q.x = (Math.random() - 0.5) * 90; q.z = (Math.random() - 0.5) * 90; }
        var k = 0.07; rp[j] = q.x; rp[j + 1] = q.y; rp[j + 2] = q.z; rp[j + 3] = q.x - wx * 0.5 * k; rp[j + 4] = q.y + vy * k; rp[j + 5] = q.z - wz * 0.5 * k;
      });
      G.rain.position.set(tw.x, 0, tw.z); G.rain.geometry.attributes.position.needsUpdate = true;
    }
    if (isSnow) {
      var spp = G.sp0, tnow = now / 1000;
      G.sst.forEach(function (q, i) {
        q.y -= 1.1 * dt; q.x += (wx * 0.7 + Math.sin(tnow + q.ph) * 0.3) * dt; q.z += (wz * 0.7 + Math.cos(tnow * 0.8 + q.ph) * 0.3) * dt;
        if (q.y < 0) { q.y += 32; q.x = (Math.random() - 0.5) * 90; q.z = (Math.random() - 0.5) * 90; }
        spp[i * 3] = q.x; spp[i * 3 + 1] = q.y; spp[i * 3 + 2] = q.z;
      });
      G.snow.position.set(tw.x, 0, tw.z); G.snow.geometry.attributes.position.needsUpdate = true;
    }
    // 풍향계: 화살촉이 바람이 불어오는 쪽을 향함, 컵은 풍속만큼 회전 · 바람자루는 바람 가는 쪽으로 펴짐
    G.vane.rotation.y = (90 - f.wd) * D2R + Math.sin(now / 700) * 0.06 * Math.min(1, f.ws / 2);
    G.cups.rotation.y -= Math.min(30, f.ws * 3.5) * dt;
    G.sockYaw.rotation.y = (90 - (f.wd + 180)) * D2R;
    var droop = (1 - Math.min(1, f.ws / 7)) * 70 * D2R; G.sockPitch.rotation.z = -droop + Math.sin(now / 300) * 0.04 * Math.min(1, f.ws / 3);
    // ── 측창·천창·커튼·차광 ──
    function side(s, o) {
      var top = 0.3 + d.vh * o, hh = Math.max(0.001, d.hs - top);
      s.top.scale.y = hh; s.top.position.y = top + hh / 2;
      s.roll.position.y = top; var rr = 1 + o * 1.8; s.roll.scale.x = rr; s.roll.scale.y = rr;
      s.rollFilm.position.y = top; s.rollFilm.scale.set(rr * 1.1, 1, rr * 1.1);
      s.motor.position.y = top;
      if (s.net) { s.net.visible = o > 0.01; s.net.scale.y = Math.max(0.001, d.vh * o); s.net.position.y = 0.3 + d.vh * o / 2; }
    }
    side(P.sides.A, f.A); side(P.sides.B, f.B);
    P.flaps.forEach(function (pv) { pv.rotation.z = pv.userData.slope + f.R * 0.95; });
    P.curC.forEach(function (m) { m.visible = !!f.cur; }); P.curO.forEach(function (m) { m.visible = !f.cur; });
    P.shOn.forEach(function (m) { m.visible = !!f.sh; }); P.shOff.forEach(function (m) { m.visible = !f.sh; });
    // 하우스 안 공기색(온도), 습도 높으면 필름에 물방울(결로)
    var fa = clamp((f.RHi - 85) / 15, 0, 1), tcol = tempColor(f.Ti);
    P.airMat.color.setRGB((tcol[0] * (1 - fa * 0.6) + 255 * fa * 0.6) / 255, (tcol[1] * (1 - fa * 0.6) + 255 * fa * 0.6) / 255, (tcol[2] * (1 - fa * 0.6) + 255 * fa * 0.6) / 255);
    P.airMat.opacity = 0.08 + 0.18 * fa;
    var wantMap = f.RHi >= 93 && (f.cond > 0 || f.Ti - f.To > 3 || el < 5) ? 'drops' : 'film';
    if (P.film.map && wantMap !== P.filmMap) { P.filmMap = wantMap; P.film.map = G.X[wantMap]; P.film.needsUpdate = true; }
    P.film.opacity = d.baseOp + (wantMap === 'drops' ? 0.25 : 0.12 * fa) + (isRain ? 0.05 : 0);
    P.film.shininess = isRain ? 140 : 70;
    var wxL = (Math.sin((f.wd + 180) * D2R) * ca - Math.cos((f.wd + 180) * D2R) * sa) * Math.min(1, f.ws / 4), wzL = (-Math.sin((f.wd + 180) * D2R) * sa - Math.cos((f.wd + 180) * D2R) * ca) * Math.min(1, f.ws / 4);
    if (P.heat) {
      var pulse = 0.85 + 0.15 * Math.sin(now / 140), on = !!f.heat;
      P.heat.glow.visible = on; P.heat.glow.scale.setScalar(pulse); P.heat.light.intensity = on ? 1.4 * pulse : 0;
      P.heat.flame.color.setHex(on ? mixHex(0xff7a1a, 0xffc04a, (Math.sin(now / 90) + 1) / 2) : 0x331a0c);
      P.heat.ducts.forEach(function (dc) { var tgt = on ? 1 : 0.22; dc.scale.x += (tgt - dc.scale.x) * Math.min(1, dt * 1.5 + 0.02); dc.scale.z = dc.scale.x; dc.position.y = 0.2 * dc.scale.x + 0.02; });
      P.heat.smoke.forEach(function (sm) { var t = ((now / 4000) + sm.userData.ph) % 1, b = sm.userData.base; sm.material.opacity = on ? 0.32 * (1 - t) * Math.min(1, t * 6) : 0; sm.position.set(b.x + wxL * t * 1.6, b.y + t * 2.2, b.z + wzL * t * 1.6); sm.scale.setScalar(0.3 + t * 1.1); });
    }
    P.dripMat.color.setHex(f.irr > 0 ? 0x3aa6d0 : 0x334155); P.irrLed.color.setHex(f.irr > 0 ? 0x22d3ee : f.heat ? 0xf59e0b : 0x22c55e);
    P.fans.forEach(function (hb2) { hb2.rotation.z += (f.Gv > 0.3 || f.heat || f.cur ? 14 : 4) * dt; });
    // 창으로 드나드는 바람
    var to = (f.wd + 180) * D2R, vx = Math.sin(to), vz = -Math.cos(to), lxw = vx * ca + vz * sa, dirX = lxw >= 0 ? 1 : -1;
    var flowOn = f.Gv > 0.3, zc = G.orbit.zc || 0;
    [['A', f.A, P.arA], ['B', f.B, P.arB]].forEach(function (s) {
      var sd2 = P.sides[s[0]], o = s[1];
      s[2].forEach(function (ar, k) {
        ar.visible = flowOn && o > 0.02; if (!ar.visible) return;
        var z = clamp(zc + (k - 1) * Math.min(5, d.L / 4), -d.L / 2 + 1, d.L / 2 - 1);
        ar.position.set(sd2.x - dirX * 0.9, 0.3 + d.vh * o / 2, z); ar.setDirection(new T.Vector3(dirX, 0, 0));
      });
    });
    P.arR.forEach(function (ar, k) {
      ar.visible = flowOn && f.R > 0.02; if (!ar.visible) return;
      var span = Math.floor(k / 2), xc = d.x0 + span * d.W + d.W / 2 + d.du * d.W * 0.5;
      ar.position.set(xc, d.hr - 0.4, clamp(zc + (k % 2 ? 3 : -3), -d.L / 2 + 1, d.L / 2 - 1)); ar.setDirection(new T.Vector3(0, 1, 0));
    });
    // 바람 입자
    var wb = G.wb, mv = f.ws * 2.2 * dt, wp = G.wp, ln = 0.6 + f.ws * 0.45;
    G.wind.visible = f.ws > 0.3; G.wind.material.opacity = clamp(0.15 + f.ws / 8, 0.15, 0.8) * (dayF > 0.2 ? 1 : 0.5);
    G.wst.forEach(function (p, i) {
      p.x += vx * mv; p.z += vz * mv;
      if (p.x > wb.half) p.x -= 2 * wb.half; if (p.x < -wb.half) p.x += 2 * wb.half;
      if (p.z > wb.half) p.z -= 2 * wb.half; if (p.z < -wb.half) p.z += 2 * wb.half;
      var lx = p.x * ca + p.z * sa, lz = -p.x * sa + p.z * ca, j = i * 6;
      var inside = Math.abs(lx) < d.NW / 2 + 0.3 && Math.abs(lz) < d.L / 2 + 0.3 && p.y < d.hr + 0.4;
      var l = inside ? 0 : ln * p.l;
      wp[j] = p.x; wp[j + 1] = p.y; wp[j + 2] = p.z; wp[j + 3] = p.x - vx * l; wp[j + 4] = p.y; wp[j + 5] = p.z - vz * l;
    });
    G.wind.geometry.attributes.position.needsUpdate = true;
    // 카메라
    var o = G.orbit, ce2 = Math.cos(o.el * D2R);
    G.cam.position.set(tw.x + o.dist * ce2 * Math.sin(o.az * D2R), tw.y + o.dist * Math.sin(o.el * D2R), tw.z - o.dist * ce2 * Math.cos(o.az * D2R));
    if (G.cam.position.y < 0.6) G.cam.position.y = 0.6;
    G.cam.lookAt(tw); G.cam.updateMatrixWorld();
    // 하늘: 해·달·구름·별은 카메라 기준 먼 곳에 둠. 방위는 실제, 높이는 화면 하늘 띠에 보이도록 줄여서 그림
    var cp = G.cam.position, SKYR = 260;
    G.skyDome.position.copy(cp); G.mountains.position.set(cp.x, 0, cp.z);
    function skyAt(az, alt, rr) { var ce3 = Math.cos(alt * D2R); return new T.Vector3(cp.x + rr * ce3 * Math.sin(az * D2R), cp.y + rr * Math.sin(alt * D2R), cp.z - rr * ce3 * Math.cos(az * D2R)); }
    // 화면 위 끝이 카메라 수평선 위 약 10° 이므로, 실제 0~90°를 1.5~7.5°로 줄여 늘 보이게
    function dispAlt(e) { var top = 25 - G.orbit.el; return Math.max(1.5, Math.min(top - 2.5, 1.5 + Math.max(0, Math.min(90, e)) / 90 * (top - 4))); }
    G.sunBall.visible = G.sunHalo.visible = el > -1;
    var sdisp = skyAt(f.az, el > -1 ? dispAlt(el) : el, 1);
    G.skyMat.uniforms.sunD.value.set(sdisp.x - cp.x, Math.max(-0.2, sdisp.y - cp.y), sdisp.z - cp.z);
    if (el > -1) { G.sunBall.position.copy(skyAt(f.az, dispAlt(el), SKYR)); G.sunHalo.position.copy(G.sunBall.position); }
    G.sunBall.material.color.setHex(el < 8 ? 0xffa94d : 0xfff3c4); G.sunHalo.material.color.setHex(el < 8 ? 0xffb070 : 0xfff0b0); G.sunHalo.material.opacity = over ? 0.1 : 0.3;
    var cc = COORD(), mp = moonPos(cc[0], cc[1], f.t), mk = Math.round(mp.illum * 20) + (mp.waxing ? 'w' : 'n');
    if (mk !== G.moonKey) { G.moonKey = mk; G.moonSpr.material.map.dispose(); G.moonSpr.material.map = moonTexture(mp.illum, mp.waxing); G.moonSpr.material.needsUpdate = true; }
    G.moonSpr.visible = mp.el > -1 && mp.illum > 0.03 && !over;
    if (G.moonSpr.visible) { G.moonSpr.position.copy(skyAt(mp.az, dispAlt(mp.el), SKYR)); G.moonSpr.material.opacity = el > 5 ? 0.5 : over ? 0.6 : 1; }
    G.stars.visible = el < -6 && !over; G.stars.position.set(cp.x, 0, cp.z); G.stars.material.opacity = clamp((-el - 6) / 8, 0, 1) * 0.9;
    G.clouds.forEach(function (cl) { if (!cl.visible) return; var u = cl.userData, rr = Math.max(130, Math.hypot(u.ox, u.oz) + 110); cl.position.copy(skyAt(Math.atan2(u.ox, -u.oz) / D2R, u.alt, rr)); cl.scale.setScalar(rr / 80); });
    G.sky = { mp: mp };
    G.r.render(G.scene, G.cam);
    // 글자
    var nA = (d.axis + 270) % 360, nB = (d.axis + 90) % 360, L = G.lbs, H = G.house;
    function lw(x, y, z) { return H.localToWorld(new T.Vector3(x, y, z)); }
    place(L['in'], lw(0, d.hs * 0.55, zc), '안 <b>' + f1(f.Ti) + '℃</b><br>습도 ' + Math.round(f.RHi) + '%' + (f.RHi >= 90 ? ' ⚠' : ''));
    place(L.A, lw(-d.NW / 2 - 0.4, 0.3 + d.vh * 0.5, zc), dir8(nA) + ' 측창 ' + Math.round(f.A * 100) + '%');
    place(L.B, lw(d.NW / 2 + 0.4, 0.3 + d.vh * 0.5, zc), dir8(nB) + ' 측창 ' + Math.round(f.B * 100) + '%');
    if (c.house.roofVent) place(L.R, lw(d.x0 + d.W / 2, d.hr + 0.9, zc), '천창 ' + Math.round(f.R * 100) + '%'); else L.R.style.display = 'none';
    if (G.sunBall.visible) place(L.sun, G.sunBall.position.clone().add(new T.Vector3(0, -13, 0)), '☀ 해 ' + dir8(f.az) + ' ' + Math.round(el) + '°'); else L.sun.style.display = 'none';
    if (G.moonSpr.visible) place(L.mo, G.moonSpr.position.clone().add(new T.Vector3(0, -15, 0)), '🌙 ' + G.sky.mp.name + ' ' + Math.round(G.sky.mp.el) + '°'); else L.mo.style.display = 'none';
    place(L.ws, G.sensTop, '💨 ' + dir16(f.wd) + '풍 ' + f1(f.ws) + 'm/s');
    if (f.irr > 0) place(L.irr, lw(0, 0.4, zc + 2), '💧 관수'); else L.irr.style.display = 'none';
    var rc = big / 2 + 8;
    place(L.N, new T.Vector3(0, 0.2, -rc)); place(L.E, new T.Vector3(rc, 0.2, 0)); place(L.S, new T.Vector3(0, 0.2, rc)); place(L.W, new T.Vector3(-rc, 0.2, 0));
    var taken = [];
    [G.hud, G.ov.querySelector('.bt')].forEach(function (e) { if (e.offsetParent !== null) taken.push(e.getBoundingClientRect()); });
    ['in', 'R', 'A', 'B', 'ws', 'sun', 'mo', 'irr', 'N', 'E', 'S', 'W'].forEach(function (k) {
      var e = L[k]; if (e.style.display === 'none') return;
      var r = e.getBoundingClientRect();
      for (var i = 0; i < taken.length; i++) { var t = taken[i]; if (r.left < t.right + 2 && r.right > t.left - 2 && r.top < t.bottom + 2 && r.bottom > t.top - 2) { e.style.display = 'none'; return; } }
      taken.push(r);
    });
    var wxn = f.pty === 1 ? '🌧 비' : f.pty === 2 ? '🌨 비/눈' : f.pty === 3 ? '❄ 눈' : f.pty === 4 ? '🌦 소나기' : f.sky === 4 ? '☁ 흐림' : f.sky === 3 ? '⛅ 구름많음' : '☀ 맑음';
    var extra = frost && el < 12 ? '<br>❄ 서리 가능 (바깥 ' + f1(f.To) + '℃)' : f.RHo >= 97 && f.ws < 2.5 ? '<br>🌫 안개' : '';
    var hud = '🕒 ' + tlabel(f.t) + ' · ' + wxn + '<br>바깥 ' + f1(f.To) + '℃ · ' + Math.round(f.RHo) + '%<br>☀ 일사 ' + Math.round(f.G) + ' W/m²' + (el > 0 ? ' · 해 ' + dir8(f.az) + ' ' + Math.round(el) + '°' : '') + (G.sky.mp.el > 0 ? '<br>🌙 ' + G.sky.mp.name + ' ' + dir8(G.sky.mp.az) + ' ' + Math.round(G.sky.mp.el) + '°' : '') + '<br>💨 ' + dir16(f.wd) + '풍 ' + f1(f.ws) + ' m/s' + extra;
    if (G.hud.dataset.t !== hud) { G.hud.innerHTML = hud; G.hud.dataset.t = hud; }
  }
  function hide() {
    if (G) { G.cv.style.display = 'none'; G.ov.style.display = 'none'; }
    var svg = document.getElementById('stage'); if (svg) svg.style.display = '';
  }
  // 3D / 단면 전환 버튼
  function initBtn() {
    var b = document.getElementById('view3d'); if (!b) return;
    if (!ok) { b.style.display = 'none'; return; }
    b.style.display = '';
    function lab() { b.textContent = mode === '3d' ? '단면으로 보기' : '3D로 보기'; }
    lab();
    b.onclick = function () { mode = mode === '3d' ? '2d' : '3d'; ls('farmily.sim.view', mode); if (mode === '2d') hide(); lab(); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBtn); else initBtn();
  root.FSIM3D = { active: function () { return ok && mode === '3d'; }, draw: draw, hide: hide };
})(window);
