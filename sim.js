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
  S.date = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); S.days = 2;  // 날짜 선택(처음엔 오늘): '' = 지금부터(예보), 'YYYY-MM-DD' = 그날 0시부터(지난 시간은 관측, 앞으로는 예보)
  var regions = null, sido = [], weather = null, result = null, prevSummary = null, lastWin = '';
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
    buildDate();
    $('r_sido').onchange = function () { fillSigun(this.value); var first = regions.filter(function (r) { return r.sido === $('r_sido').value; })[0]; if (first) { S.region = first.code; $('r_sigun').value = first.code; loadWeather(); } };
    $('r_sigun').onchange = function () { S.region = this.value; ls('farmily.region', S.region); loadWeather(); };
  }
  function buildDate() {
    var el = $('f-date'); if (!el || el.dataset.ok) return; el.dataset.ok = 1;
    el.innerHTML = '<label class="dsel">📅 <input type="date" id="d_date" aria-label="날짜"></label>'
      + '<select id="d_len" aria-label="기간"><option value="1">1일</option><option value="2" selected>2일</option><option value="3">3일</option></select>'
      + '<button class="btn ghost sm" id="d_now" type="button">지금부터</button><span id="d_note"></span>';
    $('d_date').value = S.date;
    $('d_date').onchange = function () { S.date = this.value || ''; prevSummary = null; simulate(); };
    $('d_len').onchange = function () { S.days = +this.value; prevSummary = null; simulate(); };
    $('d_now').onclick = function () { S.date = ''; $('d_date').value = ''; prevSummary = null; simulate(); };
  }
  function ymd(ms) { return kst(ms).toISOString().slice(0, 10); }
  function fcEnd() { var c = COORD[S.region] || [36.5, 127.5]; return Date.parse(weather.h0 + ':00+09:00') + (F.hourlyLen(weather, c[0], c[1]) - 1) * 3600000; }
  function obsStart(obs) { var k = Object.keys(obs || {}).sort()[0]; return k ? Date.parse(k.replace(' ', 'T') + ':00+09:00') : null; }
  function dateBounds(obs) {
    var lo = obsStart(obs), p0 = weather.past && weather.past.h0 ? Date.parse(weather.past.h0 + ':00+09:00') : null;
    lo = Math.min(lo || Infinity, p0 || Infinity, Date.parse(weather.h0 + ':00+09:00'));
    var di = $('d_date'); if (di) { di.min = ymd(lo + 86400000); di.max = ymd(fcEnd()); }
    return { lo: lo, hi: fcEnd() };
  }
  // 빈 시간 채우기 (앞뒤 값으로 잇기)
  function fillGaps(w) {
    ['T', 'RH', 'G', 'WSD'].forEach(function (k) {
      var a = w[k], n = a.length, last = -1;
      for (var i = 0; i < n; i++) if (a[i] != null) {
        if (last < 0) for (var j = 0; j < i; j++) a[j] = a[i];
        else for (j = last + 1; j < i; j++) a[j] = a[last] + (a[i] - a[last]) * (j - last) / (i - last);
        last = i;
      }
      if (last >= 0) for (j = last + 1; j < n; j++) a[j] = a[last];
    });
    ['VEC', 'SKY', 'PTY', 'R'].forEach(function (k) { var a = w[k], prev = null; for (var i = 0; i < a.length; i++) { if (a[i] == null) a[i] = prev != null ? prev : (k === 'SKY' ? 1 : k === 'VEC' ? 270 : 0); prev = a[i]; } });
  }
  function fillSigun(s) { $('r_sigun').innerHTML = regions.filter(function (r) { return r.sido === s; }).map(function (r) { return '<option value="' + r.code + '"' + (r.code === S.region ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join(''); }
  function loadWeather() {
    $('status').textContent = '예보 불러오는 중…';
    fetch(BASE + 'data/weather/' + S.region + '.json', { cache: 'no-store' }).then(function (x) { if (!x.ok) throw 0; return x.json(); })
      .then(function (w) { weather = w; prevSummary = null; if (!$('v_fc')) buildVirt(); simulate(); })
      .catch(function () { $('status').textContent = '이 지역 예보를 아직 불러올 수 없습니다.'; });
  }

  // ---------- 가상 날씨 ----------
  // 예보 대신 직접 만든 날씨(기온·습도·하늘·비·바람)로 계산해 '이런 날이면 우리 하우스는?'을 미리 봄
  var VFIELDS = [
    { k: 'tmin', label: '아침 최저기온', unit: '℃', min: -25, max: 35, step: 1 },
    { k: 'tmax', label: '낮 최고기온', unit: '℃', min: -15, max: 45, step: 1 },
    { k: 'trend', label: '날마다 기온 변화', help: '다음 날로 갈수록 + 오름 · − 내림(찬 공기)', unit: '℃/일', min: -10, max: 10, step: 1 },
    { k: 'rhDay', label: '한낮 습도', unit: '%', min: 10, max: 100, step: 5 },
    { k: 'rhNight', label: '밤·새벽 습도', unit: '%', min: 30, max: 100, step: 5 },
    { k: 'sky', label: '하늘', type: 'select', opts: [['1', '맑음'], ['3', '구름 많음'], ['4', '흐림']] },
    { k: 'ws', label: '바람 세기', help: '평균 풍속 (한낮엔 조금 더 셈)', unit: 'm/s', min: 0, max: 25, step: 0.5 },
    { k: 'wd', label: '바람 방향', type: 'select', opts: [['0', '북풍'], ['45', '북동풍'], ['90', '동풍'], ['135', '남동풍'], ['180', '남풍'], ['225', '남서풍'], ['270', '서풍'], ['315', '북서풍']] },
    { k: 'rain', label: '비·눈', type: 'select', opts: [['0', '없음'], ['1', '약한 비 (시간당 1mm)'], ['4', '비 (시간당 4mm)'], ['12', '강한 비 (시간당 12mm)'], ['snow', '눈']] },
    { k: 'rainDay', label: '비·눈 오는 날', type: 'select', opts: [['1', '첫째 날'], ['2', '둘째 날'], ['3', '셋째 날']], rain: 1 },
    { k: 'rainHour', label: '비·눈 시작 시각', unit: '시', min: 0, max: 23, step: 1, rain: 1 },
    { k: 'rainHours', label: '비·눈 오는 시간', unit: '시간', min: 1, max: 48, step: 1, rain: 1 }
  ];
  var VPRESETS = [
    ['☀️ 맑은 가을날', { tmin: 10, tmax: 24, trend: 0, rhDay: 45, rhNight: 90, sky: '1', ws: 2, wd: '315', rain: '0' }],
    ['📉 찬 공기 내려옴', { tmin: 12, tmax: 22, trend: -6, rhDay: 40, rhNight: 80, sky: '1', ws: 6, wd: '315', rain: '0' }],
    ['🌥 흐리고 습한 날', { tmin: 15, tmax: 21, trend: 0, rhDay: 75, rhNight: 98, sky: '4', ws: 1, wd: '90', rain: '0' }],
    ['🌧 하루 종일 비', { tmin: 14, tmax: 18, trend: 0, rhDay: 85, rhNight: 98, sky: '4', ws: 3, wd: '180', rain: '4', rainDay: '1', rainHour: 6, rainHours: 14 }],
    ['🌀 비바람·태풍', { tmin: 20, tmax: 25, trend: 0, rhDay: 90, rhNight: 99, sky: '4', ws: 14, wd: '135', rain: '12', rainDay: '1', rainHour: 3, rainHours: 18 }],
    ['🔥 폭염', { tmin: 27, tmax: 36, trend: 0, rhDay: 50, rhNight: 85, sky: '1', ws: 1.5, wd: '225', rain: '0' }],
    ['❄️ 한파', { tmin: -12, tmax: -2, trend: -1, rhDay: 40, rhNight: 70, sky: '1', ws: 5, wd: '315', rain: '0' }],
    ['🌨 눈 오는 날', { tmin: -4, tmax: 1, trend: 0, rhDay: 80, rhNight: 95, sky: '4', ws: 3, wd: '0', rain: 'snow', rainDay: '1', rainHour: 18, rainHours: 10 }]
  ];
  var VBASE = { on: false, date: '', days: 2, tmin: 10, tmax: 24, trend: 0, rhDay: 45, rhNight: 90, sky: '1', ws: 2, wd: '315', rain: '0', rainDay: '1', rainHour: 6, rainHours: 6 };
  S.virt = (function () { try { return Object.assign({}, VBASE, JSON.parse(ls('farmily.sim.virt') || '{}') || {}); } catch (e) { return Object.assign({}, VBASE); } })();
  function saveVirt() { ls('farmily.sim.virt', JSON.stringify(S.virt)); }
  function vStart() { var d = S.virt.date || ymd(Date.now()); return Date.parse(d + 'T00:00:00+09:00'); }

  // 시간별 바깥 날씨 만들기: 계산 시작 하루 전(하우스 안 상태 맞추기용)부터 기간 끝까지
  function virtWeather() {
    var V = S.virt, H = 3600000, c = COORD[S.region] || [36.5, 127.5];
    var t0 = vStart(), a = t0 - 24 * H, n = (V.days + 1) * 24 + 1;
    var tmin = +V.tmin, tmax = Math.max(+V.tmax, tmin + 1), tr = +V.trend || 0;
    function lo(d) { return tmin + tr * Math.max(0, d); }
    function hi(d) { return tmax + tr * Math.max(0, d); }
    var rainOn = V.rain !== '0', rs = t0 + ((+V.rainDay || 1) - 1) * 86400000 + (+V.rainHour || 0) * H, re = rs + (+V.rainHours || 1) * H;
    var snow = V.rain === 'snow', rmm = snow ? 1 : +V.rain || 0, sky0 = +V.sky || 1, ws0 = +V.ws || 0, wd0 = +V.wd || 0;
    var w = { h0: kst(a).toISOString().slice(0, 16), h0t: a, src: [], T: [], RH: [], G: [], GC: [], SKY: [], PTY: [], VEC: [], WSD: [], R: [], P: [] };
    for (var i = 0; i < n; i++) {
      var t = a + i * H, h = kst(t).getUTCHours(), d = Math.floor(i / 24) - 1, T;
      // 새벽 6시 최저 → 오후 3시 최고 → 다음 날 새벽 최저로 이어지는 하루 곡선
      if (h < 6) T = lo(d) + (hi(d - 1) - lo(d)) * (1 + Math.cos(Math.PI * (h + 9) / 15)) / 2;
      else if (h <= 15) T = lo(d) + (hi(d) - lo(d)) * (1 - Math.cos(Math.PI * (h - 6) / 9)) / 2;
      else T = lo(d + 1) + (hi(d) - lo(d + 1)) * (1 + Math.cos(Math.PI * (h - 15) / 15)) / 2;
      var wet = rainOn && t >= rs && t < re, near = rainOn && t >= rs - 3 * H && t < re + 2 * H;
      if (wet) T -= 0.35 * Math.max(0, T - lo(d));
      var fr = Math.max(0, Math.min(1, (T - lo(d)) / Math.max(1, hi(d) - lo(d))));
      var RH = +V.rhNight - (+V.rhNight - +V.rhDay) * fr;
      if (wet) RH = Math.max(RH, 95); else if (near) RH = Math.max(RH, 85);
      var sky = wet || near ? 4 : sky0;
      var sp = F.sunPos(c[0], c[1], new Date(t)), cz = Math.sin(Math.max(0, sp.el) * Math.PI / 180);
      var clear = sp.el > 0 ? 1098 * cz * Math.exp(-0.057 / Math.max(cz, 0.01)) : 0;
      var G = clear * (wet ? (rmm >= 10 ? 0.12 : 0.2) : sky === 1 ? 1 : sky === 3 ? 0.7 : 0.35);
      var gust = h >= 9 && h <= 21 ? 0.75 + 0.5 * Math.sin(Math.PI * (h - 9) / 12) : 0.7;
      var ws = Math.max(0, ws0 * gust * (wet ? 1.15 : 1));
      w.src.push('virt'); w.T.push(Math.round(T * 10) / 10); w.RH.push(Math.round(Math.max(5, Math.min(100, RH))));
      w.G.push(Math.round(G)); w.GC.push(Math.round(clear)); w.SKY.push(sky); w.PTY.push(wet ? (snow ? 3 : 1) : 0);
      w.VEC.push(Math.round((wd0 + 12 * Math.sin(i / 5) + 360) % 360)); w.WSD.push(Math.round(ws * 10) / 10); w.R.push(wet ? rmm : 0);
      w.P.push(wet ? 90 : near ? 60 : sky === 4 ? 30 : sky === 3 ? 20 : 0);
    }
    return { w: w, t0: t0 };
  }
  function virtLabel() {
    var V = S.virt, sky = { 1: '맑음', 3: '구름 많음', 4: '흐림' }[V.sky] || '';
    var rain = V.rain === '0' ? '' : ' · ' + (V.rain === 'snow' ? '눈' : '비 시간당 ' + V.rain + 'mm') + ' (' + V.rainDay + '일째 ' + V.rainHour + '시부터 ' + V.rainHours + '시간)';
    return sky + ' · 최저 ' + V.tmin + '℃ / 최고 ' + V.tmax + '℃' + (+V.trend ? ' (날마다 ' + (V.trend > 0 ? '+' : '') + V.trend + '℃)' : '') + ' · 바람 ' + V.ws + 'm/s' + rain;
  }
  function vFieldHTML(f) {
    var v = S.virt[f.k], id = 'v_' + f.k, h = '<label class="fld" id="w_' + id + '"' + (f.rain && S.virt.rain === '0' ? ' style="display:none"' : '') + '><span class="fl">' + f.label + (f.help ? '<i>' + f.help + '</i>' : '') + '</span>';
    if (f.type === 'select') h += '<select id="' + id + '">' + f.opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(v) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
    else h += '<span class="numw"><input type="number" id="' + id + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + v + '"><em>' + f.unit + '</em></span>';
    return h + '</label>';
  }
  function buildVirt() {
    var top = document.querySelector('.top'); if (!$('vcard')) return;
    if (!$('wmode')) {
      var m = document.createElement('select'); m.id = 'wmode'; m.setAttribute('aria-label', '날씨 자료');
      m.innerHTML = '<option value="fc">📡 기상청 예보</option><option value="virt">🧪 가상 날씨</option>';
      top.insertBefore(m, top.firstChild);
      m.onchange = function () { S.virt.on = this.value === 'virt'; saveVirt(); prevSummary = null; showVirt(); simulate(); };
    }
    $('wmode').value = S.virt.on ? 'virt' : 'fc';
    var V = S.virt, card = $('vcard');
    card.innerHTML = '<h2>🧪 가상 날씨 만들기 <small style="font-size:12px;color:#888;font-weight:400">예보가 아닌, 직접 정한 날씨로 계산합니다</small></h2>'
      + '<div class="vpre">' + VPRESETS.map(function (p, i) { return '<button class="btn ghost sm" type="button" data-vp="' + i + '">' + p[0] + '</button>'; }).join('')
      + (weather ? '<button class="btn ghost sm" type="button" id="v_fc">📡 지금 예보 값으로 채우기</button>' : '') + '</div>'
      + '<div class="vgrid">'
      + '<label class="fld"><span class="fl">시작 날짜<i>계절에 따라 해 높이·낮 길이가 바뀝니다</i></span><input type="date" id="v_date" value="' + (V.date || ymd(Date.now())) + '"></label>'
      + '<label class="fld"><span class="fl">기간</span><select id="v_days">' + [1, 2, 3].map(function (d) { return '<option value="' + d + '"' + (+V.days === d ? ' selected' : '') + '>' + d + '일</option>'; }).join('') + '</select></label>'
      + VFIELDS.map(vFieldHTML).join('') + '</div>'
      + '<p class="note">기온은 새벽 6시쯤 가장 낮고 오후 3시쯤 가장 높게, 습도는 그 반대로 움직이도록 만듭니다. 비·눈이 오는 동안은 하늘이 흐려지고 습도가 95% 이상으로 오르며 햇빛이 크게 줄어듭니다. 지역(위 시·군)은 해 위치 계산에만 씁니다. 설정을 바꾸면 아래 예상 결과 표에 바로 전 설정과의 차이가 작은 글씨로 나옵니다.</p>';
    Array.prototype.forEach.call(card.querySelectorAll('[data-vp]'), function (b) {
      b.onclick = function () { var p = VPRESETS[+this.dataset.vp][1]; Object.assign(S.virt, { trend: 0, rain: '0' }, p); saveVirt(); buildVirt(); simulate(); };
    });
    if ($('v_fc')) $('v_fc').onclick = function () {
      var ds = (weather.days || []).filter(function (d) { return d.min != null && d.max != null; });
      if (!ds.length) return;
      var T = weather.T.filter(function (x) { return x != null; }), RH = (weather.RH || []).filter(function (x) { return x != null; }), Wv = (weather.WSD || []).filter(function (x) { return x != null; });
      var avg = function (a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; };
      Object.assign(S.virt, { date: ds[0].d, tmin: Math.round(ds[0].min), tmax: Math.round(ds[0].max),
        trend: ds[1] ? Math.round(((ds[1].min + ds[1].max) - (ds[0].min + ds[0].max)) / 2) : 0,
        rhDay: Math.round(Math.min.apply(null, RH.length ? RH : [50]) / 5) * 5, rhNight: Math.round(Math.max.apply(null, RH.length ? RH : [90]) / 5) * 5,
        ws: Math.round(avg(Wv) * 2) / 2, rain: '0' });
      // 하늘: 첫날 낮 동안 가장 많은 하늘 상태 · 비·눈: 예보 안의 첫 강수 구간
      var h0 = Date.parse(weather.h0 + ':00+09:00'), cnt = { 1: 0, 3: 0, 4: 0 }, d0 = Date.parse(ds[0].d + 'T00:00:00+09:00');
      for (var i = 0; i < weather.T.length; i++) { var t = h0 + i * 3600000, hh = kst(t).getUTCHours(); if (t >= d0 && t < d0 + 86400000 && hh >= 8 && hh <= 17 && weather.SKY && cnt[weather.SKY[i]] != null) cnt[weather.SKY[i]]++; }
      S.virt.sky = ['1', '3', '4'].sort(function (x, y) { return cnt[y] - cnt[x]; })[0];
      var PT = weather.PTY || [], RR = weather.R || [];
      for (i = 0; i < PT.length; i++) {
        t = h0 + i * 3600000; if (t < d0) continue; if (t >= d0 + 3 * 86400000) break;
        if (PT[i] > 0) {
          var j = i, sum = 0, snowN = 0; while (j < PT.length && PT[j] > 0) { sum += RR[j] || 0; if (PT[j] === 3 || PT[j] === 2) snowN++; j++; }
          var mm = sum / (j - i);
          Object.assign(S.virt, { rain: snowN > (j - i) / 2 ? 'snow' : mm >= 8 ? '12' : mm >= 2.5 ? '4' : '1', rainDay: String(Math.floor((t - d0) / 86400000) + 1), rainHour: kst(t).getUTCHours(), rainHours: Math.min(48, j - i) });
          if (+S.virt.days < +S.virt.rainDay) S.virt.days = +S.virt.rainDay;
          break;
        }
      }
      saveVirt(); buildVirt(); simulate();
    };
    $('v_date').onchange = function () { S.virt.date = this.value; prevSummary = null; saveVirt(); simulate(); };
    $('v_days').onchange = function () { S.virt.days = +this.value; prevSummary = null; saveVirt(); simulate(); };
    VFIELDS.forEach(function (f) {
      $('v_' + f.k).onchange = function () {
        var v = this.value;
        if (f.type !== 'select') { v = +v; if (isNaN(v)) v = VBASE[f.k]; v = Math.max(f.min, Math.min(f.max, v)); this.value = v; }
        S.virt[f.k] = v;
        if (f.k === 'tmin' && S.virt.tmax <= v) { S.virt.tmax = v + 1; $('v_tmax').value = v + 1; }
        if (f.k === 'tmax' && S.virt.tmin >= v) { S.virt.tmin = v - 1; $('v_tmin').value = v - 1; }
        if (f.k === 'rain') VFIELDS.forEach(function (g) { if (g.rain) $('w_v_' + g.k).style.display = v === '0' ? 'none' : ''; });
        saveVirt(); clearTimeout(tmr); tmr = setTimeout(simulate, 200);
      };
    });
    showVirt();
  }
  function showVirt() {
    var on = S.virt.on; if (!$('vcard')) return;
    $('vcard').style.display = on ? '' : 'none';
    var fd = $('f-date'); if (fd) fd.style.display = on ? 'none' : '';
    if (on && !$('v_date')) buildVirt();
    if (window.postHeight) setTimeout(window.postHeight, 50);
  }

  // ---------- 계산 ----------
  function simVirtual() {
    var c = COORD[S.region] || [36.5, 127.5];
    var keepIdx = player.idx, keepT = result && result.frames[Math.floor(keepIdx)] ? result.frames[Math.floor(keepIdx)].t : null;
    var old = result ? result.summary : null, vw = virtWeather();
    var win = 'v|' + vw.t0 + '|' + S.virt.days; if (win !== lastWin) { keepT = null; old = null; lastWin = win; }
    result = F.run(vw.w, c[0], c[1], S.house, S.crop, S.stage, S.ctrl, { cal: activeCal(), noPast: true, recordFrom: vw.t0 });
    result.drv = null; result.virt = true;
    if (old) prevSummary = old;
    var r = find(S.region), g = result.geom;
    $('status').innerHTML = esc(r ? r.sido + ' ' + r.name : '') + ' · 바닥 ' + Math.round(g.A).toLocaleString() + 'm² · ' + result.plants.toLocaleString() + '주'
      + ' · <b style="color:#7c3aed">🧪 가상 날씨</b> ' + esc(dlabel(vw.t0 + 9 * 3600000)) + '부터 ' + S.virt.days + '일: ' + esc(virtLabel())
      + (activeCal() ? ' · <b style="color:#15803d">실측 보정 적용 중</b>' : '');
    var fr = result.frames;
    player.idx = 0;
    if (keepT != null) for (var i = 0; i < fr.length; i++) if (fr[i].t >= keepT) { player.idx = i; break; }
    if (keepT == null) { for (i = 0; i < fr.length; i++) { var d = kst(fr[i].t); if (d.getUTCHours() === 7 && d.getUTCMinutes() === 0) { player.idx = i; break; } } }
    $('seek').max = fr.length - 1; $('seek').value = player.idx;
    var nb = $('nowbox'); if (nb) nb.dataset.place = (r ? r.sido + ' ' + r.name : '') + ' · 가상 날씨';
    drawCharts(); drawSummary(); renderFrame();
  }
  function simulate() {
    if (S.virt && S.virt.on) return simVirtual();
    if (!weather) return;
    var c = COORD[S.region] || [36.5, 127.5];
    var keepIdx = player.idx, keepT = result && result.frames[Math.floor(keepIdx)] ? result.frames[Math.floor(keepIdx)].t : null;
    var old = result ? result.summary : null, w = weather, opt = { cal: activeCal() }, dv = null, note = '';
    var stn = weather.obs_stn ? weather.obs_stn.id : '';
    if (S.date) {
      if (!obsCache[stn]) { $('status').textContent = '관측 자료 불러오는 중…'; loadObs(stn).then(simulate); return; }
      var obs = obsCache[stn], bd = dateBounds(obs), H = 3600000;
      var t0 = Date.parse(S.date + 'T00:00:00+09:00'), t1 = Math.min(t0 + S.days * 86400000, bd.hi);
      if (t1 - t0 < 6 * H) { $('d_note').innerHTML = ' <b style="color:#b91c1c">이 날짜는 예보 범위를 벗어났습니다 (' + ymd(bd.hi) + '까지 가능)</b>'; return; }
      dv = driverFor(t0 - 24 * H, t1, obs);
      if (dv.miss > dv.n * 0.3) {
        if (S.date !== ymd(Date.now())) { $('d_note').innerHTML = ' <b style="color:#b91c1c">이 기간은 바깥 자료가 부족합니다 (관측 자료 ' + ymd(bd.lo + 86400000) + '부터)</b>'; return; }
        dv = null; note = ' · 오늘 새벽 바깥 자료가 모자라 지금부터 예보로 계산';  // 오늘은 자료가 모자라면 예보 계산으로 대신
      } else {
      fillGaps(dv.w); w = dv.w; opt.noPast = true; opt.recordFrom = t0;
      var cnt = { obs: 0, past: 0, fc: 0 }; dv.w.src.forEach(function (x, i) { if (dv.w.h0t + i * H >= t0 && x) cnt[x]++; });
      note = ' · ' + S.date.slice(5).replace('-', '/') + '부터 ' + S.days + '일: 관측소 관측 ' + cnt.obs + '시간' + (cnt.past ? ' + 지난 자료 ' + cnt.past + '시간' : '') + ' + 예보 ' + cnt.fc + '시간' + (dv.miss ? ' (빈 ' + dv.miss + '시간은 앞뒤 값으로 이음)' : '');
      }
    } else if (stn && !obsCache[stn]) loadObs(stn).then(function (o) { dateBounds(o); });
    if (obsCache[stn]) dateBounds(obsCache[stn]);
    var dn = $('d_note'); if (dn) dn.innerHTML = dv ? ' <span style="color:#555">지난 시간은 <b>관측값</b>, 앞으로는 <b>예보</b>로 계산 · 하우스 안은 모델 계산값</span>' : '';
    var win = S.date + '|' + S.days; if (win !== lastWin) { keepT = null; old = null; lastWin = win; }
    result = F.run(w, c[0], c[1], S.house, S.crop, S.stage, S.ctrl, opt);
    result.drv = dv;
    if (old) prevSummary = old;
    var r = find(S.region), g = result.geom;
    $('status').innerHTML = esc(r ? r.sido + ' ' + r.name : '') + ' · 바닥 ' + Math.round(g.A).toLocaleString() + 'm² · 부피 ' + Math.round(g.V).toLocaleString() + 'm³ · 피복 표면 ' + Math.round(g.Ac).toLocaleString() + 'm² · ' + result.plants.toLocaleString() + '주'
      + (dv ? note : ' · 기상청 ' + String(weather.short_base || '').replace(/^(\d{4})(\d\d)(\d\d) (\d\d).*/, function (m, a, b, c2, d) { return (+b) + '/' + (+c2) + ' ' + d + '시'; }) + ' 발표 예보' + note)
      + (result.preH ? ' · 직전 ' + result.preH + '시간 바깥 자료로 출발' : '')
      + (activeCal() ? ' · <b style="color:#15803d">실측 보정 적용 중</b>' : '');
    var fr = result.frames;
    player.idx = 0;
    if (keepT != null) for (var i = 0; i < fr.length; i++) if (fr[i].t >= keepT) { player.idx = i; break; }
    if (keepT == null) { var noon = 0; for (i = 0; i < fr.length; i++) { var d = kst(fr[i].t); if (d.getUTCHours() === 7 && d.getUTCMinutes() === 0) { noon = i; break; } } player.idx = noon; }
    if (player.live && !player.playing) { var ni = nowIdx(); if (ni >= 0) player.idx = ni; }
    $('seek').max = fr.length - 1; $('seek').value = player.idx;
    var nb = $('nowbox'); if (nb) nb.dataset.place = (r ? r.sido + ' ' + r.name : '') + (weather.obs_stn ? ' · 관측 ' + weather.obs_stn.name + ' 관측소' + (weather.obs_stn.km ? ' (' + weather.obs_stn.km + 'km)' : '') : '');
    drawCharts(); drawSummary(); renderFrame();
  }

  // ---------- 플레이어 ----------
  var player = { idx: 0, playing: false, speed: 6, last: 0, live: true };  // speed: 초당 프레임(10분) 수 → 6 = 1시간/초 · live: '지금' 따라가기(기본)
  // 지금 시각에 가장 가까운 장면 번호 (범위 밖이면 -1)
  function nowIdx() {
    if (!result || !result.frames.length) return -1;
    var fr = result.frames, now = Date.now();
    if (now < fr[0].t || now > fr[fr.length - 1].t) return -1;
    var best = 0; for (var i = 0; i < fr.length; i++) if (Math.abs(fr[i].t - now) < Math.abs(fr[best].t - now)) best = i;
    return best;
  }
  function setLive(on) {
    player.live = on; var b = $('now'); if (b) { b.classList.toggle('on', on); b.title = on ? '지금 시각을 따라가는 중 (날씨 자료가 갱신되면 자동 반영)' : '지금 시각으로 이동'; }
  }
  function goNow() { var i = nowIdx(); if (i < 0) return false; player.idx = i; $('seek').value = i; renderFrame(0, true); return true; }
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
    } else {
      player.last = 0;
      if (player.live && result && !(S.virt && S.virt.on)) { var ni = nowIdx(); if (ni >= 0 && ni !== Math.floor(player.idx)) { player.idx = ni; $('seek').value = ni; } }
      renderFrame(0.016, true);
    }
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

  // ---------- 단면(2D) 그림: 실제 하우스처럼 ----------
  // 아치 파이프·도리·물받이·기초, 측창 감기 축·개폐기·방충망, 보온커튼·차광망, 두둑·멀칭·점적, 유인줄 토마토(겹잎·화방·열매),
  // 온풍기·연통·비닐 덕트, 유동팬, 하늘색·햇살·산·이웃 하우스·배수로, 결로·비·눈·서리·안개·밤 어둠까지 그림.
  function clamp2(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function hexS(n) { return '#' + ('00000' + (n >>> 0).toString(16)).slice(-6); }
  function mixC(a, b, f) { var r = (a >> 16) & 255, g = (a >> 8) & 255, c = a & 255, r2 = (b >> 16) & 255, g2 = (b >> 8) & 255, c2 = b & 255; return (Math.round(r + (r2 - r) * f) << 16) | (Math.round(g + (g2 - g) * f) << 8) | Math.round(c + (c2 - c) * f); }
  var SKY2 = [[-18, 0x040814, 0x0d1428, 0x000000], [-10, 0x081129, 0x1a2342, 0x000000], [-5, 0x1c2a58, 0x5a4a6e, 0xff7a4a],
    [-1, 0x3a4f86, 0xe38a5a, 0xff8a4a], [3, 0x4f73b0, 0xf4b072, 0xffa860], [8, 0x4c86c8, 0xf0d2a6, 0xffd2a0],
    [18, 0x3f8ad4, 0xcfe4f2, 0xfff1dc], [40, 0x2f7fd0, 0xbcdcf2, 0xffffff], [90, 0x2a76c8, 0xb4d6f0, 0xffffff]];
  function sky2(el, over, pty) {
    var k = SKY2, i = 0; while (i < k.length - 2 && el > k[i + 1][0]) i++;
    var a = k[i], b = k[i + 1], f = clamp2((el - a[0]) / (b[0] - a[0]), 0, 1);
    var top = mixC(a[1], b[1], f), hor = mixC(a[2], b[2], f), sun = mixC(a[3], b[3], f);
    if (over) { var day = clamp2((el + 4) / 14, 0, 1), rn = pty > 0 && pty !== 3, sn = pty === 3;
      top = mixC(top, mixC(0x141a26, rn ? 0x7d8792 : sn ? 0xc3c9d0 : 0x9aa4ae, day), 0.85); hor = mixC(hor, mixC(0x252c3a, rn ? 0xa3abb3 : sn ? 0xdde1e6 : 0xc6ccd2, day), 0.85); }
    return { top: top, hor: hor, sun: sun };
  }
  function srand(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  var c2d = { key: '', bg: '', crop: '' };
  function n1(v) { return (Math.round(v * 10) / 10).toString(); }
  // 토마토 겹잎 (x,y 줄기 붙는 곳, dir ±1 방향, len px)
  function leafSvg(x, y, dir, len, col, rot) {
    var o = '', a = (rot || 0), ca = Math.cos(a), sa = Math.sin(a);
    function P(px, py) { return n1(x + (px * ca - py * sa) * dir) + ' ' + n1(y + px * sa + py * ca); }
    function D(t) { return len * (0.18 * t * t + 0.05 * t); }  // 끝으로 갈수록 처짐
    o += '<path d="M' + P(0, 0) + 'Q' + P(len * 0.5, -len * 0.05) + ' ' + P(len, D(1)) + '" stroke="' + col + '" stroke-width="1.3" fill="none"/>';
    [[0.3, 0.32, 0.15], [0.55, 0.36, 0.17], [0.78, 0.3, 0.14]].forEach(function (q) {
      [-1, 1].forEach(function (sd) {
        var bx = len * q[0], by = D(q[0]), ex = bx + len * q[1] * 0.55, ey = by + sd * len * q[1] * 0.75 + len * 0.06, w = len * q[2];
        o += '<path d="M' + P(bx, by) + 'Q' + P((bx + ex) / 2 - sd * w * 0.3, (by + ey) / 2 - w) + ' ' + P(ex, ey) + 'Q' + P((bx + ex) / 2 + sd * w * 0.3, (by + ey) / 2 + w) + ' ' + P(bx, by) + 'Z" fill="' + col + '"/>';
      });
    });
    var tx = len, ty = D(1), w2 = len * 0.17;
    o += '<path d="M' + P(tx - len * 0.06, ty) + 'Q' + P(tx + len * 0.12, ty - w2) + ' ' + P(tx + len * 0.32, ty + len * 0.05) + 'Q' + P(tx + len * 0.12, ty + w2) + ' ' + P(tx - len * 0.06, ty) + 'Z" fill="' + col + '"/>';
    return o;
  }
  function draw2D(f, h, g, o) {
    var W = 900, ground = o.ground, sx = o.sx, sy = o.sy, x0 = o.x0, n = g.n, nW = n * g.W, FS = o.FS, narrowS = o.narrowS, multi = n > 1;
    function fz(v) { return (v * FS).toFixed(1); }
    function X(m) { return x0 + m * sx; }
    function Y(m) { return ground - m * sy; }
    function yAt(u) { return g.hs + (g.hr - g.hs) * 4 * u * (1 - u); }
    var el = f.el, over = f.sky === 4 || f.pty > 0, isRain = f.pty === 1 || f.pty === 2 || f.pty === 4, isSnow = f.pty === 2 || f.pty === 3, snowCover = f.pty === 3 || (f.pty === 2 && f.To < 1);
    var SC = sky2(el, over, f.pty), dayF = clamp2((el + 2) / 12, 0, 1), now = Date.now();
    var frost = !over && f.To <= 2 && el < 12, fog = f.RHo >= 97 && f.ws < 2.5;
    var axis = h.axis % 180, nB = (axis + 90) % 360;
    var hsP = g.hs * sy, hrP = g.hr * sy, spanP = g.W * sx;
    var s = '', lab = '';
    // ── 정의 ──
    var sunCol = hexS(SC.sun || 0xffffff);
    s += '<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + hexS(SC.top) + '"/><stop offset=".62" stop-color="' + hexS(mixC(SC.top, SC.hor, 0.6)) + '"/><stop offset="1" stop-color="' + hexS(SC.hor) + '"/></linearGradient>'
      + '<radialGradient id="sglow"><stop offset="0" stop-color="' + sunCol + '" stop-opacity=".85"/><stop offset=".25" stop-color="' + sunCol + '" stop-opacity=".35"/><stop offset="1" stop-color="' + sunCol + '" stop-opacity="0"/></radialGradient>'
      + '<linearGradient id="soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b5440"/><stop offset=".35" stop-color="#5a4433"/><stop offset="1" stop-color="#3f3024"/></linearGradient>'
      + '<linearGradient id="mulch" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3f45"/><stop offset=".35" stop-color="#16181b"/><stop offset="1" stop-color="#0d0e10"/></linearGradient>'
      + '<linearGradient id="airg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + rgb(tempColor(f.Ti + 2), 1) + '" stop-opacity=".30"/><stop offset="1" stop-color="' + rgb(tempColor(f.Ti - 1), 1) + '" stop-opacity=".12"/></linearGradient>'
      + '<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8" stop-opacity=".55"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></linearGradient>'
      + '<radialGradient id="hglow"><stop offset="0" stop-color="#ffb35c" stop-opacity=".75"/><stop offset=".5" stop-color="#ff8a3d" stop-opacity=".25"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>'
      + '<radialGradient id="drop"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset="1" stop-color="#bcd3ea" stop-opacity=".35"/></radialGradient>'
      + '<radialGradient id="puff"><stop offset="0" stop-color="#e6e9ec" stop-opacity=".7"/><stop offset="1" stop-color="#e6e9ec" stop-opacity="0"/></radialGradient>'
      + '<linearGradient id="cloudg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#cfd6de"/></linearGradient>'
      + '<pattern id="net" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0L4 4M4 0L0 4" stroke="#4b5563" stroke-width=".5"/></pattern>'
      + '<pattern id="shd" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#111418" opacity=".7"/><path d="M0 2.5H5M2.5 0V5" stroke="#000" stroke-width="1.2"/></pattern>'
      + '<pattern id="quilt" width="10" height="6" patternUnits="userSpaceOnUse"><rect width="10" height="6" fill="#ece6d6"/><path d="M0 3H10" stroke="#b9a988" stroke-width=".8" stroke-dasharray="2 2"/></pattern>';
    // 하우스 단면 경로
    var arch = '', archTop = '';
    for (var i = 0; i < n; i++) { var a0 = x0 + i * spanP, a1 = a0 + spanP, am = (a0 + a1) / 2; var seg = 'Q' + n1(am) + ' ' + n1(ground - hsP - 2 * (hrP - hsP)) + ' ' + n1(a1) + ' ' + n1(ground - hsP); arch += (i === 0 ? 'M' + n1(a0) + ' ' + ground + 'L' + n1(a0) + ' ' + n1(ground - hsP) : '') + seg; archTop += (i === 0 ? 'M' + n1(a0) + ' ' + n1(ground - hsP) : '') + seg; }
    var archFull = arch + 'L' + n1(x0 + nW * sx) + ' ' + ground + 'Z';
    s += '<clipPath id="hin"><path d="' + archFull + '"/></clipPath></defs>';
    // ── 하늘·해·구름·먼 산·나무·이웃 하우스 (정적인 것은 캐시) ──
    s += '<rect width="' + W + '" height="' + ground + '" fill="url(#sk)"/>';
    if (el < -6 && !over) { var sr = srand(3); for (var st = 0; st < 70; st++) { var stx = sr() * 900, sty = sr() * (ground - 120); s += '<circle cx="' + n1(stx) + '" cy="' + n1(sty) + '" r="' + n1(0.5 + sr() * 1.1) + '" fill="#fff" opacity="' + n1(clamp2((-el - 6) / 8, 0, 1) * (0.4 + sr() * 0.6)) + '"/>'; } }
    if (el > -6) {
      var dB = Math.cos((f.az - nB) * Math.PI / 180), ang = Math.atan2(Math.sin(Math.max(el, -6) * Math.PI / 180), Math.cos(el * Math.PI / 180) * dB);
      var R = 330, cx = 450 + R * Math.cos(ang), cy = ground - 10 - R * 0.95 * Math.sin(ang);
      s += '<circle cx="' + n1(cx) + '" cy="' + n1(cy) + '" r="' + (over ? 60 : 110) + '" fill="url(#sglow)" opacity="' + (over ? 0.35 : 1) + '"/>';
      if (!over) s += '<circle cx="' + n1(cx) + '" cy="' + n1(cy) + '" r="15" fill="' + (el < 8 ? '#ffb15c' : '#fff6cf') + '"/>';
    }
    var nc = over ? 7 : f.sky === 3 ? 4 : 2, cdrift = (now / 1000 * (2 + f.ws * 1.5)) % 1000;
    for (var k = 0; k < nc; k++) {
      var ccx = ((k * 173 + 60 + cdrift * (Math.cos((f.wd + 180 - nB) * Math.PI / 180) >= 0 ? 1 : -1)) % 1000 + 1000) % 1000 - 50, ccy = (over ? 30 : 45) + (k * 37) % 60, sc2 = over ? 1.5 : 1;
      var cfill = el > -2 ? (f.pty > 0 ? '#aab2bb' : over ? '#d5dae0' : 'url(#cloudg)') : '#3a4458';
      s += '<g opacity="' + (over ? 0.95 : 0.85) + '" fill="' + cfill + '" transform="translate(' + n1(ccx) + ',' + ccy + ') scale(' + sc2 + ')"><ellipse cx="0" cy="0" rx="50" ry="15"/><ellipse cx="22" cy="-11" rx="28" ry="16"/><ellipse cx="-20" cy="-7" rx="22" ry="12"/><ellipse cx="44" cy="-2" rx="18" ry="10"/>'
        + (el > 3 && !over ? '<ellipse cx="0" cy="8" rx="46" ry="5" fill="' + hexS(mixC(SC.hor, 0x8a96a6, 0.5)) + '" opacity=".35"/>' : '') + '</g>';
    }
    // 먼 산 두 겹 (지평선 쪽 색에 묻혀 흐릿하게)
    var hz = ground - 2, mFar = mixC(mixC(0x1a2420, 0x58705c, dayF), SC.hor, 0.55), mNear = mixC(mixC(0x101812, 0x3f5a3c, dayF), SC.hor, 0.3);
    var mr = srand(11), mp1 = 'M-10 ' + hz, mp2 = 'M-10 ' + hz;
    for (var mx = -10; mx <= 910; mx += 20) { mp1 += 'L' + mx + ' ' + n1(hz - 34 - 22 * Math.sin(mx / 70) - 14 * Math.sin(mx / 23 + 1) - mr() * 6); }
    for (mx = -10; mx <= 910; mx += 15) { mp2 += 'L' + mx + ' ' + n1(hz - 12 - 10 * Math.sin(mx / 45 + 2) - 6 * Math.sin(mx / 17) - mr() * 4); }
    s += '<path d="' + mp1 + 'L910 ' + hz + 'Z" fill="' + hexS(mFar) + '"/><path d="' + mp2 + 'L910 ' + hz + 'Z" fill="' + hexS(mNear) + '"/>';
    // 바람막이 나무 (뒤쪽)
    var tcol = hexS(mixC(mixC(0x0c140d, 0x2f5a2c, dayF), SC.hor, 0.15)), tr = srand(23);
    for (k = 0; k < 16; k++) { var tx = 20 + k * 56 + tr() * 20, th = 26 + tr() * 22; s += '<path d="M' + n1(tx) + ' ' + ground + 'V' + n1(ground - th * 0.4) + '" stroke="' + tcol + '" stroke-width="3"/><ellipse cx="' + n1(tx) + '" cy="' + n1(ground - th * 0.62) + '" rx="' + n1(th * 0.32) + '" ry="' + n1(th * 0.45) + '" fill="' + tcol + '"/>'; }
    // 이웃 하우스 (양옆, 같은 크기 비율로 일부만 보임)
    var nbW = Math.min(8, Math.max(6, g.W)) * sx, nbHs = 1.7 * sy, nbHr = 3.3 * sy, gap = 4 * sx;
    [[x0 - gap - nbW, 1], [x0 - 2 * gap - 2 * nbW, 1], [x0 + nW * sx + gap, 1], [x0 + nW * sx + 2 * gap + nbW, 1]].forEach(function (q) {
      var l = q[0], r = l + nbW, m = (l + r) / 2;
      s += '<path d="M' + n1(l) + ' ' + ground + 'L' + n1(l) + ' ' + n1(ground - nbHs) + 'Q' + n1(m) + ' ' + n1(ground - nbHs - 2 * (nbHr - nbHs)) + ' ' + n1(r) + ' ' + n1(ground - nbHs) + 'L' + n1(r) + ' ' + ground + 'Z" fill="' + hexS(mixC(0xeef3f7, SC.hor, 0.5)) + '" fill-opacity="' + (dayF > 0.3 ? 0.55 : 0.25) + '" stroke="' + hexS(mixC(0xdfe6ec, SC.hor, 0.4)) + '" stroke-width="2"/>';
      if (snowCover) s += '<path d="M' + n1(l + nbW * 0.15) + ' ' + n1(ground - nbHs - (nbHr - nbHs) * 0.5) + 'Q' + n1(m) + ' ' + n1(ground - nbHs - 2 * (nbHr - nbHs) - 4) + ' ' + n1(r - nbW * 0.15) + ' ' + n1(ground - nbHs - (nbHr - nbHs) * 0.5) + '" stroke="#f5f7f9" stroke-width="5" fill="none"/>';
    });
    // ── 땅: 풀(서리·눈) · 흙 단면 · 배수로 ──
    var grassC = snowCover ? '#f2f5f8' : frost ? '#dfe7ec' : isRain ? '#4f6a33' : '#6b8e3d';
    s += '<rect y="' + ground + '" width="' + W + '" height="200" fill="url(#soil)"/>';
    var gr = srand(31); for (k = 0; k < 60; k++) s += '<circle cx="' + n1(gr() * 900) + '" cy="' + n1(ground + 10 + gr() * 50) + '" r="' + n1(0.8 + gr() * 2) + '" fill="' + (gr() > 0.5 ? '#7a614a' : '#3a2c20') + '" opacity=".7"/>';
    s += '<rect y="' + (ground - 1) + '" width="' + W + '" height="6" fill="' + grassC + '"/>';
    for (k = 0; k < 120; k++) { var gx = (k * 7.7) % 900; if (gx > X(-0.2) && gx < X(nW + 0.2)) continue; s += '<path d="M' + n1(gx) + ' ' + ground + 'l' + n1((gr() - 0.5) * 3) + ' ' + n1(-3 - gr() * 4) + '" stroke="' + grassC + '" stroke-width="1.2"/>'; }
    if (frost) for (k = 0; k < 40; k++) s += '<circle cx="' + n1(gr() * 900) + '" cy="' + n1(ground + gr() * 3) + '" r=".9" fill="#fff"/>';
    [-1.6, nW + 1.6].forEach(function (dm) { var dx = X(dm), dw = Math.max(8, 0.4 * sx), dh = Math.max(6, 0.22 * sy); s += '<path d="M' + n1(dx - dw / 2) + ' ' + ground + 'v' + n1(dh) + 'h' + n1(dw) + 'v' + n1(-dh) + '" fill="' + (isRain ? '#5d7686' : '#4a4b3c') + '" stroke="#b9b6ae" stroke-width="2.5"/>' + (isRain ? '<rect x="' + n1(dx - dw / 2 + 2) + '" y="' + n1(ground + dh * 0.4) + '" width="' + n1(dw - 4) + '" height="' + n1(dh * 0.55) + '" fill="#7d9bb0"/>' : ''); });
    if (isRain) for (k = 0; k < 6; k++) { var pdx = (k * 151 + 40) % 900; if (pdx > X(-0.3) && pdx < X(nW + 0.3)) continue; s += '<ellipse cx="' + pdx + '" cy="' + (ground + 2) + '" rx="' + (14 + k % 3 * 6) + '" ry="2.5" fill="' + hexS(SC.hor) + '" opacity=".7"/>'; }
    // ── 하우스 안 ──
    s += '<path d="' + archFull + '" fill="url(#airg)"/>';
    s += '<rect x="' + n1(X(0)) + '" y="' + ground + '" width="' + n1(nW * sx) + '" height="5" fill="#5a4433"/>';
    // 햇살(빛줄기): 해 쪽에서 피복을 지나 비스듬히
    if (el > 3 && f.G > 80 && !over) {
      var dBs = Math.cos((f.az - nB) * Math.PI / 180), dxm = Math.cos(el * Math.PI / 180) * dBs / Math.max(0.15, Math.sin(el * Math.PI / 180));
      var op = clamp2(f.G / 900, 0.15, 0.55) * (f.sh ? 0.4 : 1) * (f.RHi > 80 ? 1.25 : 1);
      s += '<g clip-path="url(#hin)" opacity="' + n1(op) + '">';
      for (k = 0; k < 7; k++) { var bxm = (k + 0.5) / 7 * nW, ty2 = yAt(((bxm % g.W) / g.W)), bw = nW * sx / 7 * 0.45, sh = -dxm * ty2 * sx; s += '<path d="M' + n1(X(bxm) - bw / 2) + ' ' + n1(Y(ty2)) + 'h' + n1(bw) + 'l' + n1(sh) + ' ' + n1(ty2 * sy) + 'h' + n1(-bw * 1.6) + 'Z" fill="url(#beam)"/>'; }
      s += '</g>';
    }
    // 기초 (콘크리트)
    [0, nW].forEach(function (m) { s += '<rect x="' + n1(X(m) - 5) + '" y="' + n1(ground - 3) + '" width="10" height="13" fill="#b9b6ae"/>'; });
    // 두둑·작물: 정적 부분 캐시
    var rowsPer = Math.max(2, Math.round(g.W / 1.6)), bedW = g.W / rowsPer, beds = [];
    for (i = 0; i < n; i++) for (k = 0; k < rowsPer; k++) beds.push(i * g.W + (k + 0.5) * bedW);
    var bedTop = Math.min(0.75, bedW * 0.42), bedBot = Math.min(1.05, bedW * 0.62), bedH = 0.22;
    var plH = Math.min(g.hs * 0.95, 0.5 + o.lai * 0.55);
    var ck = JSON.stringify([g.n, g.W, g.hs, g.hr, x0, sx, sy, ground, o.stage, o.crop, o.lai]);
    if (ck !== c2d.key) {
      c2d.key = ck; var cs = '', cb = '', pr = srand(77);
      beds.forEach(function (bx) {
        cb += '<path d="M' + n1(X(bx - bedBot / 2)) + ' ' + ground + 'L' + n1(X(bx - bedTop / 2)) + ' ' + n1(Y(bedH)) + 'Q' + n1(X(bx)) + ' ' + n1(Y(bedH + 0.04)) + ' ' + n1(X(bx + bedTop / 2)) + ' ' + n1(Y(bedH)) + 'L' + n1(X(bx + bedBot / 2)) + ' ' + ground + 'Z" fill="url(#mulch)"/>'
          + '<path d="M' + n1(X(bx - bedTop / 2) + 2) + ' ' + n1(Y(bedH) + 1) + 'Q' + n1(X(bx)) + ' ' + n1(Y(bedH + 0.035)) + ' ' + n1(X(bx + bedTop / 2) - 2) + ' ' + n1(Y(bedH) + 1) + '" stroke="#6b7480" stroke-width="1" fill="none" opacity=".6"/>';
      });
      var LC = ['#3f7f2b', '#4a8c31', '#579a39', '#36742a', '#5f9f3e'], ripe = ['#d2231b', '#dc3a1c', '#e8641f', '#ee8a2a', '#c9b23c', '#7fae3e', '#6aa339'];
      beds.forEach(function (bx, bi) {
        [-1, 1].forEach(function (sd) {
          var lx = bx + sd * bedTop * 0.28, span = Math.floor(lx / g.W), uu = clamp2((lx - span * g.W) / g.W, 0.02, 0.98);
          var wireY = Math.min(3.0, yAt(uu) - 0.4), ph = Math.max(0.35, Math.min(plH, wireY - bedH - 0.1)), yb = bedH + 0.02, px = X(lx);
          cs += '<path d="M' + n1(px) + ' ' + n1(Y(yb)) + 'V' + n1(Y(wireY)) + '" stroke="#f2efe6" stroke-width=".8" opacity=".6"/><circle cx="' + n1(px) + '" cy="' + n1(Y(wireY)) + '" r="1.6" fill="#8d969e"/>';
          // 줄기: 살짝 지그재그
          var stem = 'M' + n1(px) + ' ' + n1(Y(yb)), nseg = Math.max(3, Math.round(ph / 0.18));
          for (var q = 1; q <= nseg; q++) stem += 'L' + n1(px + (q % 2 ? 1.4 : -1.4)) + ' ' + n1(Y(yb + ph * q / nseg));
          cs += '<path d="' + stem + '" stroke="#5d8a3a" stroke-width="' + n1(Math.max(1.6, sx * 0.022)) + '" fill="none" stroke-linejoin="round"/>';
          var bare = o.stage === 'harvest' ? ph * 0.32 : 0.05, nl = Math.max(3, Math.round((ph - bare) / 0.2)), lenPx = (o.stage === 'early' ? 0.24 : 0.42) * sx;
          for (var lv = 0; lv < nl; lv++) {
            var t = (lv + 0.5) / nl, ly = Y(yb + bare + (ph - bare) * t), dir = (lv + bi + (sd > 0 ? 1 : 0)) % 2 ? 1 : -1, ln = lenPx * (t > 0.8 ? 1.15 - (t - 0.8) * 2.2 : 0.85 + t * 0.35);
            cs += leafSvg(px, ly, dir, ln, LC[(lv + bi) % LC.length], -0.25 + pr() * 0.2);
          }
          if (o.stage !== 'early') {
            var nT = Math.min(o.stage === 'harvest' ? 6 : 4, Math.max(1, Math.floor((ph - 0.4) / 0.32))), cherry = o.crop === 'cherry';
            for (var tt = 0; tt < nT; tt++) {
              var tyM = yb + 0.38 + tt * Math.max(0.28, (ph - 0.55) / nT); if (tyM > yb + ph - 0.08) break;
              var tdir = tt % 2 ? 1 : -1, fromTop = nT - 1 - tt, ty3 = Y(tyM);
              if (fromTop < (o.stage === 'harvest' ? 1 : 2)) { for (var fl = 0; fl < 4; fl++) cs += '<path d="M' + n1(px + tdir * (5 + fl * 3.2)) + ' ' + n1(ty3 + 2 + (fl % 2) * 2.5) + 'l2 3.2h-4z" fill="#f6d21c"/>'; continue; }
              var colI = o.stage === 'harvest' ? Math.min(ripe.length - 1, Math.floor(Math.max(0, tt - Math.floor(nT * 0.15)) * ripe.length / Math.max(1, nT - 1))) : ripe.length - 1;
              var nf = cherry ? 7 : 4, fr = (cherry ? 0.014 : 0.034) * sx;
              cs += '<path d="M' + n1(px) + ' ' + n1(ty3) + 'q' + n1(tdir * 6) + ' 1 ' + n1(tdir * (8 + nf * fr * 0.9)) + ' ' + n1(4 + fr) + '" stroke="#5d8a3a" stroke-width="1" fill="none"/>';
              for (var fi = 0; fi < nf; fi++) { var fxp = px + tdir * (5 + fi * fr * 1.5), fyp = ty3 + 4 + fr + (fi % 2) * fr * 0.9; cs += '<circle cx="' + n1(fxp) + '" cy="' + n1(fyp) + '" r="' + n1(Math.max(1.4, fr * (1 - fi * 0.04))) + '" fill="' + ripe[colI] + '"/><circle cx="' + n1(fxp - fr * 0.3) + '" cy="' + n1(fyp - fr * 0.35) + '" r="' + n1(Math.max(0.5, fr * 0.3)) + '" fill="#fff" opacity=".35"/>'; }
            }
          }
        });
      });
      c2d.beds = cb; c2d.crop = cs;
    }
    s += c2d.beds;
    // 점적 호스 (관수 때 파랗게)
    beds.forEach(function (bx) { [-1, 1].forEach(function (sd) { s += '<circle cx="' + n1(X(bx + sd * bedTop * 0.22)) + '" cy="' + n1(Y(bedH + 0.03)) + '" r="2" fill="' + (f.irr > 0 ? '#38bdf8' : '#2b3138') + '"/>'; }); });
    // 비닐 덕트 (각 동 가운데 통로 바닥, 난방 때 부풀어 오름)
    if (h.heater > 0) for (i = 0; i < n; i++) { var dxm2 = i * g.W + bedW * Math.max(1, Math.floor(rowsPer / 2)), dr = 0.2 * sx, dry = (f.heat ? 0.2 : 0.06) * sy; s += '<ellipse cx="' + n1(X(dxm2)) + '" cy="' + n1(ground - dry) + '" rx="' + n1(dr) + '" ry="' + n1(dry) + '" fill="#f2f6f8" fill-opacity=".85" stroke="#cfd8de"/>'; }
    // 온풍기 + 연통 (마지막 통로) + 연기
    var hxm = (n - 1) * g.W + bedW * (rowsPer - 1), hW = Math.min(0.85, bedW * 0.5) * sx, hH = Math.min(1.35, g.hs * 0.75) * sy, hx = X(hxm) - hW / 2, hy = ground - hH;
    if (h.heater > 0) {
      var chY = Math.min(g.hs - 0.15, Math.min(1.35, g.hs * 0.75) + 1.0), chx = X(hxm) + hW * 0.2;
      s += '<path d="M' + n1(chx) + ' ' + n1(hy) + 'V' + n1(Y(chY)) + 'H' + n1(X(nW) + 0.5 * sx) + 'v' + n1(-1.0 * sy) + '" stroke="#8b9298" stroke-width="' + n1(Math.max(3, 0.12 * sx)) + '" fill="none" stroke-linejoin="round"/>'
        + '<path d="M' + n1(X(nW) + 0.5 * sx - 9) + ' ' + n1(Y(chY + 1.0) - 2) + 'l9 -7l9 7z" fill="#8b9298"/>';
      if (f.heat) { var drift = Math.cos(((f.wd + 180) % 360 - nB) * Math.PI / 180) * Math.min(1, f.ws / 3); for (k = 0; k < 5; k++) { var tp = ((now / 3500) + k / 5) % 1; s += '<circle cx="' + n1(X(nW) + 0.5 * sx + drift * tp * 40) + '" cy="' + n1(Y(chY + 1.0) - 8 - tp * 50) + '" r="' + n1(5 + tp * 14) + '" fill="url(#puff)" opacity="' + n1((1 - tp) * Math.min(1, tp * 5)) + '"/>'; } }
      s += '<rect x="' + n1(hx) + '" y="' + n1(hy) + '" width="' + n1(hW) + '" height="' + n1(hH) + '" rx="2" fill="#5b6b5e"/>';
      for (k = 1; k < 5; k++) s += '<line x1="' + n1(hx + 3) + '" x2="' + n1(hx + hW - 3) + '" y1="' + n1(hy + hH * 0.12 + k * 3) + '" y2="' + n1(hy + hH * 0.12 + k * 3) + '" stroke="#3a453c" stroke-width="1"/>';
      var bwx = hx + hW / 2, bwy = hy + hH * 0.65;
      if (f.heat) { var fl2 = 0.6 + 0.4 * Math.sin(now / 120); s += '<circle cx="' + n1(bwx) + '" cy="' + n1(bwy) + '" r="' + n1(Math.max(18, 0.5 * sx) * (0.9 + 0.1 * fl2)) + '" fill="url(#hglow)"/>'; }
      s += '<circle cx="' + n1(bwx) + '" cy="' + n1(bwy) + '" r="4" fill="' + (f.heat ? '#ffb347' : '#2a1a10') + '" stroke="#2d3530"/>';
    } else s += '<rect x="' + n1(hx) + '" y="' + n1(ground - 18) + '" width="' + n1(hW) + '" height="18" rx="2" fill="#475569" opacity=".6"/><text x="' + n1(hx + hW / 2) + '" y="' + n1(ground - 6) + '" font-size="' + fz(9) + '" fill="#e2e8f0" text-anchor="middle">없음</text>';
    s += c2d.crop;
    // 유동팬 (지붕 아래) · 센서함
    var fanR = 0.28 * sx, fanA = (now / (f.Gv > 0.3 || f.heat || f.cur ? 60 : 160)) % 360;
    for (i = 0; i < n; i++) { var fxm = i * g.W + g.W / 2, fym = multi ? g.hs - 0.45 : yAt(0.5) - 0.55; s += '<line x1="' + n1(X(fxm)) + '" x2="' + n1(X(fxm)) + '" y1="' + n1(Y(yAt(0.5))) + '" y2="' + n1(Y(fym) - fanR) + '" stroke="#9ea7ad" stroke-width="1"/><circle cx="' + n1(X(fxm)) + '" cy="' + n1(Y(fym)) + '" r="' + n1(fanR) + '" fill="#e5e9ec" fill-opacity=".25" stroke="#9ea7ad" stroke-width="2"/><g transform="translate(' + n1(X(fxm)) + ',' + n1(Y(fym)) + ') rotate(' + n1(fanA) + ')">' + [0, 90, 180, 270].map(function (aa) { return '<ellipse rx="' + n1(fanR * 0.15) + '" ry="' + n1(fanR * 0.45) + '" cy="' + n1(-fanR * 0.45) + '" fill="#5f6870" transform="rotate(' + aa + ')"/>'; }).join('') + '</g>'; }
    var sbxm = g.W / 2 + (rowsPer % 2 ? bedW * 0.5 : 0); s += '<line x1="' + n1(X(sbxm)) + '" x2="' + n1(X(sbxm)) + '" y1="' + n1(Y(yAt(0.5))) + '" y2="' + n1(Y(1.55)) + '" stroke="#8e979f" stroke-width=".8"/><rect x="' + n1(X(sbxm) - 6) + '" y="' + n1(Y(1.55)) + '" width="12" height="16" rx="2" fill="#f5f5f0" stroke="#c9cdd1"/>';
    // 결로·습한 공기
    if (f.RHi >= 90) { s += '<path d="' + archFull + '" fill="#e8eef4" opacity="' + n1(clamp2((f.RHi - 90) / 10, 0, 1) * 0.22) + '"/>'; }
    if (f.RHi >= 93) { var dr2 = srand(5), ndp = Math.round(clamp2((f.RHi - 93) / 7, 0.3, 1) * 70); for (k = 0; k < ndp; k++) { var um = dr2() * nW, uu2 = (um % g.W) / g.W, dpy = Y(yAt(uu2)) + 4 + dr2() * 4; s += '<circle cx="' + n1(X(um)) + '" cy="' + n1(dpy) + '" r="' + n1(1.2 + dr2() * 1.8) + '" fill="url(#drop)"/>'; } }
    // ── 구조: 아치 파이프 + 피복 + 도리 + 물받이·기둥 ──
    s += '<path d="' + archFull + '" fill="none" stroke="#c9d0d6" stroke-width="3.2" stroke-linejoin="round"/>';
    s += '<path d="' + archTop + '" fill="none" stroke="#ffffff" stroke-opacity="' + (isRain ? 0.95 : 0.7) + '" stroke-width="' + (h.cover === 'po2' ? 2.4 : 1.4) + '" transform="translate(0,-2)"/>';
    if (h.cover === 'po2') s += '<path d="' + archTop + '" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width="1" transform="translate(0,-5)"/>';
    [0, nW].forEach(function (m) { s += '<line x1="' + n1(X(m) + (m ? 2 : -2)) + '" y1="' + n1(ground - 3) + '" x2="' + n1(X(m) + (m ? 2 : -2)) + '" y2="' + n1(Y(0.3)) + '" stroke="#fff" stroke-opacity=".75" stroke-width="2.5"/>'; });
    var purl = [0.5, 0.22, 0.78]; if (g.W > 6) purl.push(0.36, 0.64);
    for (i = 0; i < n; i++) purl.forEach(function (pu) { s += '<circle cx="' + n1(X(i * g.W + pu * g.W)) + '" cy="' + n1(Y(yAt(pu)) + 3) + '" r="2.6" fill="#aeb7bf" stroke="#7f8a94" stroke-width=".6"/>'; });
    [0, nW].forEach(function (m) { s += '<circle cx="' + n1(X(m)) + '" cy="' + n1(Y(g.hs)) + '" r="3" fill="#aeb7bf"/><circle cx="' + n1(X(m)) + '" cy="' + n1(Y(0.3)) + '" r="2.6" fill="#aeb7bf"/>'; });
    if (multi) {
      for (i = 1; i < n; i++) { var gxp = X(i * g.W); s += '<line x1="' + n1(gxp) + '" y1="' + ground + '" x2="' + n1(gxp) + '" y2="' + n1(Y(g.hs)) + '" stroke="#b6bfc6" stroke-width="3.5"/><path d="M' + n1(gxp - 9) + ' ' + n1(Y(g.hs) - 6) + 'v8h18v-8" fill="#b8c1c8" stroke="#8e979f" stroke-width="1"/>'; }
      s += '<line x1="' + n1(X(0)) + '" x2="' + n1(X(nW)) + '" y1="' + n1(Y(g.hs - 0.12)) + '" y2="' + n1(Y(g.hs - 0.12)) + '" stroke="#8e979f" stroke-width="1.6"/>';
    }
    // 눈 쌓인 지붕
    if (snowCover && !(f.Ti > 8 && !f.cur)) for (i = 0; i < n; i++) { var sxl = X(i * g.W + 0.16 * g.W), sxr = X(i * g.W + 0.84 * g.W); s += '<path d="M' + n1(sxl) + ' ' + n1(Y(yAt(0.16)) - 2) + 'Q' + n1((sxl + sxr) / 2) + ' ' + n1(Y(2 * g.hr - yAt(0.16)) - 10) + ' ' + n1(sxr) + ' ' + n1(Y(yAt(0.84)) - 2) + '" stroke="#f7f9fb" stroke-width="7" fill="none" stroke-linecap="round"/>'; }
    // 차광막 (바깥, 지붕 위)
    if (h.shade) {
      if (f.sh) s += '<path d="' + archTop + '" transform="translate(0,' + n1(-0.32 * sy) + ')" fill="none" stroke="url(#shd)" stroke-width="7"/>';
      else for (i = 0; i < n; i++) s += '<circle cx="' + n1(X(i * g.W + 0.12)) + '" cy="' + n1(Y(g.hs + 0.36)) + '" r="6" fill="#1f2328"/>';
    }
    // 보온커튼
    if (h.curtain !== 'none') {
      var cfill = h.curtain === 'multi' ? 'url(#quilt)' : '#efece4', cw = h.curtain === 'multi' ? 7 : 4;
      if (f.cur) {
        if (!multi) { var cp = 'M' + n1(X(0.2)) + ' ' + n1(Y(0.15)); for (k = 1; k <= 20; k++) { var cu = 0.03 + 0.94 * k / 20; cp += 'L' + n1(X(cu * g.W)) + ' ' + n1(Y(yAt(cu) - 0.28)); } cp += 'L' + n1(X(nW - 0.2)) + ' ' + n1(Y(0.15)); s += '<path d="' + cp.replace('M' + n1(X(0.2)) + ' ' + n1(Y(0.15)), 'M' + n1(X(0.2)) + ' ' + n1(Y(0.15)) + 'L' + n1(X(0.2)) + ' ' + n1(Y(yAt(0.03) - 0.28))) + '" fill="none" stroke="' + (h.curtain === 'multi' ? '#d9cfb6' : '#e8e3d6') + '" stroke-width="' + (cw + 1) + '" stroke-linejoin="round"/>'; }
        else s += '<rect x="' + n1(X(0.05)) + '" y="' + n1(Y(g.hs - 0.18) - cw / 2) + '" width="' + n1((nW - 0.1) * sx) + '" height="' + cw + '" fill="' + cfill + '" stroke="#bfa77a" stroke-width=".6"/>';
        lab += '<text x="' + n1(X(0.4)) + '" y="' + n1(Y(multi ? g.hs - 0.18 : yAt(0.12) - 0.28) + 16 * FS) + '" font-size="' + fz(11) + '" fill="#f8f5ec" font-weight="700" stroke="#3b3424" stroke-width="2.5" paint-order="stroke">보온커튼 닫힘</text>';
      } else {
        if (!multi) [0.3, nW - 0.3].forEach(function (m) { s += '<circle cx="' + n1(X(m)) + '" cy="' + n1(Y(g.hs - 0.05)) + '" r="' + (h.curtain === 'multi' ? 7 : 5) + '" fill="#e8dcc0" stroke="#bfa77a"/>'; });
        else for (i = 0; i < n; i++) s += '<rect x="' + n1(X(i * g.W + 0.15)) + '" y="' + n1(Y(g.hs - 0.14)) + '" width="' + n1(0.3 * sx) + '" height="' + n1(0.22 * sy) + '" rx="3" fill="#e8dcc0" stroke="#bfa77a"/>';
      }
    }
    // 측창: 아래 0.3m 고정 + 그 위로 감아 올림 (감기 축·개폐기·방충망)
    var ventPx = Math.min(h.ventH, g.hs - 0.3) * sy, ventY0 = Y(0.3);
    function sideVent(x, open, label, isA) {
      var hh = ventPx * open, top = ventY0 - hh, out = isA ? -1 : 1, rr = 3.5 + open * 4.5, ov = '';
      if (hh > 0.5) ov += '<rect x="' + n1(x - 2.5) + '" y="' + n1(top) + '" width="5" height="' + n1(hh) + '" fill="' + (h.net ? 'url(#net)' : 'none') + '" opacity=".95"/>';
      ov += '<line x1="' + n1(x) + '" y1="' + n1(top) + '" x2="' + n1(x) + '" y2="' + n1(Y(g.hs)) + '" stroke="#fff" stroke-opacity=".8" stroke-width="2.5"/>';
      ov += '<circle cx="' + n1(x + out * 4) + '" cy="' + n1(top) + '" r="' + n1(rr) + '" fill="#e6edf2" stroke="#94a3b8" stroke-width="1.2"/><circle cx="' + n1(x + out * 4) + '" cy="' + n1(top) + '" r="1.8" fill="#64748b"/>';
      ov += '<rect x="' + n1(x + out * (6 + rr) - (isA ? 9 : 0)) + '" y="' + n1(top - 6) + '" width="9" height="12" rx="1.5" fill="#2f3b46"/>';
      var lx = isA ? x - 8 : x + 8, an = isA ? 'end' : 'start';
      lab += '<text x="' + n1(lx) + '" y="' + n1(ground + 22 * FS) + '" font-size="' + fz(13) + '" font-weight="700" fill="#fff" text-anchor="' + an + '" stroke="#2b2118" stroke-width="3" paint-order="stroke">' + label + ' 측창</text>'
        + '<text x="' + n1(lx) + '" y="' + n1(ground + 42 * FS) + '" font-size="' + fz(15) + '" font-weight="800" fill="#fff" text-anchor="' + an + '" stroke="#2b2118" stroke-width="3" paint-order="stroke">' + Math.round(open * 100) + '%</text>';
      return ov;
    }
    s += sideVent(X(0), f.A, dir8((axis + 270) % 360), true) + sideVent(X(nW), f.B, dir8(nB), false);
    // 천창: 각 동 꼭대기 덮개가 들림 (밀대·방충망)
    if (h.roofVent) for (i = 0; i < n; i++) {
      var ax = X(i * g.W + g.W / 2), ay = Y(g.hr), len = Math.max(14, h.roofW * sx), rot = -f.R * 40;
      if (h.net && f.R > 0.02) s += '<path d="M' + n1(ax) + ' ' + n1(ay) + 'L' + n1(ax + len) + ' ' + n1(ay + len * 0.25) + '" stroke="url(#net)" stroke-width="6" opacity=".8"/>';
      s += '<g transform="translate(' + n1(ax) + ',' + n1(ay) + ') rotate(' + n1(rot) + ')"><line x1="0" y1="0" x2="' + n1(len) + '" y2="' + n1(len * 0.25) + '" stroke="#f8fafc" stroke-width="4" stroke-linecap="round"/><line x1="0" y1="0" x2="' + n1(len) + '" y2="' + n1(len * 0.25) + '" stroke="#94a3b8" stroke-width="1"/></g>';
      if (f.R > 0.02) { var tipA = rot * Math.PI / 180, tipx = ax + len * 0.75 * Math.cos(tipA) - len * 0.19 * Math.sin(tipA), tipy = ay + len * 0.75 * Math.sin(tipA) + len * 0.19 * Math.cos(tipA); s += '<line x1="' + n1(tipx) + '" y1="' + n1(tipy) + '" x2="' + n1(ax + len * 0.75) + '" y2="' + n1(ay + len * 0.19 + 8) + '" stroke="#6b7680" stroke-width="2"/>'; }
      if (i === 0) lab += '<text x="' + n1(ax) + '" y="' + n1(ay - 18) + '" font-size="' + fz(12) + '" font-weight="700" fill="#fff" text-anchor="middle" stroke="#0f172a" stroke-width="3" paint-order="stroke">천창 ' + Math.round(f.R * 100) + '%</text>';
    }
    // 관수 표시
    if (f.irr > 0) beds.forEach(function (bx) { lab += '<text x="' + n1(X(bx)) + '" y="' + n1(Y(bedH) - 4) + '" font-size="' + fz(12) + '" text-anchor="middle">💧</text>'; });
    // ── 비·눈 ──
    var wdx = Math.cos(((f.wd + 180) % 360 - nB) * Math.PI / 180) * f.ws;
    if (isRain) { var heavy = f.pty === 4 || (f.rain || 0) >= 3, nr = heavy ? 120 : 70; for (k = 0; k < nr; k++) { var rx = ((k * 61 + now / 4) % 960) - 30, ry = (k * 97 + now / 2) % (ground - 10); s += '<line x1="' + n1(rx) + '" y1="' + n1(ry) + '" x2="' + n1(rx + wdx * 1.6) + '" y2="' + n1(ry + 11) + '" stroke="#b9d3ee" stroke-width="1.1" opacity=".75"/>'; } }
    if (isSnow) for (k = 0; k < 90; k++) { var sxx = ((k * 83 + now / 40 * (1 + (k % 3) * 0.3) * (wdx >= 0 ? 1 : -1) * Math.min(3, Math.abs(wdx) + 0.5)) % 920 + 920) % 920 - 10, syy = (k * 53 + now / 30) % ground; s += '<circle cx="' + n1(sxx + Math.sin(now / 700 + k) * 4) + '" cy="' + n1(syy) + '" r="' + n1(1.2 + (k % 3) * 0.6) + '" fill="#fff" opacity=".9"/>'; }
    // ── 안개 · 밤 어둠 (조명은 그 위에 다시 밝게) ──
    if (fog) s += '<rect width="900" height="' + (ground + 6) + '" fill="' + hexS(SC.hor) + '" opacity=".4"/>';
    var dark = clamp2((4 - el) / 12, 0, 1) * 0.5;
    if (dark > 0.02) {
      s += '<rect width="900" height="440" fill="#050a1a" opacity="' + n1(dark) + '"/>';
      if (h.heater > 0 && f.heat) { var fl3 = 0.6 + 0.4 * Math.sin(now / 120); s += '<circle cx="' + n1(hx + hW / 2) + '" cy="' + n1(hy + hH * 0.65) + '" r="' + n1(Math.max(36, 1.2 * sx) * (0.9 + 0.1 * fl3)) + '" fill="url(#hglow)" opacity=".7"/>'; }
    }
    return s + lab;
  }

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
    var to = (f.wd + 180) % 360, along = Math.abs(Math.sin((to - nB) * Math.PI / 180));
    var d3 = !!(window.FSIM3D && window.FSIM3D.active());
    if (d3) window.FSIM3D.draw(f, { house: h, geom: g, lai: result.lai, stage: S.stage, crop: S.crop, dt: still ? 0.016 : (dt || 0.016) });
    else {
    var svg = draw2D(f, h, g, { ground: ground, sx: sx, sy: sy, x0: x0, FS: FS, narrowS: narrowS, lai: result.lai, stage: S.stage, crop: S.crop });
    var el = f.el, ventY0 = ground - 0.3 * sy, ventPx = Math.min(h.ventH, g.hs - 0.3) * sy, i;
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
    }
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
      ['🎯', '환기 시작 ' + f1(f.vset) + '℃'],
      result.drv ? (function () { var x = result.drv.w.src[Math.round((f.t - result.drv.w.h0t) / 3600000)]; return x === 'fc' ? ['🔮', '바깥 = 예보'] : x === 'obs' ? ['📡', '바깥 = 관측값'] : x ? ['🗂', '바깥 = 지난 자료'] : ['…', '바깥 = 빈 시간(앞뒤 값으로 이음)']; })() : null
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
      var nowT = Date.now();
      if (nowT > t0 && nowT < t1) o += '<line x1="' + chartX(nowT) + '" x2="' + chartX(nowT) + '" y1="' + top + '" y2="' + bot + '" stroke="#0369a1" stroke-dasharray="4 3"/>' + (pi === 0 ? '<text x="' + (+chartX(nowT) + 3) + '" y="' + (top + 10) + '" font-size="10" fill="#0369a1">지금</text>' : '');
      if (pi === 0 && result.drv) { // 바깥 자료 출처 띠: 회색 = 관측, 하늘색 = 예보
        var dw = result.drv.w, segS = null, segK = null;
        fr.forEach(function (f, i) { var k = dw.src[Math.round((f.t - dw.h0t) / 3600000)] === 'fc' ? 'fc' : 'obs'; if (k !== segK || i === fr.length - 1) { if (segK) o += '<rect x="' + chartX(segS) + '" y="' + (top - 5) + '" width="' + Math.max(1, chartX(f.t) - chartX(segS)) + '" height="4" fill="' + (segK === 'fc' ? '#38bdf8' : '#64748b') + '"/>'; segS = f.t; segK = k; } });
        o += '<text x="' + (CW - CR - 4) + '" y="' + (top - 8) + '" font-size="10" fill="#555" text-anchor="end">위 띠: 회색 = 바깥 관측값 · 하늘색 = 예보</text>';
      }
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
      el.addEventListener('click', function (ev) { player.idx = idxAt(ev); setLive(false); $('seek').value = player.idx; renderFrame(0, true); document.getElementById('stagewrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
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
    $('summary').innerHTML = t + '<ul class="tips">' + tips.map(function (x) { return '<li class="' + x[0] + '">' + (x[0] === 'warn' ? '⚠️ ' : x[0] === 'ok' ? '✅ ' : '💡 ') + (result.virt ? String(x[1]).replace(/ 예보 —/g, ' (가상 날씨) —') : x[1]) + '</li>'; }).join('') + '</ul>'
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
    function put(t, v, sname) { if (v && v.T != null) { v.src = sname; src[t] = v; } }
    function fromW(o, h0s, nn, sn) { if (!o || !o.T) return; var h0 = Date.parse(h0s + ':00+09:00'); for (var i = 0; i < Math.min(o.T.length, nn || 1e9); i++) put(h0 + i * H, { T: o.T[i], RH: o.RH && o.RH[i], G: o.G && o.G[i], SKY: o.SKY && o.SKY[i], PTY: o.PTY && o.PTY[i], VEC: o.VEC && o.VEC[i], WSD: o.WSD && o.WSD[i], R: o.R && o.R[i] }, sn); }
    fromW(weather, weather.h0, F.hourlyLen(weather, c[0], c[1]), 'fc');
    if (weather.past) fromW(weather.past, weather.past.h0, 0, 'past');
    var nObs = 0;
    for (var i = 0; i < n; i++) {
      var t = a + i * H, r = obs[hkey(t)]; if (!r || num(r.ta) == null) continue;
      var r2 = obs[hkey(t + H)], i1 = num(r.icsr), i2 = r2 ? num(r2.icsr) : null, cl = num(r.dc10Tca), rn = num(r.rn) || 0, G;
      if (i1 != null || i2 != null) G = ((i1 != null ? i1 : i2) + (i2 != null ? i2 : i1)) / 2 * 1e6 / 3600;
      else { var sp = F.sunPos(c[0], c[1], new Date(t)), cz = Math.sin(Math.max(0, sp.el) * Math.PI / 180); G = sp.el > 0 ? 1098 * cz * Math.exp(-0.057 / Math.max(cz, 0.01)) * (rn > 0 ? 0.2 : 1 - 0.75 * Math.pow((cl == null ? 5 : cl) / 10, 3.4)) : 0; }
      put(t, { T: num(r.ta), RH: num(r.hm), G: G, SKY: cl == null ? 1 : cl <= 5 ? 1 : cl <= 8 ? 3 : 4, PTY: rn > 0 ? 1 : 0, VEC: num(r.wd), WSD: num(r.ws), R: rn }, 'obs'); nObs++;
    }
    var w = { h0: kst(a).toISOString().slice(0, 16), h0t: a, src: [], T: [], RH: [], G: [], SKY: [], PTY: [], VEC: [], WSD: [], R: [] }, miss = 0;
    for (i = 0; i < n; i++) { var v = src[a + i * H]; if (!v) miss++; w.src.push(v ? v.src : null); ['T', 'RH', 'G', 'SKY', 'PTY', 'VEC', 'WSD', 'R'].forEach(function (k) { w[k].push(v ? (v[k] == null ? null : v[k]) : null); }); }
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
    $('play').onclick = function () { if (!result) return; if (player.idx >= result.frames.length - 1) player.idx = 0; player.playing = !player.playing; setLive(false); this.textContent = player.playing ? '⏸ 정지' : '▶ 재생'; };
    $('seek').oninput = function () { player.idx = +this.value; player.playing = false; setLive(false); $('play').textContent = '▶ 재생'; renderFrame(0, true); };
    $('now').onclick = function () { player.playing = false; $('play').textContent = '▶ 재생'; setLive(true); if (!goNow()) { var dd = $('d_date'); if (dd && dd.value !== ymd(Date.now())) { dd.value = ymd(Date.now()); dd.dispatchEvent(new Event('change', { bubbles: true })); } } };
    setLive(true);
    // 날씨 자료가 갱신되면(기상청 발표 후 자동 반영) 다시 계산 — 5분마다, 그리고 탭이 다시 보일 때
    function refreshWeather() {
      if (!weather || (S.virt && S.virt.on)) return;
      fetch(BASE + 'data/weather/' + S.region + '.json', { cache: 'no-store' }).then(function (x) { return x.ok ? x.json() : null; }).then(function (w) {
        if (w && w.code === S.region && w.updated && w.updated !== weather.updated) { weather = w; obsCache = {}; simulate(); }
      }).catch(function () {});
    }
    setInterval(refreshWeather, 5 * 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshWeather(); });
    $('speed').onchange = function () { player.speed = +this.value; };
    $('reset').onclick = function () { S.ctrl = F.defaults(S.crop); buildForms(); changed(); };
    $('jump').onchange = function () { if (!result) return; var v = this.value, fr = result.frames; for (var i = 0; i < fr.length; i++) { var d = kst(fr[i].t), dd = d.getUTCDate(), hh = d.getUTCHours();
      if (v === 'now') { player.idx = 0; break; } var parts2 = v.split('-'); if (+parts2[0] === dd && +parts2[1] === hh && d.getUTCMinutes() === 0) { player.idx = i; break; } }
      setLive(false); $('seek').value = player.idx; renderFrame(0, true); this.value = ''; };
    fetch(BASE + 'data/regions.json').then(function (r) { return r.json(); }).then(function (d) {
      regions = d.regions; sido = d.sido; if (!find(S.region)) S.region = '3406'; buildRegion(); buildVirt(); if (S.virt.on) simulate(); loadWeather();
    });
    requestAnimationFrame(tick);
    setInterval(function () { if (!result) return; var fr = result.frames, sel = $('jump'), h = '<option value="">시각 바로 가기</option><option value="now">처음(지금)</option>';
      var seen = {}; fr.forEach(function (f) { var d = kst(f.t); if (d.getUTCMinutes() === 0 && [6, 9, 12, 15, 18, 21, 0, 3].indexOf(d.getUTCHours()) >= 0) { var k = d.getUTCDate() + '-' + d.getUTCHours(); if (!seen[k]) { seen[k] = 1; h += '<option value="' + k + '">' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + d.getUTCHours() + '시</option>'; } } });
      if (sel.dataset.h !== h) { sel.innerHTML = h; sel.dataset.h = h; } }, 1000);
  }
  init();
})();
