/* FARMILY 오늘의 농업 정보 — 대표 품목 가격 변동 추이
   기간 버튼(1개월 / 6개월 / 1년 / 전체)으로 창을 바꿔 가며 다시 그립니다.
   y축은 0을 강제하지 않고 보이는 구간의 실제 범위에 맞추고, 배경에 계절 띄를 깔아
   철에 따른 시세 흐름을 볼 수 있게 합니다.
   데이터: trend-primary.json (dates 공유 + 품목별 p 배열, 결측일은 null) */
(function () {
  var BASE = location.pathname.indexOf('/log/') > -1 ? '../' : './';
  var PERIODS = [
    { k: 30, t: '1개월' }, { k: 182, t: '6개월' },
    { k: 365, t: '1년' }, { k: 0, t: '전체' }
  ];
  var SEASON = [['봄', '#f3f8ee'], ['여름', '#edf5fa'], ['가을', '#fdf5ea'], ['겨울', '#f4f5f9']];
  var STEPS = [50, 100, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  var GEOM = {
    d: { cls: 'svg-d', vb: '0 0 1280 320', x0: 90, x1: 1250, y0: 34, y1: 282, fs: 15, tx: 80, xy: 308, xfs: 15, sw: 3, r: 5, vfs: 15, dy: 13, minw: 78, sfs: 13 },
    m: { cls: 'svg-m', vb: '0 0 640 268', x0: 78, x1: 616, y0: 30, y1: 236, fs: 13, tx: 69, xy: 262, xfs: 14, sw: 2.5, r: 4, vfs: 13, dy: 11, minw: 54, sfs: 12 }
  };
  var DAY = 86400000;
  var data = null, host = null, cur = 30;

  function css() {
    var s = document.createElement('style');
    s.textContent =
      '.trend-period{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:4px 0 10px}' +
      '.trend-period .tp-lab{font-size:13px;color:#666;margin-right:2px}' +
      '.trend-period button{border:1px solid #ddd;background:#fafafa;color:#555;border-radius:16px;' +
      'padding:4px 12px;font-size:13px;font-family:inherit;line-height:1.5;cursor:pointer}' +
      '.trend-period button.on{background:#12341f;color:#fff;border-color:#12341f;font-weight:700}' +
      '.trend-period button:disabled{color:#bbb;background:#fcfcfc;cursor:default}' +
      '.trend-period .tp-hint{font-size:12px;color:#aaa;margin-left:2px}';
    document.head.appendChild(s);
  }

  function won(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function seasonOf(d) { var m = d.getUTCMonth() + 1; return (m >= 3 && m <= 5) ? 0 : (m >= 6 && m <= 8) ? 1 : (m >= 9 && m <= 11) ? 2 : 3; }

  /* 눈금 4~7개, 데이터가 축을 가장 꿉 채우는 후보. 0 기준선을 강제하지 않는다. */
  function ticks(lo, hi) {
    if (!(hi > lo)) { var pad = Math.abs(hi) * 0.1 + 1; lo = hi - pad; hi = hi + pad; }
    var best = null, i;
    for (i = 0; i < STEPS.length; i++) {
      var st = STEPS[i], a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st;
      if (b === a) b = a + st;
      var n = (b - a) / st + 1;
      if (n >= 4 && n <= 7) {
        var fill = (hi - lo) / (b - a);
        if (!best || fill > best.fill) best = { lo: a, hi: b, st: st, fill: fill };
      }
    }
    if (!best) {
      var raw = (hi - lo) / 4 || 1, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), st2 = 10 * mag;
      [1, 2, 2.5, 5, 10].some(function (m) { if (m * mag >= raw) { st2 = m * mag; return true; } return false; });
      var a2 = Math.floor(lo / st2) * st2, b2 = Math.ceil(hi / st2) * st2;
      if (b2 === a2) b2 = a2 + st2;
      best = { lo: a2, hi: b2, st: st2, fill: (hi - lo) / (b2 - a2) };
    }
    return best;
  }

  function bands(pts, X, g) {
    var segs = [], cur = null, o = [];
    pts.forEach(function (p) {
      var s = seasonOf(new Date(p.d));
      if (!cur || cur[0] !== s) { cur = [s, p.d, p.d]; segs.push(cur); } else cur[2] = p.d;
    });
    segs.forEach(function (sg, i) {
      var xa = i ? X(sg[1]) : g.x0;
      var xb = (i === segs.length - 1) ? g.x1 : (X(sg[2]) + X(segs[i + 1][1])) / 2;
      o.push('<rect x="' + xa.toFixed(1) + '" y="' + g.y0 + '" width="' + Math.max(xb - xa, 0).toFixed(1) +
        '" height="' + (g.y1 - g.y0) + '" fill="' + SEASON[sg[0]][1] + '"/>');
      if (i) o.push('<line x1="' + xa.toFixed(1) + '" y1="' + g.y0 + '" x2="' + xa.toFixed(1) +
        '" y2="' + g.y1 + '" stroke="#e3ddd2" stroke-width="1"/>');
      if (xb - xa >= g.minw) o.push('<text x="' + ((xa + xb) / 2).toFixed(1) + '" y="' + (g.y0 + g.sfs + 3) +
        '" font-size="' + g.sfs + '" fill="#b9b0a2" text-anchor="middle">' + SEASON[sg[0]][0] + '</text>');
    });
    return o.join('');
  }

  function svg(pts, kind, label, color) {
    var g = GEOM[kind], vals = pts.map(function (p) { return p.v; });
    var t = ticks(Math.min.apply(null, vals), Math.max.apply(null, vals));
    var d0 = pts[0].d, span = (pts[pts.length - 1].d - d0) / DAY || 1;
    var X = function (d) { return g.x0 + (d - d0) / DAY / span * (g.x1 - g.x0); };
    var Y = function (v) { return g.y1 - (v - t.lo) / (t.hi - t.lo) * (g.y1 - g.y0); };
    var o = ['<svg class="' + g.cls + '" viewBox="' + g.vb + '" role="img" aria-label="' + label + ' 가격 변동 추이">'];
    o.push(bands(pts, X, g));
    for (var v = t.lo; v <= t.hi + 0.5; v += t.st) {
      var y = Y(v);
      o.push('<line x1="' + g.x0 + '" y1="' + y.toFixed(1) + '" x2="' + g.x1 + '" y2="' + y.toFixed(1) + '" stroke="#e4e4e4" stroke-width="1"/>');
      o.push('<text x="' + g.tx + '" y="' + (y + g.fs * 0.32).toFixed(1) + '" font-size="' + g.fs + '" fill="#999" text-anchor="end">' + won(v) + '</text>');
    }
    var n = pts.length, pick = [];
    function add(i) { if (pick.indexOf(i) < 0) pick.push(i); }
    if (n > 14) [0, n >> 2, n >> 1, (3 * n) >> 2, n - 1].forEach(add);
    else if (n > 7) [0, (n / 3) | 0, ((2 * n) / 3) | 0, n - 1].forEach(add);
    else for (var k = 0; k < n; k++) add(k);
    pick.sort(function (a, b) { return a - b; }).forEach(function (i) {
      var dt = new Date(pts[i].d), anc = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
      o.push('<text x="' + X(pts[i].d).toFixed(1) + '" y="' + g.xy + '" text-anchor="' + anc +
        '" font-size="' + g.xfs + '" fill="#999">' + (dt.getUTCMonth() + 1) + '/' + dt.getUTCDate() + '</text>');
    });
    o.push('<polyline points="' + pts.map(function (p) { return X(p.d).toFixed(1) + ',' + Y(p.v).toFixed(1); }).join(' ') +
      '" fill="none" stroke="' + color + '" stroke-width="' + g.sw + '" stroke-linejoin="round" stroke-linecap="round"/>');
    if (n <= 14) pts.forEach(function (p) {
      o.push('<circle cx="' + X(p.d).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="' + g.r +
        '" fill="' + color + '" stroke="#fff" stroke-width="2"/>');
    });
    var mx = vals.indexOf(Math.max.apply(null, vals)), mn = vals.indexOf(Math.min.apply(null, vals));
    [n - 1, mx, mn].filter(function (i, k, a) { return a.indexOf(i) === k; }).forEach(function (i) {
      var anc = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
      var ax = X(pts[i].d) + (i === 0 ? 7 : (i === n - 1 ? -7 : 0));
      var below = (i === mn && i !== n - 1 && i !== mx);
      var ay = below ? Y(pts[i].v) + g.dy + g.vfs * 0.5 : Y(pts[i].v) - g.dy;
      o.push('<text x="' + ax.toFixed(1) + '" y="' + ay.toFixed(1) + '" font-size="' + g.vfs +
        '" font-weight="700" fill="#444" text-anchor="' + anc + '">' + won(pts[i].v) + '</text>');
    });
    o.push('</svg>');
    return o.join('');
  }

  function span() {
    var d = data.dates, lo = Date.parse(d[0] + 'T00:00:00Z'), hi = Date.parse(d[d.length - 1] + 'T00:00:00Z');
    return { lo: lo, hi: hi, days: (hi - lo) / DAY };
  }

  function render(days) {
    cur = days;
    var sp = span(), cut = days ? sp.hi - days * DAY : -Infinity;
    data.items.forEach(function (it, idx) {
      var panel = document.getElementById('trend-tab-' + idx);
      if (!panel) return;
      var pts = [];
      for (var i = 0; i < data.dates.length; i++) {
        if (it.p[i] == null) continue;
        var ms = Date.parse(data.dates[i] + 'T00:00:00Z');
        if (ms >= cut) pts.push({ d: ms, v: it.p[i] });
      }
      if (pts.length < 2) {
        panel.innerHTML = '<div class="trend-note">이 기간에는 비교할 자료가 2일 미만이라 그래프를 그릴 수 없습니다. 더 긴 기간을 골라 보세요.</div>';
        return;
      }
      var f = new Date(pts[0].d), l = new Date(pts[pts.length - 1].d);
      panel.innerHTML =
        '<div class="tab-sub">' + esc(it.n) + ' · ' + esc(it.u) + ' · 가락시장 상품 등급</div>' +
        svg(pts, 'd', esc(it.n), it.c) + svg(pts, 'm', esc(it.n), it.c) +
        '<div class="trend-note">' + (f.getUTCMonth() + 1) + '월 ' + f.getUTCDate() + '일~' +
        (l.getUTCMonth() + 1) + '월 ' + l.getUTCDate() + '일 가락시장 상품(상) 등급 경락가 ' + pts.length +
        '일치 · 배경색은 계절(가을 9~11월 등)을 나타냅니다 · 자료가 없는 날은 건너뛰고 이었습니다.</div>';
    });
    host.querySelectorAll('button').forEach(function (b) {
      b.className = (+b.dataset.k === days) ? 'on' : '';
    });
    if (typeof postHeight === 'function') postHeight();
  }

  function buttons() {
    var sp = span(), html = '<div class="trend-period"><span class="tp-lab">기간</span>', short = null;
    PERIODS.forEach(function (p) {
      /* 자료가 아직 그 기간에 못 미치면 '전체'와 같은 그림이 되므로 비활성 */
      var dead = p.k && p.k > sp.days;
      if (!dead && p.k && short === null) short = p.k;
      html += '<button type="button" data-k="' + p.k + '"' + (dead ? ' disabled title="자료가 더 쌓이면 열립니다"' : '') +
        '>' + p.t + '</button>';
    });
    if (sp.days < 365) html += '<span class="tp-hint">자료 누적 ' + (Math.round(sp.days) + 1) + '일</span>';
    host.innerHTML = html + '</div>';
    host.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { if (!b.disabled) render(+b.dataset.k); });
    });
    render(short || 0);
  }

  function init() {
    host = document.getElementById('trend-period');
    if (!host) return;
    css();
    /* 다른 품목 드롭다운을 보는 동안에는 기간 버튼을 숨긴다(그 차트는 60일 고정) */
    var pick = document.getElementById('trend-pick');
    if (pick && window.MutationObserver) {
      new MutationObserver(function () {
        var p = document.getElementById('trend-pick-panel');
        host.style.display = (p && p.className === 'on') ? 'none' : '';
      }).observe(pick, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
    }
    fetch(BASE + 'trend-primary.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { data = j; buttons(); })
      .catch(function () {
        host.innerHTML = '<div class="trend-note">기간별 시세 이력을 불러오지 못했습니다.</div>';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
