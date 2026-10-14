/* farmily-daily : 온실 환경 시뮬레이션 엔진 (토마토)
   바깥 예보(기온·습도·예상 일사·하늘·바람·비)와 하우스 정보·자동제어 설정으로
   1분 간격 에너지·수분 수지를 계산해 하우스 안 기온·습도·창 개도·커튼·차광·난방·관수를 예측합니다.
   단순화한 1구역 모델(공기+작물 1개, 흙 1개)이라 실제 하우스와 차이가 있을 수 있습니다. */
(function (root) {
  var D2R = Math.PI / 180, SIGMA_DUMMY = 0;
  var CP = 1006, RHO = 1.2, LAMBDA = 2.45e6, G = 9.81;

  // ---------- 태양 위치 (NOAA 근사) ----------
  function sunPos(lat, lon, d) {           // d: Date(UTC 기준 정확한 순간)
    var ms = d.getTime(), jd = ms / 86400000 + 2440587.5, n = jd - 2451545.0;
    var L = (280.46 + 0.9856474 * n) % 360, gA = ((357.528 + 0.9856003 * n) % 360) * D2R;
    var lam = (L + 1.915 * Math.sin(gA) + 0.02 * Math.sin(2 * gA)) * D2R, eps = (23.439 - 0.0000004 * n) * D2R;
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    var gmst = (18.697374558 + 24.06570982441908 * n) % 24, lst = (gmst * 15 + lon) * D2R;
    var ha = lst - ra, la = lat * D2R;
    var el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
    var az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
    return { el: el / D2R, az: (az / D2R + 360) % 360 };
  }

  function esat(T) { return 610.94 * Math.exp(17.625 * T / (T + 243.04)); }              // Pa
  function xFrom(T, RH) { var e = esat(T) * RH / 100; return 0.622 * e / (101325 - e); } // kg/kg
  function rhFrom(T, X) { var e = X * 101325 / (0.622 + X); return Math.min(100, e / esat(T) * 100); }

  // ---------- 작물 기준 (농촌진흥청·제주농업기술원 토마토 재배 자료 기준 일반값) ----------
  var CROPS = {
    tomato: { name: '토마토', nightAdd: 0 },
    cherry: { name: '방울토마토', nightAdd: 2 }
  };
  var STAGES = {
    early: { name: '정식~활착', lai: 0.6 },
    flower: { name: '개화·착과기', lai: 1.6 },
    harvest: { name: '수확기', lai: 2.8 }
  };
  function defaults(crop) {
    var a = (CROPS[crop] || CROPS.tomato).nightAdd;
    return {
      ventDay: 26, ventNight: 20, band: 4,            // 환기 시작 온도, 완전 개방까지 온도폭
      windLimit: 6, windOpen: 20, stormLimit: 10,      // 강풍 시 바람받이 측창 최대 %, 폭풍 시 모두 닫음
      rainRoofClose: true, coldOut: 10, coldOpen: 30,  // 외기 10℃ 미만이면 측창 최대 30%
      nightDehum: true,                                // 야간 습도 90% 이상이면 측창 5% (외기 8℃ 이상일 때)
      heatDay: 15, heatEve: 13 + a, heatMid: 11 + a, heatDawn: 13 + a, // 주간 / 일몰~+5시간 / 심야 / 일출 2시간 전~일출
      curtainOut: 15, curtainOpenRad: 30,              // 일몰 후 외기 15℃ 미만이면 커튼 닫음, 일사 30W/m² 넘으면 연다
      shadeRad: 650,                                   // 바깥 일사 650W/m² 넘으면 차광
      irrJ: 70, irrMl: 50,                             // 일사 70J/cm² 쌓일 때마다 1회 50mL/주
      irrStart: 60, irrEnd: 120                        // 일출 60분 뒤부터 일몰 120분 전까지
    };
  }
  function houseDefaults(type) {
    if (type === 'multi') return { type: 'multi', spans: 3, width: 8, length: 50, sideH: 3.5, ridgeH: 5.5, axis: 0,
      cover: 'po2', curtain: 'multi', shade: 1, shadePct: 50, ventH: 1.5, roofVent: 1, roofW: 0.9, net: 1, heater: 150000, plants: 0 };
    return { type: 'single', spans: 1, width: 7, length: 60, sideH: 1.6, ridgeH: 3.2, axis: 0,
      cover: 'po1', curtain: 'single', shade: 0, shadePct: 50, ventH: 1.2, roofVent: 0, roofW: 0.6, net: 1, heater: 60000, plants: 0 };
  }
  var COVERS = {
    po1: { name: 'PO필름 1겹', U: 6.2, tau: 0.82, sky: 1.0 },
    po2: { name: 'PO필름 2겹', U: 4.0, tau: 0.70, sky: 0.65 },
    glass: { name: '유리', U: 6.0, tau: 0.78, sky: 0.35 }
  };
  var CURTAINS = { none: { name: '없음', u: 1, sky: 1 }, single: { name: '보온커튼 1겹', u: 0.6, sky: 0.45 }, multi: { name: '다겹 보온커튼', u: 0.35, sky: 0.25 } };

  function geom(h) {
    var n = h.type === 'multi' ? Math.max(1, Math.round(h.spans)) : 1;
    var W = h.width, L = h.length, hs = h.sideH, hr = Math.max(h.ridgeH, hs + 0.3), rise = hr - hs;
    var arc = Math.sqrt(W * W + 16 / 3 * rise * rise);
    var endA = n * (W * hs + 2 / 3 * W * rise);
    return { n: n, A: n * W * L, V: L * endA, Ac: L * (2 * hs + n * arc) + 2 * endA, W: W, L: L, hs: hs, hr: hr };
  }

  // 시간별 예보 → 임의 시각 값 (선형 보간, 풍향은 벡터로)
  // 예보 끝부분(3시간 간격)이 섞여 있으면 1시간 간격으로 이어지는 앞부분만 씀 (태양 고도로 확인)
  function hourlyLen(w, lat, lon) {
    var h0 = Date.parse(w.h0 + ':00+09:00'), N = w.T.length;
    if (!w.EL) return N;
    for (var i = 0; i < N; i++) if (w.EL[i] != null && Math.abs(sunPos(lat, lon, new Date(h0 + i * 3600000)).el - w.EL[i]) > 3) return i;
    return N;
  }
  function sampler(w, Nmax) {
    var h0 = Date.parse(w.h0 + ':00+09:00'), N = Math.min(w.T.length, Nmax || 1e9);
    function at(arr, i, f) { var a = arr && arr[i], b = arr && arr[Math.min(N - 1, i + 1)]; if (a == null) return b; if (b == null) return a; return a + (b - a) * f; }
    return {
      start: h0, end: h0 + (N - 1) * 3600000, n: N,
      get: function (t) {
        var x = (t - h0) / 3600000, i = Math.max(0, Math.min(N - 1, Math.floor(x))), f = Math.max(0, Math.min(1, x - i));
        var v1 = w.VEC ? w.VEC[i] : null, v2 = w.VEC ? w.VEC[Math.min(N - 1, i + 1)] : null, s1 = w.WSD ? w.WSD[i] || 0 : 0, s2 = w.WSD ? w.WSD[Math.min(N - 1, i + 1)] || 0 : 0;
        var vx = 0, vy = 0;
        if (v1 != null) { vx += Math.sin(v1 * D2R) * (1 - f) * (s1 + .1); vy += Math.cos(v1 * D2R) * (1 - f) * (s1 + .1); }
        if (v2 != null) { vx += Math.sin(v2 * D2R) * f * (s2 + .1); vy += Math.cos(v2 * D2R) * f * (s2 + .1); }
        var k = f < 0.5 ? i : Math.min(N - 1, i + 1);
        // 예상 일사는 '정시 앞뒤 30분 평균' 값이라 그대로 보간
        return { T: at(w.T, i, f), RH: at(w.RH, i, f), G: Math.max(0, at(w.G || [], i, f) || 0), GC: Math.max(0, at(w.GC || [], i, f) || 0),
          ws: s1 + (s2 - s1) * f, wd: (Math.atan2(vx, vy) / D2R + 360) % 360,
          sky: w.SKY ? w.SKY[k] : 1, pty: w.PTY ? w.PTY[k] : 0, rain: w.R ? w.R[k] || 0 : 0 };
      }
    };
  }

  function run(w, lat, lon, house, cropKey, stageKey, c, opt) {
    opt = opt || {};
    var g = geom(house), cov = COVERS[house.cover] || COVERS.po1, cur = CURTAINS[house.curtain] || CURTAINS.none;
    var lai = (STAGES[stageKey] || STAGES.flower).lai, fc = 1 - Math.exp(-0.7 * lai);
    var plants = house.plants > 0 ? house.plants : Math.round(g.A * 2.5);
    var cal = Object.assign({ kU: 1, kInf: 1, kTau: 1, kVent: 1 }, opt.cal || {});
    var nF = hourlyLen(w, lat, lon), wd = w, preH = 0;
    // 직전 시간(관측·지난 예보)이 이어져 있으면 그 시점부터 계산을 시작해 하우스 안 상태를 맞춰 둠
    if (w.past && w.past.T && !opt.noPast) {
      var P = w.past, n = P.T.length, st0 = n;
      while (st0 > 0 && P.T[st0 - 1] != null) st0--;
      var ph0 = Date.parse(P.h0 + ':00+09:00') + st0 * 3600000;
      if (n - st0 >= 6 && ph0 + (n - st0) * 3600000 === Date.parse(w.h0 + ':00+09:00')) {
        preH = n - st0; wd = { h0: '', T: [], RH: [], G: [], SKY: [], PTY: [], VEC: [], WSD: [], R: [] };
        var d0 = new Date(ph0 + 9 * 3600000); wd.h0 = d0.toISOString().slice(0, 16);
        ['T', 'RH', 'G', 'SKY', 'PTY', 'VEC', 'WSD', 'R'].forEach(function (k) { wd[k] = (P[k] || []).slice(st0).concat((w[k] || []).slice(0, nF)); });
      }
    }
    var S = sampler(wd, preH + nF), dt = 60;
    var recFrom = opt.recordFrom != null ? opt.recordFrom : S.start + preH * 3600000;
    var Ca = RHO * CP * g.V + 25000 * g.A, Cs = 1.5e5;
    var meanT = 0, cnt = 0; for (var q = 0; q < w.T.length; q++) if (w.T[q] != null) { meanT += w.T[q]; cnt++; } meanT = cnt ? meanT / cnt : 15;
    var Tdeep = meanT + 5;
    var Cd = 0.65 * (house.net ? 0.65 : 1) * cal.kVent, Cw = 0.12;
    var axis = (house.axis || 0) % 180, nA = (axis + 270) % 360, nB = (axis + 90) % 360;  // 측창 A(왼쪽), B(오른쪽)이 바라보는 방위
    var Lside = g.L * 0.95, roofLen = g.L * 0.85, nRoof = house.roofVent ? g.n : 0;
    var heatCap = (house.heater || 0) * 1.163; // kcal/h → W
    // 상태
    var t = S.start - (preH ? 0 : 3 * 3600000), o0 = S.get(S.start);
    var Ti = o0.T + (o0.G > 50 ? 5 : 2), Ts = Tdeep, Xi = xFrom(Ti, o0.G > 50 ? 70 : 88);
    var sideA = 0, sideB = 0, roof = 0, curtain = 0, shade = 0, heatOn = 0, acc = 0, lastIrr = -1e12;
    var out = [], step = 0, cur10 = null;
    var irrEvents = [];
    function sunTimes(day0) { // 그날 일출·일몰 시각 (5분 간격 탐색)
      var rise = null, set = null, prev = sunPos(lat, lon, new Date(day0)).el;
      for (var m = 5; m <= 1440; m += 5) { var e = sunPos(lat, lon, new Date(day0 + m * 60000)).el; if (prev <= -0.8 && e > -0.8) rise = day0 + m * 60000; if (prev > -0.8 && e <= -0.8) set = day0 + m * 60000; prev = e; }
      return { rise: rise, set: set };
    }
    var stCache = {};
    function st(tm) { var d = new Date(tm + 9 * 3600000); var key = d.getUTCFullYear() * 10000 + d.getUTCMonth() * 100 + d.getUTCDate();
      if (!stCache[key]) stCache[key] = sunTimes(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 9 * 3600000); return stCache[key]; }
    function rate(cur, target, perMin) { return cur < target ? Math.min(target, cur + perMin) : Math.max(target, cur - perMin); }

    while (t <= S.end) {
      var o = S.get(Math.max(t, S.start)), sp = sunPos(lat, lon, new Date(t)), sday = st(t), sprev = st(t - 86400000);
      var day = sp.el > -0.8;
      var To = o.T, Xo = xFrom(To, o.RH), u = o.ws * 0.75, RHi = rhFrom(Ti, Xi);
      // ----- 제어 -----
      // 난방 설정: 주간 / 일몰~+5시간 / 심야 / 일출 2시간 전~일출
      var sinceSet = sday.set && t >= sday.set ? (t - sday.set) / 3600000 : (sprev.set ? (t - sprev.set) / 3600000 : 99);
      var toRise = sday.rise && t < sday.rise ? (sday.rise - t) / 3600000 : 99;
      var hset = day ? c.heatDay : sinceSet <= 5 ? c.heatEve : toRise <= 2 ? c.heatDawn : c.heatMid;
      if (heatCap > 0) { if (Ti < hset - 0.3) heatOn = 1; else if (Ti > hset + 0.5) heatOn = 0; } else heatOn = 0;
      // 환기
      var vset = day ? c.ventDay : c.ventNight;
      var need = Math.max(0, Math.min(1, (Ti - vset) / Math.max(0.5, c.band)));
      if (!day && c.nightDehum && RHi >= 90 && To >= 8 && need < 0.05) need = 0.05;
      if (heatOn) need = 0;
      var tRoof = 0, tSide = need;
      if (nRoof) { tRoof = Math.min(1, need / 0.5); tSide = Math.max(0, (need - 0.3) / 0.7); if (!day && c.nightDehum && need === 0.05) { tRoof = 0.1; tSide = 0; } }
      var maxSide = 1;
      if (To < c.coldOut) maxSide = Math.min(maxSide, c.coldOpen / 100);
      if (o.pty > 0) { if (c.rainRoofClose) tRoof = 0; maxSide = Math.min(maxSide, 0.5); }
      var cA = Math.cos((o.wd - nA) * D2R), cB = Math.cos((o.wd - nB) * D2R);  // 바람이 그쪽에서 불어오면 1
      var tA = Math.min(tSide, maxSide), tB = Math.min(tSide, maxSide);
      if (o.ws >= c.windLimit) { if (cA > 0.3) tA = Math.min(tA, c.windOpen / 100); if (cB > 0.3) tB = Math.min(tB, c.windOpen / 100); tRoof = Math.min(tRoof, 0.3); }
      if (o.ws >= c.stormLimit) { tA = 0; tB = 0; tRoof = 0; }
      // 커튼: 밤에 외기 기준 이하면 닫고, 아침 일사 기준 넘으면 연다
      if (house.curtain !== 'none') {
        if (!day && To < c.curtainOut) curtain = 1;
        else if (day && o.G >= c.curtainOpenRad) curtain = 0;
        else if (day && curtain && o.G < c.curtainOpenRad) curtain = 1;
        else if (!day && To >= c.curtainOut + 1) curtain = 0;
      } else curtain = 0;
      // 차광
      if (house.shade) { if (o.G >= c.shadeRad) shade = 1; else if (o.G < c.shadeRad - 150) shade = 0; } else shade = 0;
      sideA = rate(sideA, tA, 0.25); sideB = rate(sideB, tB, 0.25); roof = rate(roof, tRoof, 0.34);
      // ----- 물리 -----
      var tau = cal.kTau * cov.tau * 0.92 * (shade ? 1 - house.shadePct / 100 : 1) * (curtain ? 0.35 : 1);
      var Rin = tau * o.G;                                     // 바닥 1m²당 들어온 햇빛 (W/m²)
      var VPDi = Math.max(0, esat(Ti) * (1 - RHi / 100)) / 1000; // kPa
      var lE = Math.max(0, 0.6 * fc * Rin + 10 * lai * VPDi);   // 증산 잠열 (W/m²)
      var Rsoil = (1 - fc) * 0.6 * Rin;
      var Qs = Rin - Rsoil - lE;
      var clear = o.pty > 0 ? 0 : (o.sky === 1 ? 0.8 : o.sky === 3 ? 0.35 : 0.1);
      var skyLoss = 28 * cov.sky * clear * (curtain ? cur.sky : 1);
      var U = cal.kU * cov.U * (curtain ? cur.u : 1);
      // 환기량
      var hv = house.ventH, AsA = hv * Lside * sideA, AsB = hv * Lside * sideB, Ar = house.roofW * roofLen * nRoof * roof * (curtain ? 0.3 : 1);
      var dT = Math.max(0, Ti - To), Tm = (Ti + To) / 2 + 273.15;
      var perp = 0.4 + 0.6 * Math.abs(Math.sin((o.wd - axis) * D2R));
      var Gw = 0;
      if (AsA > 0 && AsB > 0) Gw = Cd * Math.sqrt(Cw) * u * perp * AsA * AsB / Math.sqrt(AsA * AsA + AsB * AsB);
      else Gw = 0.03 * u * (AsA + AsB);
      Gw += Cd * Math.sqrt(Cw) * u * 0.5 * Ar;
      var As = AsA + AsB, Gs = Cd / 3 * As * Math.sqrt(G * hv * dT / Tm);
      if (Ar > 0) { var H = g.hr - hv / 2, Aeq = As > 0 ? Ar * As / Math.sqrt(Ar * Ar + As * As) : Ar * 0.5; Gs += Cd * Aeq * Math.sqrt(2 * G * H * dT / Tm); }
      var Gv = Math.sqrt(Gw * Gw + Gs * Gs);
      var Ginf = cal.kInf * g.V * (curtain ? 0.5 : 0.8) / 3600 * (1 + 0.1 * u);
      var Qheat = heatOn ? heatCap : 0;
      var Tc = Ti - (curtain ? 0.45 : 0.75) * (Ti - To);
      var cond = Math.max(0, RHO * 0.003 * g.Ac * (Xi - xFrom(Tc, 100)));    // kg/s
      var dTi = (g.A * (Qs + 7 * (Ts - Ti) - skyLoss) + Qheat + LAMBDA * cond - U * g.Ac * (Ti - To) - RHO * CP * (Gv + Ginf) * (Ti - To)) / Ca;
      var dTs = (Rsoil - 7 * (Ts - Ti) - 1.5 * (Ts - Tdeep)) / Cs;
      var E = lE / LAMBDA * g.A;                                             // kg/s
      var dX = (E - RHO * (Gv + Ginf) * (Xi - Xo) - cond) / (RHO * g.V);
      Ti += dTi * dt; Ts += dTs * dt; Xi += dX * dt;
      var xs = xFrom(Ti, 100); if (Xi > xs) Xi = xs; if (Xi < 0.0005) Xi = 0.0005;
      // 관수 (일사비례)
      var irr = 0;
      if (t >= recFrom) {
        if (day) acc += o.G * dt / 1e4;                       // J/cm²
        var okWin = sday.rise && sday.set && t >= sday.rise + c.irrStart * 60000 && t <= sday.set - c.irrEnd * 60000;
        if (okWin && acc >= c.irrJ) { acc = 0; irr = 1; irrEvents.push(t); }
        if (!day && sp.el < -10) acc = 0;
      }
      // 기록 (10분마다)
      if (t >= recFrom) {
        if (!cur10) cur10 = { E: 0, heatS: 0, irr: 0, cond: 0 };
        cur10.E += E * dt; cur10.heatS += heatOn ? dt : 0; cur10.irr += irr; cur10.cond += cond * dt;
        if (step % 10 === 0) {
          out.push({ t: t, To: To, Ti: Ti, Ts: Ts, RHo: o.RH, RHi: rhFrom(Ti, Xi), A: sideA, B: sideB, R: roof, cur: curtain, sh: shade,
            heat: heatOn, hset: hset, vset: vset, G: o.G, Rin: Rin, el: sp.el, az: sp.az, wd: o.wd, ws: o.ws, sky: o.sky, pty: o.pty,
            day: day, E: cur10.E, heatS: cur10.heatS, irr: cur10.irr, cond: cur10.cond, Gv: Gv });
          cur10 = null;
        }
        step++;
      }
      t += dt * 1000;
    }
    return { frames: out, plants: plants, geom: g, irr: irrEvents, lai: lai, preH: preH, summary: summarize(out, plants, c, cropKey, house, g) };
  }

  // ---------- 하루 단위 요약 · 토마토 기준 판정 ----------
  function summarize(fr, plants, c, cropKey, house, g) {
    var nightLow = cropKey === 'cherry' ? 12 : 10;
    var days = {}, order = [];
    fr.forEach(function (f) {
      var d = new Date(f.t + 9 * 3600000), key = d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
      if (!days[key]) { days[key] = { key: key, date: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), n: 0, tmax: -99, tmin: 99, omax: -99, omin: 99,
        ok: 0, hot: 0, hot35: 0, cold: 0, cold5: 0, wet: 0, nightHot: 0, heatS: 0, irr: 0, E: 0, vent: 0, cond: 0, morningWet: 0 }; order.push(key); }
      var s = days[key], h = d.getUTCHours();
      s.n++; s.tmax = Math.max(s.tmax, f.Ti); s.tmin = Math.min(s.tmin, f.Ti); s.omax = Math.max(s.omax, f.To); s.omin = Math.min(s.omin, f.To);
      var ok = f.day ? (f.Ti >= 18 && f.Ti <= 28) : (f.Ti >= nightLow && f.Ti <= 20);
      if (ok) s.ok++;
      if (f.Ti >= 30) s.hot++; if (f.Ti >= 35) s.hot35++;
      if (!f.day && f.Ti < nightLow) s.cold++; if (f.Ti < 5) s.cold5++;
      if (!f.day && f.Ti > 20) s.nightHot++;
      if (f.RHi >= 90) s.wet++;
      if (h >= 5 && h < 9 && f.RHi >= 75) s.morningWet++;
      if (f.A > 0.02 || f.B > 0.02 || f.R > 0.02) s.vent++;
      s.heatS += f.heatS; s.irr += f.irr; s.E += f.E; s.cond += f.cond;
    });
    return order.filter(function (k) { return days[k].n >= 12; }).map(function (k) {
      var s = days[k], hr = 1 / 6;
      var supplyL = s.irr * c.irrMl / 1000, etL = s.E / plants;   // 주당 L
      var oil = s.heatS / 3600 * (house.heater || 0) / (8700 * 0.85);
      return { key: k, date: s.date, hours: s.n * hr, full: s.n >= 143, tmax: s.tmax, tmin: s.tmin, omax: s.omax, omin: s.omin,
        okPct: s.n ? Math.round(s.ok / s.n * 100) : 0, hot: s.hot * hr, hot35: s.hot35 * hr, cold: s.cold * hr, cold5: s.cold5 * hr,
        nightHot: s.nightHot * hr, wet: s.wet * hr, morningWet: s.morningWet * hr, vent: s.vent * hr, heatH: s.heatS / 3600, oilL: oil,
        irr: s.irr, supplyL: supplyL, etL: etL, drain: supplyL > 0 && s.n >= 143 ? (supplyL - etL) / supplyL * 100 : null, condL: s.cond / g.A };
    });
  }

  function advice(sum, c, house, cropKey) {
    var tips = [];
    var full = sum.filter(function (d) { return d.full; }); if (!full.length) full = sum;
    var hot = Math.max.apply(null, full.map(function (d) { return d.hot; }));
    var cold = Math.max.apply(null, full.map(function (d) { return d.cold; }));
    var wet = Math.max.apply(null, full.map(function (d) { return d.wet; }));
    var mw = Math.max.apply(null, full.map(function (d) { return d.morningWet; }));
    var drains = full.filter(function (d) { return d.drain != null && d.irr > 0; });
    if (hot >= 1) tips.push(['warn', '30℃ 넘는 시간이 하루 최대 ' + hot.toFixed(1) + '시간 예상됩니다. 환기 시작 온도를 ' + (c.ventDay - 2) + '℃로 낮추거나' + (house.shade ? ' 차광 기준 일사를 낮춰' : ' 차광막을 써서') + ' 꽃 떨어짐·호흡 소모를 줄여 보세요.']);
    if (cold >= 1) tips.push(['warn', '밤에 기준(' + (cropKey === 'cherry' ? 12 : 10) + '℃)보다 낮은 시간이 최대 ' + cold.toFixed(1) + '시간입니다. ' + (house.heater > 0 ? '난방 설정이나 난방기 용량을 확인하세요.' : '난방기가 없는 조건입니다. 보온커튼·난방을 검토하세요.')]);
    if (wet >= 3) tips.push(['warn', '습도 90% 이상이 하루 최대 ' + wet.toFixed(1) + '시간 이어집니다. 잿빛곰팡이병 위험이 있으니 ' + (c.nightDehum ? '아침 환기·순환팬을 함께' : '야간 제습 환기를 켜고 순환팬을') + ' 써 보세요.']);
    if (mw >= 2) tips.push(['info', '오전 5~9시 습도 75% 이상이 ' + mw.toFixed(1) + '시간입니다. 이 시간대 고습은 열과를 늘리니 해 뜬 뒤 짧게 환기하거나 송풍하세요.']);
    drains.forEach(function (d) {
      if (d.drain < 10) tips.push(['warn', fmtDay(d.date) + ' 급액이 증산보다 적거나 비슷합니다(추정 배액률 ' + Math.round(d.drain) + '%). 1회 급액량을 늘리거나 일사 기준을 낮추세요.']);
      else if (d.drain > 45) tips.push(['info', fmtDay(d.date) + ' 추정 배액률 ' + Math.round(d.drain) + '%로 많습니다. 1회 급액량을 줄여도 됩니다(목표 20~30%).']);
    });
    if (!tips.length) tips.push(['ok', '이 설정이면 예보 기간 동안 큰 문제 없이 적온 범위가 유지될 것으로 보입니다.']);
    return tips;
  }
  // ---------- 실제 기록으로 보정 ----------
  // records: [{t: ms, Ti: ℃, RHi: % (선택)}] · w: 그 기간 바깥 시간별 자료 (h0, T, RH, G, SKY, PTY, VEC, WSD, R)
  var CAL_PARAMS = [
    { k: 'kU', lo: 0.5, hi: 1.8, step: 0.2, name: '보온력(열 빠짐)' },
    { k: 'kInf', lo: 0.3, hi: 3.0, step: 0.4, name: '틈새 바람' },
    { k: 'kTau', lo: 0.7, hi: 1.15, step: 0.08, name: '햇빛 투과' },
    { k: 'kVent', lo: 0.4, hi: 1.8, step: 0.2, name: '창 환기 효율' }
  ];
  function score(fr, recs) {
    if (!fr.length) return { n: 0, rmse: 99, rmseRH: null, bias: 0 };
    var t0 = fr[0].t, se = 0, n = 0, seH = 0, nH = 0, b = 0;
    recs.forEach(function (r) {
      var i = Math.round((r.t - t0) / 600000); if (i < 0 || i >= fr.length) return;
      var f = fr[i]; if (Math.abs(f.t - r.t) > 330000) return;
      var d = f.Ti - r.Ti; se += d * d; b += d; n++;
      if (r.RHi != null) { var dh = f.RHi - r.RHi; seH += dh * dh; nH++; }
    });
    return { n: n, rmse: n ? Math.sqrt(se / n) : 99, rmseRH: nH ? Math.sqrt(seH / nH) : null, bias: n ? b / n : 0 };
  }
  function calibrate(w, lat, lon, house, cropKey, stageKey, c, recs, opt) {
    opt = opt || {};
    var from = recs[0].t - 6 * 3600000;   // 기록 6시간 전부터 계산을 시작해 출발값 영향을 줄임
    function cost(cal) {
      var r = run(w, lat, lon, house, cropKey, stageKey, c, { cal: cal, noPast: true, recordFrom: from });
      var sc = score(r.frames, recs);
      return { v: sc.rmse + (sc.rmseRH != null ? 0.04 * sc.rmseRH : 0), sc: sc, r: r };
    }
    var cur = { kU: 1, kInf: 1, kTau: 1, kVent: 1 }, base = cost(cur), best = base, steps = {};
    CAL_PARAMS.forEach(function (p) { steps[p.k] = p.step; });
    for (var round = 0; round < 5; round++) {
      CAL_PARAMS.forEach(function (p) {
        [1, -1].forEach(function (sg) {
          var tryv = Math.max(p.lo, Math.min(p.hi, cur[p.k] + sg * steps[p.k]));
          if (tryv === cur[p.k]) return;
          var cand = Object.assign({}, cur); cand[p.k] = tryv;
          var r = cost(cand); if (r.v < best.v - 1e-4) { best = r; cur = cand; }
        });
        steps[p.k] /= 1.8;
      });
    }
    return { cal: cur, before: base.sc, after: best.sc, beforeRun: base.r, afterRun: best.r };
  }

  function fmtDay(ms) { var d = new Date(ms); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); }

  root.FSIM = { run: run, calibrate: calibrate, score: score, CAL_PARAMS: CAL_PARAMS, hourlyLen: hourlyLen, sunPos: sunPos, defaults: defaults, houseDefaults: houseDefaults, advice: advice, geom: geom,
    CROPS: CROPS, STAGES: STAGES, COVERS: COVERS, CURTAINS: CURTAINS, rhFrom: rhFrom, xFrom: xFrom };
  // 시군 대표 좌표 (scripts/build_regions.py 와 같은 값) — 해 위치 계산용
  root.FSIM_COORDS = {"1101":[37.5665,126.978],"2101":[35.1796,129.0756],"2102":[35.2445,129.2222],"2201":[35.8714,128.6014],"2202":[35.7746,128.4314],"2203":[36.2428,128.5728],"2301":[37.4563,126.7052],"2302":[37.7466,126.488],"2303":[37.254,126.473],"2401":[35.1595,126.8526],"2501":[36.3504,127.3845],"2601":[35.5384,129.3114],"2602":[35.5622,129.1428],"2901":[36.48,127.289],"3101":[37.2636,127.0286],"3102":[37.42,127.1267],"3103":[37.7381,127.0337],"3104":[37.3943,126.9568],"3105":[37.5034,126.766],"3106":[37.4786,126.8646],"3107":[36.9921,127.1129],"3108":[37.9036,127.0606],"3109":[37.3219,126.8309],"3110":[37.6584,126.832],"3111":[37.4292,126.9876],"3112":[37.5943,127.1296],"3113":[37.636,127.2165],"3114":[37.1499,127.0774],"3115":[37.38,126.803],"3116":[37.3617,126.9352],"3117":[37.3448,126.9683],"3118":[37.5393,127.2147],"3119":[37.2411,127.1776],"3120":[37.76,126.78],"3121":[37.272,127.435],"3122":[37.008,127.2797],"3123":[37.6152,126.7156],"3124":[37.1996,126.8312],"3125":[37.4294,127.255],"3126":[37.7853,127.0458],"3127":[37.8949,127.2003],"3128":[37.2984,127.637],"3129":[38.0966,127.0748],"3130":[37.8315,127.5105],"3131":[37.4917,127.4875],"3201":[37.8813,127.7298],"3202":[37.3422,127.9202],"3203":[37.7519,128.8761],"3204":[37.5247,129.1143],"3205":[37.164,128.9856],"3206":[38.207,128.5918],"3207":[37.4499,129.1652],"3208":[37.697,127.8888],"3209":[37.4917,127.985],"3210":[37.1836,128.4617],"3211":[37.3708,128.3903],"3212":[37.3807,128.6608],"3213":[38.1467,127.3133],"3214":[38.1062,127.7082],"3215":[38.11,127.9897],"3216":[38.0697,128.1707],"3217":[38.3806,128.4679],"3218":[38.0754,128.619],"3301":[36.6424,127.489],"3302":[36.991,127.9259],"3303":[37.1326,128.191],"3304":[36.4894,127.7295],"3305":[36.3064,127.5713],"3306":[36.175,127.7834],"3307":[36.7854,127.5815],"3308":[36.8554,127.4356],"3309":[36.8154,127.7866],"3310":[36.9403,127.6905],"3311":[36.9846,128.3655],"3401":[36.8151,127.1139],"3402":[36.4465,127.119],"3403":[36.3333,126.6127],"3404":[36.7898,127.0018],"3405":[36.7848,126.4503],"3406":[36.1872,127.0987],"3407":[36.2745,127.2489],"3408":[36.8898,126.6459],"3409":[36.1088,127.488],"3410":[36.2756,126.9098],"3411":[36.0803,126.6919],"3412":[36.4592,126.8022],"3413":[36.6013,126.6608],"3414":[36.6826,126.8449],"3415":[36.7456,126.2979],"3501":[35.8242,127.148],"3502":[35.9676,126.7369],"3503":[35.9483,126.9577],"3504":[35.5699,126.8559],"3505":[35.4164,127.3905],"3506":[35.8036,126.8809],"3507":[35.9047,127.1622],"3508":[35.7917,127.4249],"3509":[36.0068,127.6608],"3510":[35.6474,127.5212],"3511":[35.6178,127.289],"3512":[35.3744,127.1374],"3513":[35.4358,126.702],"3514":[35.7318,126.733],"3601":[34.8118,126.3922],"3602":[34.7604,127.6622],"3603":[34.9506,127.4872],"3604":[35.016,126.7108],"3605":[34.9407,127.6959],"3606":[35.3211,126.9882],"3607":[35.282,127.292],"3608":[35.2025,127.4629],"3609":[34.6112,127.285],"3610":[34.7715,127.08],"3611":[35.0645,126.9865],"3612":[34.6817,126.9069],"3613":[34.642,126.7671],"3614":[34.5733,126.5989],"3615":[34.8002,126.6969],"3616":[34.9904,126.4817],"3617":[35.0659,126.5165],"3618":[35.2772,126.512],"3619":[35.3018,126.7849],"3620":[34.311,126.7551],"3621":[34.4868,126.2635],"3622":[34.8668,126.3026],"3701":[36.019,129.3435],"3702":[35.8562,129.2247],"3703":[36.1398,128.1136],"3704":[36.5684,128.7294],"3705":[36.1195,128.3446],"3706":[36.8057,128.6241],"3707":[35.9733,128.9386],"3708":[36.4109,128.159],"3709":[36.5865,128.1867],"3710":[35.8251,128.7415],"3711":[36.3527,128.697],"3712":[36.4359,129.0571],"3713":[36.6667,129.1124],"3714":[36.415,129.3653],"3715":[35.6474,128.7341],"3716":[35.726,128.2629],"3717":[35.9192,128.2829],"3718":[35.9955,128.4017],"3719":[36.658,128.4529],"3720":[36.8931,128.7325],"3721":[36.993,129.4004],"3722":[37.4844,130.9057],"3801":[35.2281,128.6811],"3802":[35.18,128.1076],"3803":[34.8544,128.4331],"3804":[35.0037,128.0642],"3805":[35.2285,128.8894],"3806":[35.5037,128.7466],"3807":[34.8806,128.6211],"3808":[35.335,129.0373],"3809":[35.3222,128.2617],"3810":[35.2725,128.4064],"3811":[35.5446,128.4925],"3812":[34.973,128.3223],"3813":[34.8377,127.8924],"3814":[35.0672,127.7513],"3815":[35.4155,127.8734],"3816":[35.5205,127.7251],"3817":[35.6866,127.9095],"3818":[35.5666,128.1658],"3901":[33.4996,126.5312],"3902":[33.2541,126.56]};
})(typeof window !== 'undefined' ? window : globalThis);
