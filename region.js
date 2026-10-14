/* farmily-daily : 우리 지역 카드 (지역 선택·서리·일조·난방 필요 시간·병 발생 위험 신호·바람·예상 일사량·48시간 그래프, 내 지역 소식 강조)
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
    + '#local-app .lc-wide{grid-column:1/-1}'
    + '#local-app .lc-chart{position:relative;margin-top:6px;touch-action:pan-y}'
    + '#local-app .lc-chart svg{display:block;width:100%;height:auto;overflow:visible}'
    + '#local-app .lc-chart text{font-family:inherit}'
    + '#local-app .lc-tip{position:absolute;top:0;pointer-events:none;background:#fff;border:1px solid #d5ddd5;border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.6;color:#333;box-shadow:0 2px 8px rgba(0,0,0,.12);white-space:nowrap;display:none;z-index:2}'
    + '#local-app .lc-tip b{color:#12341f}'
    + '#local-app .lc-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:#666;margin-top:6px}'
    + '#local-app .lc-legend i{display:inline-block;width:14px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}'
    + '#local-app .lc-wind{display:flex;gap:14px;align-items:center}'
    + '#local-app .lc-sunrow{display:flex;gap:10px;margin-top:8px}'
    + '#local-app .lc-sunrow>div{flex:1 1 0;background:#fff;border:1px solid #e3ebe3;border-radius:8px;padding:6px 8px;font-size:12px;color:#666}'
    + '#local-app .lc-sunrow b{display:block;font-size:16px;color:#12341f}'
    + '#local-app .lc-meter{height:6px;background:#eceae2;border-radius:3px;margin-top:4px;overflow:hidden}'
    + '#local-app .lc-meter span{display:block;height:100%;background:#f2b33d;border-radius:3px}'
    + '#local-app .lc-wtab{display:grid;grid-template-columns:repeat(8,1fr);gap:3px;margin-top:8px}'
    + '#local-app .lc-wc{background:#fff;border:1px solid #e3ebe3;border-radius:6px;text-align:center;padding:4px 0 3px;font-size:11px;line-height:1.35;color:#555}'
    + '#local-app .lc-wc b{display:block;font-size:12px;color:#12341f}'
    + '#local-app .lc-wc.st{border-color:#e57373;background:#fdecea}'
    + '#local-app .lc-wc .ws{display:inline-block;margin-top:1px;padding:0 3px;border-radius:3px;background:#eef2ee;font-size:10px;color:#2f4f3a}'
    + '#local-app .lc-wday{font-size:12px;color:#666;font-weight:700;margin-top:8px}'
    + '#local-app .lc-chg{margin:8px 0 0;padding:0;list-style:none;font-size:13px;color:#444;line-height:1.6}'
    + '#local-app .lc-orient{font-size:13px;color:#666;margin-top:8px}'
    + '#local-app .lc-orient select{font-size:13px;padding:3px 6px}'
    + '#local-app .lc-range{font-size:11px;color:#888;display:block}'
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

  var DIR16 = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
  function dir16(v) { return v == null ? '' : DIR16[Math.round(v / 22.5) % 16]; }
  function skyIcon(sky, pty, night) {
    if (pty === 1 || pty === 4) return '🌧'; if (pty === 2) return '🌨'; if (pty === 3) return '❄️';
    if (sky === 4) return '☁️'; if (sky === 3) return night ? '☁️' : '⛅'; if (sky === 1) return night ? '🌙' : '☀️'; return '';
  }
  function skyWord(sky, pty) {
    if (pty === 1) return '비'; if (pty === 2) return '비/눈'; if (pty === 3) return '눈'; if (pty === 4) return '소나기';
    return sky === 1 ? '맑음' : sky === 3 ? '구름많음' : sky === 4 ? '흐림' : '';
  }
  var DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  function dir8(v) { return v == null ? '' : DIR8[Math.round(v / 45) % 8]; }
  // 바람받이(바람이 불어오는 쪽) 측창
  function windward(v, o) {
    if (v == null || !o) return '';
    var a = v * Math.PI / 180, ex = Math.sin(a), ny = Math.cos(a);
    if (o === 'ew') return ex > 0.38 ? '동' : ex < -0.38 ? '서' : '옆';
    return ny > 0.38 ? '북' : ny < -0.38 ? '남' : '옆';
  }
  function windWord(v) { return v >= 14 ? '매우 강함' : v >= 9 ? '강함' : v >= 4 ? '보통' : '약함'; }
  var WIND_WARN = 9;
  // 바람 화살표: VEC는 바람이 불어오는 방향 → 화살표는 불어가는 쪽(+180°)
  function arrow(cx, cy, len, vec, color, sw) {
    var a = (vec + 180) * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
    var x1 = cx - dx * len / 2, y1 = cy - dy * len / 2, x2 = cx + dx * len / 2, y2 = cy + dy * len / 2;
    var hx = -dy, hy = dx, hl = Math.max(3, len * 0.32);
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round"/>'
      + '<path d="M' + (x2 + dx * 1).toFixed(1) + ' ' + (y2 + dy * 1).toFixed(1) + 'L' + (x2 - dx * hl + hx * hl * 0.6).toFixed(1) + ' ' + (y2 - dy * hl + hy * hl * 0.6).toFixed(1)
      + 'L' + (x2 - dx * hl - hx * hl * 0.6).toFixed(1) + ' ' + (y2 - dy * hl - hy * hl * 0.6).toFixed(1) + 'Z" fill="' + color + '"/>';
  }

  // ---------- 48시간 그래프 (작은 그래프 여러 개가 같은 시간축을 공유) ----------
  function chart48(w, holder) {
    var N = Math.min(48, w.T.length), h0 = parseIso(w.h0);
    var W = Math.max(300, Math.round(holder.clientWidth || 600));
    var L = 34, R = 8, PW = W - L - R, step = PW / N;
    function X(i) { return L + step * (i + 0.5); }
    var has = function (k) { return w[k] && w[k].length >= N && w[k].slice(0, N).some(function (v) { return v != null; }); };
    var y = 0, svg = '';
    var EL = w.EL || [];
    var night = function (i) { return EL.length ? EL[i] <= 0 : (function () { var hh = (h0.getHours() + i) % 24; return hh < 7 || hh >= 18; })(); };
    // 1) 하늘 아이콘 줄
    var skyY = y; if (has('SKY')) y += 22; y += 18;
    // 2) 예상 일사량
    var gY = y, gH = 78; if (has('G')) y += gH + 26;
    // 3) 기온
    var tY = y, tH = 80; y += tH + 26;
    // 4) 강수확률
    var pY = y, pH = 36; if (has('P')) y += pH + 26;
    // 5) 바람
    var wY = y, wH = 52; if (has('WSD')) y += wH + 26;
    var axY = y; y += 30; var H = y;
    // 밤 음영
    for (var i = 0; i < N; i++) if (night(i)) svg += '<rect x="' + (L + step * i).toFixed(1) + '" y="0" width="' + (step + 0.6).toFixed(1) + '" height="' + axY + '" fill="#eef0f4"/>';
    function title(yy, t) { svg += '<text x="' + L + '" y="' + (yy - 6) + '" font-size="12" font-weight="700" fill="#555">' + t + '</text>'; }
    function grid(yy, hh, lo, hi, ticks, unit) {
      ticks.forEach(function (v) { var gy = yy + hh - (v - lo) / (hi - lo) * hh; svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" stroke="#e4e7e4" stroke-width="1"/><text x="' + (L - 5) + '" y="' + (gy + 4).toFixed(1) + '" font-size="10" fill="#888" text-anchor="end">' + v + unit + '</text>'; });
    }
    // 하늘
    if (has('SKY')) {
      var every = step >= 14 ? 2 : step >= 7 ? 3 : 6;
      for (i = 0; i < N; i += every) { var ic = skyIcon(w.SKY[i], w.PTY ? w.PTY[i] : 0, night(i)); if (ic) svg += '<text x="' + X(i).toFixed(1) + '" y="' + (skyY + 16) + '" font-size="13" text-anchor="middle">' + ic + '</text>'; }
    }
    // 일사량
    if (has('G')) {
      title(gY + 4, '☀️ 예상 일사량 (W/m²)');
      var gTop = Math.max(400, Math.ceil(Math.max.apply(null, (w.GC || w.G).slice(0, N).map(function (v) { return v || 0; })) / 200) * 200);
      grid(gY + 8, gH - 8, 0, gTop, [0, gTop / 2, gTop], '');
      var gy0 = gY + gH; var sc = function (v) { return gy0 - v / gTop * (gH - 8); };
      if (w.GC) { var pc = ''; for (i = 0; i < N; i++) pc += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + sc(w.GC[i] || 0).toFixed(1); svg += '<path d="' + pc + '" fill="none" stroke="#c9a24a" stroke-width="1.5" stroke-dasharray="4 3"/>'; }
      var pa = 'M' + X(0).toFixed(1) + ' ' + gy0; for (i = 0; i < N; i++) pa += 'L' + X(i).toFixed(1) + ' ' + sc(w.G[i] || 0).toFixed(1); pa += 'L' + X(N - 1).toFixed(1) + ' ' + gy0 + 'Z';
      svg += '<path d="' + pa + '" fill="#f2b33d" fill-opacity=".55" stroke="#e09a12" stroke-width="2" stroke-linejoin="round"/>';
    }
    // 기온
    var T = w.T.slice(0, N), tv = T.filter(function (v) { return v != null; });
    var tlo = Math.floor(Math.min.apply(null, tv.concat([setpoint, 3])) / 5) * 5, thi = Math.ceil(Math.max.apply(null, tv.concat([setpoint])) / 5) * 5; if (thi - tlo < 10) thi = tlo + 10;
    title(tY + 4, '🌡 기온 (°C)');
    var tt = []; for (var v = tlo; v <= thi; v += (thi - tlo > 20 ? 10 : 5)) tt.push(v); grid(tY + 8, tH - 8, tlo, thi, tt, '°');
    var ty = function (v) { return tY + tH - (v - tlo) / (thi - tlo) * (tH - 8); };
    // 서리선 3°C (범위 안일 때)
    if (3 >= tlo && 3 <= thi && tv.some(function (x) { return x <= 7; })) svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ty(3).toFixed(1) + '" y2="' + ty(3).toFixed(1) + '" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="2 3"/><text x="' + (W - R - 2) + '" y="' + (ty(3) + 13).toFixed(1) + '" font-size="10" fill="#1e40af" text-anchor="end">서리 3°C</text>';
    svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ty(setpoint).toFixed(1) + '" y2="' + ty(setpoint).toFixed(1) + '" stroke="#b45309" stroke-width="1.5" stroke-dasharray="6 4"/><text x="' + (W - R - 2) + '" y="' + (ty(setpoint) - 4).toFixed(1) + '" font-size="10" fill="#92400e" text-anchor="end">난방 설정 ' + setpoint + '°C</text>';
    var pt = ''; for (i = 0; i < N; i++) if (T[i] != null) pt += (pt ? 'L' : 'M') + X(i).toFixed(1) + ' ' + ty(T[i]).toFixed(1);
    svg += '<path d="' + pt + '" fill="none" stroke="#c2410c" stroke-width="2" stroke-linejoin="round"/>';
    // 최저·최고 표시
    var iMin = 0, iMax = 0; for (i = 0; i < N; i++) { if (T[i] != null && T[i] < T[iMin]) iMin = i; if (T[i] != null && T[i] > T[iMax]) iMax = i; }
    [[iMin, 14], [iMax, -7]].forEach(function (q) { svg += '<circle cx="' + X(q[0]).toFixed(1) + '" cy="' + ty(T[q[0]]).toFixed(1) + '" r="4" fill="#c2410c" stroke="#fff" stroke-width="2"/><text x="' + X(q[0]).toFixed(1) + '" y="' + (ty(T[q[0]]) + q[1]).toFixed(1) + '" font-size="11" font-weight="700" fill="#333" text-anchor="middle">' + f1(T[q[0]]) + '°</text>'; });
    // 강수확률
    if (has('P')) {
      title(pY + 4, '☔ 강수확률 (%)'); grid(pY + 8, pH - 8, 0, 100, [0, 100], '');
      var bw = Math.max(1, step - 2);
      for (i = 0; i < N; i++) { var p = w.P[i] || 0; if (!p) continue; var bh = p / 100 * (pH - 8);
        svg += '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + (pY + pH - bh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="' + Math.min(2, bw / 2) + '" fill="' + (p >= 60 ? '#2563eb' : '#93b4e8') + '"/>'; }
    }
    // 바람: 막대(풍속) + 위쪽 화살표(풍향)
    if (has('WSD')) {
      var wTop = Math.max(10, Math.ceil(Math.max.apply(null, w.WSD.slice(0, N).map(function (v) { return v || 0; })) / 5) * 5);
      title(wY + 4, '💨 바람 (m/s · 화살표는 바람이 불어가는 쪽)'); grid(wY + 22, wH - 22, 0, wTop, [0, wTop], '');
      var bw2 = Math.max(1, step - 2);
      if (WIND_WARN <= wTop) { var wy = wY + wH - WIND_WARN / wTop * (wH - 22); svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + wy.toFixed(1) + '" y2="' + wy.toFixed(1) + '" stroke="#c62828" stroke-width="1" stroke-dasharray="3 3"/>'; }
      for (i = 0; i < N; i++) { var ws = w.WSD[i] || 0, bh2 = Math.max(1, ws / wTop * (wH - 22));
        svg += '<rect x="' + (X(i) - bw2 / 2).toFixed(1) + '" y="' + (wY + wH - bh2).toFixed(1) + '" width="' + bw2.toFixed(1) + '" height="' + bh2.toFixed(1) + '" rx="' + Math.min(2, bw2 / 2) + '" fill="' + (ws >= WIND_WARN ? '#c62828' : '#8a9aa9') + '"/>'; }
      var ev = step >= 14 ? 2 : step >= 7 ? 3 : 4;
      for (i = 0; i < N; i += ev) if (w.VEC && w.VEC[i] != null) svg += arrow(X(i), wY + 12, 12, w.VEC[i], (w.WSD[i] || 0) >= WIND_WARN ? '#c62828' : '#475569', 1.6);
    }
    // 시간축
    svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + axY + '" y2="' + axY + '" stroke="#bbb"/>';
    for (i = 0; i < N; i++) {
      var t = new Date(h0.getTime() + i * 3600000), hh = t.getHours();
      if (hh === 0) svg += '<line x1="' + (L + step * i).toFixed(1) + '" x2="' + (L + step * i).toFixed(1) + '" y1="0" y2="' + (axY + 26) + '" stroke="#9aa39a" stroke-width="1"/><text x="' + (L + step * i + 3).toFixed(1) + '" y="' + (axY + 26) + '" font-size="11" font-weight="700" fill="#444">' + md(t) + '</text>';
      if (hh % 6 === 0) svg += '<text x="' + X(i).toFixed(1) + '" y="' + (axY + 13) + '" font-size="10" fill="#777" text-anchor="middle">' + hh + '시</text>';
    }
    svg += '<line id="lc-cross" x1="0" x2="0" y1="0" y2="' + axY + '" stroke="#12341f" stroke-width="1" opacity="0"/>';
    svg += '<rect id="lc-hit" x="' + L + '" y="0" width="' + PW + '" height="' + (axY + 28) + '" fill="transparent"/>';
    holder.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="앞으로 48시간 일사량·기온·강수확률·바람 그래프">' + svg + '</svg><div class="lc-tip"></div>';
    // 호버/터치: 시각별 값 모두 보기
    var hit = holder.querySelector('#lc-hit'), cross = holder.querySelector('#lc-cross'), tip = holder.querySelector('.lc-tip');
    function show(ev) {
      var rc = holder.getBoundingClientRect(), sx = (ev.clientX - rc.left) * W / rc.width;
      var k = Math.max(0, Math.min(N - 1, Math.floor((sx - L) / step)));
      var t = new Date(h0.getTime() + k * 3600000);
      cross.setAttribute('x1', X(k)); cross.setAttribute('x2', X(k)); cross.setAttribute('opacity', '.6');
      var lines = ['<b>' + md(t) + ' ' + t.getHours() + '시</b>' + (w.SKY ? ' ' + skyIcon(w.SKY[k], w.PTY ? w.PTY[k] : 0, night(k)) + ' ' + skyWord(w.SKY[k], w.PTY ? w.PTY[k] : 0) : '')];
      if (w.G && w.G[k] != null) lines.push('예상 일사 ' + w.G[k] + ' W/m²' + (w.GC && w.GC[k] ? ' (맑을 때 ' + w.GC[k] + ')' : '') + (EL[k] != null ? ' · 태양 고도 ' + Math.max(0, Math.round(EL[k])) + '°' : ''));
      if (T[k] != null) lines.push('기온 ' + f1(T[k]) + '°C' + (w.RH && w.RH[k] != null ? ' · 습도 ' + w.RH[k] + '%' : ''));
      if (w.P && w.P[k] != null) lines.push('강수확률 ' + w.P[k] + '%' + (w.R && w.R[k] ? ' · 강수 ' + w.R[k] + 'mm' : ''));
      if (w.WSD && w.WSD[k] != null) lines.push('바람 ' + dir16(w.VEC && w.VEC[k]) + '풍 ' + f1(w.WSD[k]) + ' m/s (' + windWord(w.WSD[k]) + ')');
      tip.innerHTML = lines.join('<br>'); tip.style.display = 'block';
      var px = X(k) * rc.width / W, tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(rc.width - tw, px + (px > rc.width / 2 ? -tw - 12 : 12))) + 'px';
    }
    function hide() { tip.style.display = 'none'; cross.setAttribute('opacity', '0'); }
    hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show); hit.addEventListener('pointerleave', hide);
  }

  var regions = null, sido = [];
  var cur = ls('farmily.region') || '';
  var setpoint = +(ls('farmily.setpoint') || 15);
  var orient = ls('farmily.orient') || '';  // 'ew' = 측창이 동·서를 향함(남북으로 긴 하우스), 'ns' = 측창이 남·북을 향함(동서로 긴 하우스)
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
    if (!r0) document.getElementById('lc-body').innerHTML = '<div class="lc-s">시·도와 시·군을 고르시면 우리 지역의 서리 예상일, 최근 7일 일조량, 오늘 밤 난방이 필요한 시간, 바람·예상 일사량, 48시간 그래프, 병 발생 위험 신호를 보여 드리고 아래 소식 중 우리 지역 내용을 노랗게 표시합니다. 선택은 이 기기에 기억됩니다.</div>';
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

  var lastW = null, rsz = null;
  window.addEventListener('resize', function () { clearTimeout(rsz); rsz = setTimeout(function () { var ch = document.getElementById('lc-chart'); if (ch && lastW && Math.abs((ch._w || 0) - ch.clientWidth) > 20) { chart48(lastW, ch); ch._w = ch.clientWidth; ph(); } }, 200); });

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
        + (su.gsr ? '같은 7일 관측 일사량 합 <b>' + f1(su.gsr.reduce(function (a, b) { return a + b; }, 0)) + ' MJ/m²</b>. ' : '')
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
    // 5) 바람 (앞으로 24시간 + 3시간 단위 풍향 시간표)
    if (w.WSD && w.WSD.some(function (x) { return x != null; })) {
      var n24 = Math.min(24, w.WSD.length), im = 0;
      for (var a = 0; a < n24; a++) if ((w.WSD[a] || 0) > (w.WSD[im] || 0)) im = a;
      var wmax = w.WSD[im] || 0, tm = new Date(h0.getTime() + im * 3600000), vnow = w.VEC ? w.VEC[0] : null;
      var strong = 0; for (a = 0; a < n24; a++) if ((w.WSD[a] || 0) >= WIND_WARN) strong++;
      var dial = '<svg width="74" height="74" viewBox="0 0 74 74" aria-hidden="true"><circle cx="37" cy="37" r="30" fill="#fff" stroke="#cfd8cf"/>'
        + ['북', '동', '남', '서'].map(function (d, q) { var ang = q * Math.PI / 2; return '<text x="' + (37 + Math.sin(ang) * 24).toFixed(1) + '" y="' + (41 - Math.cos(ang) * 24).toFixed(1) + '" font-size="10" fill="#888" text-anchor="middle">' + d + '</text>'; }).join('')
        + (vnow != null ? arrow(37, 37, 30, vnow, (w.WSD[0] || 0) >= WIND_WARN ? '#c62828' : '#12341f', 3) : '') + '</svg>';
      // 3시간 단위 블록 (정시 3·6·9…에 맞춤): 그 3시간 중 가장 센 바람과 평균 풍향
      var blocks = [], k0 = 0;
      while (k0 < w.WSD.length && (h0.getHours() + k0) % 3 !== 0) k0++;
      for (var k = k0; k + 2 < w.WSD.length && blocks.length < 16; k += 3) {
        var sx = 0, sy = 0, mxw = 0;
        for (var q = k; q < k + 3; q++) { var vv = w.VEC ? w.VEC[q] : null, ww = w.WSD[q] || 0; if (vv != null) { sx += Math.sin(vv * Math.PI / 180) * (ww + 0.1); sy += Math.cos(vv * Math.PI / 180) * (ww + 0.1); } mxw = Math.max(mxw, ww); }
        var vb = (sx || sy) ? (Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360 : null;
        blocks.push({ t: new Date(h0.getTime() + k * 3600000), v: vb, s: mxw });
      }
      function cell(bk) {
        var side = windward(bk.v, orient);
        return '<div class="lc-wc' + (bk.s >= WIND_WARN ? ' st' : '') + '" title="' + md(bk.t) + ' ' + bk.t.getHours() + '~' + (bk.t.getHours() + 3) + '시 ' + dir16(bk.v) + '풍 최대 ' + f1(bk.s) + 'm/s">'
          + '<b>' + bk.t.getHours() + '시</b>'
          + (bk.v != null ? '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">' + arrow(10, 10, 15, bk.v, bk.s >= WIND_WARN ? '#c62828' : '#334155', 2) + '</svg>' : '')
          + '<div>' + dir8(bk.v) + '</div><div>' + f1(bk.s) + '</div>'
          + (side ? '<span class="ws">' + (side === '옆' ? '양쪽' : side + '측') + '</span>' : '') + '</div>';
      }
      var tab = '', row = [];
      blocks.forEach(function (bk, q) {
        if (q % 8 === 0) { if (row.length) tab += '<div class="lc-wtab">' + row.join('') + '</div>'; row = []; tab += '<div class="lc-wday">' + md(bk.t) + ' ' + bk.t.getHours() + '시부터</div>'; }
        row.push(cell(bk));
      });
      if (row.length) tab += '<div class="lc-wtab">' + row.join('') + '</div>';
      // 직전에 알려 준 풍향(기준)에서 67.5° 이상 돌아가면 '바뀜'으로 알림 (천천히 도는 경우도 잡힘, 약한 바람은 제외)
      var chg = [], anc = null;
      for (k = 0; k < blocks.length && chg.length < 5; k++) {
        var bk2 = blocks[k]; if (bk2.v == null || bk2.s < 1.5) continue;
        if (anc == null) { anc = bk2.v; continue; }
        var dlt = Math.abs(((bk2.v - anc) + 540) % 360 - 180);
        if (dlt >= 67.5) { chg.push(md(bk2.t) + ' ' + bk2.t.getHours() + '시경 <b>' + dir8(anc) + '풍 → ' + dir8(bk2.v) + '풍</b>'); anc = bk2.v; }
      }
      var osel = '<div class="lc-orient">우리 하우스 측창 방향 <select id="lc-orient"><option value=""' + (orient ? '' : ' selected') + '>선택 안 함</option>'
        + '<option value="ew"' + (orient === 'ew' ? ' selected' : '') + '>동쪽·서쪽 측창 (남북으로 긴 하우스)</option>'
        + '<option value="ns"' + (orient === 'ns' ? ' selected' : '') + '>남쪽·북쪽 측창 (동서로 긴 하우스)</option></select>'
        + (orient ? ' — 칸 아래 표시는 <b>바람이 들이치는 쪽 측창</b>입니다(“양쪽”은 하우스 길이 방향으로 부는 바람).' : ' — 고르시면 시간대별로 바람이 들이치는 쪽 측창을 표시합니다.') + '</div>';
      tiles += '<div class="lc-tile lc-wide"><div class="lc-k">💨 바람 · 풍향 시간표</div><div class="lc-wind">' + dial + '<div>'
        + '<div class="lc-v">지금 ' + dir16(vnow) + '풍 ' + f1(w.WSD[0] || 0) + ' m/s</div>'
        + '<div class="lc-s">24시간 안에 가장 셀 때 ' + md(tm) + ' ' + tm.getHours() + '시 ' + dir16(w.VEC && w.VEC[im]) + '풍 <b>' + f1(wmax) + ' m/s</b> (' + windWord(wmax) + ')</div></div></div>'
        + (chg.length ? '<ul class="lc-chg">' + chg.map(function (x) { return '<li>🔄 풍향 바뀜: ' + x + '</li>'; }).join('') + '</ul>' : '<div class="lc-s">이 기간 풍향이 크게 바뀌는 때는 없습니다.</div>')
        + tab + osel
        + '<div class="lc-s">칸마다 3시간 동안의 <b>대표 풍향</b>(화살표는 바람이 불어가는 쪽)과 <b>가장 센 풍속(m/s)</b>입니다. 빨간 칸은 초속 ' + WIND_WARN + 'm 이상. '
        + (strong ? '⚠️ 24시간 안에 강한 바람이 약 ' + strong + '시간 예상됩니다. 비닐·차광막 고정끈을 점검하고 바람받이 측창은 닫아 두세요. ' : '')
        + '기상청 단기예보(5km 격자) 값이라 산·건물 때문에 하우스 자리 바람은 다를 수 있으니, 자동제어기 풍향 센서 값과 함께 보세요.</div></div>';
    }
    // 6) 예상 일사량 (오늘·내일·모레)
    if (w.rad && w.rad.length) {
      var rd = w.rad.slice(0, 3), noon = null, cal = rd.some(function (x) { return x.cal; });
      if (w.EL) for (var b = 0; b < Math.min(24, w.EL.length); b++) if (noon == null || w.EL[b] > noon) noon = w.EL[b];
      var so = w.solar, ts = so && so.test, sc = w.solar_score;
      tiles += '<div class="lc-tile lc-wide"><div class="lc-k">🌤 예상 일사량 (하루 합계)' + (cal ? ' · 10년 관측으로 보정' : '') + '</div><div class="lc-sunrow">'
        + rd.map(function (x, q) { var dd = parseIso(x.d), pc = x.clear ? Math.round(x.est / x.clear * 100) : 0;
            return '<div>' + (q === 0 ? '오늘' : q === 1 ? '내일' : '모레') + ' ' + (dd.getMonth() + 1) + '/' + dd.getDate() + (x.part ? ' (남은 시간)' : '')
              + '<b>' + f1(x.est) + ' MJ/m²</b>'
              + (x.cal && x.lo != null ? '<span class="lc-range">대략 ' + f1(x.lo) + '~' + f1(x.hi) + '</span>' : '')
              + '맑은 날의 ' + pc + '%<div class="lc-meter"><span style="width:' + Math.min(100, pc) + '%"></span></div>'
              + (x.clim != null && !x.part ? '<span class="lc-range">평년 ' + f1(x.clim) + ' (' + (x.est >= x.clim ? '+' : '') + Math.round((x.est / x.clim - 1) * 100) + '%)</span>' : '') + '</div>'; }).join('')
        + '</div><div class="lc-s">'
        + (cal && so
          ? '태양 높이(요즘 한낮 약 ' + (noon != null ? Math.round(noon) : '-') + '°)로 맑은 날 일사량을 계산한 뒤, <b>' + esc(so.name) + ' 관측소(' + so.km + 'km)의 ' + so.first.slice(0, 4) + '~' + so.last.slice(0, 4) + '년 일사 관측 ' + Number(so.n).toLocaleString() + '일</b>에서 구름 양·비에 따라 실제로 줄어든 비율을 찾아 적용했습니다. “대략”은 같은 조건이던 날 중 가운데 절반이 들어간 범위, “평년”은 지난 10년 같은 날짜 앞뒤 1주 평균입니다.'
            + (ts ? '<br>📏 검증: 마지막 2년(' + ts.from.slice(0, 7).replace('-', '.') + '~' + ts.to.slice(0, 7).replace('-', '.') + ')을 빼고 맞춘 뒤 그 2년에 대 보니 하루 평균 오차 <b>±' + f1(ts.mae) + ' MJ/m²(' + ts.pct + '%)</b>, 보정 전 단순 계산은 ±' + f1(ts.naive_mae) + '(' + ts.naive_pct + '%)였습니다. 이 검증은 실제 구름 양을 안다고 본 값이라, 구름 예보가 빗나가면 오차가 더 커집니다.' : '')
            + (sc && sc.n >= 5 ? '<br>🎯 실제 예보 성적: 최근 ' + sc.n + '일 전날 예보와 관측을 비교하면 평균 오차 <b>±' + f1(sc.mae) + ' MJ/m²</b>(' + Math.round(sc.mae / sc.mean * 100) + '%), “대략” 범위 안에 든 날 ' + sc.inside + '%.' : '<br>🎯 매일 전날 예보와 실제 관측을 맞춰 보는 성적표를 쌓고 있습니다(5일 이상 모이면 여기 표시).')
          : '태양 높이(요즘 한낮 약 ' + (noon != null ? Math.round(noon) : '-') + '°)로 맑은 날 일사량을 계산하고, 기상청 하늘 상태로 줄인 추정값입니다. 가까운 관측소의 10년 일사 관측으로 보정하는 작업이 진행 중이며, 끝나면 보정값과 오차가 표시됩니다.')
        + ' 하우스 안은 피복재 때문에 보통 이보다 20~40% 적습니다.</div></div>';
    }
    // 7) 48시간 그래프
    var hasChart = w.T && w.T.length >= 12;
    if (hasChart) tiles += '<div class="lc-tile lc-wide"><div class="lc-k">⏱ 앞으로 48시간 한눈에</div><div class="lc-chart" id="lc-chart"></div>'
      + '<div class="lc-legend"><span><i style="background:#f2b33d;opacity:.8"></i>예상 일사량</span><span><i style="border-top:2px dashed #c9a24a;height:0;background:none"></i>맑을 때 일사량</span>'
      + '<span><i style="background:#c2410c;height:3px"></i>기온</span><span><i style="background:#eef0f4;border:1px solid #d9dde5"></i>밤</span><span><i style="background:#c62828"></i>강한 바람(' + WIND_WARN + 'm/s 이상)</span></div>'
      + '<div class="lc-s">그래프를 누르거나 손가락으로 훑으면 그 시각의 하늘·일사·기온·습도·강수·바람이 함께 나옵니다.</div></div>';
    var base = String(w.short_base || '');
    var bm = /^(\d{4})(\d\d)(\d\d) (\d\d)/.exec(base);
    body.innerHTML = '<div class="lc-grid">' + tiles + '</div><div class="lc-foot">' + esc(r.sido + ' ' + r.name) + ' · 자료: 기상청 단기예보'
      + (bm ? '(' + (+bm[2]) + '/' + (+bm[3]) + ' ' + bm[4] + '시 발표)' : '') + '·중기예보·종관기상관측(ASOS) · 바깥 날씨 기준이라 하우스 안 환경과는 다를 수 있습니다.</div>';
    var os_ = document.getElementById('lc-orient');
    if (os_) os_.onchange = function () { orient = this.value; ls('farmily.orient', orient); render(r, w); };
    var sp = document.getElementById('lc-sp');
    if (sp) sp.onchange = function () { var v = +this.value; if (v >= 0 && v <= 30) { setpoint = v; ls('farmily.setpoint', String(v)); render(r, w); } };
    var ch = document.getElementById('lc-chart');
    if (ch) { chart48(w, ch); ch._w = ch.clientWidth; lastW = w; }
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
