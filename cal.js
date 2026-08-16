/* farmily-daily : 지난 소식 달력 (archive.json 기반)
   사용법 - 페이지에 아래 두 줄을 넣으면 됩니다.
   <div id="cal" data-current="YYYY-MM-DD"></div>
   <script src="/farmily-daily/cal.js"></script>                     */
(function () {
  var CSS = ''
    + '.cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}'
    + '.cal-title{font-weight:700;font-size:16px}'
    + '.cal-nav{border:1px solid #ddd;background:#fafafa;color:#555;border-radius:8px;width:36px;height:32px;font-size:16px;line-height:1;cursor:pointer;font-family:inherit}'
    + '.cal-nav:disabled{opacity:.35;cursor:default}'
    + '.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}'
    + '.cal-dow{text-align:center;font-size:12px;color:#999;padding:4px 0}'
    + '.cal-dow.sun{color:#d9534f}.cal-dow.sat{color:#3f6fd8}'
    + '.cal-day{position:relative;text-align:center;padding:10px 0 14px;border-radius:8px;font-size:14px;color:#c4c4c4}'
    + '.cal-day.has{color:#222;background:#f4f7f4;cursor:pointer;font-weight:700}'
    + '.cal-day.has:hover{background:#e4ece6}'
    + '.cal-day.has::after{content:"";position:absolute;left:50%;bottom:7px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:#12341f}'
    + '.cal-day.today{background:#12341f;color:#fff}.cal-day.today::after{background:#fff}'
    + '.cal-day.viewing{box-shadow:inset 0 0 0 2px #12341f}'
    + '.cal-note{font-size:12px;color:#999;margin-top:12px;line-height:1.7}';
  var st = document.createElement('style');
  st.appendChild(document.createTextNode(CSS));
  document.head.appendChild(st);

  var el = document.getElementById('cal');
  if (!el) return;
  var base = location.pathname.indexOf('/log/') > -1 ? '../' : './';
  var viewing = el.getAttribute('data-current') || '';
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  fetch(base + 'archive.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var days = data.days || {};
      var keys = Object.keys(days).sort();
      if (!keys.length) { el.innerHTML = '<div class="cal-note">아직 보관된 소식이 없습니다.</div>'; return; }
      var today = data.today || keys[keys.length - 1];
      var minM = keys[0].slice(0, 7);
      var maxM = (today > keys[keys.length - 1] ? today : keys[keys.length - 1]).slice(0, 7);
      var cur = (viewing || today).slice(0, 7);
      if (cur < minM) cur = minM;
      if (cur > maxM) cur = maxM;

      function shift(m, d) {
        var t = (+m.slice(0, 4)) * 12 + (+m.slice(5, 7) - 1) + d;
        return Math.floor(t / 12) + '-' + pad(t % 12 + 1);
      }
      function render() {
        var y = +cur.slice(0, 4), mo = +cur.slice(5, 7);
        var first = new Date(y, mo - 1, 1).getDay(), last = new Date(y, mo, 0).getDate();
        var h = '<div class="cal-head">'
          + '<button type="button" class="cal-nav" id="calPrev"' + (cur <= minM ? ' disabled' : '') + '>&#8249;</button>'
          + '<span class="cal-title">' + y + '년 ' + mo + '월</span>'
          + '<button type="button" class="cal-nav" id="calNext"' + (cur >= maxM ? ' disabled' : '') + '>&#8250;</button>'
          + '</div><div class="cal-grid">';
        for (var i = 0; i < 7; i++) h += '<div class="cal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + DOW[i] + '</div>';
        for (var b = 0; b < first; b++) h += '<div class="cal-day"></div>';
        for (var d = 1; d <= last; d++) {
          var key = y + '-' + pad(mo) + '-' + pad(d), c = 'cal-day';
          if (days[key]) c += ' has';
          if (key === today) c += ' today'; else if (key === viewing) c += ' viewing';
          h += '<div class="' + c + '" data-d="' + key + '">' + d + '</div>';
        }
        h += '</div><div class="cal-note">진한 초록 날짜가 오늘이고, 옅은 배경에 점이 찍힌 날짜에 그날의 소식이 있습니다. 날짜를 누르면 그날 페이지로 이동합니다.</div>';
        el.innerHTML = h;
        var p = document.getElementById('calPrev'), n = document.getElementById('calNext');
        if (p) p.onclick = function () { cur = shift(cur, -1); render(); };
        if (n) n.onclick = function () { cur = shift(cur, 1); render(); };
        var cells = el.querySelectorAll('.cal-day.has');
        for (var k = 0; k < cells.length; k++) {
          cells[k].onclick = function () {
            var key = this.getAttribute('data-d');
            location.href = (key === today) ? (base + 'index.html') : (base + days[key]);
          };
        }
        if (typeof postHeight === 'function') postHeight();
      }
      render();
    })
    .catch(function () { el.innerHTML = '<div class="cal-note">달력을 불러오지 못했습니다.</div>'; });
})();
