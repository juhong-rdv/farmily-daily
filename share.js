/* farmily-daily : '설정 코드' — 지역·작물·하우스·자동제어 설정(·모델 맞춘 값)을 짧은 코드 하나로 만들어
   카톡·메모로 보관하거나 보내고, 다른 기기에서 그 코드를 넣으면 같은 설정이 됩니다. 서버·로그인·주소 공유 없음.
   코드 = 설정 중 기본값과 다른 항목만 담은 JSON 을 base64url 로 바꾼 글자. sim.js 보다 먼저 불러와야 합니다.
   (예전 '설정 링크' 주소 ?s=…&c=… 로 들어와도 그대로 적용합니다) */
(function () {
  var F = window.FSIM;
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

  // 설정 묶음 o = { r: 지역, c: 작물, g: 생육 단계, h: 하우스(바뀐 것만), t: 자동제어(바뀐 것만), k: 모델 맞춘 값 } 을 이 기기에 저장
  function applyObj(o, cal) {
    if (!o || typeof o !== 'object') throw new Error('bad');
    var crop = o.c || 'tomato', hs = o.h || {};
    var full = { crop: crop, stage: o.g || 'flower', house: Object.assign(F.houseDefaults(hs.type || 'single'), hs), ctrl: Object.assign(F.defaults(crop), o.t || {}) };
    if (ls('farmily.sim', JSON.stringify(full)) !== true) return false;
    var k = o.k || cal;
    if (k && k.cal) ls('farmily.sim.cal', JSON.stringify({ on: true, cal: k.cal, rmse: k.e, n: k.n, from: k.f, to: k.u, made: Date.now(), shared: true }));
    if (o.r) ls('farmily.region', String(o.r));
    return true;
  }

  // ── 예전 링크(?s=…) 로 들어온 경우 ──
  var u = new URL(location.href), sp = u.searchParams, got = false;
  if (sp.get('s') != null || sp.get('c') != null) {
    try {
      var o0 = sp.get('s') != null ? dec(sp.get('s') || 'e30') : {};
      if (sp.get('region')) o0.r = sp.get('region');
      got = applyObj(o0, sp.get('c') != null ? dec(sp.get('c')) : null) ? true : 'nostore';
    } catch (e) { got = 'bad'; }
    sp.delete('s'); sp.delete('c'); history.replaceState(null, '', u.href);
  }
  // ── 코드로 불러온 직후(새로고침 뒤 안내) ──
  try { if (sessionStorage.getItem('farmily.codeApplied')) { sessionStorage.removeItem('farmily.codeApplied'); got = 'code'; } } catch (e) {}

  // ── 내 설정 코드 만들기 ──
  function makeCode() {
    var saved = {}; try { saved = JSON.parse(ls('farmily.sim') || '{}') || {}; } catch (e) { saved = {}; }
    var crop = saved.crop || 'tomato', house = saved.house || {}, o = {};
    var rs = document.getElementById('r_sigun'), region = (rs && rs.value) || ls('farmily.region') || '';
    if (region) o.r = region;
    if (crop !== 'tomato') o.c = crop;
    if (saved.stage && saved.stage !== 'flower') o.g = saved.stage;
    var hd = diff(house, F.houseDefaults(house.type || 'single')); if (house.type && house.type !== 'single') hd.type = house.type;
    if (Object.keys(hd).length) o.h = round(hd);
    var td = diff(saved.ctrl || {}, F.defaults(crop)); if (Object.keys(td).length) o.t = round(td);
    try { var cal = JSON.parse(ls('farmily.sim.cal') || 'null'); if (cal && cal.on && cal.cal) o.k = { cal: cal.cal, e: cal.rmse, n: cal.n, f: cal.from, u: cal.to }; } catch (e) {}
    return enc(o);
  }
  // 받은 코드 넣기: 앞뒤 공백·줄바꿈, 예전 링크 주소를 붙여 넣어도 알아봄
  function readCode(txt) {
    txt = String(txt || '').trim();
    var m = txt.match(/[?&]s=([A-Za-z0-9_-]*)/);
    if (m) { var o = dec(m[1] || 'e30'), r = txt.match(/[?&]region=(\d+)/), c = txt.match(/[?&]c=([A-Za-z0-9_-]+)/); if (r) o.r = r[1]; if (c) o.k = dec(c[1]); return o; }
    txt = txt.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9_-]+$/.test(txt)) throw new Error('bad');
    return dec(txt);
  }

  function ui() {
    var top = document.querySelector('.top'); if (!top) return;
    var css = document.createElement('style');
    css.textContent = '#shbtn{font:inherit;font-size:14px;padding:6px 12px;border-radius:8px;border:1px solid #12341f;background:#fff;color:#12341f;cursor:pointer}'
      + '#shbox{display:none;flex-basis:100%;background:#f0f5f0;border:1px solid #dfe8df;border-radius:10px;padding:10px 12px;font-size:14px}'
      + '#shbox .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0 8px}'
      + '#shbox .row b{min-width:96px}'
      + '#shbox input{flex:1 1 220px;min-width:0;font:inherit;font-family:ui-monospace,Consolas,monospace;font-size:14px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff}'
      + '#shbox small{color:#666;display:block}#shmsg{display:block;min-height:1.4em;font-size:13px;color:#15803d}#shmsg.err{color:#b91c1c}'
      + '#shnote{flex-basis:100%;background:#eff6ff;border-radius:8px;padding:8px 12px;font-size:14px}';
    document.head.appendChild(css);
    var b = document.createElement('button'); b.type = 'button'; b.id = 'shbtn'; b.textContent = '🔑 설정 코드';
    b.title = '지금 설정을 짧은 코드로 만들거나, 받은 코드를 넣어 같은 설정으로 바꿉니다.';
    top.insertBefore(b, document.getElementById('status'));
    var box = document.createElement('div'); box.id = 'shbox';
    box.innerHTML = '<div class="row"><b>내 설정 코드</b><input id="shcode" readonly aria-label="내 설정 코드">'
      + '<button type="button" class="btn sm" id="shcopy">복사</button>'
      + (navigator.share ? '<button type="button" class="btn sm ghost" id="shsend">📤 보내기</button>' : '') + '</div>'
      + '<div class="row"><b>받은 코드 넣기</b><input id="shin" placeholder="여기에 코드를 붙여 넣으세요" aria-label="받은 설정 코드" autocomplete="off" spellcheck="false">'
      + '<button type="button" class="btn sm" id="shload">불러오기</button><button type="button" class="btn sm ghost" id="shclose">닫기</button></div>'
      + '<span id="shmsg"></span>'
      + '<small>코드에는 지역, 작물, 하우스 정보, 자동제어 설정<span id="shcal"></span>이 들어 있습니다. 카톡·메모에 보관하거나 다른 사람에게 보내고, 다른 기기에서 \'받은 코드 넣기\'에 붙여 넣으면 같은 설정이 됩니다. 불러오면 그 기기에 있던 설정은 코드의 설정으로 바뀝니다. 설정을 바꾸면 코드도 바뀝니다.</small>';
    top.appendChild(box);
    var out = box.querySelector('#shcode'), inp = box.querySelector('#shin'), msg = box.querySelector('#shmsg');
    function say(t, err) { msg.textContent = t; msg.className = err ? 'err' : ''; if (window.postHeight) setTimeout(window.postHeight, 50); }
    function refresh() {
      out.value = makeCode();
      var cal = null; try { cal = JSON.parse(ls('farmily.sim.cal') || 'null'); } catch (e) {}
      box.querySelector('#shcal').textContent = cal && cal.on ? ', 기록으로 맞춘 모델 값' : '';
    }
    function copy() {
      var t = out.value;
      function fallback() { out.focus(); out.select(); var okk = false; try { okk = document.execCommand('copy'); } catch (e) {} done(okk); }
      function done(okk) { if (okk) say('✅ 코드를 복사했습니다. 카톡·메모에 붙여 넣어 두세요.'); else { out.focus(); out.select(); say('코드를 길게 눌러(또는 Ctrl+C) 복사하세요.', true); } }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { done(true); }, fallback); else fallback();
    }
    b.onclick = function () {
      if (box.style.display === 'block') { box.style.display = 'none'; if (window.postHeight) setTimeout(window.postHeight, 50); return; }
      refresh(); box.style.display = 'block'; say('');
    };
    // 설정을 바꾸면 코드도 바로 새로 (sim.js 가 저장한 뒤에 읽도록 잠깐 늦춤)
    document.addEventListener('change', function (e) { if (box.style.display === 'block' && e.target !== inp) setTimeout(refresh, 50); });
    document.addEventListener('input', function (e) { if (box.style.display === 'block' && e.target !== inp) setTimeout(refresh, 300); });
    box.querySelector('#shcopy').onclick = copy;
    box.querySelector('#shclose').onclick = function () { box.style.display = 'none'; if (window.postHeight) setTimeout(window.postHeight, 50); };
    var sb = box.querySelector('#shsend'); if (sb) sb.onclick = function () { navigator.share({ title: '우리 하우스 시뮬레이션 설정 코드', text: out.value }).catch(function () {}); };
    function load() {
      var o;
      try { o = readCode(inp.value); if (!o || typeof o !== 'object' || Array.isArray(o)) throw 0; } catch (e) { say('⚠ 코드를 읽지 못했습니다. 빠지거나 바뀐 글자가 없는지 확인해 주세요.', true); return; }
      if (!applyObj(o)) { say('⚠ 이 브라우저는 설정 저장을 막고 있어 코드를 적용하지 못했습니다.', true); return; }
      try { sessionStorage.setItem('farmily.codeApplied', '1'); } catch (e) {}
      var u2 = new URL(location.href); u2.searchParams.delete('s'); u2.searchParams.delete('c');
      if (o.r) u2.searchParams.set('region', o.r);
      location.replace(u2.href);
    }
    box.querySelector('#shload').onclick = load;
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') load(); });
    if (got) {
      var n = document.createElement('div'); n.id = 'shnote';
      n.textContent = got === 'bad' ? '⚠ 받은 설정을 읽지 못해 이 기기에 저장된 설정으로 엽니다.' : got === 'nostore' ? '⚠ 이 브라우저는 설정 저장을 막고 있어 받은 설정을 적용하지 못했습니다.' : '📥 받은 코드의 설정(지역·하우스·자동제어)으로 바꿨습니다. 이 기기에도 저장됐습니다.';
      top.appendChild(n); setTimeout(function () { n.remove(); if (window.postHeight) window.postHeight(); }, 9000);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui); else ui();
})();
