/* farmily-daily : 우리 지역 카드 (지역 선택·서리·일조·난방 필요 시간·병 발생 위험 신호, 내 지역 소식 강조)
   사용법 - 페이지에 아래 블록과 스크립트 한 줄을 넣으면 됩니다. 데이터: data/regions.json, data/weather/<code>.json
   <div class="card" id="local-card"><h2>📍 우리 지역 농업 날씨</h2><div id="local-app">...대체 문구...</div></div>
   <script src="/farmily-daily/region.js"></script>                                                       */
(function () {
  var app = document.getElementById('local-app');
  if (!app) return;
  var BASE = '/farmily-daily/';
  var CSS = ''
    + '#local-app .lc-pick{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 14px}'
    + '#local-app select,#local-app input{font-family:inherit;font-size:15px;padding:6px 10px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#222}'
    + '#local-app input{width:64px;text-align:right}'
    + '#local-app .lc-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
    + '#local-app .lc-tile{background:#f7f9f7;border:1px solid #e3ebe3;border-radius:10px;padding:14px 16px}'
    + '#local-app .lc-k{font-size:13px;color:#666;font-weight:700;margin-bottom:4px}'
    + '#local-app .lc-v{font-size:20px;font-weight:800;color:#12341f;line-height:1.35}'
    + '#local-app .lc-s{font-size:13px;color:#666;margin-top:4px;line-height:1.55}'
    + '#local-app .lc-days{display:flex;gap:3px;margin-top:8px}'
    + '#local-app .lc-day{flex:1 1 0;text-align:center;border-radius:5px;padding:3px 0;font-size:11px;line-height:1.3;color:#444;background:#eef2ee}'
    + '#local-app .lc-day b{display:block;font-size:12px}'
    + '#local-app .lc-day.f1{background:#dbeafe;color:#1e3a8a}#local-app .lc-day.f2{background:#93c5fd;color:#0c2a6b}#local-app .lc-day.f3{background:#2563eb;color:#fff}'
    + '#local-app .lc-bars{display:flex;align-items:flex-end;gap:3px;height:34px;margin-top:8px}'
    + '#local-app .lc-bars span{flex:1 1 0;background:#f2b33d;border-radius:2px 2px 0 0;min-height:2px}'
    + '#local-app .lc-risk{list-style:none;padding:0;margin:4px 0 0}'
    + '#local-app .lc-risk li{display:flex;justify-content:space-between;font-size:14px;margin:0 0 4px}'
    + '#local-app .lc-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:0}'
    + '#local-app .lv-높음{color:#c62828;font-weight:800}#local-app .lv-보통{color:#b26a00;font-weight:700}#local-app .lv-낮음{color:#2e7d32}'
    + '#local-app .lc-foot{font-size:12px;color:#999;margin-top:12px;line-height:1.6}'
    + '#local-app .lc-mine-n{display:inline-block;background:#fff4c2;border-radius:12px;padding:3px 10px;font-size:13px;cursor:pointer;color:#5b4500}'
    + '.lc-mark{background:#fff4c2;border-radius:3px;padding:0 2px}'
    + '@media (max-width:600px){#local-app .lc-grid{grid-template-columns:1fr}}';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var GROUP = { '수도권': ['서울', '인천', '경기'], '충청': ['대전', '세종', '충북', '충남'], '호남': ['광주', '전북', '전남'],
    '영남': ['부산', '대구', '울산', '경북', '경남'], '경남권': ['부산', '울산', '경남'], '경북권': ['대구', '경북'],
    '전남권': ['광주', '전남'], '전북권': ['전북'], '영동': ['강원'], '영서': ['강원'],
    '중부': ['서울', '인천', '경기', '강원', '대전', '세종', '충북', '충남'],
    '남부': ['광주', '전북', '전남', '부산', '대구', '울산', '경북', '경남', '제주'] };
  var FULL = { '충북': ['충청북도'], '충남': ['충청남도'], '전북': ['전라북도'], '전남': ['전라남도'], '경북': ['경상북도'],
    '경남': ['경상남도'], '강원': ['강원도'], '경기': ['경기도'], '제주': ['제주도'] };

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ph() { if (typeof window.postHeight === 'function') { try { window.postHeight(); } catch (e) {} } }
  function kstNow() { var d = new Date(); return new Date(d.getTime() + (d.getTimezoneOffset() + 540) * 60000); }
  function parseIso(s) { var m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(s); return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)); }
  function md(d) { return (d.getMonth() + 1) + '/' + d.getDate() + '(' + DOW[d.getDay()] + ')'; }
  function f1(x) { return (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, ''); }

  var regions = null, sido = [];
  var cur = ls('farmily.region') || '';
  var setpoint = +(ls('farmily.setpoint') || 15);
  if (!(setpoint >= 0 && setpoint <= 30)) setpoint = 15;

  fetch(BASE + 'data/regions.json').then(function (r) { return r.json(); }).then(function (d) {
    regions = d.regions; sido = d.sido; renderPicker(); if (cur) load(cur);
  }).catch(function () { /* 대체 문구 그대로 둠 */ });

  function renderPicker() {
    var r0 = find(cur);
    var h = '<div class="lc-pick"><select id="lc-sido" aria-label="시도"><option value="">시·도 선택</option>';
    sido.forEach(function (s) { h += '<option value="' + s.short + '"' + (r0 && r0.sido === s.short ? ' selected' : '') + '>' + esc(s.full) + '</option>'; });
    h += '</select><select id="lc-sigun" aria-label="시군"><option value="">시·군 선택</option></select><span id="lc-mine"></span></div><div id="lc-body"></div>';
    app.innerHTML = h;
    fillSigun(r0 ? r0.sido : '');
    document.getElementById('lc-sido').onchange = function () { fillSigun(this.value); };
    document.getElementById('lc-sigun').onchange = function () { if (this.value) { cur = this.value; ls('farmily.region', cur); load(cur); } };
    if (!r0) document.getElementById('lc-body').innerHTML = '<div class="lc-s">시·도와 시·군을 고르시면 우리 지역의 서리 예상일, 최근 7일 일조량, 오늘 밤 난방이 필요한 시간, 병 발생 위험 신호를 보여 드리고 아래 소식 중 우리 지역 내용을 노랗게 표시합니다. 선택은 이 기기에 기억됩니다.</div>';
    ph();
  }
  function find(code) { if (!regions) return null; for (var i = 0; i < regions.length; i++) if (regions[i].code === code) return regions[i]; return null; }
  function fillSigun(s) {
    var el = document.getElementById('lc-sigun'), h = '<option value="">시·군 선택</option>';
    regions.forEach(function (r) { if (r.sido === s) h += '<option value="' + r.code + '"' + (r.code === cur ? ' selected' : '') + '>' + esc(r.name) + '</option>'; });
    el.innerHTML = h; el.disabled = !s;
    if (s) { var only = regions.filter(function (r) { return r.sido === s; }); if (only.length === 1) { el.value = only[0].code; el.onchange.call(el); } }
  }

  function load(code) {
    var r = find(code); if (!r) return;
    mark(r);
    var body = document.getElementById('lc-body');
    body.innerHTML = '<div class="lc-s">' + esc(r.name) + ' 자료를 불러오는 중입니다…</div>'; ph();
    fetch(BASE + 'data/weather/' + code + '.json', { cache: 'no-store' }).then(function (x) {
      if (!x.ok) throw new Error(x.status); return x.json();
    }).then(function (w) { render(r, w); }).catch(function () {
      body.innerHTML = '<div class="lc-s"><b>' + esc(r.sido + ' ' + r.name) + '</b> — 기상청 자료 연결을 준비하고 있습니다. 연결되면 이 자리에 서리 예상일·일조량·난방 필요 시간·병 발생 위험 신호가 표시됩니다. 아래 소식 중 우리 지역 내용은 노랗게 표시해 두었습니다.</div>';
      ph();
    });
  }

  function render(r, w) {
    var body = document.getElementById('lc-body');
    var h0 = parseIso(w.h0), now = kstNow();
    // 오늘 밤 구간: 18시~다음 날 09시 (지금이 밤이면 지금부터 09시까지)
    var s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18), e;
    if (now.getHours() < 9) { s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()); e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9); }
    else { if (now.getHours() >= 18) s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()); e = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9); }
    var nightT = [];
    for (var i = 0; i < w.T.length; i++) {
      var t = new Date(h0.getTime() + i * 3600000);
      if (t >= s && t < e && w.T[i] != null) nightT.push(w.T[i]);
    }
    var tiles = '';
    // 1) 오늘 밤·난방
    if (nightT.length) {
      var mn = Math.min.apply(null, nightT), cnt = nightT.filter(function (x) { return x < setpoint; }).length;
      tiles += '<div class="lc-tile"><div class="lc-k">🌙 오늘 밤 · 난방 필요 시간</div>'
        + '<div class="lc-v">최저 ' + f1(mn) + '°C · ' + (cnt ? '약 ' + cnt + '시간' : '난방 불필요') + '</div>'
        + '<div class="lc-s">하우스 야간 설정 온도 <input id="lc-sp" type="number" min="0" max="30" step="1" value="' + setpoint + '">°C 보다 바깥 기온이 낮은 시간'
        + (cnt ? '(' + (s.getHours()) + '시~다음 날 9시 중)' : '') + '입니다. 바깥 기온 기준 대략값이라 보온 상태에 따라 실제 가동 시간은 달라집니다.</div></div>';
    }
    // 2) 서리
    var days = (w.days || []).filter(function (d) { return d.min != null && d.d >= w.h0.slice(0, 10); });
    if (days.length) {
      var first = null; for (var j = 0; j < days.length; j++) if (days[j].min <= 3) { first = days[j]; break; }
      var low = days.reduce(function (a, b) { return b.min < a.min ? b : a; });
      var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var v, sub;
      if (first) {
        var fd = parseIso(first.d), dd = Math.round((fd - today0) / 86400000);
        v = (dd <= 0 ? '오늘' : dd === 1 ? '내일' : dd + '일 뒤') + ' ' + md(fd) + ' 최저 ' + f1(first.min) + '°C';
        sub = (first.min <= 0 ? '얼음이 얼 수 있는 기온입니다. ' : '서리가 내릴 수 있는 기온(3°C 이하)입니다. ')
          + '서리에 약한 작물은 부직포·보온 덮개를 미리 준비해 두세요.' + (first.src === '중기' ? ' (4일 이후는 ' + esc(first.stn || '도 대표') + ' 지점 예보)' : '');
      } else {
        v = days.length + '일 안에는 서리 걱정 낮음';
        sub = '이 기간 가장 낮은 기온은 ' + md(parseIso(low.d)) + ' ' + f1(low.min) + '°C입니다.';
      }
      var chips = days.slice(0, 10).map(function (d) {
        var c = d.min <= 0 ? 'f3' : d.min <= 3 ? 'f2' : d.min <= 7 ? 'f1' : '';
        var x = parseIso(d.d); return '<span class="lc-day ' + c + '" title="' + md(x) + ' 최저 ' + d.min + '°C' + (d.src === '중기' ? ' (중기예보)' : '') + '"><b>' + Math.round(d.min) + '°</b>' + x.getDate() + '일</span>';
      }).join('');
      tiles += '<div class="lc-tile"><div class="lc-k">❄️ 서리 예상</div><div class="lc-v">' + v + '</div><div class="lc-days">' + chips + '</div><div class="lc-s">' + sub + '</div></div>';
    }
    // 3) 일조
    if (w.sun) {
      var su = w.sun, mx = Math.max.apply(null, su.daily.concat([1]));
      var rt = su.ratio, word = rt == null ? '' : rt >= 110 ? '평년보다 많음' : rt >= 90 ? '평년 수준' : rt >= 70 ? '평년보다 적음' : '평년보다 크게 부족';
      tiles += '<div class="lc-tile"><div class="lc-k">☀️ 최근 7일 일조량</div><div class="lc-v">' + f1(su.sum) + '시간 <span style="font-size:14px;font-weight:700;color:#666">하루 평균 ' + f1(su.avg) + '시간</span></div>'
        + '<div class="lc-bars">' + su.daily.map(function (x) { return '<span style="height:' + Math.max(4, x / mx * 100) + '%" title="' + x + '시간"></span>'; }).join('') + '</div>'
        + '<div class="lc-s">' + (rt != null ? '같은 기간 지난 ' + su.normal_years + '년 평균(' + f1(su.normal) + '시간)의 <b>' + rt + '%</b> — ' + word + '. ' : '')
        + (rt != null && rt < 90 ? '햇볕이 부족하면 시설 과채류는 착과 부담을 줄이고 웃자람을 살펴 주세요. ' : '')
        + '관측: ' + esc(su.stn) + ' ' + su.km + 'km · ' + su.start.slice(5).replace('-', '/') + '~' + su.end.slice(5).replace('-', '/') + '</div></div>';
    }
    // 4) 병 발생 위험
    if (w.risk) {
      var rk = w.risk, rows = [['잿빛곰팡이병', '시설 과채·딸기', rk.gray], ['노균병', '오이·배추 등', rk.downy], ['탄저병', '고추·과수', rk.anth]];
      var col = { '높음': '#e53935', '보통': '#f9a825', '낮음': '#43a047' };
      tiles += '<div class="lc-tile"><div class="lc-k">🦠 병 발생 위험 신호 (앞으로 ' + rk.hours + '시간)</div><ul class="lc-risk">'
        + rows.map(function (x) { return '<li><span><span class="lc-dot" style="background:' + col[x[2].lv] + '"></span>' + x[0] + ' <span style="color:#999;font-size:12px">' + x[1] + '</span></span><span class="lv-' + x[2].lv + '">' + x[2].lv + ' <span style="font-weight:400;color:#999;font-size:12px">' + x[2].h + '시간</span></span></li>'; }).join('')
        + '</ul><div class="lc-s">바깥 기온·습도·비로 본 참고 신호입니다(발령 정보 아님). 병이 좋아하는 습하고 알맞은 기온이 이어지는 시간을 셌습니다.</div></div>';
    }
    var base = String(w.short_base || '');
    var bm = /^(\d{4})(\d\d)(\d\d) (\d\d)/.exec(base);
    body.innerHTML = '<div class="lc-grid">' + tiles + '</div><div class="lc-foot">' + esc(r.sido + ' ' + r.name) + ' · 자료: 기상청 단기예보'
      + (bm ? '(' + (+bm[2]) + '/' + (+bm[3]) + ' ' + bm[4] + '시 발표)' : '') + '·중기예보·종관기상관측(ASOS) · 바깥 날씨 기준이라 하우스 안 환경과는 다를 수 있습니다.</div>';
    var sp = document.getElementById('lc-sp');
    if (sp) sp.onchange = function () { var v = +this.value; if (v >= 0 && v <= 30) { setpoint = v; ls('farmily.setpoint', String(v)); render(r, w); } };
    ph();
  }

  // 내 지역 소식 강조: 본문 <strong>[지역]</strong> 중 선택 지역이 들어간 것
  function mark(r) {
    var marks = document.querySelectorAll('.lc-mark'); for (var i = 0; i < marks.length; i++) marks[i].classList.remove('lc-mark');
    var toks = [r.sido].concat(FULL[r.sido] || []);
    var nm = r.name.replace(/(특별시|광역시|특별자치시|특별자치도)$/, ''); if (nm.length >= 3) nm = nm.replace(/[시군]$/, '');
    if (nm && nm !== r.sido) toks.push(nm);
    Object.keys(GROUP).forEach(function (g) { if (GROUP[g].indexOf(r.sido) >= 0) toks.push(g); });
    var list = document.querySelectorAll('strong'), hit = [];
    for (var k = 0; k < list.length; k++) {
      var el = list[k]; if (app.contains(el)) continue;
      var t = el.textContent || ''; if (!/^\s*\[.+\]\s*$/.test(t) || /전국/.test(t)) continue;
      for (var q = 0; q < toks.length; q++) if (t.indexOf(toks[q]) >= 0) { el.classList.add('lc-mark'); hit.push(el); break; }
    }
    var box = document.getElementById('lc-mine');
    if (box) {
      box.innerHTML = hit.length ? '<span class="lc-mine-n" title="눌러서 첫 소식으로 이동">우리 지역 언급 ' + hit.length + '곳 ▾</span>' : '';
      if (hit.length) box.firstChild.onclick = function () { hit[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    }
  }
})();
