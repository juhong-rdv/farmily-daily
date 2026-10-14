/* farmily-daily : 우리 하우스 시뮬레이션 3D 화면 (three.js r128)
   sim.js 가 프레임마다 FSIM3D.draw(f, ctx) 를 부릅니다. WebGL 이 안 되면 기존 단면 그림을 씁니다. */
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
    // 밝은 부분 = 바깥 반원 + 위상만큼의 타원 (상현 쪽은 오른쪽이 밝음)
    var k = 1 - 2 * illum, right = waxing;
    x.fillStyle = '#f8f5e6'; x.beginPath();
    x.ellipse(64, 64, 58, 58, 0, -Math.PI / 2, Math.PI / 2, !right);
    x.ellipse(64, 64, Math.max(0.5, Math.abs(k) * 58), 58, 0, Math.PI / 2, -Math.PI / 2, right ? k > 0 : k < 0);
    x.fill();
    return new T.CanvasTexture(c);
  }
  var G = null;

  // ---------- 화면 준비 ----------
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
    var scene = new T.Scene();
    scene.fog = new T.Fog(0xa9d6f5, 200, 600);
    var cam = new T.PerspectiveCamera(50, 16 / 9, 0.2, 3000);
    var hemi = new T.HemisphereLight(0xeaf4ff, 0x6b5a3a, 0.6); scene.add(hemi);
    var sun = new T.DirectionalLight(0xffffff, 1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006;
    scene.add(sun); scene.add(sun.target);
    var moon = new T.DirectionalLight(0xc7d2fe, 0); moon.position.set(-60, 90, 50); scene.add(moon);
    var ground = new T.Mesh(new T.PlaneGeometry(2000, 2000), new T.MeshLambertMaterial({ color: 0x7d9a52 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    var sunBall = new T.Mesh(new T.SphereGeometry(5, 24, 16), new T.MeshBasicMaterial({ color: 0xffd54a, fog: false }));
    var sunHalo = new T.Mesh(new T.SphereGeometry(9, 24, 16), new T.MeshBasicMaterial({ color: 0xffe08a, fog: false, transparent: true, opacity: 0.3 }));
    scene.add(sunBall); scene.add(sunHalo);
    var moonSpr = new T.Sprite(new T.SpriteMaterial({ map: moonTexture(0.5, true), fog: false, transparent: true, depthWrite: false })); moonSpr.scale.set(16, 16, 1); scene.add(moonSpr);
    var NSt = 500, stp = new Float32Array(NSt * 3);
    for (var si = 0; si < NSt; si++) { var th = Math.random() * Math.PI * 2, ph2 = Math.asin(Math.random() * 0.98 + 0.02); stp[si * 3] = Math.cos(ph2) * Math.cos(th) * 700; stp[si * 3 + 1] = Math.sin(ph2) * 700; stp[si * 3 + 2] = Math.cos(ph2) * Math.sin(th) * 700; }
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
    var rain = new T.LineSegments(rg, new T.LineBasicMaterial({ color: 0xc7dcf5, transparent: true, opacity: 0.7 })); rain.frustumCulled = false; scene.add(rain);
    var NS = 1600, sp0 = new Float32Array(NS * 3), sst = [];
    for (i = 0; i < NS; i++) sst.push({ x: (Math.random() - 0.5) * 90, y: Math.random() * 32, z: (Math.random() - 0.5) * 90, ph: Math.random() * 6.28 });
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp0, 3));
    var snow = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.95 })); snow.frustumCulled = false; scene.add(snow);
    // 풍향·풍속계 (프로펠러형) + 바람자루(공항식)
    var metal = new T.MeshLambertMaterial({ color: 0x9ca3af }), dark = new T.MeshLambertMaterial({ color: 0x374151 });
    var sens = new T.Group(); scene.add(sens);
    var mast = new T.Mesh(new T.CylinderGeometry(0.05, 0.07, 1, 8), metal); mast.position.y = 0.5; sens.add(mast); mast.castShadow = true;
    var head = new T.Group(); head.scale.setScalar(2.2); sens.add(head);
    var body = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.6, 10), dark); body.rotation.z = Math.PI / 2; head.add(body);
    var nose = new T.Mesh(new T.ConeGeometry(0.09, 0.25, 10), dark); nose.rotation.z = -Math.PI / 2; nose.position.x = 0.42; head.add(nose);
    var tail = new T.Mesh(new T.BoxGeometry(0.7, 0.4, 0.02), new T.MeshLambertMaterial({ color: 0xf8fafc })); tail.position.x = -0.6; tail.position.y = 0.05; head.add(tail);
    var prop = new T.Group(); prop.position.x = 0.55; head.add(prop);
    for (i = 0; i < 4; i++) { var bl = new T.Mesh(new T.BoxGeometry(0.02, 0.42, 0.07), new T.MeshLambertMaterial({ color: 0xf97316 })); bl.position.y = 0.21; var bg2 = new T.Group(); bg2.rotation.x = i * Math.PI / 2; bg2.add(bl); prop.add(bg2); }
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
    G = { moon: moon, moonSpr: moonSpr, stars: stars, moonKey: '', bright: ls('farmily.sim.bright') === '1', wrap: wrap, r: r, cv: cv, ov: ov, scene: scene, cam: cam, hemi: hemi, sun: sun, sunBall: sunBall, sunHalo: sunHalo, clouds: clouds, cmat: cmat,
      rain: rain, rp: rp, rst: rst, snow: snow, sp0: sp0, sst: sst, sens: sens, head: head, prop: prop, mast: mast, sockPole: sockPole, sockYaw: sockYaw, sockPitch: sockPitch, ground: ground, wind: wind, wp: wp, wst: wst, lbs: lbs, hud: ov.querySelector('#o3hud'), house: null, key: '', w: 0,
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
  function zoom(k) { if (!G.dims) return; G.orbit.dist = clamp(G.orbit.dist * k, 3, Math.max(G.dims.L, G.dims.NW) * 3 + 40); }
  var PRESETS = ['가까이', '전체', '위에서'];
  function preset(p) {
    var d = G.dims, o = G.orbit, big = Math.max(d.L, d.NW);
    o.preset = p;
    // 늘 북쪽에서 남쪽(한낮의 해 쪽)을 바라봄 — 하우스의 북쪽 끝을 가까이
    var ca0 = Math.cos(d.axis * D2R), es = ca0 >= 0 ? -1 : 1;
    if (p === 0) { o.zc = es * (d.L / 2 - Math.min(d.L / 2, d.NW * 0.9 + 4)) * Math.abs(ca0); o.tl.set(0, d.hr * 0.75, o.zc); o.az = 5; o.el = 15; o.dist = Math.max(d.NW * 2.4, d.hr * 6, 16); }
    else if (p === 1) { o.zc = 0; o.tl.set(0, d.hr * 0.6, 0); o.az = 15; o.el = 18; o.dist = big * 1.05 + 10; }
    else { o.zc = 0; o.tl.set(0, 0, 0); o.az = d.axis + 180 + 1; o.el = 82; o.dist = big * 1.15 + 8; }
    G.ov.querySelector('#o3p').textContent = '시점: ' + PRESETS[p];
  }

  // ---------- 하우스 만들기 ----------
  function dispose(o) { o.traverse(function (m) { if (m.geometry) m.geometry.dispose(); if (m.material) { (Array.isArray(m.material) ? m.material : [m.material]).forEach(function (x) { x.dispose(); }); } }); }
  function build(h, g, lai, stage, crop) {
    if (G.house) { G.scene.remove(G.house); dispose(G.house); }
    var axis = (h.axis || 0) % 180, grp = new T.Group(); grp.rotation.y = -axis * D2R;
    var n = g.n, W = g.W, L = g.L, hs = g.hs, hr = g.hr, NW = n * W, x0 = -NW / 2;
    var vh = Math.max(0.1, Math.min(h.ventH, hs - 0.3)), du = Math.min(0.35, (h.roofW || 0.6) / W), rl = L * 0.85;
    var baseOp = h.cover === 'glass' ? 0.13 : h.cover === 'po2' ? 0.3 : 0.22;
    var film = new T.MeshPhongMaterial({ color: 0xeef6ff, transparent: true, opacity: baseOp, side: T.DoubleSide, depthWrite: false, shininess: 80 });
    function yAt(u) { return hs + (hr - hs) * 4 * u * (1 - u); }
    function patch(xs, u0, u1, z0, z1, off) {
      var seg = 14, pos = [], idx = [];
      for (var k = 0; k <= seg; k++) { var u = u0 + (u1 - u0) * k / seg, x = xs + u * W, y = yAt(u) + (off || 0); pos.push(x, y, z0, x, y, z1); }
      for (k = 0; k < seg; k++) { var a = 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
    }
    function add(o) { grp.add(o); return o; }
    // 단면 모양
    var sh = new T.Shape(); sh.moveTo(x0, 0); sh.lineTo(x0, hs);
    for (var i = 0; i < n; i++) for (var k = 1; k <= 16; k++) { var u = k / 16; sh.lineTo(x0 + i * W + u * W, yAt(u)); }
    sh.lineTo(x0 + NW, 0); sh.lineTo(x0, 0);
    // 바닥·멀칭
    var floor = add(new T.Mesh(new T.PlaneGeometry(NW, L), new T.MeshLambertMaterial({ color: 0x5b4636 }))); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; floor.receiveShadow = true;
    // 지붕 (천창 자리는 비워 둠)
    var flaps = [], flapMat = new T.MeshPhongMaterial({ color: 0xe6f0fa, transparent: true, opacity: 0.38, side: T.DoubleSide, depthWrite: false });
    for (i = 0; i < n; i++) {
      var xs = x0 + i * W, xc = xs + W / 2;
      if (h.roofVent) {
        add(new T.Mesh(patch(xs, 0, 0.5, -L / 2, L / 2), film));
        add(new T.Mesh(patch(xs, 0.5, 0.5 + du, -L / 2, -rl / 2), film));
        add(new T.Mesh(patch(xs, 0.5, 0.5 + du, rl / 2, L / 2), film));
        add(new T.Mesh(patch(xs, 0.5 + du, 1, -L / 2, L / 2), film));
        var px = xs + (0.5 + du) * W, py = yAt(0.5 + du), len = Math.hypot(px - xc, py - hr), slope = Math.atan2(py - hr, px - xc);
        var pv = new T.Group(); pv.position.set(xc, hr, 0); pv.userData.slope = slope;
        var fm = new T.Mesh(new T.BoxGeometry(len, 0.04, rl), flapMat); fm.position.x = len / 2; pv.add(fm);
        var fe = new T.LineSegments(new T.EdgesGeometry(fm.geometry), new T.LineBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.8 })); fe.position.x = len / 2; pv.add(fe);
        add(pv); flaps.push(pv);
      } else add(new T.Mesh(patch(xs, 0, 1, -L / 2, L / 2), film));
    }
    // 양쪽 박공
    [-1, 1].forEach(function (s) { var gm = add(new T.Mesh(new T.ShapeGeometry(sh), film)); gm.position.z = s * L / 2; });
    // 측창 (아래 0.3m 고정, 그 위로 감아 올림)
    var pg = new T.PlaneGeometry(1, 1); pg.rotateY(Math.PI / 2);
    var cg = new T.CylinderGeometry(0.06, 0.06, 1, 10); cg.rotateX(Math.PI / 2);
    var rollMat = new T.MeshLambertMaterial({ color: 0xe2e8f0 }), netMat = new T.MeshBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.2, side: T.DoubleSide, depthWrite: false });
    function sideSet(sg) {
      var x = sg * NW / 2, b = add(new T.Mesh(pg, film)); b.scale.set(1, 0.3, L); b.position.set(x, 0.15, 0);
      var top = add(new T.Mesh(pg, film)); top.position.x = x;
      var roll = add(new T.Mesh(cg, rollMat)); roll.position.x = x + sg * 0.05; roll.scale.z = L; roll.castShadow = true;
      var net = h.net ? add(new T.Mesh(pg, netMat)) : null; if (net) { net.position.x = x; net.scale.z = L; }
      top.scale.z = L;
      return { x: x, top: top, roll: roll, net: net };
    }
    var sides = { A: sideSet(-1), B: sideSet(1) };
    // 뼈대 (아치 파이프·서까래)
    var lp = [], nz = Math.max(2, Math.round(L / 1.2));
    for (var a = 0; a <= nz; a++) {
      var z = -L / 2 + a * L / nz;
      lp.push(x0, 0, z, x0, hs, z, x0 + NW, 0, z, x0 + NW, hs, z);
      for (i = 0; i < n; i++) { var pu = 0; for (k = 1; k <= 12; k++) { var uu = k / 12; lp.push(x0 + i * W + pu * W, yAt(pu), z, x0 + i * W + uu * W, yAt(uu), z); pu = uu; } if (i > 0) lp.push(x0 + i * W, 0, z, x0 + i * W, hs, z); }
    }
    for (i = 0; i <= n; i++) lp.push(x0 + i * W, hs, -L / 2, x0 + i * W, hs, L / 2);
    for (i = 0; i < n; i++) lp.push(x0 + i * W + W / 2, hr, -L / 2, x0 + i * W + W / 2, hr, L / 2);
    var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(lp, 3));
    add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0xd8dee6, transparent: true, opacity: 0.75 })));
    // 양 끝 아치를 굵게 (동 수가 잘 보이도록)
    var tubeMat = new T.MeshLambertMaterial({ color: 0xf1f5f9 });
    [-L / 2, L / 2].forEach(function (z) {
      for (var i2 = 0; i2 < n; i2++) {
        var pts = []; for (var k2 = 0; k2 <= 16; k2++) { var u2 = k2 / 16; pts.push(new T.Vector3(x0 + i2 * W + u2 * W, yAt(u2), z)); }
        add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, 0.05, 6, false), tubeMat));
      }
      for (i2 = 0; i2 <= n; i2++) { var po = add(new T.Mesh(new T.CylinderGeometry(0.05, 0.05, hs, 6), tubeMat)); po.position.set(x0 + i2 * W, hs / 2, z); }
    });
    // 보온커튼
    var curC = null, curO = null;
    if (h.curtain !== 'none') {
      var cm = new T.MeshLambertMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0.9, side: T.DoubleSide });
      curC = add(new T.Mesh(new T.PlaneGeometry(NW - 0.1, L - 0.1), cm)); curC.rotation.x = -Math.PI / 2; curC.position.y = hs - 0.08;
      curO = add(new T.Mesh(new T.BoxGeometry(0.3, 0.18, L - 0.2), cm)); curO.position.set(x0 + NW - 0.3, hs - 0.15, 0);
    }
    // 차광막 (지붕 바깥)
    var shOn = [], shOff = null;
    if (h.shade) {
      var sm = new T.MeshLambertMaterial({ color: 0x111827, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false });
      for (i = 0; i < n; i++) { var sp = add(new T.Mesh(patch(x0 + i * W, 0, 1, -L / 2, L / 2, 0.3), sm)); sp.castShadow = true; shOn.push(sp); }
      shOff = add(new T.Mesh(new T.CylinderGeometry(0.07, 0.07, L, 10), new T.MeshLambertMaterial({ color: 0x6b7280 }))); shOff.rotation.x = Math.PI / 2; shOff.position.set(x0 + 0.15, hs + 0.12, 0);
    }
    // 하우스 안 공기 (온도 색)
    var airMat = new T.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.14, depthWrite: false, side: T.DoubleSide });
    var ag = new T.ExtrudeGeometry(sh, { depth: L - 0.4, bevelEnabled: false }); ag.translate(0, 0, -(L - 0.4) / 2);
    var air = add(new T.Mesh(ag, airMat)); air.scale.set(0.985, 0.975, 1);
    // 작물 줄·점적
    var rowsPer = Math.max(2, Math.round(W / 1.6)), ph = Math.min(hs * 0.95, 0.5 + lai * 0.55), xsRow = [];
    for (i = 0; i < n; i++) for (k = 0; k < rowsPer; k++) xsRow.push(x0 + i * W + (k + 0.5) * W / rowsPer);
    var step = Math.max(0.6, xsRow.length * (L - 2) / 2400), perRow = Math.max(1, Math.floor((L - 2) / step)), np = xsRow.length * perRow;
    var mulch = new T.MeshLambertMaterial({ color: 0x1f2937 }), dripMat = new T.MeshBasicMaterial({ color: 0x334155 });
    xsRow.forEach(function (x) {
      var m = add(new T.Mesh(new T.PlaneGeometry(0.7, L - 1.4), mulch)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, 0); m.receiveShadow = true;
      var dp = add(new T.Mesh(new T.BoxGeometry(0.035, 0.035, L - 1.6), dripMat)); dp.position.set(x + 0.15, 0.05, 0);
    });
    var plGeo = new T.CylinderGeometry(0.03, 0.04, 1, 5); plGeo.translate(0, 0.5, 0);
    var plants = add(new T.InstancedMesh(plGeo, new T.MeshLambertMaterial({ color: 0x4d7c2a }), np));
    var lfGeo = new T.IcosahedronGeometry(0.26, 0), NL = 4;
    var leaves = add(new T.InstancedMesh(lfGeo, new T.MeshLambertMaterial({ color: 0xffffff }), np * NL)); leaves.castShadow = true; leaves.receiveShadow = true;
    var LC = [0x3f8a2a, 0x4d9a33, 0x5aa83c, 0x37802a], lq = 0;
    var nf = stage === 'harvest' ? 3 : stage === 'flower' ? 1 : 0, fr = null;
    if (nf) fr = add(new T.InstancedMesh(new T.SphereGeometry(stage === 'harvest' ? (crop === 'cherry' ? 0.04 : 0.075) : 0.05, 8, 6), new T.MeshLambertMaterial({ color: 0xffffff }), np * nf));
    var dm = new T.Object3D(), col = new T.Color(), c3 = [0xdc2626, 0xf97316, 0x84cc16], q = 0;
    xsRow.forEach(function (x, ri) {
      for (var j = 0; j < perRow; j++) {
        var z = -L / 2 + 1 + (j + 0.5) * step, s = 0.9 + 0.2 * ((j * 7 + ri * 3) % 5) / 4, id = ri * perRow + j;
        dm.position.set(x, 0, z); dm.rotation.set(0, j * 1.3, 0); dm.scale.set(1, ph * s, 1); dm.updateMatrix(); plants.setMatrixAt(id, dm.matrix);
        for (var lv = 0; lv < NL; lv++) {
          var hy = ph * s * (0.22 + lv * 0.24), w2 = 1.15 - lv * 0.12;
          dm.position.set(x + (lv % 2 ? 0.07 : -0.07), hy, z + (lv % 2 ? -0.05 : 0.05)); dm.rotation.set(lv * 0.7, j * 1.3 + lv * 1.1, 0); dm.scale.set(w2, 0.75, w2); dm.updateMatrix();
          leaves.setMatrixAt(lq, dm.matrix); leaves.setColorAt(lq, col.setHex(LC[(j + lv + ri) % 4])); lq++;
        }
        for (var e = 0; fr && e < nf; e++) {
          dm.position.set(x + (e % 2 ? -0.2 : 0.2), ph * (nf === 1 ? 0.6 : 0.25 + e * 0.15), z + (e - 1) * 0.08); dm.rotation.set(0, 0, 0); dm.scale.set(1, 1, 1); dm.updateMatrix();
          fr.setMatrixAt(q, dm.matrix); fr.setColorAt(q, col.setHex(nf === 1 ? 0xfacc15 : c3[e])); q++;
        }
      }
    });
    plants.instanceMatrix.needsUpdate = true; leaves.instanceMatrix.needsUpdate = true; if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true; if (fr) { fr.instanceMatrix.needsUpdate = true; if (fr.instanceColor) fr.instanceColor.needsUpdate = true; }
    // 난방기
    var heat = null;
    if (h.heater > 0) {
      var hx = x0 + NW - 1.0, hz = L / 2 - 2.5;
      var hb = add(new T.Mesh(new T.BoxGeometry(1.0, 0.9, 0.7), new T.MeshLambertMaterial({ color: 0x475569 }))); hb.position.set(hx, 0.45, hz); hb.castShadow = true;
      var glow = add(new T.Mesh(new T.SphereGeometry(0.55, 16, 12), new T.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.6 }))); glow.position.set(hx, 1.15, hz);
      var pl = new T.PointLight(0xff8a3d, 0, 16); pl.position.set(hx, 1.3, hz); add(pl);
      heat = { glow: glow, light: pl };
    }
    // 바람 흐름 화살표
    function arrow(c) { var a = new T.ArrowHelper(new T.Vector3(1, 0, 0), new T.Vector3(), 1.6, c, 0.55, 0.38); a.visible = false; add(a); return a; }
    var arA = [arrow(0x38bdf8), arrow(0x38bdf8), arrow(0x38bdf8)], arB = [arrow(0x38bdf8), arrow(0x38bdf8), arrow(0x38bdf8)], arR = [];
    if (h.roofVent) for (i = 0; i < n; i++) arR.push(arrow(0xfb923c), arrow(0xfb923c));
    G.scene.add(grp); grp.updateMatrixWorld(true);
    G.house = grp;
    G.dims = { n: n, W: W, L: L, hs: hs, hr: hr, NW: NW, x0: x0, vh: vh, du: du, axis: axis, baseOp: baseOp };
    G.parts = { film: film, sides: sides, flaps: flaps, curC: curC, curO: curO, shOn: shOn, shOff: shOff, air: air, airMat: airMat, dripMat: dripMat, heat: heat, arA: arA, arB: arB, arR: arR };
    // 바람 입자 범위
    var half = Math.max(L, NW) / 2 + 18;
    G.wb = { half: half, ymax: hr + 5 };
    G.wst.forEach(function (p) { p.x = (Math.random() * 2 - 1) * half; p.z = (Math.random() * 2 - 1) * half; p.y = 0.3 + Math.random() * (hr + 4.7); });
    // 그림자 범위
    var ext = Math.max(L, NW) / 2 + 6, sc = G.sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = ext * 4 + 100; sc.updateProjectionMatrix();
    G.scene.fog.near = Math.max(L, NW) * 1.5 + 80; G.scene.fog.far = G.scene.fog.near + 400;
    // 구름 자리
    var spread = Math.max(L, NW) * 0.7 + 30, hc = Math.max(L, NW) * 0.35 + 22;
    G.clouds.forEach(function (c, ci) { c.position.set(Math.cos(ci * 2.1 + 0.4) * spread, hc + (ci % 3) * 4, Math.sin(ci * 1.7 + 1.1) * spread - spread * 0.3); });
    // 풍향계·바람자루 자리: 가까이 보기 쪽 끝 바깥 모서리
    var mh = hr + 1.6, es0 = Math.cos(axis * D2R) >= 0 ? -1 : 1, sp1 = grp.localToWorld(new T.Vector3(x0 + NW + 2.5, 0, es0 * (L / 2 - 1.5))), sp2 = grp.localToWorld(new T.Vector3(x0 - 2.5, 0, es0 * (L / 2 - 1.5)));
    G.sens.position.copy(sp1); G.mast.scale.y = mh; G.mast.position.y = mh / 2; G.head.position.y = mh + 0.2;
    var sh2 = Math.max(4, hs + 1.5); G.sockPole.scale.y = sh2; G.sockPole.position.set(sp2.x, sh2 / 2, sp2.z); G.sockYaw.position.set(sp2.x, sh2 - 0.1, sp2.z);
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
    var h = c.house, g = c.geom, dt = c.dt || 0;
    // 계산 결과(g)의 크기로 만든다 — 입력 직후 계산 전의 옛 크기로 그려지는 것을 막음
    var key = JSON.stringify([g.n, g.W, g.L, g.hs, g.hr, h.axis, h.cover, h.curtain, h.shade, h.roofVent, h.roofW, h.ventH, h.net, h.heater, c.lai, c.stage, c.crop]);
    if (key !== G.key) { G.key = key; build(h, g, c.lai, c.stage, c.crop); }
    var d = G.dims, P = G.parts, a = d.axis * D2R, ca = Math.cos(a), sa = Math.sin(a);
    // 하늘·빛
    var el = f.el, over = f.sky === 4 || f.pty > 0;
    var bg = el > 8 ? 0xa9d6f5 : el > -2 ? 0xf5c08a : el > -8 ? 0x4a4f7d : 0x0d1733;
    if (over) bg = el > -2 ? (f.pty === 3 || f.pty === 2 ? 0xd3d8de : f.pty > 0 ? 0x9aa3ad : 0xb4bcc4) : 0x1c2333;
    if (el < 2 && G.bright) bg = over ? 0x4b5568 : 0x34497a;
    G.scene.background = new T.Color(bg); G.scene.fog.color.setHex(bg);
    var dayF = clamp((el + 2) / 12, 0, 1);
    // 밤: 달빛 정도로 은은하게, '밝게'를 누르면 구조물 확인용으로 환하게
    G.moon.intensity = el < 2 ? (G.bright ? 0.7 : 0.35) : 0;
    G.hemi.intensity = Math.max(0.3 + 0.45 * dayF, el < 4 ? (G.bright ? 1.0 : 0.55) : 0); G.hemi.color.setHex(dayF > 0.3 ? 0xeaf4ff : 0x8ea2d8);
    var ce = Math.cos(Math.max(el, -3) * D2R), sd = new T.Vector3(ce * Math.sin(f.az * D2R), Math.sin(Math.max(el, -3) * D2R), -ce * Math.cos(f.az * D2R));
    var big = Math.max(d.L, d.NW), R = big + 40;
    if (el > 0) { G.sun.visible = true; G.sun.intensity = 0.15 + 0.95 * Math.min(1, (f.G || 0) / 750); G.sun.color.setHex(el < 8 ? 0xffc58a : 0xffffff); G.sun.position.copy(sd).multiplyScalar(R); G.sun.target.position.set(0, 0, 0); }
    else G.sun.visible = false;
    var tw = G.house.localToWorld(G.orbit.tl.clone());
    // 구름: 맑음 2 · 구름많음 6 · 흐림/비/눈 12 (흐리면 낮고 회색)
    var nc = over ? 12 : f.sky === 3 ? 6 : 2;
    G.cmat.color.setHex(el > -2 ? (f.pty > 0 ? 0x9ca3af : over ? 0xc9ced6 : 0xffffff) : 0x3f4a5c);
    var tw0 = (Math.sin((f.wd + 180) * D2R)), tz0 = -Math.cos((f.wd + 180) * D2R), cs = 220;
    G.clouds.forEach(function (cl, i) {
      cl.visible = i < nc; if (!cl.visible) return;
      var u = cl.userData; if (u.ox == null) { u.ox = Math.cos(i * 2.1 + 0.4) * cs; u.oz = Math.sin(i * 1.7 + 1.1) * cs; }
      u.ox += tw0 * (0.6 + f.ws * 0.5) * dt; u.oz += tz0 * (0.6 + f.ws * 0.5) * dt;
      if (u.ox > cs) u.ox -= 2 * cs; if (u.ox < -cs) u.ox += 2 * cs; if (u.oz > cs) u.oz -= 2 * cs; if (u.oz < -cs) u.oz += 2 * cs;
      u.alt = (over ? 1.5 : 3) + (i % 4) * (over ? 1.2 : 1.8);  // 화면 하늘 띠 안에 보이도록 고도(°)
    });
    // 비 (1 비, 2 비/눈, 4 소나기) · 눈 (2, 3)
    var isRain = f.pty === 1 || f.pty === 2 || f.pty === 4, isSnow = f.pty === 2 || f.pty === 3;
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
      var spp = G.sp0, tnow = Date.now() / 1000;
      G.sst.forEach(function (q, i) {
        q.y -= 1.1 * dt; q.x += (wx * 0.7 + Math.sin(tnow + q.ph) * 0.3) * dt; q.z += (wz * 0.7 + Math.cos(tnow * 0.8 + q.ph) * 0.3) * dt;
        if (q.y < 0) { q.y += 32; q.x = (Math.random() - 0.5) * 90; q.z = (Math.random() - 0.5) * 90; }
        spp[i * 3] = q.x; spp[i * 3 + 1] = q.y; spp[i * 3 + 2] = q.z;
      });
      G.snow.position.set(tw.x, 0, tw.z); G.snow.geometry.attributes.position.needsUpdate = true;
    }
    G.ground.material.color.setHex(f.pty === 3 ? 0xd9dee4 : f.pty === 2 ? 0xa3b38a : isRain ? 0x5f7a40 : 0x7d9a52);
    // 풍향계: 머리가 바람이 불어오는 쪽을 향함, 프로펠러는 풍속만큼 회전 · 바람자루는 바람 가는 쪽으로 펴짐
    G.head.rotation.y = (90 - f.wd) * D2R;
    G.prop.rotation.x += Math.min(25, f.ws * 4) * dt;
    G.sockYaw.rotation.y = (90 - (f.wd + 180)) * D2R;
    var droop = (1 - Math.min(1, f.ws / 7)) * 70 * D2R; G.sockPitch.rotation.z = -droop + Math.sin(Date.now() / 300) * 0.04 * Math.min(1, f.ws / 3);
    // 측창·천창·커튼·차광
    function side(s, o) {
      var top = 0.3 + d.vh * o, hh = Math.max(0.001, d.hs - top);
      s.top.scale.y = hh; s.top.position.y = top + hh / 2;
      s.roll.position.y = top; var rr = 1 + o * 1.5; s.roll.scale.x = rr; s.roll.scale.y = rr;
      if (s.net) { s.net.visible = o > 0.01; s.net.scale.y = Math.max(0.001, d.vh * o); s.net.position.y = 0.3 + d.vh * o / 2; }
    }
    side(P.sides.A, f.A); side(P.sides.B, f.B);
    P.flaps.forEach(function (pv) { pv.rotation.z = pv.userData.slope + f.R * 0.95; });
    if (P.curC) { P.curC.visible = !!f.cur; P.curO.visible = !f.cur; }
    if (P.shOff) { P.shOn.forEach(function (m) { m.visible = !!f.sh; }); P.shOff.visible = !f.sh; }
    var fa = clamp((f.RHi - 85) / 15, 0, 1), tcol = tempColor(f.Ti);
    P.airMat.color.setRGB((tcol[0] * (1 - fa * 0.6) + 255 * fa * 0.6) / 255, (tcol[1] * (1 - fa * 0.6) + 255 * fa * 0.6) / 255, (tcol[2] * (1 - fa * 0.6) + 255 * fa * 0.6) / 255);
    P.airMat.opacity = 0.13 + 0.2 * fa; P.film.opacity = d.baseOp + 0.18 * fa;
    if (P.heat) { var pulse = 0.85 + 0.15 * Math.sin(Date.now() / 140); P.heat.glow.visible = !!f.heat; P.heat.glow.scale.setScalar(pulse); P.heat.light.intensity = f.heat ? 1.6 * pulse : 0; }
    P.dripMat.color.setHex(f.irr > 0 ? 0x38bdf8 : 0x334155);
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
    G.wind.visible = f.ws > 0.3; G.wind.material.opacity = clamp(0.15 + f.ws / 8, 0.15, 0.8);
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
    G.cam.lookAt(tw); G.cam.updateMatrixWorld();
    // 하늘: 해·달·구름·별은 카메라 기준 먼 곳에 둠. 방위는 실제, 높이는 화면 하늘 띠에 보이도록 줄여서 그림
    var cp = G.cam.position, SKYR = 260;
    function skyAt(az, alt, rr) { var ce3 = Math.cos(alt * D2R); return new T.Vector3(cp.x + rr * ce3 * Math.sin(az * D2R), cp.y + rr * Math.sin(alt * D2R), cp.z - rr * ce3 * Math.cos(az * D2R)); }
    // 화면 위 끝이 카메라 수평선 위 약 10° 이므로, 실제 0~90°를 1.5~7.5°로 줄여 늘 보이게
    function dispAlt(e) { var top = 25 - G.orbit.el; return Math.max(1.5, Math.min(top - 2.5, 1.5 + Math.max(0, Math.min(90, e)) / 90 * (top - 4))); }
    G.sunBall.visible = G.sunHalo.visible = el > -1;
    if (el > -1) { G.sunBall.position.copy(skyAt(f.az, dispAlt(el), SKYR)); G.sunHalo.position.copy(G.sunBall.position); }
    G.sunBall.material.color.setHex(el < 8 ? 0xffa94d : 0xffd54a); G.sunHalo.material.opacity = over ? 0.12 : 0.3;
    var cc = COORD(), mp = moonPos(cc[0], cc[1], f.t), mk = Math.round(mp.illum * 20) + (mp.waxing ? 'w' : 'n');
    if (mk !== G.moonKey) { G.moonKey = mk; G.moonSpr.material.map.dispose(); G.moonSpr.material.map = moonTexture(mp.illum, mp.waxing); G.moonSpr.material.needsUpdate = true; }
    G.moonSpr.visible = mp.el > -1 && mp.illum > 0.03;
    if (G.moonSpr.visible) { G.moonSpr.position.copy(skyAt(mp.az, dispAlt(mp.el), SKYR)); G.moonSpr.material.opacity = el > 5 ? 0.5 : over ? 0.6 : 1; }
    G.stars.visible = el < -6 && !over; G.stars.position.set(cp.x, 0, cp.z);
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
    var hud = '🕒 ' + tlabel(f.t) + ' · ' + wxn + '<br>바깥 ' + f1(f.To) + '℃ · ' + Math.round(f.RHo) + '%<br>☀ 일사 ' + Math.round(f.G) + ' W/m²' + (el > 0 ? ' · 해 ' + dir8(f.az) + ' ' + Math.round(el) + '°' : '') + (G.sky.mp.el > 0 ? '<br>🌙 ' + G.sky.mp.name + ' ' + dir8(G.sky.mp.az) + ' ' + Math.round(G.sky.mp.el) + '°' : '') + '<br>💨 ' + dir16(f.wd) + '풍 ' + f1(f.ws) + ' m/s';
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
