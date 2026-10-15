/* farmily-daily : 자동제어 '권장값 비교' + 강수 그래프·예상 결과 '비·눈' 줄 — sim.js 보다 먼저 불러옵니다.
   1) 자동제어 입력칸마다 권장값을 작게 보여 주고, 바꾼 값은 노란 칸 + '↺ 권장값으로' 단추
   2) 값을 바꾸면 같은 날씨·같은 하우스로 권장값일 때를 한 번 더 계산해
      예상 결과 위에 '권장값과 비교' 표를, 기온·습도 그래프에 '권장값일 때' 초록 점선을 보여 줌 */
(function () {
  var F = window.FSIM; if (!F) return;
  var $ = function (id) { return document.getElementById(id); };
  function f1(x) { return x == null || isNaN(x) ? '-' : (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
  function crop() { var c = $('c_crop'); return (c && c.value) || 'tomato'; }
  function defs() { return F.defaults(crop()); }

  // ── 계산 가로채기: 바꾼 값이 있으면 권장값으로도 계산해 둠 ──
  var last = null, ctrlRef = null, orig = F.run;
  F.run = function (w, lat, lon, house, cropKey, stageKey, c, opt) {
    if (c && typeof c === 'object') ctrlRef = c;   // sim.js 의 S.ctrl (화면 설정) 그 자체
    if (ctrlRef) setTimeout(syncRain, 0);
    var r = orig.apply(this, arguments);
    try {
      var d = F.defaults(cropKey), ch = Object.keys(d).some(function (k) { return d[k] !== c[k]; });
      var b = ch ? orig.call(this, w, lat, lon, house, cropKey, stageKey, d, Object.assign({}, opt || {})) : null;
      if (b && b.frames.length !== r.frames.length) b = null;
      last = { r: r, b: b, crop: cropKey, house: house, ctrl: Object.assign({}, c) };
    } catch (e) { last = null; }
    return r;
  };

  var css = document.createElement('style');
  css.textContent = '.fl i.rec{color:#15803d;display:flex;align-items:center;gap:6px;flex-wrap:wrap}'
    + '.rst{display:none;font:inherit;font-size:11px;padding:0 6px;border:1px solid #cbd5c0;border-radius:6px;background:#fff;color:#12341f;cursor:pointer}'
    + '.fld.chg{background:#fef9c3;border-radius:6px;padding-left:6px;padding-right:4px}.fld.chg .rst{display:inline-block}.fld.chg input,.fld.chg select{border-color:#ca8a04}'
    + '.rechint{font-size:12px;color:#666;margin:0 0 8px}.chgk{background:#fef9c3;padding:0 4px;border-radius:4px}'
    + '.cmpbox{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:14px}'
    + '.cmpbox h3{font-size:15px;margin:0 0 6px;color:#12341f}.cmpbox ul{margin:4px 0 8px;padding-left:18px}.cmpbox li{margin:2px 0}'
    + '.cmpt{border-collapse:collapse;width:100%;font-size:14px}.cmpt th,.cmpt td{padding:5px 8px;border-bottom:1px solid #eef0f2;text-align:left}.cmpt th{color:#555;font-weight:600}'
    + '.cmpt td.g{color:#15803d;font-weight:700}.cmpt td.b{color:#b91c1c;font-weight:700}.cmpt td.n{color:#888}';
  document.head.appendChild(css);

  // ── 입력칸: 권장값 표시 ──
  function fieldInfo(inp) {
    var lab = inp.closest('label.fld'), em = lab && lab.querySelector('.numw em'), fl = lab && lab.querySelector('.fl');
    return { key: inp.id.slice(2), lab: lab, fl: fl, unit: em ? em.textContent : '', check: inp.type === 'checkbox',
      name: fl ? (fl.firstChild && fl.firstChild.nodeType === 3 ? fl.firstChild.textContent : fl.textContent) : inp.id };
  }
  function recText(fi, v) { return fi.check ? (v ? '켬' : '끔') : f1(v) + fi.unit; }
  function curVal(inp) { return inp.type === 'checkbox' ? inp.checked : +inp.value; }
  function inputs() { return Array.prototype.slice.call(document.querySelectorAll('#f-ctrl input[id^="k_"]')); }
  function mark() {
    var d = defs();
    inputs().forEach(function (inp) { var fi = fieldInfo(inp); if (fi.lab && d[fi.key] !== undefined) fi.lab.classList.toggle('chg', d[fi.key] !== curVal(inp)); });
  }
  // ── 비·비바람 때 창 위치 (실제 제어기의 '감우 시 위치') 입력칸: '비 오면 천창 닫기' 아래에 끼워 넣음 ──
  var RAIN_FIELDS = [
    { k: 'rainRoofMax', label: '비 올 때 천창 최대', help: '0 = 완전히 닫음 · 위 칸을 켰을 때', min: 0, max: 100, step: 5, unit: '%' },
    { k: 'rainSideMax', label: '비 올 때 측창 최대', help: '시간당 3mm 이상 강한 비는 이 값과 20% 중 작은 값', min: 0, max: 100, step: 5, unit: '%' },
    { k: 'rainWindLimit', label: '비바람 기준 풍속', help: '비 + 이 풍속 이상이면 아래 값 적용', min: 1, max: 15, step: 0.5, unit: 'm/s' },
    { k: 'rainWindOpen', label: '비바람 때 바람받이 측창 최대', help: '반대쪽(바람 빠지는 쪽)은 \'비 올 때 측창 최대\'까지', min: 0, max: 100, step: 5, unit: '%' }
  ];
  // 계산할 때마다 화면 칸을 실제 설정값과 맞춤(처음 열 때·권장값 되돌리기·설정 코드 불러오기 뒤)
  function syncRain() {
    if (!ctrlRef) return; var changed = false;
    RAIN_FIELDS.forEach(function (f) { var el = $('k_' + f.k); if (el && document.activeElement !== el && ctrlRef[f.k] != null && +el.value !== ctrlRef[f.k]) { el.value = ctrlRef[f.k]; changed = true; } });
    if (changed) mark();
  }
  function injectRain() {
    var anchor = $('k_rainRoofClose'); if (!anchor || $('k_rainSideMax')) return;
    var lab = anchor.closest('label.fld'), d = defs(), cur = ctrlRef || {};
    RAIN_FIELDS.slice().reverse().forEach(function (f) {
      var v = cur[f.k] != null ? cur[f.k] : d[f.k];
      var el = document.createElement('label'); el.className = 'fld'; el.id = 'w_k_' + f.k;
      el.innerHTML = '<span class="fl">' + f.label + '<i>' + f.help + '</i></span><span class="numw"><input type="number" id="k_' + f.k + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + v + '"><em>' + f.unit + '</em></span>';
      lab.parentNode.insertBefore(el, lab.nextSibling);
      el.querySelector('input').addEventListener('change', function () {
        var x = +this.value; if (isNaN(x)) x = d[f.k]; x = Math.max(f.min, Math.min(f.max, x)); this.value = x;
        if (ctrlRef) ctrlRef[f.k] = x;
        // sim.js 가 저장·다시 계산하도록 기존 칸의 change 를 한 번 보냄(값은 그대로)
        anchor.dispatchEvent(new Event('change'));
      });
    });
  }
  function decorate() {
    var box = $('f-ctrl'); if (!box || !box.firstChild || box.querySelector('.rechint')) return;
    injectRain();
    var d = defs(), cn = $('c_crop'), name = cn && cn.selectedOptions[0] ? cn.selectedOptions[0].textContent : '토마토';
    var p = document.createElement('p'); p.className = 'rechint';
    p.innerHTML = '작은 글씨 <b>권장</b> = ' + name + ' 일반 권장값 · 바꾼 값은 <span class="chgk">노란 칸</span>으로 표시되고, 아래 \'예상 결과\'에서 권장값일 때와 비교됩니다.';
    box.insertBefore(p, box.firstChild);
    inputs().forEach(function (inp) {
      var fi = fieldInfo(inp); if (!fi.fl || d[fi.key] === undefined) return;
      var i = document.createElement('i'); i.className = 'rec'; i.textContent = '권장 ' + recText(fi, d[fi.key]);
      var b = document.createElement('button'); b.type = 'button'; b.className = 'rst'; b.textContent = '↺ 권장값으로';
      b.onclick = function (e) {
        e.preventDefault(); e.stopPropagation(); var v = defs()[fi.key];
        if (inp.type === 'checkbox') inp.checked = !!v; else inp.value = v;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      };
      i.appendChild(b); fi.fl.appendChild(i);
    });
    mark();
  }
  document.addEventListener('change', function (e) { if (e.target && e.target.id && e.target.id.indexOf('k_') === 0) setTimeout(mark, 0); });

  // ── 예상 결과 위 비교 표 ──
  function totals(sum) {
    var o = { hours: 0, ok: 0, hot: 0, cold: 0, wet: 0, vent: 0, heatH: 0, oilL: 0, irr: 0, tmax: -99, tmin: 99 };
    sum.forEach(function (d) { o.hours += d.hours; o.ok += d.okPct * d.hours; o.hot += d.hot; o.cold += d.cold; o.wet += d.wet; o.vent += d.vent; o.heatH += d.heatH; o.oilL += d.oilL; o.irr += d.irr; o.tmax = Math.max(o.tmax, d.tmax); o.tmin = Math.min(o.tmin, d.tmin); });
    o.okPct = o.hours ? Math.round(o.ok / o.hours) : 0; return o;
  }
  function compareHTML() {
    if (!last) return '';
    if (!last.b) return '<div class="cmpbox"><h3>⚖ 권장값과 비교</h3>지금 자동제어 값이 모두 <b>권장값</b>입니다. 왼쪽 \'자동제어 설정\'에서 값을 바꾸면, 같은 날씨에서 권장값일 때와 내 설정일 때 결과가 어떻게 달라지는지 여기와 기온·습도 그래프(초록 점선)에 바로 보여 드립니다.</div>';
    var A = totals(last.b.summary), B = totals(last.r.summary), d = F.defaults(last.crop), coldT = last.crop === 'cherry' ? 12 : 10;
    var dfs = inputs().map(fieldInfo).filter(function (fi) { return d[fi.key] !== undefined && d[fi.key] !== last.ctrl[fi.key]; });
    var rows = [
      ['적온 유지 비율', A.okPct, B.okPct, '%', 'high', 0],
      ['30℃ 넘는 시간', A.hot, B.hot, '시간', 'low', 1],
      ['밤 저온 시간 (' + coldT + '℃ 미만)', A.cold, B.cold, '시간', 'low', 1],
      ['습도 90% 이상 (결로·병 위험)', A.wet, B.wet, '시간', 'low', 1],
      ['최고 / 최저 온도', f1(A.tmax) + ' / ' + f1(A.tmin), f1(B.tmax) + ' / ' + f1(B.tmin), '℃', null, 0],
      ['창 열린 시간', A.vent, B.vent, '시간', null, 1]
    ].concat(last.house.heater > 0 ? [['난방 시간 · 등유', A.oilL, B.oilL, 'L', 'low', 1, f1(A.heatH) + '시간 · ', f1(B.heatH) + '시간 · ']] : [])
      .concat([['관수 횟수', A.irr, B.irr, '회', null, 0]]);
    var good = 0, bad = 0;
    var tb = rows.map(function (r) {
      var a = r[1], b = r[2], cls = 'n', dt = '';
      if (typeof a === 'number') {
        var x = b - a;
        if (Math.abs(x) >= (r[5] ? 0.05 : 0.5)) {
          dt = (x > 0 ? '+' : '') + (r[5] ? f1(x) : Math.round(x)) + (r[3] === '%' ? '%p' : r[3]);
          if (r[4]) { var g = r[4] === 'low' ? x < 0 : x > 0; cls = g ? 'g' : 'b'; if (g) good++; else bad++; }
        } else dt = '같음';
        a = (r[6] || '') + (r[5] ? f1(a) : Math.round(a)) + r[3]; b = (r[7] || '') + (r[5] ? f1(b) : Math.round(b)) + r[3];
      } else { a += r[3]; b += r[3]; }
      return '<tr><th>' + r[0] + '</th><td>' + a + '</td><td><b>' + b + '</b></td><td class="' + cls + '">' + dt + '</td></tr>';
    }).join('');
    var verdict = good && !bad ? '✅ 권장값보다 <b>좋아지는</b> 항목만 있습니다.' : bad && !good ? '⚠️ 권장값보다 <b>나빠지는</b> 항목만 있습니다.'
      : good || bad ? '⚖ 좋아지는 항목 ' + good + '개, 나빠지는 항목 ' + bad + '개 — 무엇을 더 중요하게 볼지 정해서 고르세요.' : '결과 차이가 거의 없습니다.';
    return '<div class="cmpbox"><h3>⚖ 권장값과 비교 <small style="font-weight:400;color:#666">(같은 날씨 · 이 기간 전체)</small></h3>'
      + '<div>바꾼 값:</div><ul>' + dfs.map(function (fi) { return '<li>' + fi.name + ': 권장 ' + recText(fi, d[fi.key]) + ' → <b>' + recText(fi, last.ctrl[fi.key]) + '</b></li>'; }).join('') + '</ul>'
      + '<div class="scroll"><table class="cmpt"><tr><th></th><th>권장값일 때</th><th>내 설정</th><th>차이</th></tr>' + tb + '</table></div>'
      + '<p style="margin:8px 0 0">' + verdict + ' <button type="button" class="btn sm ghost" id="cmpreset">모두 권장값으로</button></p></div>';
  }
  function decorateSummary() {
    var s = $('summary'); if (!s || !s.firstChild || !last) return;
    // 예상 결과 표에 '비·눈' 줄 추가
    var tbl = s.querySelector('table.sumt');
    if (tbl && !tbl.querySelector('.rainrow')) {
      var rows = tbl.querySelectorAll('tr'), after = null;
      for (var i = 0; i < rows.length; i++) { var th = rows[i].querySelector('th'); if (th && th.textContent.indexOf('습도 90%') === 0) after = rows[i]; }
      var tr = document.createElement('tr'); tr.className = 'rainrow';
      tr.innerHTML = '<th>비·눈 (강수량 · 시간)</th>' + last.r.summary.map(function (d) {
        if (!d.rainH) return '<td>없음</td>';
        return '<td' + (d.rainWet >= 2 ? ' class="mid"' : '') + '>' + (d.snowH >= d.rainH / 2 ? '🌨 ' : '🌧 ') + f1(d.rainMm) + 'mm · ' + f1(d.rainH) + '시간' + (d.rainWet >= 0.5 ? '<br><small>그동안 습도 90%↑ ' + f1(d.rainWet) + '시간</small>' : '') + '</td>';
      }).join('');
      if (after && after.nextSibling) after.parentNode.insertBefore(tr, after.nextSibling); else (rows[0] && rows[0].parentNode || tbl).appendChild(tr);
    }
    if (!s.querySelector('.cmpbox')) { var div = document.createElement('div'); div.innerHTML = compareHTML(); if (div.firstChild) s.insertBefore(div.firstChild, s.firstChild); }
    if (window.postHeight) setTimeout(window.postHeight, 50);
  }
  document.addEventListener('click', function (e) { if (e.target && e.target.id === 'cmpreset') { var r = $('reset'); if (r) r.click(); } });

  // ── 강수 그래프 (습도 그래프 아래): 시간당 강수량 막대 + 강수확률 ──
  function rainPanel() {
    var ch = $('charts'); if (!ch || !last || ch.querySelector('.rainch')) return;
    var svgs = ch.querySelectorAll('svg.ch'); if (svgs.length < 2) return;
    var fr = last.r.frames, t0 = fr[0].t, t1 = fr[fr.length - 1].t, CL = 44, CR = 12, CW = +svgs[1].getAttribute('viewBox').split(' ')[2], H = 84, top = 22, bot = H - 8;
    function X(t) { return CL + (t - t0) / (t1 - t0) * (CW - CL - CR); }
    var mx = 2, anyRain = false, anyPop = false;
    fr.forEach(function (f) { if (f.rain > mx) mx = f.rain; if (f.pty > 0 || f.rain > 0) anyRain = true; if (f.pop != null) anyPop = true; });
    mx = Math.ceil(mx);
    function Y(v) { return bot - v / mx * (bot - top); }
    var o = '<svg viewBox="0 0 ' + CW + ' ' + H + '" class="ch rainch"><text x="' + CL + '" y="14" font-size="12" font-weight="700" fill="#444">🌧 비·눈 (시간당 mm)' + (anyPop ? ' · 강수확률' : '') + '</text>';
    var ns = null; fr.forEach(function (f, i) { if (!f.day && ns == null) ns = f.t; if ((f.day || i === fr.length - 1) && ns != null) { o += '<rect x="' + X(ns).toFixed(1) + '" y="' + top + '" width="' + (X(f.t) - X(ns)).toFixed(1) + '" height="' + (bot - top) + '" fill="#eef0f4"/>'; ns = null; } });
    [0, mx / 2, mx].forEach(function (v) { o += '<line x1="' + CL + '" x2="' + (CW - CR) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="#e5e7eb"/><text x="' + (CL - 5) + '" y="' + (Y(v) + 4).toFixed(1) + '" font-size="10" fill="#888" text-anchor="end">' + f1(v) + '</text>'; });
    fr.forEach(function (f, i) {
      if (!(f.pty > 0 || f.rain > 0)) return;
      var x = X(f.t), x2 = i < fr.length - 1 ? X(fr[i + 1].t) : x + 1, v = Math.max(f.rain || 0.3, 0.3);
      o += '<rect x="' + x.toFixed(1) + '" y="' + Y(v).toFixed(1) + '" width="' + Math.max(0.8, x2 - x + 0.2).toFixed(1) + '" height="' + (bot - Y(v)).toFixed(1) + '" fill="' + (f.pty === 3 ? '#a5b4fc' : f.pty === 2 ? '#818cf8' : f.pty === 4 ? '#1d4ed8' : '#3b82f6') + '"/>';
    });
    if (anyPop) { var d = ''; fr.forEach(function (f, i) { if (f.pop == null) return; d += (d ? 'L' : 'M') + X(f.t).toFixed(1) + ' ' + (bot - f.pop / 100 * (bot - top)).toFixed(1); }); o += '<path d="' + d + '" fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="3 3"/>'; }
    if (!anyRain) o += '<text x="' + ((CL + CW - CR) / 2) + '" y="' + ((top + bot) / 2 + 4) + '" font-size="12" fill="#64748b" text-anchor="middle">이 기간에는 비·눈 예보가 없습니다</text>';
    fr.forEach(function (f) { var dd = new Date(f.t + 9 * 3600000); if (dd.getUTCMinutes() === 0 && dd.getUTCHours() === 0) o += '<line x1="' + X(f.t).toFixed(1) + '" x2="' + X(f.t).toFixed(1) + '" y1="' + top + '" y2="' + bot + '" stroke="#9ca3af"/>'; });
    o += '<line class="playhead" x1="0" x2="0" y1="' + top + '" y2="' + H + '" stroke="#12341f" stroke-width="2"/></svg>';
    var w = document.createElement('div'); w.className = 'chw';
    w.innerHTML = '<div class="leg"><span><i style="border-top:4px solid #3b82f6"></i>비</span><span><i style="border-top:4px solid #818cf8"></i>비/눈·눈</span>' + (anyPop ? '<span><i style="border-top:2px dashed #94a3b8"></i>강수확률 (위 끝 100%)</span>' : '') + '<span style="color:#888">비 오면 천창 닫힘·측창 줄임</span></div>' + o;
    var hum = svgs[1].parentNode; hum.parentNode.insertBefore(w, hum.nextSibling);
  }
  // ── 기온·습도 그래프에 '권장값일 때' 초록 점선 (sim.js 그래프와 같은 눈금 계산) ──
  function decorateCharts() {
    rainPanel();
    if (!last || !last.b) return;
    var svgs = document.querySelectorAll('#charts svg.ch'); if (svgs.length < 2 || svgs[0].querySelector('.basel')) return;
    var fr = last.r.frames, bf = last.b.frames, t0 = fr[0].t, t1 = fr[fr.length - 1].t, CL = 44, CR = 12;
    [[0, 'Ti', 120, null], [1, 'RHi', 90, [0, 100]]].forEach(function (q) {
      var svg = svgs[q[0]], CW = +svg.getAttribute('viewBox').split(' ')[2], top = 22, bot = q[2] - 8, lo, hi;
      if (q[3]) { lo = q[3][0]; hi = q[3][1]; }
      else { var v = []; fr.forEach(function (f) { v.push(f.Ti, f.To); }); lo = Math.floor(Math.min.apply(null, v.concat([5])) / 5) * 5; hi = Math.ceil(Math.max.apply(null, v.concat([30])) / 5) * 5; }
      var d = '';
      bf.forEach(function (f, i) { var y = bot - (f[q[1]] - lo) / (hi - lo) * (bot - top); y = Math.max(top, Math.min(bot, y)); d += (i ? 'L' : 'M') + (CL + (fr[i].t - t0) / (t1 - t0) * (CW - CL - CR)).toFixed(1) + ' ' + y.toFixed(1); });
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#16a34a'); p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-dasharray', '2 3'); p.setAttribute('class', 'basel');
      var ph = svg.querySelector('.playhead'); svg.insertBefore(p, ph);
      var leg = svg.parentNode.querySelector('.leg');
      if (leg) { var sp = document.createElement('span'); sp.innerHTML = '<i style="border-top:2px dashed #16a34a"></i>권장값일 때 안'; leg.appendChild(sp); var first = leg.querySelector('span'); if (first && first.textContent.indexOf('(내 설정)') < 0) first.lastChild.textContent += ' (내 설정)'; }
    });
  }

  function watch(id, fn) { var el = $(id); if (!el) return; new MutationObserver(fn).observe(el, { childList: true }); }
  watch('f-ctrl', decorate); watch('summary', decorateSummary); watch('charts', decorateCharts);
})();
