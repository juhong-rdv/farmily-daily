# -*- coding: utf-8 -*-
"""예상 일사량 보정: 종관기상관측(ASOS) 일자료 10년치(일사량 sumGsr·평균 전운량 avgTca·강수량 sumRn)로
지점별 '맑은 날 대비 실제 일사 비율'을 구름 양·비 여부에 따라 맞추고, 최근 2년은 떼어 두고 시험해 오차를 기록합니다.
출력: data/solar/<지점번호>.json  (fetch_weather.py 가 하루 몇 개 지점씩 채워 나갑니다)"""
import json, math, os, datetime as dt

KST = dt.timezone(dt.timedelta(hours=9))
EDGES = [0, 2, 4, 6, 8, 9, 10.01]          # 평균 전운량(할) 구간
SKY_TENTHS = {1: 2.0, 3: 7.0, 4: 9.5}      # 단기예보 하늘상태 → 대표 전운량(맑음 0~5, 구름많음 6~8, 흐림 9~10할)
STALE_DAYS = 180

def _elev(lat, lon, doy, minutes):
    g = 2 * math.pi / 365 * (doy - 1 + (minutes / 60 - 12) / 24)
    decl = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
            + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    eot = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    ha = math.radians((minutes + eot + 4 * lon - 540) / 4 - 180)
    la = math.radians(lat)
    return math.sin(la) * math.sin(decl) + math.cos(la) * math.cos(decl) * math.cos(ha)

def clear_day_table(lat, lon):
    """1~366일 맑은 하늘 하루 일사량(MJ/m²), Haurwitz 모델 10분 간격 적분."""
    out = [0.0]
    for doy in range(1, 367):
        s = 0.0
        for m in range(0, 1440, 10):
            cz = _elev(lat, lon, doy, m + 5)
            if cz > 0: s += 1098 * cz * math.exp(-0.057 / cz)
        out.append(s * 600 / 1e6)
    return out

def _pct(v, q):
    v = sorted(v)
    if not v: return None
    k = (len(v) - 1) * q
    f = int(k); c = min(f + 1, len(v) - 1)
    return v[f] + (v[c] - v[f]) * (k - f)

def _bin(t):
    for i in range(len(EDGES) - 1):
        if EDGES[i] <= t < EDGES[i + 1]: return i
    return len(EDGES) - 2

def fit(rows):
    """rows: [(month, tenths, rain, ratio)] → 월별 맑은 날 보정 k, 구름·비 구간별 비율(중앙값·25%·75%)."""
    allr = [r[3] for r in rows]
    g90 = _pct(allr, 0.9) or 0.75
    k = []
    for mth in range(1, 13):
        v = [r[3] for r in rows if r[0] == mth]
        k.append(round(_pct(v, 0.9), 3) if len(v) >= 20 else round(g90, 3))
    bins = {}
    for key, rain in (("dry", False), ("rain", True)):
        arr = []
        for i in range(len(EDGES) - 1):
            v = [r[3] / k[r[0] - 1] for r in rows if _bin(r[1]) == i and r[2] == rain]
            if len(v) < 15 and rain:  # 비 온 날 자료가 적으면 같은 구름 구간의 비 안 온 날로 대신
                v = [r[3] / k[r[0] - 1] for r in rows if _bin(r[1]) == i]
            arr.append({"lo": EDGES[i], "hi": min(10, EDGES[i + 1]), "n": len(v),
                        "med": round(_pct(v, 0.5), 3) if v else None,
                        "p25": round(_pct(v, 0.25), 3) if v else None,
                        "p75": round(_pct(v, 0.75), 3) if v else None})
        for i, b in enumerate(arr):  # 빈 구간은 이웃 구간 값으로
            if b["med"] is None:
                nb = next((arr[j] for j in sorted(range(len(arr)), key=lambda j: abs(j - i)) if arr[j]["med"] is not None), None)
                if nb: b.update(med=nb["med"], p25=nb["p25"], p75=nb["p75"])
        bins[key] = arr
    return {"k": k, "bins": bins}

def factor(model, month, tenths, rain):
    b = model["bins"]["rain" if rain else "dry"][_bin(tenths)]
    kk = model["k"][month - 1]
    if b["med"] is None: return None
    return kk * b["med"], kk * b["p25"], kk * b["p75"]

def calibrate(stn, name, lat, lon, call, items, now, log):
    end = (now - dt.timedelta(days=1)).date()
    first = end.replace(year=end.year - 10) + dt.timedelta(days=1)
    raw, seen_gsr = [], False
    y = end.year
    while y >= first.year:
        a = max(first, dt.date(y, 1, 1)); b = min(end, dt.date(y, 12, 31))
        body = call("/AsosDalyInfoService/getWthrDataList", {"pageNo": 1, "numOfRows": 400, "dataCd": "ASOS", "dateCd": "DAY",
                    "startDt": a.strftime("%Y%m%d"), "endDt": b.strftime("%Y%m%d"), "stnIds": stn})
        it = items(body)
        if it and "sumGsr" not in it[0] and not log.get("calib_keys"):
            log["calib_keys"] = sorted(it[0].keys())  # 진단: 항목 이름이 다를 때 확인용
        got = [r for r in it if r.get("sumGsr") not in (None, "")]
        if got: seen_gsr = True
        raw += it
        if y == end.year - 1 and not seen_gsr:  # 올해·작년 모두 일사 관측이 없으면 일사 관측 안 하는 지점
            return {"stn": stn, "name": name, "gsr": False, "updated": now.date().isoformat()}
        y -= 1
    CL = clear_day_table(lat, lon)
    rows = []
    for r in raw:
        try:
            d = dt.date.fromisoformat(r["tm"]); g = float(r["sumGsr"]); t = float(r["avgTca"])
        except Exception:
            continue
        rn = r.get("sumRn"); rn = float(rn) if rn not in (None, "") else 0.0
        doy = d.timetuple().tm_yday; c = CL[doy]
        if c < 1: continue
        ratio = g / c
        if not (0.02 <= ratio <= 1.3): continue
        rows.append((d, d.month, t, rn >= 1.0, ratio, g, c, doy))
    if len(rows) < 365:
        return {"stn": stn, "name": name, "gsr": False, "updated": now.date().isoformat(), "n": len(rows)}
    # 최근 2년은 떼어 두고 시험
    cut = end - dt.timedelta(days=730)
    train = [(r[1], r[2], r[3], r[4]) for r in rows if r[0] <= cut]
    test = [r for r in rows if r[0] > cut]
    test_res = None
    if len(train) >= 365 and len(test) >= 200:
        m = fit(train)
        err = []; naive = []; inside = 0
        for r in test:
            f = factor(m, r[1], r[2], r[3])
            if not f: continue
            p = r[6] * f[0]; err.append(abs(p - r[5]))
            if r[6] * f[1] <= r[5] <= r[6] * f[2]: inside += 1
            nf = 0.2 if r[3] else 1 - 0.75 * (r[2] / 10) ** 3.4
            naive.append(abs(r[6] * nf - r[5]))
        mean = sum(r[5] for r in test) / len(test)
        if err:
            test_res = {"n": len(err), "from": min(r[0] for r in test).isoformat(), "to": max(r[0] for r in test).isoformat(),
                        "mae": round(sum(err) / len(err), 2), "mean": round(mean, 2), "pct": round(sum(err) / len(err) / mean * 100),
                        "naive_mae": round(sum(naive) / len(naive), 2), "naive_pct": round(sum(naive) / len(naive) / mean * 100),
                        "inside": round(inside / len(err) * 100)}
    model = fit([(r[1], r[2], r[3], r[4]) for r in rows])
    # 평년(지난 10년) 같은 날짜 ±7일 평균 일사량
    by = {}
    for r in rows: by.setdefault(r[7], []).append(r[5])
    clim = [None]
    for doy in range(1, 367):
        v = []
        for dd in range(-7, 8):
            v += by.get((doy + dd - 1) % 366 + 1, [])
        clim.append(round(sum(v) / len(v), 1) if len(v) >= 20 else None)
    return {"stn": stn, "name": name, "lat": lat, "lon": lon, "gsr": True, "updated": now.date().isoformat(),
            "first": min(r[0] for r in rows).isoformat(), "last": max(r[0] for r in rows).isoformat(), "n": len(rows),
            "k": model["k"], "bins": model["bins"], "test": test_res, "clim": clim}

def load(root, stn):
    try:
        return json.load(open(os.path.join(root, "data", "solar", "%s.json" % stn), encoding="utf-8"))
    except Exception:
        return None

def save(root, obj):
    os.makedirs(os.path.join(root, "data", "solar"), exist_ok=True)
    with open(os.path.join(root, "data", "solar", "%s.json" % obj["stn"]), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))

def needs(obj, now):
    if not obj: return True
    try:
        age = (now.date() - dt.date.fromisoformat(obj["updated"])).days
        return age > (STALE_DAYS if obj.get("gsr") else 30)  # 일사 관측 없음 판정은 한 달 뒤 다시 확인
    except Exception:
        return True
