/* FARMILY 오늘의 농업 정보 — 품목별 가격 변동 추이 드롭다운
   대표 품목은 기존 탭 그대로 두고, 수집 중인 나머지 품목을 골라 볼 수 있게 합니다.
   데이터: trend-data.json (archive-prices에서 매일 생성) */
(function () {
  var BASE = location.pathname.indexOf('/log/') > -1 ? '../' : './';
  var LINE = '#12341f';
  var data = null, wrap, sel, panel;

  function css() {
    var s = document.createElement('style');
    s.textContent =
      '.trend-pick{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:2px 0 12px}' +
      '.trend-pick label{font-size:13px;color:#666}' +
      '.trend-pick select{font-family:inherit;font-size:13px;color:#333;background:#fafafa;' +
      'border:1px solid #ddd;border-radius:16px;padding:5px 30px 5px 12px;cursor:pointer;max-width:100%;' +
      '-webkit-appearance:none;appearance:none;' +
      'background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' fill=\'none\' stroke=\'%23888\' stroke-width=\'1.6\'/%3E%3C/svg%3E");' +
      'background-repeat:no-repeat;background-position:right 12px center}' +
      '.trend-pick select:focus{outline:2px solid #12341f;outline-offset:1px}' +
      '.trend-pick .tp-reset{border:0;background:none;color:#1a56db;font-family:inherit;font-size:13px;cursor:pointer;padding:4px}' +
      '.trend-pick .tp-reset[hidden]{display:none}' +
      '#trend-pick-panel{display:none}' +
      '#trend-pick-panel.on{display:block}';
    document.head.appendChild(s);
  }

  function won(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function ticks(lo, hi) {
    /* 값이 하나뿐이거나 변동이 없는 품목: 값 주변으로 폭을 잡아 선이 가운데 오게 한다 */
    if (!(hi > lo)) { var c = hi || 1; var pad = Math.abs(c) * 0.1 + 1; lo = c - pad; hi = c + pad; }
    var steps = [50, 100, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000], best = null;
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      var a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st;
      if (b === a) b = a + st;
      var n = (b - a) / st + 1;
      if (n >= 4 && n <= 7) {
        var fill = (hi - lo) / (b - a);
        if (!best || fill > best.fill) best = { lo: a, hi: b, st: st, fill: fill };
      }
    }
    if (!best) {
      var raw = (hi - lo) / 4, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), st2 = 10 * mag;
      [1, 2, 2.5, 5, 10].some(function (m) { if (m * mag >= raw) { st2 = m * mag; return true; } return false; });
      var a2 = Math.floor(lo / st2) * st2, b2 = Math.ceil(hi / st2) * st2;
      if (b2 === a2) b2 = a2 + st2;
      best = { lo: a2, hi: b2, st: st2, fill: (hi - lo) / (b2 - a2) };
    }
    return best;
  }

  function svg(pts, mobile, label) {
    var G = mobile
      ? { vb: '0 0 640 268', x0: 78, x1: 616, y0: 30, y1: 236, fs: 13, tx: 69, xy: 260, xfs: 14, sw: 2.5, r: 4, vfs: 13, dy: 11 }
      : { vb: '0 0 1280 320', x0: 90, x1: 1250, y0: 34, y1: 282, fs: 15, tx: 80, xy: 308, xfs: 15, sw: 3, r: 5, vfs: 15, dy: 13 };
    var vals = pts.map(function (p) { return p.v; });
    var t = ticks(Math.min.apply(null, vals), Math.max.apply(null, vals));
    var d0 = pts[0].d, span = (pts[pts.length - 1].d - d0) / 86400000 || 1;
    var X = function (p) { return G.x0 + ((p.d - d0) / 86400000) / span * (G.x1 - G.x0); };
    var Y = function (v) { return G.y1 - (v - t.lo) / (t.hi - t.lo) * (G.y1 - G.y0); };
    var o = ['<svg class="svg-' + (mobile ? 'm' : 'd') + '" viewBox="' + G.vb + '" role="img" aria-label="' + label + ' 가격 변동 추이">'];
    for (var v = t.lo; v <= t.hi + 0.5; v += t.st) {
      var y = Y(v);
      o.push('<line x1="' + G.x0 + '" y1="' + y.toFixed(1) + '" x2="' + G.x1 + '" y2="' + y.toFixed(1) + '" stroke="#ececec" stroke-width="1"/>');
      o.push('<text x="' + G.tx + '" y="' + (y + G.fs * 0.32).toFixed(1) + '" font-size="' + G.fs + '" fill="#999" text-anchor="end">' + won(v) + '</text>');
    }
    var n = pts.length, pick = [];
    if (n > 14) { [0, n >> 2, n >> 1, (3 * n) >> 2, n - 1].forEach(function (i) { if (pick.indexOf(i) < 0) pick.push(i); }); }
    else if (n > 7) { [0, (n / 3) | 0, ((2 * n) / 3) | 0, n - 1].forEach(function (i) { if (pick.indexOf(i) < 0) pick.push(i); }); }
    else { for (var k = 0; k < n; k++) pick.push(k); }
    pick.sort(function (a, b) { return a - b; }).forEach(function (i) {
      var dt = new Date(pts[i].d);
      o.push('<text x="' + X(pts[i]).toFixed(1) + '" y="' + G.xy + '" text-anchor="middle" font-size="' + G.xfs + '" fill="#999">' + (dt.getUTCMonth() + 1) + '/' + dt.getUTCDate() + '</text>');
    });
    o.push('<polyline points="' + pts.map(function (p) { return X(p).toFixed(1) + ',' + Y(p.v).toFixed(1); }).join(' ') +
      '" fill="none" stroke="' + LINE + '" stroke-width="' + G.sw + '" stroke-linecap="round" stroke-linejoin="round"/>');
    if (n <= 14) pts.forEach(function (p) {
      o.push('<circle cx="' + X(p).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="' + G.r + '" fill="' + LINE + '" stroke="#fff" stroke-width="2"/>');
    });
    var mx = vals.indexOf(Math.max.apply(null, vals)), mn = vals.indexOf(Math.min.apply(null, vals));
    [n - 1, mx, mn].filter(function (i, k, a) { return a.indexOf(i) === k; }).forEach(function (i) {
      var anc = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
      var ax = X(pts[i]) + (i === 0 ? 7 : (i === n - 1 ? -7 : 0));
      /* 최저점 라벨은 선 위에 겹치므로 아래쪽에 붙인다 */
      var below = (i === mn && i !== n - 1 && i !== mx);
      var ay = below ? Y(pts[i].v) + G.dy + G.vfs * 0.5 : Y(pts[i].v) - G.dy;
      o.push('<text x="' + ax.toFixed(1) + '" y="' + ay.toFixed(1) + '" font-size="' + G.vfs +
        '" font-weight="700" fill="#444" text-anchor="' + anc + '">' + won(pts[i].v) + '원</text>');
    });
    o.push('</svg>');
    return o.join('');
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function draw(idx) {
    var s = data.series[idx];
    var pts = [];
    for (var i = 0; i < data.dates.length; i++) {
      if (s.p[i] == null) continue;
      pts.push({ d: Date.parse(data.dates[i] + 'T00:00:00Z'), v: s.p[i] });
    }
    if (pts.length < 2) {
      panel.innerHTML = '<div class="trend-note">이 품목은 아직 비교할 자료가 2일 미만이라 그래프를 그릴 수 없습니다.</div>';
    } else {
      var first = new Date(pts[0].d), last = new Date(pts[pts.length - 1].d);
      var vs = pts.map(function (p) { return p.v; });
      var flat = Math.max.apply(null, vs) === Math.min.apply(null, vs);
      panel.innerHTML =
        '<div class="tab-sub">' + esc(s.n) + ' · ' + esc(s.u) + ' · 가락시장 상품 등급</div>' +
        svg(pts, false, esc(s.n)) + svg(pts, true, esc(s.n)) +
        '<div class="trend-note">' + (first.getUTCMonth() + 1) + '월 ' + first.getUTCDate() + '일부터 ' +
        (last.getUTCMonth() + 1) + '월 ' + last.getUTCDate() + '일까지 ' + pts.length + '일치 경락가입니다. 자료가 없는 날은 건너뛰고 이었습니다.' +
        (flat ? ' 이 기간 가격이 한 번도 바뀌지 않았습니다 — 경매 물량이 적어 직전 가격이 그대로 유지되는 품목일 수 있습니다.' : '') + '</div>';
    }
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.className = 'tab-panel'; });
    document.querySelectorAll('.trend-tabs .tab-btn').forEach(function (b) { b.className = 'tab-btn'; });
    panel.className = 'on';
    wrap.querySelector('.tp-reset').hidden = false;
    if (typeof postHeight === 'function') postHeight();
  }

  function reset() {
    panel.className = ''; panel.innerHTML = '';
    sel.selectedIndex = 0;
    wrap.querySelector('.tp-reset').hidden = true;
    if (typeof showTrendTab === 'function') showTrendTab(0);
    else if (typeof postHeight === 'function') postHeight();
  }

  function build() {
    var primary = data.primary || [];
    var nameCount = {};
    data.series.forEach(function (s) { nameCount[s.n] = (nameCount[s.n] || 0) + 1; });
    var opts = data.series.map(function (s, i) { return { i: i, s: s }; })
      .filter(function (o) { return primary.indexOf(o.s.n) < 0; })
      .sort(function (a, b) { return a.s.n.localeCompare(b.s.n, 'ko'); });
    var html = '<option value="">품목을 선택하세요 (' + opts.length + '개)</option>';
    opts.forEach(function (o) {
      var t = nameCount[o.s.n] > 1 ? o.s.n + ' · ' + o.s.u : o.s.n;
      html += '<option value="' + o.i + '">' + esc(t) + '</option>';
    });
    sel.innerHTML = html;
    sel.disabled = false;
  }

  function init() {
    var host = document.getElementById('trend-pick');
    if (!host) return;
    css();
    host.innerHTML =
      '<div class="trend-pick"><label for="trend-select">다른 품목도 보기</label>' +
      '<select id="trend-select" disabled><option value="">불러오는 중…</option></select>' +
      '<button type="button" class="tp-reset" hidden>대표 품목으로 돌아가기</button></div>' +
      '<div id="trend-pick-panel"></div>';
    wrap = host; sel = host.querySelector('#trend-select'); panel = host.querySelector('#trend-pick-panel');
    sel.addEventListener('change', function () { if (sel.value === '') reset(); else draw(+sel.value); });
    host.querySelector('.tp-reset').addEventListener('click', reset);
    var tabs = document.querySelector('.trend-tabs');
    if (tabs) tabs.addEventListener('click', function () {
      if (panel.className === 'on') { panel.className = ''; panel.innerHTML = ''; sel.selectedIndex = 0; wrap.querySelector('.tp-reset').hidden = true; }
    });
    fetch(BASE + 'trend-data.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { data = j; build(); })
      .catch(function () { sel.innerHTML = '<option value="">시세 이력을 불러오지 못했습니다</option>'; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
