/* farmily-daily : '내 설정 링크' — 지역·작물·하우스·자동제어 설정(·모델 맞춘 값)을 주소에 담아
   즐겨찾기나 카톡으로 보내면 어느 기기에서든 같은 설정으로 열리게 합니다. 서버·로그인 없음.
   주소 형식: sim.html?region=<시군코드>&s=<설정> (&c=<모델 맞춘 값>)
   설정은 기본값과 다른 항목만 담아 주소를 짧게 합니다. sim.js 보다 먼저 불러와야 합니다. */
(function () {
  var F = window.FSIM, PAGE = 'https://juhong-rdv.github.io/farmily-daily/sim.html';
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); return true; } catch (e) { return null; } }
  function enc(o) {
    var b = new TextEncoder().encode(JSON.stringify(o)), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function dec(t) {
    var s = atob(t.replace(/-/g, '+').replace(/_/g, '/')), b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(b));
  }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function diff(o, base) { var r = {}; Object.keys(o || {}).forEach(function (k) { if (!same(o[k], base[k])) r[k] = o[k]; }); return r; }
  function round(o) { var r = {}; Object.keys(o).forEach(function (k) { var v = o[k]; r[k] = typeof v === 'number' ? Math.round(v * 10000) / 10000 : v; }); return r; }

  // ── 받은 링크 적용: 주소의 설정을 이 기기에 저장하고 주소에서는 지움(새로고침해도 다시 덮어쓰지 않게) ──
  var u = new URL(location.href), sp = u.searchParams, got = false;
  if (sp.get('s') != null || sp.get('c') != null) {
    try {
      if (sp.get('s') != null) {
        var o = dec(sp.get('s') || 'e30'), crop = o.c || 'tomato', hs = o.h || {};
        var full = { crop: crop, stage: o.g || 'flower', house: Object.assign(F.houseDefaults(hs.type || 'single'), hs), ctrl: Object.assign(F.defaults(crop), o.t || {}) };
        ls('farmily.sim', JSON.stringify(full));
      }
      if (sp.get('c') != null) { var c = dec(sp.get('c')); if (c && c.cal) ls('farmily.sim.cal', JSON.stringify({ on: true, cal: c.cal, rmse: c.e, n: c.n, from: c.f, to: c.u, made: Date.now(), shared: true })); }
      if (sp.get('region')) ls('farmily.region', sp.get('region'));
      got = true;
    } catch (e) { got = 'bad'; }
    sp.delete('s'); sp.delete('c'); history.replaceState(null, '', u.href);
  }

  // ── 링크 만들기 ──
  function makeLink() {
    var saved = {}; try { saved = JSON.parse(ls('farmily.sim') || '{}') || {}; } catch (e) { saved = {}; }
    var crop = saved.crop || 'tomato', house = saved.house || {}, o = {};
    if (crop !== 'tomato') o.c = crop;
    if (saved.stage && saved.stage !== 'flower') o.g = saved.stage;
    var hd = diff(house, F.houseDefaults(house.type || 'single')); if (house.type && house.type !== 'single') hd.type = house.type;
    if (Object.keys(hd).length) o.h = round(hd);
    var td = diff(saved.ctrl || {}, F.defaults(crop)); if (Object.keys(td).length) o.t = round(td);
    var rs = document.getElementById('r_sigun'), region = (rs && rs.value) || ls('farmily.region') || '';
    var q = (region ? 'region=' + encodeURIComponent(region) + '&' : '') + 's=' + enc(o);
    try { var cal = JSON.parse(ls('farmily.sim.cal') || 'null'); if (cal && cal.on && cal.cal) q += '&c=' + enc({ cal: cal.cal, e: cal.rmse, n: cal.n, f: cal.from, u: cal.to }); } catch (e) {}
    return PAGE + '?' + q;
  }

  function ui() {
    var top = document.querySelector('.top'); if (!top) return;
    var css = document.createElement('style');
    css.textContent = '#shbtn{font:inherit;font-size:14px;padding:6px 12px;border-radius:8px;border:1px solid #12341f;background:#fff;color:#12341f;cursor:pointer}'
      + '#shbox{display:none;flex-basis:100%;background:#f0f5f0;border:1px solid #dfe8df;border-radius:10px;padding:10px 12px;font-size:14px}'
      + '#shbox input{width:100%;font:inherit;font-size:13px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;margin:6px 0;background:#fff}'
      + '#shbox .r{display:flex;gap:6px;flex-wrap:wrap}#shbox small{color:#666;display:block;margin-top:4px}'
      + '#shnote{flex-basis:100%;background:#eff6ff;border-radius:8px;padding:8px 12px;font-size:14px}';
    document.head.appendChild(css);
    var b = document.createElement('button'); b.type = 'button'; b.id = 'shbtn'; b.textContent = '🔗 내 설정 링크 복사';
    b.title = '지역·하우스·자동제어 설정을 담은 주소를 만듭니다. 즐겨찾기하거나 카톡으로 보내면 다른 기기에서도 같은 설정으로 열립니다.';
    var st = document.getElementById('status'); top.insertBefore(b, st);
    var box = document.createElement('div'); box.id = 'shbox';
    box.innerHTML = '<b id="shmsg"></b><input id="shurl" readonly aria-label="내 설정 링크"><div class="r">'
      + '<button type="button" class="btn sm" id="shcopy">다시 복사</button>'
      + (navigator.share ? '<button type="button" class="btn sm ghost" id="shsend">📤 카톡 등으로 보내기</button>' : '')
      + '<button type="button" class="btn sm ghost" id="shclose">닫기</button></div>'
      + '<small>이 주소를 즐겨찾기하거나 다른 기기·다른 사람에게 보내면 지금 설정(지역, 작물, 하우스 정보, 자동제어 설정' + '<span id="shcal"></span>)으로 열립니다. 설정을 바꾸면 링크를 새로 복사하세요. 받는 쪽 기기에 있던 설정은 이 링크의 설정으로 바뀝니다.</small>';
    top.appendChild(box);
    var inp = box.querySelector('#shurl'), msg = box.querySelector('#shmsg');
    function copy(t) {
      function fallback() { inp.focus(); inp.select(); var okk = false; try { okk = document.execCommand('copy'); } catch (e) {} done(okk); }
      function done(okk) { msg.textContent = okk ? '✅ 링크를 복사했습니다. 카톡·문자에 붙여 넣거나 즐겨찾기하세요.' : '아래 주소를 길게 눌러(또는 Ctrl+C) 복사하세요.'; if (!okk) { inp.focus(); inp.select(); } if (window.postHeight) setTimeout(window.postHeight, 50); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { done(true); }, fallback); else fallback();
    }
    b.onclick = function () {
      var link = makeLink(); inp.value = link; box.style.display = 'block';
      var cal = null; try { cal = JSON.parse(ls('farmily.sim.cal') || 'null'); } catch (e) {}
      box.querySelector('#shcal').textContent = cal && cal.on ? ', 기록으로 맞춘 모델 값' : '';
      copy(link);
    };
    box.querySelector('#shcopy').onclick = function () { copy(inp.value); };
    box.querySelector('#shclose').onclick = function () { box.style.display = 'none'; if (window.postHeight) setTimeout(window.postHeight, 50); };
    var sb = box.querySelector('#shsend'); if (sb) sb.onclick = function () { navigator.share({ title: '우리 하우스 시뮬레이션 설정', url: inp.value }).catch(function () {}); };
    if (got) {
      var n = document.createElement('div'); n.id = 'shnote';
      n.textContent = got === 'bad' ? '⚠ 링크의 설정을 읽지 못해 이 기기에 저장된 설정으로 엽니다.' : ls('farmily._t', '1') !== true ? '⚠ 이 브라우저는 설정 저장을 막고 있어 링크 설정을 적용하지 못했습니다.' : '📥 받은 링크의 설정(지역·하우스·자동제어)으로 열었습니다. 이 기기에도 저장됐습니다.';
      top.appendChild(n); setTimeout(function () { n.remove(); if (window.postHeight) window.postHeight(); }, 9000);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui); else ui();
})();
