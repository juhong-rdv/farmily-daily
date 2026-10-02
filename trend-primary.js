/* FARMILY 오늘의 농업 정보 — 대표 품목 가격 변동 추이
   기간 버튼(1개월 / 6개월 / 1년 / 전체)으로 창을 바꿔 가며 다시 그립니다.
   y축은 0을 강제하지 않고 보이는 구간의 실제 범위에 맞추며, 계절은 그래프 배경이 아니라
   플롯 아래 얇은 띠로 표시해 선이 먼저 읽히게 합니다(여백 정리형).
   선 위에 마우스를 올리거나 손가락으로 짚으면 그날 날짜와 경락가가 말풍선으로 나옵니다.
   데이터: trend-primary.json (dates 공유 + 품목별 p 배열, 결측일은 null) */
(function () {
  var BASE = location.pathname.indexOf('/log/') > -1 ? '../' : './';
  var PERIODS = [
    { k: 30, t: '1개월' }, { k: 182, t: '6개월' },
    { k: 365, t: '1년' }, { k: 0, t: '전체' }
  ];
  var SEASON = [['봄', '#eef5e6'], ['여름', '#e7f1fa'], ['가을', '#fbf0e2'], ['겨울', '#eef0f5']];
  var STEPS = [50, 100, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  var GEOM = {
    d: { cls: 'svg-d', vb: '0 0 1280 320', x0: 92, x1: 1252, y0: 30, y1: 230,
         sy0: 244, sy1: 264, xy: 292, fs: 15, tx: 80, xfs: 14, sw: 2.8, r: 4,
         vfs: 13, lfs: 17, dy: 11, dyb: 21, minw: 74, sfs: 13 },
    m: { cls: 'svg-m', vb: '0 0 640 268', x0: 78, x1: 616, y0: 26, y1: 180,
         sy0: 192, sy1: 209, xy: 237, fs: 13, tx: 68, xfs: 13, sw: 2.4, r: 3.5,
         vfs: 12, lfs: 15, dy: 10, dyb: 19, minw: 52, sfs: 12 }
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

  /* 눈금 4~7개, 데이터가 축을 가장 꽉 채우는 후보. 0 기준선을 강제하지 않는다. */
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

  /* 계절 띠 — 플롯 아래 얇은 막대. 구간 경계는 공통 좌표를 써서 틈이 생기지 않게 한다. */
  function bands(pts, X, g) {
    var segs = [], cur = null, o = [], edges = [g.x0];
    pts.forEach(function (p) {
      var s = seasonOf(new Date(p.d));
      if (!cur || cur[0] !== s) { cur = [s, p.d, p.d]; segs.push(cur); } else cur[2] = p.d;
    });
    for (var i = 0; i < segs.length - 1; i++) edges.push((X(segs[i][2]) + X(segs[i + 1][1])) / 2);
    edges.push(g.x1);
    segs.forEach(function (sg, i) {
      var a = edges[i], b = edges[i + 1], h = g.sy1 - g.sy0;
      o.push('<rect x="' + a.toFixed(1) + '" y="' + g.sy0 + '" width="' + Math.max(b - a, 0).toFixed(1) +
        '" height="' + h + '" fill="' + SEASON[sg[0]][1] + '"/>');
      if (b - a >= g.minw) o.push('<text x="' + ((a + b) / 2).toFixed(1) + '" y="' + (g.sy0 + h / 2 + g.sfs * 0.36).toFixed(1) +
        '" font-size="' + g.sfs + '" fill="#a79f93" text-anchor="middle">' + SEASON[sg[0]][0] + '</text>');
    });
    return o.join('');
  }

  /* ── 마우스/터치로 가격 읽기 ──────────────────────────────────────────
     차트 위에 투명한 감지 영역을 덮고, 가로 위치에서 가장 가까운 날짜를 찾아
     세로 안내선·점·말풍선을 보여 준다. 말풍선 글자는 SVG viewBox 안에 그려서
     PC와 모바일에서 다른 라벨들과 같은 비율로 커지고 줄어든다.
     trend.js의 드롭다운 차트도 이 함수를 그대로 쓴다. */
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function attachHover(el, o) {
    if (!el || !o.pts || o.pts.length < 2) return;
    var vbw = o.vbw, fs = o.fs || 14, pad = 9;
    var g = svgEl('g', { 'pointer-events': 'none', opacity: '0' });
    var vline = svgEl('line', { y1: o.y0, y2: o.y1, stroke: o.color, 'stroke-opacity': '.45', 'stroke-width': '1', 'stroke-dasharray': '4 4' });
    var dot = svgEl('circle', { r: o.fs >= 14 ? 6 : 5, fill: o.color, stroke: '#fff', 'stroke-width': '2.5' });
    var box = svgEl('rect', { rx: '6', fill: '#2d2d2d', 'fill-opacity': '.93' });
    var t1 = svgEl('text', { fill: '#fff', 'font-size': fs + 1, 'font-weight': '700', 'text-anchor': 'middle' });
    var t2 = svgEl('text', { fill: '#cfcfcf', 'font-size': fs - 1, 'text-anchor': 'middle' });
    [vline, dot, box, t1, t2].forEach(function (n) { g.appendChild(n); });
    el.appendChild(g);
    var hit = svgEl('rect', {
      x: o.x0, y: o.y0 - 8, width: o.x1 - o.x0, height: (o.y1 - o.y0) + 20,
      fill: 'transparent', 'pointer-events': 'all'
    });
    hit.style.cursor = 'crosshair';
    el.appendChild(hit);
    var labs = [].slice.call(el.querySelectorAll('.tp-vlab'));

    function show(clientX) {
      var r = el.getBoundingClientRect();
      if (!r.width) return;
      var vx = (clientX - r.left) / r.width * vbw;
      var best = 0, bd = Infinity;
      for (var i = 0; i < o.pts.length; i++) {
        var d = Math.abs(o.X(o.pts[i].d) - vx);
        if (d < bd) { bd = d; best = i; }
      }
      var p = o.pts[best], px = o.X(p.d), py = o.Y(p.v), dt = new Date(p.d);
      vline.setAttribute('x1', px.toFixed(1)); vline.setAttribute('x2', px.toFixed(1));
      dot.setAttribute('cx', px.toFixed(1)); dot.setAttribute('cy', py.toFixed(1));
      t1.textContent = won(p.v) + '원';
      t2.textContent = (dt.getUTCMonth() + 1) + '월 ' + dt.getUTCDate() + '일 (' + DOW[dt.getUTCDay()] + ')';
      var w = Math.max(t1.getComputedTextLength(), t2.getComputedTextLength()) + pad * 2;
      var h = fs * 2 + 16;
      var bx = Math.min(Math.max(px - w / 2, o.x0), o.x1 - w);
      var above = py - h - 14 >= o.y0 - 6;
      var by = above ? py - h - 14 : py + 14;
      box.setAttribute('x', bx.toFixed(1)); box.setAttribute('y', by.toFixed(1));
      box.setAttribute('width', w.toFixed(1)); box.setAttribute('height', h);
      t1.setAttribute('x', (bx + w / 2).toFixed(1)); t1.setAttribute('y', (by + fs + 3).toFixed(1));
      t2.setAttribute('x', (bx + w / 2).toFixed(1)); t2.setAttribute('y', (by + fs * 2 + 5).toFixed(1));
      g.setAttribute('opacity', '1');
      /* 말풍선과 겹치는 고정 값 라벨은 잠시 숨겨 글자가 포개지지 않게 한다 */
      labs.forEach(function (n) {
        var b = n.getBBox();
        var hitX = b.x < bx + w && b.x + b.width > bx;
        var hitY = b.y < by + h && b.y + b.height > by;
        n.style.opacity = (hitX && hitY) ? '0' : '';
      });
    }
    function hide() {
      g.setAttribute('opacity', '0');
      labs.forEach(function (n) { n.style.opacity = ''; });
    }

    hit.addEventListener('mousemove', function (e) { show(e.clientX); });
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('touchstart', function (e) { if (e.touches[0]) show(e.touches[0].clientX); }, { passive: true });
    hit.addEventListener('touchmove', function (e) { if (e.touches[0]) show(e.touches[0].clientX); }, { passive: true });
    hit.addEventListener('touchend', hide);
  }

  /* 드롭다운 차트(trend.js)도 같은 동작을 쓰도록 공개한다 */
  window.farmilyTrendHover = attachHover;

  function svg(pts, kind, label, color, uid) {
    var g = GEOM[kind], vals = pts.map(function (p) { return p.v; });
    var t = ticks(Math.min.apply(null, vals), Math.max.apply(null, vals));
    var d0 = pts[0].d, span = (pts[pts.length - 1].d - d0) / DAY || 1;
    var X = function (d) { return g.x0 + (d - d0) / DAY / span * (g.x1 - g.x0); };
    var Y = function (v) { return g.y1 - (v - t.lo) / (t.hi - t.lo) * (g.y1 - g.y0); };
    var gid = 'tpg-' + uid + '-' + kind;
    var o = ['<svg class="' + g.cls + '" viewBox="' + g.vb + '" role="img" aria-label="' + label + ' 가격 변동 추이">'];

    /* 가로 눈금 */
    for (var v = t.lo; v <= t.hi + 0.5; v += t.st) {
      var y = Y(v);
      o.push('<line x1="' + g.x0 + '" y1="' + y.toFixed(1) + '" x2="' + g.x1 + '" y2="' + y.toFixed(1) + '" stroke="#f0f0f0" stroke-width="1"/>');
      o.push('<text x="' + g.tx + '" y="' + (y + g.fs * 0.33).toFixed(1) + '" font-size="' + g.fs + '" fill="#aaa" text-anchor="end">' + won(v) + '</text>');
    }

    /* 선 아래 옅은 그라데이션 */
    var pl = pts.map(function (p) { return X(p.d).toFixed(1) + ',' + Y(p.v).toFixed(1); }).join(' ');
    o.push('<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.16"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>');
    o.push('<polygon points="' + X(pts[0].d).toFixed(1) + ',' + g.y1 + ' ' + pl + ' ' +
      X(pts[pts.length - 1].d).toFixed(1) + ',' + g.y1 + '" fill="url(#' + gid + ')"/>');
    o.push('<polyline points="' + pl + '" fill="none" stroke="' + color + '" stroke-width="' + g.sw +
      '" stroke-linejoin="round" stroke-linecap="round"/>');

    var n = pts.length;
    if (n <= 14) pts.forEach(function (p) {
      o.push('<circle cx="' + X(p.d).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="' + g.r +
        '" fill="' + color + '" stroke="#fff" stroke-width="2"/>');
    });

    /* 최고·최저는 속 빈 점과 작은 회색 글자, 최신만 색을 넣어 크게 */
    var mx = vals.indexOf(Math.max.apply(null, vals)), mn = vals.indexOf(Math.min.apply(null, vals)), last = n - 1;
    [mx, mn].forEach(function (i) {
      if (i === last) return;
      var p = pts[i], below = (i === mn);
      if (n > 14) o.push('<circle cx="' + X(p.d).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) +
        '" r="3.5" fill="#fff" stroke="' + color + '" stroke-width="2"/>');
      var anc = i === 0 ? 'start' : (i === last ? 'end' : 'middle');
      var ax = X(p.d) + (i === 0 ? 7 : 0);
      o.push('<text class="tp-vlab" x="' + ax.toFixed(1) + '" y="' + (below ? Y(p.v) + g.dyb : Y(p.v) - g.dy).toFixed(1) +
        '" font-size="' + g.vfs + '" font-weight="600" fill="#999" text-anchor="' + anc + '">' + won(p.v) + '</text>');
    });
    var lp = pts[last];
    o.push('<circle cx="' + X(lp.d).toFixed(1) + '" cy="' + Y(lp.v).toFixed(1) + '" r="' + (g.r + 2) +
      '" fill="' + color + '" stroke="#fff" stroke-width="2.5"/>');
    o.push('<text class="tp-vlab" x="' + (X(lp.d) - 10).toFixed(1) + '" y="' + (Y(lp.v) - g.dy - 3).toFixed(1) +
      '" font-size="' + g.lfs + '" font-weight="800" fill="' + color + '" text-anchor="end">' + won(lp.v) + '원</text>');

    /* 계절 띠와 날짜는 플롯 밖 아래에 */
    o.push(bands(pts, X, g));
    var pick = [];
    function add(i) { if (pick.indexOf(i) < 0) pick.push(i); }
    if (n > 14) [0, n >> 2, n >> 1, (3 * n) >> 2, n - 1].forEach(add);
    else if (n > 7) [0, (n / 3) | 0, ((2 * n) / 3) | 0, n - 1].forEach(add);
    else for (var k = 0; k < n; k++) add(k);
    pick.sort(function (a, b) { return a - b; }).forEach(function (i) {
      var dt = new Date(pts[i].d), anc = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
      o.push('<text x="' + X(pts[i].d).toFixed(1) + '" y="' + g.xy + '" text-anchor="' + anc +
        '" font-size="' + g.xfs + '" fill="#aaa">' + (dt.getUTCMonth() + 1) + '/' + dt.getUTCDate() + '</text>');
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
        svg(pts, 'd', esc(it.n), it.c, idx) + svg(pts, 'm', esc(it.n), it.c, idx) +
        '<div class="trend-note">' + (f.getUTCMonth() + 1) + '월 ' + f.getUTCDate() + '일~' +
        (l.getUTCMonth() + 1) + '월 ' + l.getUTCDate() + '일 가락시장 상품(상) 등급 경락가 ' + pts.length +
        '일치 · 그래프 아래 띠는 계절(가을 9~11월 등)입니다 · 마우스를 올리거나 손가락으로 짚으면 그날 가격이 나옵니다 · 자료가 없는 날은 건너뛰고 이었습니다.</div>';
      panel.querySelectorAll('svg').forEach(function (el) {
        var kind = el.getAttribute('class') === 'svg-m' ? 'm' : 'd', gg = GEOM[kind];
        var vals = pts.map(function (q) { return q.v; });
        var tt = ticks(Math.min.apply(null, vals), Math.max.apply(null, vals));
        var dd = pts[0].d, sp2 = (pts[pts.length - 1].d - dd) / DAY || 1;
        attachHover(el, {
          pts: pts, color: it.c, vbw: kind === 'm' ? 640 : 1280, fs: gg.xfs,
          x0: gg.x0, x1: gg.x1, y0: gg.y0, y1: gg.y1,
          X: function (d) { return gg.x0 + (d - dd) / DAY / sp2 * (gg.x1 - gg.x0); },
          Y: function (v) { return gg.y1 - (v - tt.lo) / (tt.hi - tt.lo) * (gg.y1 - gg.y0); }
        });
      });
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
