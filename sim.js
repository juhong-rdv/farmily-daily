/* farmily-daily : 우리 하우스 시뮬레이션 화면 (sim.html 에서 사용)
   데이터: data/regions.json, data/weather/<code>.json · 계산: sim-engine.js (FSIM) */
(function () {
  var BASE = '/farmily-daily/';
  var F = window.FSIM;
  var COORD = window.FSIM_COORDS || {};
  var $ = function (id) { return document.getElementById(id); };
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function f1(x) { return x == null || isNaN(x) ? '-' : (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
  function kst(ms) { return new Date(ms + 9 * 3600000); }
  function tlabel(ms) { var d = kst(ms); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '(' + DOW[d.getUTCDay()] + ') ' + d.getUTCHours() + ':' + ('0' + d.getUTCMinutes()).slice(-2); }
  function dlabel(ms) { var d = new Date(ms); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '(' + DOW[d.getUTCDay()] + ')'; }
  var DIR16 = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
  var DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  function dir16(v) { return v == null ? '' : DIR16[Math.round(v / 22.5) % 16]; }
  function dir8(v) { return v == null ? '' : DIR8[Math.round(((v % 360) + 360) % 360 / 45) % 8]; }

  // ---------- 상태 ----------
  var saved = {}; try { saved = JSON.parse(ls('farmily.sim') || '{}') || {}; } catch (e) { saved = {}; }
  var S = {
    region: (new URLSearchParams(location.search)).get('region') || ls('farmily.region') || '3406',
    crop: saved.crop || 'tomato', stage: saved.stage || 'flower',
    house: Object.assign(F.houseDefaults((saved.house && saved.house.type) || 'single'), saved.house || {}),
    ctrl: Object.assign(F.defaults(saved.crop || 'tomato'), saved.ctrl || {})
  };
  if (!saved.house) { var o = ls('farmily.orient'); if (o === 'ns') S.house.axis = 90; }
  var regions = null, sido = [], weather = null, result = null, prevSummary = null;
  function save() { ls('farmily.sim', JSON.stringify({ crop: S.crop, stage: S.stage, house: S.house, ctrl: S.ctrl })); }

  // ---------- 입력 항목 ----------
  var HOUSE_FIELDS = [
    { k: 'type', label: '하우스 형태', type: 'select', opts: [['single', '단동'], ['multi', '연동']] },
    { k: 'spans', label: '동 수', type: 'number', min: 2, max: 20, step: 1, unit: '동', show: function (h) { return h.type === 'multi'; } },
    { k: 'width', label: '폭 (한 동)', type: 'number', min: 3, max: 20, step: 0.1, unit: 'm' },
    { k: 'length', label: '길이', type: 'number', min: 10, max: 200, step: 1, unit: 'm' },
    { k: 'sideH', label: '측고 (어깨 높이)', type: 'number', min: 0.8, max: 7, step: 0.1, unit: 'm' },
    { k: 'ridgeH', label: '동고 (가장 높은 곳)', type: 'number', min: 1.5, max: 9, step: 0.1, unit: 'm' },
    { k: 'axis', label: '하우스 긴 쪽 방향', type: 'axis' },
    { k: 'cover', label: '피복재', type: 'select', opts: [['po1', 'PO필름 1겹'], ['po2', 'PO필름 2겹(이중)'], ['glass', '유리']] },
    { k: 'curtain', label: '보온커튼', type: 'select', opts: [['none', '없음'], ['single', '보온커튼 1겹'], ['multi', '다겹 보온커튼']] },
    { k: 'shade', label: '차광막', type: 'check' },
    { k: 'shadePct', label: '차광률', type: 'number', min: 10, max: 90, step: 5, unit: '%', show: function (h) { return h.shade; } },
    { k: 'ventH', label: '측창 최대 열림 높이', type: 'number', min: 0.3, max: 4, step: 0.1, unit: 'm' },
    { k: 'roofVent', label: '천창', type: 'check' },
    { k: 'roofW', label: '천창 폭 (한 동)', type: 'number', min: 0.2, max: 3, step: 0.1, unit: 'm', show: function (h) { return h.roofVent; } },
    { k: 'net', label: '측창·천창 방충망', type: 'check' },
    { k: 'heater', label: '난방기 용량 (0 = 없음)', type: 'number', min: 0, max: 2000000, step: 5000, unit: 'kcal/h' },
    { k: 'plants', label: '재식 주수 (0 = 자동)', type: 'number', min: 0, max: 100000, step: 10, unit: '주' }
  ];
  var CTRL_GROUPS = [
    ['🪟 환기 (측창·천창)', [
      { k: 'ventDay', label: '낮 환기 시작 온도', type: 'number', min: 15, max: 35, step: 0.5, unit: '℃' },
      { k: 'band', label: '완전히 열릴 때까지 온도 폭', type: 'number', min: 1, max: 10, step: 0.5, unit: '℃', help: '시작 온도 + 이 값에서 100% 열림' },
      { k: 'ventNight', label: '밤 환기 시작 온도', type: 'number', min: 10, max: 30, step: 0.5, unit: '℃' },
      { k: 'coldOut', label: '외기 저온 기준', type: 'number', min: 0, max: 20, step: 1, unit: '℃' },
      { k: 'coldOpen', label: '외기 저온일 때 측창 최대', type: 'number', min: 0, max: 100, step: 5, unit: '%' },
      { k: 'windLimit', label: '강풍 기준 풍속', type: 'number', min: 2, max: 15, step: 0.5, unit: 'm/s' },
      { k: 'windOpen', label: '강풍 때 바람받이 측창 최대', type: 'number', min: 0, max: 100, step: 5, unit: '%' },
      { k: 'stormLimit', label: '모두 닫는 풍속', type: 'number', min: 4, max: 25, step: 0.5, unit: 'm/s' },
      { k: 'rainRoofClose', label: '비 오면 천창 닫기', type: 'check' },
      { k: 'nightDehum', label: '밤 습도 90%↑ 제습 환기', type: 'check' }
    ]],
    ['🔥 난방 설정 온도', [
      { k: 'heatDay', label: '낮', type: 'number', min: 0, max: 30, step: 0.5, unit: '℃' },
      { k: 'heatEve', label: '해 진 뒤 5시간', type: 'number', min: 0, max: 30, step: 0.5, unit: '℃' },
      { k: 'heatMid', label: '한밤', type: 'number', min: 0, max: 30, step: 0.5, unit: '℃' },
      { k: 'heatDawn', label: '해 뜨기 2시간 전~일출', type: 'number', min: 0, max: 30, step: 0.5, unit: '℃' }
    ]],
    ['🧣 보온커튼 · 🕶 차광막', [
      { k: 'curtainOut', label: '밤에 커튼 닫는 외기 온도 (미만)', type: 'number', min: 0, max: 25, step: 0.5, unit: '℃' },
      { k: 'curtainOpenRad', label: '아침에 커튼 여는 일사', type: 'number', min: 0, max: 300, step: 5, unit: 'W/m²' },
      { k: 'shadeRad', label: '차광막 펴는 일사 (바깥)', type: 'number', min: 200, max: 1000, step: 10, unit: 'W/m²' }
    ]],
    ['💧 관수 (일사비례)', [
      { k: 'irrJ', label: '일사가 이만큼 쌓일 때마다 1회', type: 'number', min: 20, max: 300, step: 5, unit: 'J/cm²' },
      { k: 'irrMl', label: '1회 급액량', type: 'number', min: 10, max: 500, step: 5, unit: 'mL/주' },
      { k: 'irrStart', label: '첫 급액: 일출 후', type: 'number', min: 0, max: 240, step: 10, unit: '분' },
      { k: 'irrEnd', label: '마지막 급액: 일몰 전', type: 'number', min: 0, max: 300, step: 10, unit: '분' }
    ]]
  ];

  function fieldHTML(obj, f, prefix) {
    var v = obj[f.k], id = prefix + f.k, h = '<label class="fld" id="w_' + id + '"><span class="fl">' + f.label + (f.help ? '<i>' + f.help + '</i>' : '') + '</span>';
    if (f.type === 'select') h += '<select id="' + id + '">' + f.opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(v) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
    else if (f.type === 'check') h += '<input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '>';
    else if (f.type === 'axis') {
      h += '<span class="axisw"><select id="' + id + '_q"><option value="0">남북으로 긴 하우스 (측창: 동·서)</option><option value="90">동서로 긴 하우스 (측창: 남·북)</option><option value="x">직접 각도</option></select>'
        + '<input type="range" id="' + id + '" min="0" max="179" step="1" value="' + v + '"><b id="' + id + '_v"></b></span>';
    } else h += '<span class="numw"><input type="number" id="' + id + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + v + '"><em>' + (f.unit || '') + '</em></span>';
    return h + '</label>';
  }

  function buildForms() {
    $('f-crop').innerHTML = '<label class="fld"><span class="fl">작물</span><select id="c_crop">' + Object.keys(F.CROPS).map(function (k) { return '<option value="' + k + '"' + (S.crop === k ? ' selected' : '') + '>' + F.CROPS[k].name + '</option>'; }).join('') + '</select></label>'
      + '<label class="fld"><span class="fl">생육 단계</span><select id="c_stage">' + Object.keys(F.STAGES).map(function (k) { return '<option value="' + k + '"' + (S.stage === k ? ' selected' : '') + '>' + F.STAGES[k].name + '</option>'; }).join('') + '</select></label>';
    $('f-house').innerHTML = HOUSE_FIELDS.map(function (f) { return fieldHTML(S.house, f, 'h_'); }).join('');
    $('f-ctrl').innerHTML = CTRL_GROUPS.map(function (g) { return '<fieldset><legend>' + g[0] + '</legend>' + g[1].map(function (f) { return fieldHTML(S.ctrl, f, 'k_'); }).join('') + '</fieldset>'; }).join('');
    syncAxis(); showHide();
    $('c_crop').onchange = function () { var old = F.defaults(S.crop), nw = F.defaults(this.value); ['heatEve', 'heatMid', 'heatDawn'].forEach(function (k) { if (S.ctrl[k] === old[k]) S.ctrl[k] = nw[k]; }); S.crop = this.value; buildForms(); changed(); };
    $('c_stage').onchange = function () { S.stage = this.value; changed(); };
    HOUSE_FIELDS.forEach(function (f) {
      var el = $('h_' + f.k);
      if (f.type === 'axis') {
        el.oninput = function () { S.house.axis = +this.value; syncAxis(); changed(); };
        $('h_axis_q').onchange = function () { if (this.value !== 'x') { S.house.axis = +this.value; $('h_axis').value = S.house.axis; } syncAxis(); changed(); };
        return;
      }
      el.onchange = function () {
        if (f.k === 'type') { var keep = { axis: S.house.axis }; S.house = Object.assign(F.houseDefaults(this.value), keep); buildForms(); changed(); return; }
        S.house[f.k] = f.type === 'check' ? (this.checked ? 1 : 0) : f.type === 'select' ? this.value : +this.value;
        showHide(); changed();
      };
    });
    CTRL_GROUPS.forEach(function (g) { g[1].forEach(function (f) { $('k_' + f.k).onchange = function () { S.ctrl[f.k] = f.type === 'check' ? this.checked : +this.value; changed(); }; }); });
  }
  function syncAxis() {
    var a = S.house.axis, q = $('h_axis_q');
    if (q) { q.value = a === 0 ? '0' : a === 90 ? '90' : 'x'; $('h_axis').style.display = q.value === 'x' ? '' : 'none'; }
    var v = $('h_axis_v'); if (v) v.textContent = q && q.value === 'x' ? '긴 쪽이 ' + dir8(a) + '↔' + dir8(a + 180) + ' (' + a + '°)' : '';
  }
  function showHide() { HOUSE_FIELDS.forEach(function (f) { if (f.show) { var w = $('w_h_' + f.k); if (w) w.style.display = f.show(S.house) ? '' : 'none'; } }); }

  var tmr = null;
  function changed() { save(); clearTimeout(tmr); tmr = setTimeout(simulate, 200); }

  // ---------- 지역 ----------
  function find(code) { if (!regions) return null; for (var i = 0; i < regions.length; i++) if (regions[i].code === code) return regions[i]; return null; }
  function buildRegion() {
    var r0 = find(S.region);
    $('f-region').innerHTML = '<select id="r_sido" aria-label="시도">' + sido.map(function (s) { return '<option value="' + s.short + '"' + (r0 && r0.sido === s.short ? ' selected' : '') + '>' + esc(s.full) + '</option>'; }).join('') + '</select><select id="r_sigun" aria-label="시군"></select>';
    fillSigun(r0 ? r0.sido : sido[0].short);
    $('r_sido').onchange = function () { fillSigun(this.value); var first = regions.filter(function (r) { return r.sido === $('r_sido').value; })[0]; if (first) { S.region = first.code; $('r_sigun').value = first.code; loadWeather(); } };
    $('r_sigun').onchange = function () { S.region = this.value; ls('farmily.region', S.region); loadWeather(); };
  }
  function fillSigun(s) { $('r_sigun').innerHTML = regions.filter(function (r) { return r.sido === s; }).map(function (r) { return '<option value="' + r.code + '"' + (r.code === S.region ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join(''); }
  function loadWeather() {
    $('status').textContent = '예보 불러오는 중…';
    fetch(BASE + 'data/weather/' + S.region + '.json', { cache: 'no-store' }).then(function (x) { if (!x.ok) throw 0; return x.json(); })
      .then(function (w) { weather = w; prevSummary = null; simulate(); })
      .catch(function () { $('status').textContent = '이 지역 예보를 아직 불러올 수 없습니다.'; });
  }

  // ---------- 계산 ----------
  function simulate() {
    if (!weather) return;
    var c = COORD[S.region] || [36.5, 127.5];
    var keepIdx = player.idx, keepT = result && result.frames[Math.floor(keepIdx)] ? result.frames[Math.floor(keepIdx)].t : null;
    var old = result ? result.summary : null;
    result = F.run(weather, c[0], c[1], S.house, S.crop, S.stage, S.ctrl, { cal: activeCal() });
    if (old) prevSummary = old;
    var r = find(S.region), g = result.geom;
    $('status').innerHTML = esc(r ? r.sido + ' ' + r.name : '') + ' · 바닥 ' + Math.round(g.A).toLocaleString() + 'm² · 부피 ' + Math.round(g.V).toLocaleString() + 'm³ · 피복 표면 ' + Math.round(g.Ac).toLocaleString() + 'm² · ' + result.plants.toLocaleString() + '주'
      + ' · 기상청 ' + String(weather.short_base || '').replace(/^(\d{4})(\d\d)(\d\d) (\d\d).*/, function (m, a, b, c2, d) { return (+b) + '/' + (+c2) + ' ' + d + '시'; }) + ' 발표 예보'
      + (result.preH ? ' · 직전 ' + result.preH + '시간 바깥 자료로 출발' : '')
      + (activeCal() ? ' · <b style="color:#15803d">실측 보정 적용 중</b>' : '');
    var fr = result.frames;
    player.idx = 0;
    if (keepT != null) for (var i = 0; i < fr.length; i++) if (fr[i].t >= keepT) { player.idx = i; break; }
    if (keepT == null) { var noon = 0; for (i = 0; i < fr.length; i++) { var d = kst(fr[i].t); if (d.getUTCHours() === 7 && d.getUTCMinutes() === 0) { noon = i; break; } } player.idx = noon; }
    $('seek').max = fr.length - 1; $('seek').value = player.idx;
    drawCharts(); drawSummary(); renderFrame();
  }

  // ---------- 플레이어 ----------
  var player = { idx: 0, playing: false, speed: 6, last: 0 };  // speed: 초당 프레임(10분) 수 → 6 = 1시간/초
  function frameAt(x) {
    var fr = result.frames, i = Math.max(0, Math.min(fr.length - 1, Math.floor(x))), j = Math.min(fr.length - 1, i + 1), f = x - i;
    var a = fr[i], b = fr[j]; if (f <= 0 || i === j) return a;
    var o = {}; for (var k in a) o[k] = (typeof a[k] === 'number' && typeof b[k] === 'number' && k !== 'heat' && k !== 'irr' && k !== 'cur' && k !== 'sh' && k !== 'sky' && k !== 'pty') ? a[k] + (b[k] - a[k]) * f : a[k];
    var dwd = ((b.wd - a.wd + 540) % 360) - 180; o.wd = (a.wd + dwd * f + 360) % 360;
    var daz = ((b.az - a.az + 540) % 360) - 180; o.az = (a.az + daz * f + 360) % 360;
    return o;
  }
  function tick(ts) {
    if (player.playing) {
      if (!player.last) player.last = ts;
      var dt = Math.min(0.1, (ts - player.last) / 1000); player.last = ts;
      player.idx += dt * player.speed;
      if (player.idx >= result.frames.length - 1) { player.idx = result.frames.length - 1; player.playing = false; $('play').textContent = '▶ 재생'; }
      $('seek').value = Math.floor(player.idx);
      renderFrame(dt);
    } else { player.last = 0; renderFrame(0.016, true); }
    requestAnimationFrame(tick);
  }

  // 바람 입자
  var parts = []; for (var p = 0; p < 46; p++) parts.push({ x: Math.random() * 900, y: 40 + Math.random() * 330, l: 10 + Math.random() * 18 });

  function tempColor(T) {
    var stops = [[5, [59, 130, 246]], [12, [96, 165, 250]], [18, [74, 222, 128]], [25, [163, 230, 53]], [30, [251, 146, 60]], [35, [239, 68, 68]]];
    if (T <= stops[0][0]) return stops[0][1]; for (var i = 1; i < stops.length; i++) if (T <= stops[i][0]) { var a = stops[i - 1], b = stops[i], f = (T - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(function (k) { return Math.round(a[1][k] + (b[1][k] - a[1][k]) * f); }); }
    return stops[stops.length - 1][1];
  }
  function rgb(a, al) { return 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',' + al + ')'; }

  function renderFrame(dt, still) {
    if (!result) return;
    var f = frameAt(player.idx), h = S.house, g = result.geom;
    var cwS = $('stagewrap').clientWidth || 900, narrowS = cwS < 600, FS = 1;
    function fz(n) { return (n * FS).toFixed(1); }
    var W = 900, H = 440, ground = 380;
    var nW = g.n * g.W, sx = Math.min(560 / nW, 90), sy = Math.max(sx, 150 / g.hr); sy = Math.min(sy, 250 / g.hr);
    var x0 = 450 - nW * sx / 2, hsP = g.hs * sy, hrP = g.hr * sy, spanP = g.W * sx;
    // 좁은 화면: 하우스 둘레만 잘라 크게 보여 주고, 바깥 수치·나침반은 아래 칩으로
    var vb = '0 0 900 440';
    if (narrowS) { var vx = x0 - 100, vw = nW * sx + 200, vy = Math.max(0, ground - hrP - 70); FS = Math.max(1, vw / cwS * 0.85); vb = vx.toFixed(0) + ' ' + vy.toFixed(0) + ' ' + vw.toFixed(0) + ' ' + (ground + 48 * FS - vy).toFixed(0); }
    else FS = Math.max(1, Math.min(1.6, 900 / cwS * 0.75));
    var axis = h.axis % 180, nA = (axis + 270) % 360, nB = (axis + 90) % 360;
    var svg = '';
    // 하늘
    var el = f.el, sky1, sky2;
    if (el > 8) { sky1 = '#7cc4f4'; sky2 = '#d9efff'; } else if (el > -2) { sky1 = '#f4a259'; sky2 = '#ffe2b8'; } else if (el > -8) { sky1 = '#3b4a7a'; sky2 = '#9a7aa0'; } else { sky1 = '#0b1530'; sky2 = '#26345c'; }
    if (f.sky === 4 || f.pty > 0) { sky1 = el > -2 ? '#9aa6b2' : '#1c2333'; sky2 = el > -2 ? '#cfd6dc' : '#3a4256'; }
    svg += '<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sky1 + '"/><stop offset="1" stop-color="' + sky2 + '"/></linearGradient>'
      + '<pattern id="net" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0L4 4M4 0L0 4" stroke="#4b5563" stroke-width=".5"/></pattern>'
      + '<pattern id="shd" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#1f2937" opacity=".55"/><path d="M0 3H6M3 0V6" stroke="#111827" stroke-width="1"/></pattern></defs>';
    svg += '<rect width="' + W + '" height="' + ground + '" fill="url(#sk)"/>';
    if (el < -8 && f.sky === 1) for (var s = 0; s < 30; s++) svg += '<circle cx="' + ((s * 137) % 900) + '" cy="' + ((s * 71) % 200 + 10) + '" r="1" fill="#fff" opacity=".7"/>';
    // 태양 (단면에 투영: 오른쪽 = 측창 B 쪽)
    if (el > -6) {
      var dB = Math.cos((f.az - nB) * Math.PI / 180), ang = Math.atan2(Math.sin(Math.max(el, -6) * Math.PI / 180), Math.cos(el * Math.PI / 180) * dB);
      var R = 330, cx = 450 + R * Math.cos(ang), cy = ground - 10 - R * 0.95 * Math.sin(ang);
      svg += '<circle cx="' + cx.toFixed(0) + '" cy="' + cy.toFixed(0) + '" r="26" fill="#ffd54a" opacity=".35"/><circle cx="' + cx.toFixed(0) + '" cy="' + cy.toFixed(0) + '" r="17" fill="#ffc107" stroke="#f59e0b" stroke-width="2"/>';
      if (el > 3 && f.G > 80) { for (var rr = 0; rr < 3; rr++) { var tx = 450 + (rr - 1) * nW * sx * 0.3, ty = ground - hrP; svg += '<line x1="' + cx.toFixed(0) + '" y1="' + cy.toFixed(0) + '" x2="' + tx.toFixed(0) + '" y2="' + ty.toFixed(0) + '" stroke="#ffd54a" stroke-width="2" opacity="' + Math.min(0.5, f.G / 1200) + '" stroke-dasharray="6 6"/>'; } }
    }
    // 구름·비
    var nc = f.pty > 0 ? 6 : f.sky === 4 ? 6 : f.sky === 3 ? 3 : 1;
    for (var k = 0; k < nc; k++) { var ccx = (k * 173 + 60) % 860 + 20, ccy = 40 + (k * 37) % 60; svg += '<g opacity="' + (f.sky === 1 && !f.pty ? .5 : .9) + '" fill="' + (el > -2 ? (f.sky === 4 || f.pty ? '#e5e7eb' : '#fff') : '#475569') + '"><ellipse cx="' + ccx + '" cy="' + ccy + '" rx="46" ry="16"/><ellipse cx="' + (ccx + 26) + '" cy="' + (ccy - 10) + '" rx="28" ry="15"/><ellipse cx="' + (ccx - 22) + '" cy="' + (ccy - 6) + '" rx="22" ry="12"/></g>'; }
    if (f.pty > 0) for (k = 0; k < 60; k++) { var rx = (k * 61 + (Date.now() / 6 | 0)) % 900, ry = (k * 97 + (Date.now() / 3 | 0)) % 320 + 60; svg += '<line x1="' + rx + '" y1="' + ry + '" x2="' + (rx - 3) + '" y2="' + (ry + 10) + '" stroke="#93c5fd" stroke-width="1.2"/>'; }
    // 땅
    svg += '<rect y="' + ground + '" width="' + W + '" height="200" fill="#8b6b4a"/><rect y="' + ground + '" width="' + W + '" height="6" fill="#6b8e3d"/>';
    // 하우스 안 공기색 + 구조
    var arch = '';
    for (var i = 0; i < g.n; i++) { var a0 = x0 + i * spanP, a1 = a0 + spanP, am = (a0 + a1) / 2; arch += (i === 0 ? 'M' + a0 + ' ' + ground + 'L' + a0 + ' ' + (ground - hsP) : '') + 'Q' + am + ' ' + (ground - hsP - 2 * (hrP - hsP)) + ' ' + a1 + ' ' + (ground - hsP); }
    var archFull = arch + 'L' + (x0 + nW * sx) + ' ' + ground + 'Z';
    svg += '<path d="' + archFull + '" fill="' + rgb(tempColor(f.Ti), 0.32) + '"/>';
    // 차광막 (바깥, 지붕 위)
    if (h.shade) {
      if (f.sh) svg += '<path d="' + arch.replace(/^M[^L]+L/, 'M') + '" transform="translate(0,-6)" fill="none" stroke="url(#shd)" stroke-width="9"/>';
      else svg += '<rect x="' + (x0 - 6) + '" y="' + (ground - hsP - 14) + '" width="10" height="14" fill="#374151"/>';
    }
    // 측창: 아래에서 위로 열림 (0.3m 높이부터)
    var ventY0 = ground - 0.3 * sy, ventPx = Math.min(h.ventH, g.hs - 0.3) * sy;
    function sideVent(x, open, label, nrm, isA) {
      var hh = ventPx * open, top = ventY0 - hh;
      var o = '<line x1="' + x + '" y1="' + ground + '" x2="' + x + '" y2="' + ventY0 + '" stroke="#e2e8f0" stroke-width="4"/>';
      if (hh > 0.5) o += '<rect x="' + (x - 3) + '" y="' + top + '" width="6" height="' + hh + '" fill="' + (h.net ? 'url(#net)' : 'none') + '" opacity=".9"/>';
      o += '<line x1="' + x + '" y1="' + top + '" x2="' + x + '" y2="' + (ground - hsP) + '" stroke="#e2e8f0" stroke-width="4"/>';
      o += '<circle cx="' + x + '" cy="' + top + '" r="5" fill="#94a3b8" stroke="#475569"/>';
      var lx = isA ? x - 8 : x + 8, an = isA ? 'end' : 'start';
      o += '<text x="' + lx + '" y="' + (ground + 20 * FS) + '" font-size="' + fz(13) + '" font-weight="700" fill="#fff" text-anchor="' + an + '">' + label + ' 측창</text>'
        + '<text x="' + lx + '" y="' + (ground + 40 * FS) + '" font-size="' + fz(15) + '" font-weight="800" fill="#fff" text-anchor="' + an + '">' + Math.round(open * 100) + '%</text>';
      return o;
    }
    svg += '<path d="' + archFull + '" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-linejoin="round"/>';
    // 연동 기둥(칸막이 없음, 기둥만)
    for (i = 1; i < g.n; i++) svg += '<line x1="' + (x0 + i * spanP) + '" y1="' + ground + '" x2="' + (x0 + i * spanP) + '" y2="' + (ground - hsP) + '" stroke="#cbd5e1" stroke-width="2"/>';
    svg += sideVent(x0, f.A, dir8(nA), nA, true) + sideVent(x0 + nW * sx, f.B, dir8(nB), nB, false);
    // 천창: 각 동 꼭대기 오른쪽 덮개가 들림
    if (h.roofVent) for (i = 0; i < g.n; i++) {
      var ax = x0 + i * spanP + spanP / 2, ay = ground - hrP, len = Math.max(14, h.roofW * sx), rot = -f.R * 40;
      svg += '<g transform="translate(' + ax + ',' + ay + ') rotate(' + rot.toFixed(1) + ')"><line x1="0" y1="0" x2="' + len + '" y2="' + (len * 0.25) + '" stroke="#f8fafc" stroke-width="5" stroke-linecap="round"/></g>';
      if (i === 0) svg += '<text x="' + ax + '" y="' + (ay - 18) + '" font-size="' + fz(12) + '" font-weight="700" fill="#fff" text-anchor="middle" stroke="#0f172a" stroke-width="3" paint-order="stroke">천창 ' + Math.round(f.R * 100) + '%</text>';
    }
    // 보온커튼
    if (h.curtain !== 'none') {
      var cyy = ground - hsP + 4;
      if (f.cur) svg += '<rect x="' + (x0 + 4) + '" y="' + cyy + '" width="' + (nW * sx - 8) + '" height="7" fill="#e8dcc0" stroke="#bfa77a"/><text x="' + (x0 + 12) + '" y="' + (cyy + 22) + '" font-size="' + fz(12) + '" fill="#5b4a2a" font-weight="700">보온커튼 닫힘</text>';
      else svg += '<rect x="' + (x0 + nW * sx - 22) + '" y="' + cyy + '" width="14" height="12" fill="#e8dcc0" stroke="#bfa77a"/>';
    }
    // 작물 (토마토 줄)
    var lai = result.lai, ph = Math.min(g.hs * 0.95, 0.5 + lai * 0.55) * sy, rows = Math.max(2, Math.round(g.W / 1.6)) * g.n;
    for (i = 0; i < rows; i++) {
      var px = x0 + (i + 0.5) * nW * sx / rows;
      svg += '<line x1="' + px + '" y1="' + ground + '" x2="' + px + '" y2="' + (ground - ph) + '" stroke="#3f7d2a" stroke-width="3"/>';
      for (var lv = 0; lv < 5; lv++) { var ly = ground - ph * (0.2 + lv * 0.18); svg += '<ellipse cx="' + (px + (lv % 2 ? 7 : -7)) + '" cy="' + ly + '" rx="9" ry="4" fill="#4d9a33"/>'; }
      if (S.stage === 'flower') svg += '<circle cx="' + (px + 4) + '" cy="' + (ground - ph * 0.55) + '" r="3" fill="#facc15"/>';
      if (S.stage === 'harvest') for (lv = 0; lv < 3; lv++) svg += '<circle cx="' + (px + (lv % 2 ? -6 : 6)) + '" cy="' + (ground - ph * (0.3 + lv * 0.17)) + '" r="' + (S.crop === 'cherry' ? 3 : 5) + '" fill="' + (lv === 0 ? '#dc2626' : lv === 1 ? '#f97316' : '#84cc16') + '"/>';
      if (f.irr > 0) svg += '<text x="' + px + '" y="' + (ground - 4) + '" font-size="' + fz(13) + '" text-anchor="middle">💧</text>';
    }
    // 난방기
    var hx = x0 + nW * sx - 46, hy = ground - 26;
    svg += '<rect x="' + hx + '" y="' + hy + '" width="34" height="24" rx="3" fill="#475569"/>';
    if (f.heat) { var fl = 0.6 + 0.4 * Math.sin(Date.now() / 120); svg += '<circle cx="' + (hx + 17) + '" cy="' + (hy + 12) + '" r="' + (12 + 4 * fl) + '" fill="#f97316" opacity=".45"/><text x="' + (hx + 17) + '" y="' + (hy + 17) + '" font-size="' + fz(13) + '" text-anchor="middle">🔥</text>'; }
    if (h.heater <= 0) svg += '<text x="' + (hx + 17) + '" y="' + (hy + 16) + '" font-size="' + fz(9) + '" fill="#e2e8f0" text-anchor="middle">없음</text>';
    // 결로
    if (f.RHi >= 95) for (k = 0; k < 14; k++) { var dx = x0 + 20 + k * (nW * sx - 40) / 13; svg += '<circle cx="' + dx + '" cy="' + (ground - hsP - 3 - Math.abs(Math.sin(k)) * 8) + '" r="2.4" fill="#bfdbfe"/>'; }
    // 바람 (단면 방향 성분) — 입자
    var to = (f.wd + 180) % 360, vx = Math.cos((to - nB) * Math.PI / 180), along = Math.abs(Math.sin((to - nB) * Math.PI / 180));
    var spd = f.ws * vx * 26; // px/s
    var dtt = still ? 0.016 : (dt || 0.016);
    parts.forEach(function (q) {
      q.x += spd * dtt * (player.playing || still ? 1 : 1);
      if (q.x > 900) q.x -= 900; if (q.x < 0) q.x += 900;
      var inside = q.x > x0 - 4 && q.x < x0 + nW * sx + 4 && q.y > ground - hrP - 8;
      if (inside) return;
      var op = Math.min(0.85, 0.2 + f.ws / 8) * (0.35 + 0.65 * Math.abs(vx));
      var L2 = q.l * Math.min(1.6, 0.4 + f.ws / 5) * (vx >= 0 ? 1 : -1);
      if (f.ws > 0.3) svg += '<line x1="' + q.x.toFixed(0) + '" y1="' + q.y.toFixed(0) + '" x2="' + (q.x - L2).toFixed(0) + '" y2="' + q.y.toFixed(0) + '" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="' + op.toFixed(2) + '"/>';
    });
    // 창을 통한 공기 흐름 화살표
    function flow(x, y, dir, op) { return '<g opacity="' + op + '"><path d="M' + (x - dir * 22) + ' ' + y + 'L' + (x + dir * 22) + ' ' + y + '" stroke="#38bdf8" stroke-width="4" marker-end="none"/><path d="M' + (x + dir * 22) + ' ' + y + 'l' + (-dir * 9) + ' -7v14z" fill="#38bdf8"/></g>'; }
    var windIn = vx >= 0 ? 'A' : 'B';
    if (f.Gv > 0.3) {
      var fy = ventY0 - ventPx * Math.max(f.A, f.B) / 2;
      if (f.A > 0.02) svg += flow(x0, fy, windIn === 'A' ? 1 : -1, Math.min(1, 0.4 + f.A));
      if (f.B > 0.02) svg += flow(x0 + nW * sx, fy, windIn === 'A' ? 1 : -1, Math.min(1, 0.4 + f.B));
      if (h.roofVent && f.R > 0.02) for (i = 0; i < g.n; i++) { var rx2 = x0 + i * spanP + spanP / 2 + 6, ry2 = ground - hrP - 4; svg += '<path d="M' + rx2 + ' ' + (ry2 + 20) + 'V' + (ry2 - 16) + '" stroke="#fb923c" stroke-width="4"/><path d="M' + rx2 + ' ' + (ry2 - 24) + 'l-7 10h14z" fill="#fb923c"/>'; }
    }
    // 안·밖 수치
    var tc = tempColor(f.Ti);
    svg += '<g><rect x="' + (450 - 98 * FS) + '" y="' + (ground - hsP * 0.62 - 34 * FS) + '" width="' + 196 * FS + '" height="' + 58 * FS + '" rx="10" fill="#fff" opacity=".9"/>'
      + '<text x="450" y="' + (ground - hsP * 0.62 - 10 * FS) + '" font-size="' + fz(22) + '" font-weight="800" text-anchor="middle" fill="' + rgb([Math.max(0, tc[0] - 60), Math.max(0, tc[1] - 60), Math.max(0, tc[2] - 60)], 1) + '">안 ' + f1(f.Ti) + '℃</text>'
      + '<text x="450" y="' + (ground - hsP * 0.62 + 14 * FS) + '" font-size="' + fz(14) + '" font-weight="700" text-anchor="middle" fill="#1e3a8a">습도 ' + Math.round(f.RHi) + '%' + (f.RHi >= 90 ? ' ⚠' : '') + '</text></g>';
    if (!narrowS) svg += '<g><rect x="12" y="12" width="' + 168 * FS + '" height="' + 76 * FS + '" rx="10" fill="#0f172a" opacity=".55"/><text x="24" y="' + 36 * FS + '" font-size="' + fz(14) + '" fill="#fff" font-weight="700">바깥 ' + f1(f.To) + '℃ · ' + Math.round(f.RHo) + '%</text>'
      + '<text x="24" y="' + 58 * FS + '" font-size="' + fz(13) + '" fill="#fff">☀ 일사 ' + Math.round(f.G) + ' W/m²</text><text x="24" y="' + 78 * FS + '" font-size="' + fz(13) + '" fill="#fff">💨 ' + dir16(f.wd) + '풍 ' + f1(f.ws) + ' m/s</text></g>';
    if (along > 0.8 && f.ws > 1 && !narrowS) svg += '<text x="450" y="' + (ground - hrP - 34) + '" font-size="' + fz(12) + '" text-anchor="middle" fill="#fff" stroke="#0f172a" stroke-width="3" paint-order="stroke">바람이 하우스 길이 방향으로 붑니다</text>';
    // 위에서 본 그림 (나침반)
    var cxp = 820, cyp = 78, Rr = 56;
    if (!narrowS) {
    svg += '<g><circle cx="' + cxp + '" cy="' + cyp + '" r="' + (Rr + 10) + '" fill="#0f172a" opacity=".55"/><circle cx="' + cxp + '" cy="' + cyp + '" r="' + Rr + '" fill="none" stroke="#cbd5e1" stroke-width="1"/>'
      + ['북', '동', '남', '서'].map(function (d, q) { var a = q * Math.PI / 2; return '<text x="' + (cxp + Math.sin(a) * (Rr - 9)).toFixed(0) + '" y="' + (cyp - Math.cos(a) * (Rr - 9) + 4).toFixed(0) + '" font-size="' + fz(10) + '" fill="#e2e8f0" text-anchor="middle">' + d + '</text>'; }).join('');
    var hl = 34, hw = 12 + Math.min(10, g.n * 3);
    svg += '<g transform="translate(' + cxp + ',' + cyp + ') rotate(' + axis + ')"><rect x="' + (-hw / 2) + '" y="' + (-hl) + '" width="' + hw + '" height="' + (hl * 2) + '" fill="#e2e8f0" opacity=".85"/>'
      + '<rect x="' + (-hw / 2 - 3) + '" y="' + (-hl + 4) + '" width="3" height="' + (hl * 2 - 8) + '" fill="' + (f.A > 0.02 ? '#0d9488' : '#64748b') + '"/><rect x="' + (hw / 2) + '" y="' + (-hl + 4) + '" width="3" height="' + (hl * 2 - 8) + '" fill="' + (f.B > 0.02 ? '#7c3aed' : '#64748b') + '"/></g>';
    if (el > -2) { var sa = f.az * Math.PI / 180; svg += '<circle cx="' + (cxp + Math.sin(sa) * Rr).toFixed(0) + '" cy="' + (cyp - Math.cos(sa) * Rr).toFixed(0) + '" r="7" fill="#ffc107" stroke="#f59e0b"/>'; }
    if (f.ws > 0.2) { var wa = f.wd * Math.PI / 180, wx1 = cxp + Math.sin(wa) * (Rr + 6), wy1 = cyp - Math.cos(wa) * (Rr + 6), wx2 = cxp + Math.sin(wa) * 16, wy2 = cyp - Math.cos(wa) * 16;
      svg += '<line x1="' + wx1.toFixed(0) + '" y1="' + wy1.toFixed(0) + '" x2="' + wx2.toFixed(0) + '" y2="' + wy2.toFixed(0) + '" stroke="#38bdf8" stroke-width="3"/><circle cx="' + wx2.toFixed(0) + '" cy="' + wy2.toFixed(0) + '" r="4" fill="#38bdf8"/>'; }
    if (FS < 1.4) svg += '<text x="' + cxp + '" y="' + (cyp + Rr + 24) + '" font-size="' + fz(10) + '" fill="#fff" text-anchor="middle" stroke="#0f172a" stroke-width="3" paint-order="stroke">위에서 본 하우스 · ☀ 해 · 💨 바람</text></g>';
    }
    $('stage').setAttribute('viewBox', vb);
    $('stage').innerHTML = svg;
    // 상태 칩
    var chips = [
      ['🕒', tlabel(f.t)],
      ['🌡', '바깥 ' + f1(f.To) + '℃ · ' + Math.round(f.RHo) + '%'],
      ['💨', dir16(f.wd) + '풍 ' + f1(f.ws) + 'm/s' + (along > 0.8 && f.ws > 1 ? ' (하우스 길이 방향)' : '')],
      ['🪟', dir8(nA) + '측창 ' + Math.round(f.A * 100) + '% · ' + dir8(nB) + '측창 ' + Math.round(f.B * 100) + '%' + (h.roofVent ? ' · 천창 ' + Math.round(f.R * 100) + '%' : '')],
      h.curtain !== 'none' ? ['🧣', '커튼 ' + (f.cur ? '닫힘' : '열림')] : null,
      h.shade ? ['🕶', '차광 ' + (f.sh ? '폄' : '걷음')] : null,
      ['🔥', f.heat ? '난방 중 (설정 ' + f1(f.hset) + '℃)' : '난방 꺼짐'],
      f.irr ? ['💧', '관수'] : null,
      ['☀', f.el > 0 ? '해 높이 ' + Math.round(f.el) + '° · ' + dir16(f.az) + '쪽' : '해 진 뒤'],
      ['🎯', '환기 시작 ' + f1(f.vset) + '℃']
    ].filter(Boolean);
    $('chips').innerHTML = chips.map(function (c) { return '<span>' + c[0] + ' ' + c[1] + '</span>'; }).join('');
    // 그래프 재생선
    var fr = result.frames, t0 = fr[0].t, t1 = fr[fr.length - 1].t, X = chartX(f.t);
    var ph_ = document.querySelectorAll('.playhead'); for (i = 0; i < ph_.length; i++) { ph_[i].setAttribute('x1', X); ph_[i].setAttribute('x2', X); }
  }

  // ---------- 그래프 ----------
  var CW = 900, CL = 44, CR = 12;
  var lastCW = 0;
  window.addEventListener('resize', function () { if (result && Math.abs(($('charts').clientWidth || 900) - lastCW) > 30) { drawCharts(); renderFrame(0, true); } });
  function chartX(t) { var fr = result.frames, t0 = fr[0].t, t1 = fr[fr.length - 1].t; return (CL + (t - t0) / (t1 - t0) * (CW - CL - CR)).toFixed(1); }
  function drawCharts() {
    CW = Math.max(320, Math.round($('charts').clientWidth || 900)); lastCW = CW; var narrow = CW < 600;
    var fr = result.frames, h = S.house, nA = (h.axis % 180 + 270) % 360, nB = (h.axis % 180 + 90) % 360;
    var panels = [
      { title: '🌡 기온 (℃)', h: 120, lo: null, hi: null, series: [{ k: 'Ti', c: '#c2410c', w: 2.5, name: '하우스 안' }, { k: 'To', c: '#64748b', w: 1.5, dash: '5 4', name: '바깥' }], band: true },
      { title: '💧 상대습도 (%)', h: 90, lo: 0, hi: 100, series: [{ k: 'RHi', c: '#2563eb', w: 2.5, name: '하우스 안' }, { k: 'RHo', c: '#64748b', w: 1.5, dash: '5 4', name: '바깥' }], line90: true },
      { title: '🪟 창 열림 (%)', h: 90, lo: 0, hi: 100, pct: true, series: [{ k: 'A', c: '#0d9488', w: 2, name: dir8(nA) + ' 측창' }, { k: 'B', c: '#7c3aed', w: 2, name: dir8(nB) + ' 측창', dash: '6 3' }].concat(h.roofVent ? [{ k: 'R', c: '#d97706', w: 2, name: '천창' }] : []) },
      { title: '☀ 바깥 일사 (W/m²) · 장치 작동', h: 170, lo: 0, hi: null, area: 'G', states: true }
    ];
    var html = '';
    var t0 = fr[0].t, t1 = fr[fr.length - 1].t;
    panels.forEach(function (p, pi) {
      var top = 22, bot = p.h - (pi === panels.length - 1 ? 26 : 8) - (p.states ? 46 : 0), ph = bot - top;
      var vals = []; (p.series || []).forEach(function (s) { fr.forEach(function (f) { vals.push(f[s.k] * (p.pct ? 100 : 1)); }); });
      if (p.area) fr.forEach(function (f) { vals.push(f.G); });
      var lo = p.lo != null ? p.lo : Math.floor(Math.min.apply(null, vals.concat([5])) / 5) * 5, hi = p.hi != null ? p.hi : Math.ceil(Math.max.apply(null, vals.concat([p.area ? 400 : 30])) / (p.area ? 200 : 5)) * (p.area ? 200 : 5);
      function Y(v) { return (bot - (v - lo) / (hi - lo) * ph).toFixed(1); }
      var o = '<svg viewBox="0 0 ' + CW + ' ' + p.h + '" class="ch" data-i="' + pi + '"><text x="' + CL + '" y="14" font-size="12" font-weight="700" fill="#444">' + p.title + '</text>';
      // 밤 음영
      var nightStart = null; fr.forEach(function (f, i) { if (!f.day && nightStart == null) nightStart = f.t; if ((f.day || i === fr.length - 1) && nightStart != null) { o += '<rect x="' + chartX(nightStart) + '" y="' + top + '" width="' + (chartX(f.t) - chartX(nightStart)) + '" height="' + (bot - top) + '" fill="#eef0f4"/>'; nightStart = null; } });
      var ticks = p.area ? [0, hi / 2, hi] : p.pct || p.lo === 0 ? [0, 50, 100] : (function () { var a = []; for (var v = lo; v <= hi; v += (hi - lo > 25 ? 10 : 5)) a.push(v); return a; })();
      ticks.forEach(function (v) { o += '<line x1="' + CL + '" x2="' + (CW - CR) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#e5e7eb"/><text x="' + (CL - 5) + '" y="' + (+Y(v) + 4) + '" font-size="10" fill="#888" text-anchor="end">' + v + '</text>'; });
      if (p.band) { // 토마토 적온 띠: 낮 18~28, 밤 10(방울 12)~20
        var nl = S.crop === 'cherry' ? 12 : 10; var seg = '';
        fr.forEach(function (f, i) { if (i === fr.length - 1) return; var a = f.day ? 28 : 20, b = f.day ? 18 : nl; seg += '<rect x="' + chartX(f.t) + '" y="' + Y(a) + '" width="' + (chartX(fr[i + 1].t) - chartX(f.t) + 0.3).toFixed(1) + '" height="' + (Y(b) - Y(a)).toFixed(1) + '" fill="#dcfce7"/>'; });
        o += seg + '<text x="' + (CW - CR - 4) + '" y="' + (top + 12) + '" font-size="10" fill="#15803d" text-anchor="end">' + (narrow ? '초록 띠 = 적온' : '초록 띠 = 토마토 적온(낮 18~28℃, 밤 ' + nl + '~20℃)') + '</text>';
        o += '<line x1="' + CL + '" x2="' + (CW - CR) + '" y1="' + Y(30) + '" y2="' + Y(30) + '" stroke="#dc2626" stroke-dasharray="3 3"/><text x="' + (CL + 4) + '" y="' + (+Y(30) - 3) + '" font-size="10" fill="#b91c1c">30℃</text>';
      }
      if (p.line90) o += '<line x1="' + CL + '" x2="' + (CW - CR) + '" y1="' + Y(90) + '" y2="' + Y(90) + '" stroke="#dc2626" stroke-dasharray="3 3"/><text x="' + (CL + 4) + '" y="' + (+Y(90) - 3) + '" font-size="10" fill="#b91c1c">90% (병 위험)</text>';
      if (p.area) { var pa = 'M' + chartX(t0) + ' ' + Y(0); fr.forEach(function (f) { pa += 'L' + chartX(f.t) + ' ' + Y(f.G); }); pa += 'L' + chartX(t1) + ' ' + Y(0) + 'Z'; o += '<path d="' + pa + '" fill="#f2b33d" fill-opacity=".5" stroke="#e09a12" stroke-width="1.5"/>';
        result.irr.forEach(function (t) { o += '<line x1="' + chartX(t) + '" x2="' + chartX(t) + '" y1="' + (bot - 14) + '" y2="' + bot + '" stroke="#2563eb" stroke-width="2"/>'; });
        o += '<text x="' + (CW - CR - 4) + '" y="' + (top + 12) + '" font-size="10" fill="#1d4ed8" text-anchor="end">파란 눈금 = 관수 ' + result.irr.length + '회</text>';
      }
      (p.series || []).forEach(function (s) {
        var d = ''; fr.forEach(function (f, i) { d += (i ? 'L' : 'M') + chartX(f.t) + ' ' + Y(f[s.k] * (p.pct ? 100 : 1)); });
        o += '<path d="' + d + '" fill="none" stroke="' + s.c + '" stroke-width="' + s.w + '"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + ' stroke-linejoin="round"/>';
      });
      if (p.states) { // 장치 상태 줄
        var rowsS = [['난방', 'heat', '#ef4444'], ['커튼', 'cur', '#bfa77a'], ['차광', 'sh', '#374151']].filter(function (r) { return r[1] !== 'cur' || h.curtain !== 'none'; }).filter(function (r) { return r[1] !== 'sh' || h.shade; });
        rowsS.forEach(function (r, ri) {
          var yy = bot + 8 + ri * 13; o += '<text x="' + (CL - 5) + '" y="' + (yy + 9) + '" font-size="10" fill="#555" text-anchor="end">' + r[0] + '</text><rect x="' + CL + '" y="' + yy + '" width="' + (CW - CL - CR) + '" height="9" fill="#f3f4f6"/>';
          var st = null; fr.forEach(function (f, i) { var on = f[r[1]] > 0; if (on && st == null) st = f.t; if ((!on || i === fr.length - 1) && st != null) { o += '<rect x="' + chartX(st) + '" y="' + yy + '" width="' + Math.max(1, chartX(f.t) - chartX(st)) + '" height="9" fill="' + r[2] + '"/>'; st = null; } });
        });
      }
      if (pi === panels.length - 1) fr.forEach(function (f) { var d = kst(f.t); if (d.getUTCMinutes() === 0 && d.getUTCHours() % (narrow ? 12 : 6) === 0) o += '<text x="' + chartX(f.t) + '" y="' + (p.h - 10) + '" font-size="10" fill="#666" text-anchor="middle">' + (d.getUTCHours() === 0 ? (d.getUTCMonth() + 1) + '/' + d.getUTCDate() : d.getUTCHours() + '시') + '</text>'; });
      fr.forEach(function (f) { var d = kst(f.t); if (d.getUTCMinutes() === 0 && d.getUTCHours() === 0) o += '<line x1="' + chartX(f.t) + '" x2="' + chartX(f.t) + '" y1="' + top + '" y2="' + bot + '" stroke="#9ca3af"/>'; });
      o += '<line class="playhead" x1="0" x2="0" y1="' + top + '" y2="' + p.h + '" stroke="#12341f" stroke-width="2"/>';
      o += '</svg>';
      var leg = (p.series || []).map(function (s) { return '<span><i style="border-top:' + (s.w > 2 ? 3 : 2) + 'px ' + (s.dash ? 'dashed' : 'solid') + ' ' + s.c + '"></i>' + s.name + '</span>'; }).join('');
      html += '<div class="chw">' + (leg ? '<div class="leg">' + leg + '</div>' : '') + o + '</div>';
    });
    $('charts').innerHTML = html + '<div class="tip2" id="ctip"></div>';
    var svgs = document.querySelectorAll('#charts svg.ch');
    for (var i = 0; i < svgs.length; i++) (function (el) {
      function idxAt(ev) { var rc = el.getBoundingClientRect(), x = (ev.clientX - rc.left) * CW / rc.width; var r = (x - CL) / (CW - CL - CR); return Math.max(0, Math.min(fr.length - 1, Math.round(r * (fr.length - 1)))); }
      el.addEventListener('pointermove', function (ev) {
        var k = idxAt(ev), f = fr[k], tip = $('ctip'), rc = $('charts').getBoundingClientRect();
        tip.innerHTML = '<b>' + tlabel(f.t) + '</b><br>안 ' + f1(f.Ti) + '℃ · ' + Math.round(f.RHi) + '% / 밖 ' + f1(f.To) + '℃ · ' + Math.round(f.RHo) + '%<br>' + dir8(nA) + ' ' + Math.round(f.A * 100) + '% · ' + dir8(nB) + ' ' + Math.round(f.B * 100) + '%' + (h.roofVent ? ' · 천창 ' + Math.round(f.R * 100) + '%' : '') + '<br>일사 ' + Math.round(f.G) + 'W/m² · ' + dir16(f.wd) + '풍 ' + f1(f.ws) + 'm/s' + (f.heat ? ' · 🔥' : '') + (f.cur ? ' · 커튼' : '') + (f.sh ? ' · 차광' : '') + '<br><span style="color:#888">누르면 이 시각으로 이동</span>';
        tip.style.display = 'block'; var x = ev.clientX - rc.left; tip.style.left = Math.max(0, Math.min(rc.width - 230, x + (x > rc.width / 2 ? -240 : 14))) + 'px'; tip.style.top = (ev.clientY - rc.top + 10) + 'px';
      });
      el.addEventListener('pointerleave', function () { $('ctip').style.display = 'none'; });
      el.addEventListener('click', function (ev) { player.idx = idxAt(ev); $('seek').value = player.idx; renderFrame(0, true); document.getElementById('stagewrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    })(svgs[i]);
  }

  // ---------- 예상 결과 ----------
  function drawSummary() {
    var sum = result.summary, c = S.ctrl, h = S.house;
    var cols = sum.map(function (d) { return d; });
    function row(label, fn, cls) { return '<tr><th>' + label + '</th>' + cols.map(function (d, i) { var p = prevSummary && prevSummary[i] && prevSummary[i].key === d.key ? prevSummary[i] : null; return '<td' + (cls ? ' class="' + cls(d) + '"' : '') + '>' + fn(d, p) + '</td>'; }).join('') + '</tr>'; }
    function diff(a, b, unit, better) { if (b == null || a == null) return ''; var d = a - b; if (Math.abs(d) < 0.05) return ''; var good = better === 'low' ? d < 0 : d > 0; return ' <small class="' + (good ? 'gd' : 'bd') + '">' + (d > 0 ? '+' : '') + f1(d) + unit + '</small>'; }
    var t = '<table class="sumt"><tr><th></th>' + cols.map(function (d) { return '<th>' + dlabel(d.date) + (d.full ? '' : '<br><small>(' + Math.round(d.hours) + '시간)</small>') + '</th>'; }).join('') + '</tr>'
      + row('하우스 안 최고 / 최저', function (d, p) { return '<b>' + f1(d.tmax) + '</b> / <b>' + f1(d.tmin) + '</b>℃<br><small>바깥 ' + f1(d.omax) + ' / ' + f1(d.omin) + '</small>'; })
      + row('적온 유지 시간 비율', function (d, p) { return '<b>' + d.okPct + '%</b>' + diff(d.okPct, p && p.okPct, '%p', 'high'); }, function (d) { return d.okPct >= 85 ? 'ok' : d.okPct >= 65 ? 'mid' : 'bad'; })
      + row('30℃ 넘는 시간', function (d, p) { return f1(d.hot) + '시간' + (d.hot35 > 0 ? ' <small>(35℃↑ ' + f1(d.hot35) + ')</small>' : '') + diff(d.hot, p && p.hot, 'h', 'low'); }, function (d) { return d.hot >= 1 ? 'bad' : 'ok'; })
      + row('밤 저온 시간 (' + (S.crop === 'cherry' ? 12 : 10) + '℃ 미만)', function (d, p) { return f1(d.cold) + '시간' + diff(d.cold, p && p.cold, 'h', 'low'); }, function (d) { return d.cold >= 1 ? 'bad' : 'ok'; })
      + row('습도 90% 이상 (결로·병 위험)', function (d, p) { return f1(d.wet) + '시간' + diff(d.wet, p && p.wet, 'h', 'low'); }, function (d) { return d.wet >= 3 ? 'bad' : d.wet >= 1 ? 'mid' : 'ok'; })
      + row('창 열린 시간', function (d) { return f1(d.vent) + '시간'; })
      + row('난방 · 등유', function (d, p) { return h.heater > 0 ? f1(d.heatH) + '시간 · <b>' + f1(d.oilL) + 'L</b>' + diff(d.oilL, p && p.oilL, 'L', 'low') : '난방기 없음'; })
      + row('관수 횟수 · 급액량', function (d) { return d.irr + '회 · ' + Math.round(d.supplyL * 1000) + 'mL/주'; })
      + row('예상 증산량 · 배액률', function (d) { return Math.round(d.etL * 1000) + 'mL/주' + (d.drain != null ? ' · <b>' + Math.round(d.drain) + '%</b>' : ''); }, function (d) { return d.drain == null ? '' : d.drain < 10 ? 'bad' : d.drain > 45 ? 'mid' : 'ok'; })
      + '</table>';
    var tips = F.advice(sum, c, h, S.crop);
    $('summary').innerHTML = t + '<ul class="tips">' + tips.map(function (x) { return '<li class="' + x[0] + '">' + (x[0] === 'warn' ? '⚠️ ' : x[0] === 'ok' ? '✅ ' : '💡 ') + x[1] + '</li>'; }).join('') + '</ul>'
      + (prevSummary ? '<p class="note">작은 글씨 숫자는 바로 전 설정과 비교한 변화입니다(초록 = 좋아짐).</p>' : '');
  }


  // ---------- 실제 기록으로 보정 ----------
  function savedCal() { try { var o = JSON.parse(ls('farmily.sim.cal') || 'null'); return o && o.cal ? o : null; } catch (e) { return null; } }
  function activeCal() { var o = savedCal(); return o && o.on ? o.cal : null; }
  var obsCache = {};
  function loadObs(stn) {
    if (obsCache[stn]) return Promise.resolve(obsCache[stn]);
    return fetch(BASE + 'data/obs/' + stn + '.csv', { cache: 'no-store' }).then(function (x) { if (!x.ok) throw 0; return x.text(); }).then(function (t) {
      var lines = t.trim().split(/\r?\n/), head = lines[0].split(','), m = {};
      for (var i = 1; i < lines.length; i++) { var v = lines[i].split(','), r = {}; head.forEach(function (h, j) { r[h] = v[j]; }); m[r.tm] = r; }
      obsCache[stn] = m; return m;
    }).catch(function () { obsCache[stn] = {}; return {}; });
  }
  function num(v) { var x = parseFloat(v); return isNaN(x) ? null : x; }
  function hkey(ms) { var d = kst(ms); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2) + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':00'; }
  // 기록 기간의 바깥 시간별 자료: ASOS 관측 > 지난 시간 자료 > 예보
  function driverFor(t0, t1, obs) {
    var c = COORD[S.region] || [36.5, 127.5], H = 3600000;
    var a = Math.floor(t0 / H) * H, b = Math.ceil(t1 / H) * H, n = Math.round((b - a) / H) + 1;
    var src = {};
    function put(t, v) { if (v && v.T != null) src[t] = v; }
    function fromW(o, h0s, nn) { if (!o || !o.T) return; var h0 = Date.parse(h0s + ':00+09:00'); for (var i = 0; i < Math.min(o.T.length, nn || 1e9); i++) put(h0 + i * H, { T: o.T[i], RH: o.RH && o.RH[i], G: o.G && o.G[i], SKY: o.SKY && o.SKY[i], PTY: o.PTY && o.PTY[i], VEC: o.VEC && o.VEC[i], WSD: o.WSD && o.WSD[i], R: o.R && o.R[i] }); }
    fromW(weather, weather.h0, F.hourlyLen(weather, c[0], c[1]));
    if (weather.past) fromW(weather.past, weather.past.h0);
    var nObs = 0;
    for (var i = 0; i < n; i++) {
      var t = a + i * H, r = obs[hkey(t)]; if (!r || num(r.ta) == null) continue;
      var r2 = obs[hkey(t + H)], i1 = num(r.icsr), i2 = r2 ? num(r2.icsr) : null, cl = num(r.dc10Tca), rn = num(r.rn) || 0, G;
      if (i1 != null || i2 != null) G = ((i1 != null ? i1 : i2) + (i2 != null ? i2 : i1)) / 2 * 1e6 / 3600;
      else { var sp = F.sunPos(c[0], c[1], new Date(t)), cz = Math.sin(Math.max(0, sp.el) * Math.PI / 180); G = sp.el > 0 ? 1098 * cz * Math.exp(-0.057 / Math.max(cz, 0.01)) * (rn > 0 ? 0.2 : 1 - 0.75 * Math.pow((cl == null ? 5 : cl) / 10, 3.4)) : 0; }
      put(t, { T: num(r.ta), RH: num(r.hm), G: G, SKY: cl == null ? 1 : cl <= 5 ? 1 : cl <= 8 ? 3 : 4, PTY: rn > 0 ? 1 : 0, VEC: num(r.wd), WSD: num(r.ws), R: rn }); nObs++;
    }
    var w = { h0: kst(a).toISOString().slice(0, 16), T: [], RH: [], G: [], SKY: [], PTY: [], VEC: [], WSD: [], R: [] }, miss = 0;
    for (i = 0; i < n; i++) { var v = src[a + i * H]; if (!v) miss++; ['T', 'RH', 'G', 'SKY', 'PTY', 'VEC', 'WSD', 'R'].forEach(function (k) { w[k].push(v ? (v[k] == null ? null : v[k]) : null); }); }
    return { w: w, miss: miss, n: n, nObs: nObs };
  }
  function parseCSV(text) {
    var lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 3) throw '기록이 너무 적습니다.';
    var dl = [',', '\t', ';'].sort(function (x, y) { return lines[0].split(y).length - lines[0].split(x).length; })[0];
    var head = lines[0].split(dl).map(function (h) { return h.replace(/"/g, '').trim(); });
    function col(re, not) { for (var i = 0; i < head.length; i++) if (re.test(head[i]) && !(not && not.test(head[i]))) return i; return -1; }
    var cDT = col(/일시|시각|datetime|timestamp/i), cD = col(/날짜|date|일자/i), cT = col(/^시간$|^time$|시간\(|시:분/i);
    if (cDT < 0 && cD >= 0 && cT < 0) cDT = cD;
    var cTi = col(/(안|내부|실내|하우스|in).*(온도|temp)|^온도|temp/i, /외부|바깥|외기|out|지온|토양|습도/i);
    var cRH = col(/(안|내부|실내|하우스|in)?.*(습도|hum|rh)/i, /외부|바깥|외기|out/i);
    if (cTi < 0) throw '온도 열을 찾지 못했습니다. 첫 줄 제목에 "안온도"를 넣어 주세요.';
    if (cDT < 0 && cD < 0) throw '시각 열을 찾지 못했습니다. 첫 줄 제목에 "시각"을 넣어 주세요.';
    var recs = [];
    for (var i = 1; i < lines.length; i++) {
      var v = lines[i].split(dl).map(function (x) { return x.replace(/"/g, '').trim(); });
      var ds = cDT >= 0 ? v[cDT] : v[cD] + ' ' + (cT >= 0 ? v[cT] : '');
      var m = /(\d{4})[-./년 ]\s*(\d{1,2})[-./월 ]\s*(\d{1,2})[^\d]+(\d{1,2})[:시]\s*(\d{1,2})?/.exec(ds);
      if (!m) continue;
      var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +(m[5] || 0)) - 9 * 3600000;
      var Ti = num(v[cTi]); if (Ti == null || Ti < -20 || Ti > 60) continue;
      var RHi = cRH >= 0 ? num(v[cRH]) : null; if (RHi != null && (RHi < 5 || RHi > 100)) RHi = null;
      recs.push({ t: t, Ti: Ti, RHi: RHi });
    }
    recs.sort(function (a, b) { return a.t - b.t; });
    if (recs.length < 6) throw '읽을 수 있는 기록이 6개 미만입니다. 시각 형식(예: 2026-10-13 14:00)을 확인해 주세요.';
    return recs;
  }
  function readFile(file) {
    return file.arrayBuffer().then(function (buf) {
      try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('euc-kr').decode(buf); }
    });
  }
  function describe(k, v) {
    var pct = Math.round((v - 1) * 100); if (Math.abs(pct) < 4) return '예상과 비슷';
    var up = pct > 0, a = Math.abs(pct) + '%';
    if (k === 'kU') return up ? '열이 예상보다 ' + a + ' 잘 빠짐 (피복 노후·이음매 확인)' : '보온이 예상보다 ' + a + ' 좋음';
    if (k === 'kInf') return up ? '틈새 바람이 예상보다 ' + a + ' 많음 (출입문·측창 밑 틈 확인)' : '밀폐가 예상보다 ' + a + ' 좋음';
    if (k === 'kTau') return up ? '햇빛이 예상보다 ' + a + ' 잘 들어옴' : '햇빛이 예상보다 ' + a + ' 덜 들어옴 (필름 오염·노후)';
    return up ? '창을 열면 환기가 예상보다 ' + a + ' 잘 됨' : '환기가 예상보다 ' + a + ' 덜 됨 (방충망 막힘·주변 장애물)';
  }
  function calChart(recs, rb, ra) {
    var Wc = Math.max(320, Math.round($('calout').clientWidth || 800)), Hc = 200, L = 40, R = 10, T = 14, B = 26;
    var t0 = recs[0].t, t1 = recs[recs.length - 1].t, vals = recs.map(function (r) { return r.Ti; });
    function pick(fr) { return fr.filter(function (f) { return f.t >= t0 && f.t <= t1; }); }
    var fb = pick(rb.frames), fa = pick(ra.frames);
    fb.concat(fa).forEach(function (f) { vals.push(f.Ti); });
    var lo = Math.floor(Math.min.apply(null, vals) / 5) * 5, hi = Math.ceil(Math.max.apply(null, vals) / 5) * 5; if (hi - lo < 10) hi = lo + 10;
    function X(t) { return (L + (t - t0) / Math.max(1, t1 - t0) * (Wc - L - R)).toFixed(1); } function Y(v) { return (Hc - B - (v - lo) / (hi - lo) * (Hc - B - T)).toFixed(1); }
    var o = '<svg viewBox="0 0 ' + Wc + ' ' + Hc + '" style="width:100%;height:auto;display:block">';
    for (var v = lo; v <= hi; v += 5) o += '<line x1="' + L + '" x2="' + (Wc - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#e5e7eb"/><text x="' + (L - 5) + '" y="' + (+Y(v) + 4) + '" font-size="10" fill="#888" text-anchor="end">' + v + '</text>';
    function line(fr, col, w, dash) { var d = ''; fr.forEach(function (f, i) { d += (i ? 'L' : 'M') + X(f.t) + ' ' + Y(f.Ti); }); return '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>'; }
    o += line(fb, '#94a3b8', 1.5, '5 4') + line(fa, '#c2410c', 2.5);
    var every = Math.max(1, Math.round(recs.length / 300));
    recs.forEach(function (r, i) { if (i % every === 0) o += '<circle cx="' + X(r.t) + '" cy="' + Y(r.Ti) + '" r="2.4" fill="#0f172a" opacity=".55"/>'; });
    var d0 = kst(t0); o += '<text x="' + L + '" y="' + (Hc - 8) + '" font-size="10" fill="#666">' + tlabel(t0) + '</text><text x="' + (Wc - R) + '" y="' + (Hc - 8) + '" font-size="10" fill="#666" text-anchor="end">' + tlabel(t1) + '</text></svg>';
    return '<div class="leg"><span><i style="border-top:3px solid #0f172a;opacity:.6"></i>실측(점)</span><span><i style="border-top:2px dashed #94a3b8"></i>보정 전 모델</span><span><i style="border-top:3px solid #c2410c"></i>보정 후 모델</span></div>' + o;
  }
  function runCal(recs, demo) {
    var c = COORD[S.region] || [36.5, 127.5], out = $('calout');
    out.innerHTML = '<p class="note">계산 중…</p>';
    var t0 = recs[0].t, t1 = recs[recs.length - 1].t;
    if (t1 - t0 < 12 * 3600000) { out.innerHTML = '<p class="warnbox">기록이 12시간 이상이어야 맞출 수 있습니다(가능하면 낮·밤이 들어간 2~3일).</p>'; return; }
    var pre = demo ? Promise.resolve({}) : loadObs(weather.obs_stn ? weather.obs_stn.id : '');
    pre.then(function (obs) {
      var dv;
      if (demo) { dv = { w: Object.assign({}, weather, { past: null }), miss: 0, n: 1, nObs: 0 }; }
      else { dv = driverFor(t0 - 6 * 3600000, t1 + 3600000, obs); }
      if (dv.miss > dv.n * 0.2) { out.innerHTML = '<p class="warnbox">이 기간의 바깥 날씨 자료가 부족합니다(' + dv.miss + '/' + dv.n + '시간 없음). 관측소 시간자료는 최근 35일부터 쌓이고 있으니, 그 안의 기록을 올려 주세요. (관측소: ' + esc(weather.obs_stn ? weather.obs_stn.name : '-') + ')</p>'; return; }
      setTimeout(function () {
        var res = F.calibrate(dv.w, c[0], c[1], S.house, S.crop, S.stage, S.ctrl, recs);
        var rows = F.CAL_PARAMS.map(function (p) { return '<tr><th>' + p.name + '</th><td>× ' + res.cal[p.k].toFixed(2) + (demo && demo[p.k] ? ' <small style="color:#888">(가상 정답 × ' + demo[p.k].toFixed(2) + ')</small>' : '') + '</td><td>' + describe(p.k, res.cal[p.k]) + '</td></tr>'; }).join('')
          + (demo ? '<tr><td colspan="3" class="note">창을 연 시간이 짧은 기간이면 환기 효율처럼 잘 드러나지 않는 항목이 생깁니다. 기록이 길고 날씨가 다양할수록 정확해집니다.</td></tr>' : '');
        out.innerHTML = (demo ? '<p class="warnbox">🧪 <b>가상 예시입니다 — 실제 측정값이 아닙니다.</b> 이 예보 기간에 "보온 30% 나쁨·틈새 80% 많음·햇빛 10% 적음·환기 25% 덜 됨"인 가상의 하우스를 만들어 30분마다 온도·습도를 기록했다고 치고(측정 오차 ±0.4℃ 포함), 보정이 그 차이를 얼마나 찾아내는지 보여 줍니다.</p>' : '')
          + '<p>기록 <b>' + recs.length + '개</b> (' + tlabel(t0) + ' ~ ' + tlabel(t1) + ')' + (demo ? '' : ' · 바깥 자료: ' + esc(weather.obs_stn.name) + ' 관측소 ' + dv.nObs + '시간 + 예보·지난 자료') + '</p>'
          + '<p>하우스 안 온도 평균 오차: 보정 전 <b>±' + f1(res.before.rmse) + '℃</b> → 보정 후 <b style="color:#15803d">±' + f1(res.after.rmse) + '℃</b>'
          + (res.after.rmseRH != null ? ' · 습도 ±' + Math.round(res.before.rmseRH) + '% → ±' + Math.round(res.after.rmseRH) + '%' : '') + '</p>'
          + '<table class="sumt calt">' + rows + '</table>' + calChart(recs, res.beforeRun, res.afterRun)
          + (demo ? '<p class="note">가상 예시라 적용 버튼은 없습니다. 실제 기록 파일을 올리면 이 하우스에 맞춘 값을 예보 시뮬레이션에 적용할 수 있습니다.</p>'
            : '<p><button class="btn" id="calapply" type="button">이 보정을 예보 시뮬레이션에 적용</button></p><p class="note">기록 기간의 자동제어 설정은 지금 입력된 값과 같다고 보고 맞췄습니다. 그동안 설정을 바꿨다면 결과가 달라질 수 있습니다.</p>');
        var ap = $('calapply');
        if (ap) ap.onclick = function () { ls('farmily.sim.cal', JSON.stringify({ on: true, cal: res.cal, rmse: res.after.rmse, n: recs.length, from: t0, to: t1, made: Date.now() })); showCalState(); simulate(); };
      }, 30);
    });
  }
  function showCalState() {
    var o = savedCal(), el = $('calstate'); if (!el) return;
    if (!o) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="okbox">' + (o.on ? '✅ 실측 보정 적용 중' : '⏸ 저장된 보정(꺼짐)') + ' · 기록 ' + o.n + '개(' + tlabel(o.from) + '~' + tlabel(o.to) + ') · 맞춘 뒤 오차 ±' + f1(o.rmse) + '℃ '
      + '<button class="btn ghost sm" id="caltoggle" type="button">' + (o.on ? '끄기' : '켜기') + '</button> <button class="btn ghost sm" id="caldel" type="button">지우기</button></div>';
    $('caltoggle').onclick = function () { o.on = !o.on; ls('farmily.sim.cal', JSON.stringify(o)); showCalState(); simulate(); };
    $('caldel').onclick = function () { try { localStorage.removeItem('farmily.sim.cal'); } catch (e) {} showCalState(); simulate(); };
  }
  function initCal() {
    showCalState();
    $('calfile').onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      readFile(f).then(function (txt) { var recs = parseCSV(txt); runCal(recs, false); }).catch(function (e) { $('calout').innerHTML = '<p class="warnbox">' + esc(typeof e === 'string' ? e : '파일을 읽지 못했습니다.') + '</p>'; });
      this.value = '';
    };
    $('caltpl').onclick = function () {
      var blob = new Blob(['﻿시각,안온도,안습도\n2026-10-13 06:00,,\n2026-10-13 06:10,,\n'], { type: 'text/csv' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '하우스_온도기록_양식.csv'; document.body.appendChild(a); a.click(); a.remove();
    };
    $('caldemo').onclick = function () {
      if (!weather) return;
      var c = COORD[S.region] || [36.5, 127.5], hidden = { kU: 1.3, kInf: 1.8, kTau: 0.9, kVent: 0.75 };
      var truth = F.run(Object.assign({}, weather, { past: null }), c[0], c[1], S.house, S.crop, S.stage, S.ctrl, { cal: hidden, noPast: true });
      var seed = 7; function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
      var recs = truth.frames.filter(function (f, i) { return i % 3 === 0 && i > 36; }).map(function (f) { return { t: f.t, Ti: Math.round((f.Ti + (rnd() - 0.5) * 0.8) * 10) / 10, RHi: Math.round(f.RHi + (rnd() - 0.5) * 4) }; });
      runCal(recs, hidden);
    };
  }

  // ---------- 시작 ----------
  function init() {
    buildForms(); initCal();
    $('play').onclick = function () { if (!result) return; if (player.idx >= result.frames.length - 1) player.idx = 0; player.playing = !player.playing; this.textContent = player.playing ? '⏸ 멈춤' : '▶ 재생'; };
    $('seek').oninput = function () { player.idx = +this.value; player.playing = false; $('play').textContent = '▶ 재생'; renderFrame(0, true); };
    $('speed').onchange = function () { player.speed = +this.value; };
    $('reset').onclick = function () { S.ctrl = F.defaults(S.crop); buildForms(); changed(); };
    $('jump').onchange = function () { if (!result) return; var v = this.value, fr = result.frames; for (var i = 0; i < fr.length; i++) { var d = kst(fr[i].t), dd = d.getUTCDate(), hh = d.getUTCHours();
      if (v === 'now') { player.idx = 0; break; } var parts2 = v.split('-'); if (+parts2[0] === dd && +parts2[1] === hh && d.getUTCMinutes() === 0) { player.idx = i; break; } }
      $('seek').value = player.idx; renderFrame(0, true); this.value = ''; };
    fetch(BASE + 'data/regions.json').then(function (r) { return r.json(); }).then(function (d) {
      regions = d.regions; sido = d.sido; if (!find(S.region)) S.region = '3406'; buildRegion(); loadWeather();
    });
    requestAnimationFrame(tick);
    setInterval(function () { if (!result) return; var fr = result.frames, sel = $('jump'), h = '<option value="">시각 바로 가기</option><option value="now">처음(지금)</option>';
      var seen = {}; fr.forEach(function (f) { var d = kst(f.t); if (d.getUTCMinutes() === 0 && [6, 9, 12, 15, 18, 21, 0, 3].indexOf(d.getUTCHours()) >= 0) { var k = d.getUTCDate() + '-' + d.getUTCHours(); if (!seen[k]) { seen[k] = 1; h += '<option value="' + k + '">' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + d.getUTCHours() + '시</option>'; } } });
      if (sel.dataset.h !== h) { sel.innerHTML = h; sel.dataset.h = h; } }, 1000);
  }
  init();
})();
