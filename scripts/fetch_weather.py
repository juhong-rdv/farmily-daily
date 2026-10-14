# -*- coding: utf-8 -*-
"""기상청 공공데이터로 '우리 지역' 카드 데이터를 만듭니다. GitHub Actions에서 실행.
필요: 환경변수 KMA_SERVICE_KEY (공공데이터포털 '일반 인증키(Decoding)' — Encoding 키를 넣어도 자동으로 풀어 씁니다)
활용신청 필요한 API 3종: 기상청_단기예보 조회서비스 / 기상청_중기예보 조회서비스 / 기상청_지상(종관, ASOS) 일자료 조회서비스
출력: data/weather/<code>.json (시군별), data/sun.json (일조 하루 1회 캐시), data/solar/<지점>.json (일사 보정)·raw/<지점>.csv (관측 누적)·log.json (예보 성적), data/weather/_status.json (실행 기록)"""
import json, os, re, sys, time, datetime as dt
from urllib.parse import unquote
import requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import solar_calib as SC
from kma_common import haversine

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
KST = dt.timezone(dt.timedelta(hours=9))
NOW = dt.datetime.now(KST)
# https가 해외(GitHub 서버)에서 막히는 경우가 있어 http도 차례로 시도하고, 되는 쪽을 계속 씁니다.
BASES = ["https://apis.data.go.kr/1360000", "http://apis.data.go.kr/1360000"]
BASE_OK = {"i": None}
S = requests.Session()
S.headers["User-Agent"] = "farmily-daily-data/1.0"
LOG = {"started": NOW.isoformat(timespec="minutes"), "errors": [], "mid_invalid": [], "counts": {}, "base": None, "samples": []}

def key():
    k = os.environ.get("KMA_SERVICE_KEY", "").strip()
    return unquote(k) if "%" in k else k

def call(path, params, tries=3):
    p = dict(params, serviceKey=key(), dataType="JSON")
    last = None
    for i in range(tries):
        order = [BASE_OK["i"]] if BASE_OK["i"] is not None else list(range(len(BASES)))
        for bi in order:
            try:
                r = S.get(BASES[bi] + path, params=p, timeout=(8, 25))
            except (requests.exceptions.ConnectTimeout, requests.exceptions.ConnectionError) as e:
                last = "접속 실패(%s): %s" % (BASES[bi].split(":")[0], repr(e)[:120])
                continue
            BASE_OK["i"] = bi
            txt = r.text
            if len(LOG["samples"]) < 3:  # 진단용: 처음 몇 개 응답 앞부분 (키는 응답에 포함되지 않음)
                LOG["samples"].append({"path": path, "params": {k: v for k, v in params.items()}, "http": r.status_code, "text": txt[:600]})
            if not txt.lstrip().startswith("{"):
                m = re.search(r"<returnAuthMsg>([^<]+)|<resultMsg>([^<]+)|<errMsg>([^<]+)", txt)
                last = "비JSON 응답 HTTP %s %s" % (r.status_code, (m and next(g for g in m.groups() if g)) or txt[:120])
                if "SERVICE_KEY" in last or "SERVICE ERROR" in last or r.status_code in (401, 403):
                    raise RuntimeError(last)
                break
            j = r.json()
            hd = j.get("response", {}).get("header", {})
            code = hd.get("resultCode")
            if code == "00":
                return j["response"]["body"]
            last = "resultCode %s %s" % (code, hd.get("resultMsg"))
            if code in ("03",):  # NO_DATA
                return None
            break
        time.sleep(1.5 * (i + 1))
    raise RuntimeError(last)

def items(body):
    if not body: return []
    it = body.get("items")
    if isinstance(it, dict): it = it.get("item", [])
    return it if isinstance(it, list) else ([it] if it else [])

def pcp_mm(v):
    v = str(v).strip()
    if v in ("", "-", "0", "강수없음"): return 0.0
    if "미만" in v: return 0.5
    nums = re.findall(r"[\d.]+", v)
    return float(nums[0]) if nums else 0.0

# ---------- 단기예보 ----------
def short_bases(n=4):
    """가장 최근 발표 시각부터 거꾸로 n개 (발표 직후 자료가 늦게 올라오는 경우 대비)."""
    t = NOW - dt.timedelta(minutes=15)
    out = []
    while len(out) < n:
        for h in (23, 20, 17, 14, 11, 8, 5, 2):
            if t.hour >= h and (t.strftime("%Y%m%d"), "%02d00" % h) not in out:
                out.append((t.strftime("%Y%m%d"), "%02d00" % h))
                if len(out) >= n: break
        t = (t - dt.timedelta(days=1)).replace(hour=23, minute=59)
    return out

_short_cache = {}
def get_short(nx, ny):
    if (nx, ny) in _short_cache: return _short_cache[(nx, ny)]
    for bd, bt in short_bases():
        out, page = [], 1
        while True:
            body = call("/VilageFcstInfoService_2.0/getVilageFcst",
                        {"pageNo": page, "numOfRows": 1000, "base_date": bd, "base_time": bt, "nx": nx, "ny": ny})
            out += items(body)
            total = int((body or {}).get("totalCount", 0) or 0)
            if not body or page * 1000 >= total: break
            page += 1
        if out: break
    _short_cache[(nx, ny)] = (bd + " " + bt, out)
    time.sleep(0.05)
    return _short_cache[(nx, ny)]

def probe():
    """진단: 기상청 API 몇 가지를 한 번씩 불러 응답 앞부분을 기록합니다."""
    y = (NOW - dt.timedelta(days=1)).strftime("%Y%m%d")
    tests = [
        ("단기예보 최신", "/VilageFcstInfoService_2.0/getVilageFcst", dict(pageNo=1, numOfRows=10, base_date=short_bases()[0][0], base_time=short_bases()[0][1], nx=60, ny=127)),
        ("단기예보 어제23시", "/VilageFcstInfoService_2.0/getVilageFcst", dict(pageNo=1, numOfRows=10, base_date=y, base_time="2300", nx=60, ny=127)),
        ("초단기실황", "/VilageFcstInfoService_2.0/getUltraSrtNcst", dict(pageNo=1, numOfRows=10, base_date=(NOW - dt.timedelta(minutes=50)).strftime("%Y%m%d"), base_time=(NOW - dt.timedelta(minutes=50)).strftime("%H00"), nx=60, ny=127)),
        ("예보버전", "/VilageFcstInfoService_2.0/getFcstVersion", dict(pageNo=1, numOfRows=10, ftype="SHRT", basedatetime=short_bases()[0][0] + short_bases()[0][1])),
        ("중기기온 서울", "/MidFcstInfoService/getMidTa", dict(pageNo=1, numOfRows=10, regId="11B10101", tmFc=mid_tmfc())),
        ("ASOS 서울 어제", "/AsosDalyInfoService/getWthrDataList", dict(pageNo=1, numOfRows=10, dataCd="ASOS", dateCd="DAY", startDt=y, endDt=y, stnIds=108)),
    ]
    out = []
    for name, path, prm in tests:
        try:
            r = S.get(BASES[BASE_OK["i"] or 0] + path, params=dict(prm, serviceKey=key(), dataType="JSON"), timeout=(8, 25))
            out.append({"test": name, "params": prm, "http": r.status_code, "text": r.text[:300]})
        except Exception as e:
            out.append({"test": name, "params": prm, "error": repr(e)[:200]})
    LOG["probe"] = out

# ---------- 중기기온 ----------
def mid_tmfc():
    t = NOW - dt.timedelta(minutes=10)
    if t.hour >= 18: return t.strftime("%Y%m%d") + "1800"
    if t.hour >= 6: return t.strftime("%Y%m%d") + "0600"
    return (t - dt.timedelta(days=1)).strftime("%Y%m%d") + "1800"

_mid_cache = {}
def get_mid(reg):
    if reg in _mid_cache: return _mid_cache[reg]
    tm = mid_tmfc()
    res = None
    try:
        body = call("/MidFcstInfoService/getMidTa", {"pageNo": 1, "numOfRows": 10, "regId": reg, "tmFc": tm})
        it = items(body)
        if it:
            base = dt.datetime.strptime(tm[:8], "%Y%m%d").date()
            res = {}
            for k, v in it[0].items():
                m = re.fullmatch(r"taMin(\d+)", k)
                if m and v not in (None, "", "-"):
                    res[(base + dt.timedelta(days=int(m.group(1)))).isoformat()] = float(v)
            if not res: res = None
    except Exception as e:
        LOG["errors"].append("중기 %s: %s" % (reg, e))
    if res is None and reg not in LOG["mid_invalid"]:
        LOG["mid_invalid"].append(reg)
    _mid_cache[reg] = res
    return res

# ---------- ASOS 일조 (하루 1회) ----------
def sun_for_station(stn):
    """최근 관측 7일 일조시간 합과, 같은 날짜 구간의 지난 5년 평균."""
    end = (NOW - dt.timedelta(days=1)).date()
    start = end - dt.timedelta(days=12)
    body = call("/AsosDalyInfoService/getWthrDataList", {"pageNo": 1, "numOfRows": 30, "dataCd": "ASOS", "dateCd": "DAY",
                "startDt": start.strftime("%Y%m%d"), "endDt": end.strftime("%Y%m%d"), "stnIds": stn})
    raw = items(body)
    gsr = {r.get("tm"): float(r["sumGsr"]) for r in raw if r.get("sumGsr") not in (None, "")}
    rows = [(r.get("tm"), r.get("sumSsHr")) for r in raw]
    rows = [(d, float(v)) for d, v in rows if d and v not in (None, "")]
    if len(rows) < 7: return None
    rows.sort()
    last7 = rows[-7:]
    d0 = dt.date.fromisoformat(last7[0][0]); d1 = dt.date.fromisoformat(last7[-1][0])
    if (d1 - d0).days != 6: return None  # 결측으로 7일 연속이 아니면 쓰지 않음
    sums = []
    for back in range(1, 6):
        try:
            a, b = d0.replace(year=d0.year - back), d1.replace(year=d1.year - back)
        except ValueError:
            continue
        bb = call("/AsosDalyInfoService/getWthrDataList", {"pageNo": 1, "numOfRows": 10, "dataCd": "ASOS", "dateCd": "DAY",
                  "startDt": a.strftime("%Y%m%d"), "endDt": b.strftime("%Y%m%d"), "stnIds": stn})
        vals = [float(r["sumSsHr"]) for r in items(bb) if r.get("sumSsHr") not in (None, "")]
        if len(vals) == 7: sums.append(sum(vals))
        time.sleep(0.05)
    s = round(sum(v for _, v in last7), 1)
    normal = round(sum(sums) / len(sums), 1) if len(sums) >= 3 else None
    return {"start": last7[0][0], "end": last7[-1][0], "sum": s, "avg": round(s / 7, 1), "daily": [v for _, v in last7],
            "normal": normal, "normal_years": len(sums), "ratio": (round(s / normal * 100) if normal else None),
            "gsr": ([gsr.get(d) for d, _ in last7] if all(gsr.get(d) is not None for d, _ in last7) else None)}

def load_sun():
    p = os.path.join(ROOT, "data", "sun.json")
    today = NOW.date().isoformat()
    try:
        old = json.load(open(p, encoding="utf-8"))
        if old.get("date") == today:
            return old, False
    except Exception:
        pass
    return {"date": today, "note": "ASOS 일조시간 하루 1회 캐시", "stations": {}}, True

# ---------- 예상 일사량 (태양 고도 + 하늘 상태로 추정) ----------
import math
def sun_elev(lat, lon, t):
    """t: KST datetime (그 시각). 태양 고도(도)."""
    n = t.timetuple().tm_yday
    g = 2 * math.pi / 365 * (n - 1 + (t.hour - 12) / 24)
    decl = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
            + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    eot = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    tst = t.hour * 60 + t.minute + eot + 4 * lon - 540  # 진태양시(분), KST = UTC+9 = 135°E
    ha = math.radians(tst / 4 - 180)
    la = math.radians(lat)
    cz = math.sin(la) * math.sin(decl) + math.cos(la) * math.cos(decl) * math.cos(ha)
    return math.degrees(math.asin(max(-1, min(1, cz))))

# 하늘상태(SKY) 1 맑음(구름 0~5할) 3 구름많음(6~8할) 4 흐림(9~10할) → 구름양 대표값, Kasten-Czeplak 감쇠
SKY_CLOUD = {1: 0.25, 3: 0.7, 4: 0.95}
def cloud_factor(sky, pty):
    if pty and pty > 0: return 0.2  # 비·눈이 오는 시간
    c = SKY_CLOUD.get(sky)
    if c is None: return None
    return 1 - 0.75 * c ** 3.4

def est_ghi(lat, lon, t, sky, pty):
    """시각 t 를 가운데로 한 1시간 평균 수평면 일사(W/m²): (맑은 하늘 값, 구름 반영 값, 태양 고도)."""
    elevs = [sun_elev(lat, lon, t + dt.timedelta(minutes=m)) for m in (-25, -15, -5, 5, 15, 25)]
    clear = 0.0
    for e in elevs:
        if e > 0:
            cz = math.sin(math.radians(e))
            clear += 1098 * cz * math.exp(-0.057 / cz)  # Haurwitz 맑은 하늘 모델
    clear /= len(elevs)
    f = cloud_factor(sky, pty)
    return round(clear), (round(clear * f) if f is not None else None), round(sun_elev(lat, lon, t), 1)

# ---------- 병 발생 위험 (바깥 날씨 기준 참고 신호) ----------
def level(h): return "높음" if h >= 12 else ("보통" if h >= 6 else "낮음")
def risk(T, RH, R):
    n = min(48, len(T))
    gray = sum(1 for i in range(n) if RH[i] is not None and T[i] is not None and RH[i] >= 90 and 15 <= T[i] <= 25)
    downy = sum(1 for i in range(n) if RH[i] is not None and T[i] is not None and RH[i] >= 90 and 12 <= T[i] <= 22)
    anth = sum(1 for i in range(n) if T[i] is not None and 22 <= T[i] <= 32 and ((R[i] or 0) > 0 or (RH[i] or 0) >= 90))
    return {"hours": n, "gray": {"h": gray, "lv": level(gray)}, "downy": {"h": downy, "lv": level(downy)},
            "anth": {"h": anth, "lv": level(anth)}}

_sun_tried = set()
def station_sun(sid, sun_db):
    sid = str(sid)
    if sid not in _sun_tried and (sid not in sun_db["stations"] or sun_db["stations"][sid] is None):
        _sun_tried.add(sid)
        try:
            sun_db["stations"][sid] = sun_for_station(int(sid))
        except Exception as e:
            LOG["errors"].append("ASOS %s: %s" % (sid, e)); sun_db["stations"][sid] = None
    return sun_db["stations"].get(sid)

CAL = {}          # 지점번호 → 일사 보정 자료
SOLAR_LOG = {}    # 시군코드 → {날짜: {f: 전날 예보, o: 관측}}
CAL_KM = 60

def cal_candidates(lat, lon):
    from build_regions import ASOS
    c = [(haversine(lat, lon, s[2], s[3]), s) for s in ASOS]
    return [(round(d), s) for d, s in sorted(c) if d <= CAL_KM][:4]

def apply_calibration(reg, keys, G, GC, R, SKY, PTY, rad, sun_db):
    """10년 관측으로 맞춘 비율로 하루 예상 일사량과 시간별 값을 고칩니다."""
    pick = None
    for km, st in cal_candidates(reg["lat"], reg["lon"]):
        o = CAL.get(st[0])
        if o and o.get("gsr"):
            pick = (km, st, o); break
    if not pick: return None, None
    km, st, model = pick
    for r in rad:
        dkey = r["d"].replace("-", "")
        idx = [i for i, k in enumerate(keys) if k[:8] == dkey]
        csum = sum(GC[i] for i in idx)
        if csum <= 0 or any(SKY[i] is None for i in idx if GC[i] > 0): continue
        tenths = sum(GC[i] * (10.0 if (PTY[i] or 0) > 0 else SC.SKY_TENTHS.get(SKY[i], 7.0)) for i in idx) / csum
        rain = sum(R[i] or 0 for i in idx) >= 1.0
        month = int(dkey[4:6])
        f = SC.factor(model, month, tenths, rain)
        if not f: continue
        clear = csum * 0.0036
        est, lo, hi = clear * f[0], clear * f[1], clear * f[2]
        ksum = sum(G[i] or 0 for i in idx) * 0.0036
        if ksum > 0:
            sc = est / ksum
            for i in idx:
                if G[i] is not None: G[i] = int(round(min(GC[i] * 1.05, G[i] * sc)))
        doy = dt.date.fromisoformat(r["d"]).timetuple().tm_yday
        r.update(est=round(est, 1), lo=round(lo, 1), hi=round(hi, 1), cloud=round(tenths, 1), rain=rain, cal=True,
                 clim=(model.get("clim") or [None] * 367)[doy])
    info = {"stn": model["stn"], "name": model["name"], "km": km, "first": model.get("first"), "last": model.get("last"),
            "n": model.get("n"), "test": model.get("test")}
    # 예보 성적 기록: 내일 예보를 남겨 두고, 관측이 들어오면 맞춰 봄
    lg = SOLAR_LOG.setdefault(reg["code"], {})
    tmr = (NOW.date() + dt.timedelta(days=1)).isoformat()
    for r in rad:
        if r["d"] == tmr and r.get("cal"):
            e = lg.get(tmr, {}); e.update(f=r["est"], lo=r["lo"], hi=r["hi"], stn=model["stn"]); lg[tmr] = e
    obs = station_sun(model["stn"], sun_db)
    if obs and obs.get("gsr"):
        d0 = dt.date.fromisoformat(obs["start"])
        for j, g in enumerate(obs["gsr"]):
            dd = (d0 + dt.timedelta(days=j)).isoformat()
            if dd in lg and lg[dd].get("stn") == model["stn"]: lg[dd]["o"] = g
    for dd in [x for x in lg if x < (NOW.date() - dt.timedelta(days=60)).isoformat()]: del lg[dd]
    pairs = [v for v in lg.values() if "o" in v and "f" in v]
    score = None
    if pairs:
        mae = sum(abs(v["f"] - v["o"]) for v in pairs) / len(pairs)
        mean = sum(v["o"] for v in pairs) / len(pairs)
        score = {"n": len(pairs), "mae": round(mae, 2), "mean": round(mean, 2),
                 "inside": round(sum(1 for v in pairs if v["lo"] <= v["o"] <= v["hi"]) / len(pairs) * 100)}
    return info, score

def run_calibration():
    """처음 받는 지점은 이번 실행에 몇 개씩(한 지점 = 기상청 호출 약 10회),
    이미 쌓인 지점은 하루 한 번 새 날짜만(호출 1회) 덧붙여 다시 맞춥니다."""
    from build_regions import ASOS, full_regions
    per_run = int(os.environ.get("CAL_PER_RUN", "100"))
    for s in ASOS:
        o = SC.load(ROOT, s[0])
        if o: CAL[s[0]] = o
    order = []
    cands = [cal_candidates(r["lat"], r["lon"]) for r in full_regions()]
    for rank in range(4):
        for c in cands:
            if rank < len(c) and c[rank][1] not in order: order.append(c[rank][1])
    full = added = 0
    errs = []
    for st in order:
        o = CAL.get(st[0])
        if SC.needs_full(o, NOW):
            if full >= per_run: continue
            full += 1
        elif SC.needs_add(o, NOW):
            added += 1
        else:
            continue
        try:
            o = SC.update(st[0], st[1], st[2], st[3], call, items, NOW, LOG, ROOT, prev=o)
            SC.save(ROOT, o); CAL[st[0]] = o
        except Exception as e:
            errs.append("보정 %s %s: %s" % (st[0], st[1], str(e)[:150]))
    LOG["calib"] = {"first_download": full, "daily_add": added, "have_gsr": sum(1 for o in CAL.values() if o.get("gsr")),
                    "no_gsr": sum(1 for o in CAL.values() if not o.get("gsr")),
                    "pending": sum(1 for st in order if SC.needs_full(CAL.get(st[0]), NOW)), "errors": errs[:10]}

def build_region(reg, sun_db, sun_fresh):
    base, rows = get_short(reg["nx"], reg["ny"])
    by = {}
    tmn, tmx = {}, {}
    for it in rows:
        d, t, c, v = it["fcstDate"], it["fcstTime"], it["category"], it["fcstValue"]
        key_ = d + t
        if c in ("TMP", "REH", "PCP", "POP", "SKY", "PTY", "VEC", "WSD"):
            by.setdefault(key_, {})[c] = v
        elif c == "TMN": tmn[d] = float(v)
        elif c == "TMX": tmx[d] = float(v)
    now_key = NOW.strftime("%Y%m%d%H") + "00"
    keys = sorted(k for k in by if k >= now_key)
    if not keys: raise RuntimeError("단기예보 시간 자료 없음")
    T = [float(by[k]["TMP"]) if "TMP" in by[k] else None for k in keys]
    RH = [float(by[k]["REH"]) if "REH" in by[k] else None for k in keys]
    Rr = [pcp_mm(by[k].get("PCP", 0)) for k in keys]
    P = [int(float(by[k]["POP"])) if "POP" in by[k] else None for k in keys]
    def num(k, c, f=float):
        try: return f(float(by[k][c]))
        except Exception: return None
    SKY = [num(k, "SKY", int) for k in keys]
    PTY = [num(k, "PTY", int) for k in keys]
    VEC = [num(k, "VEC", int) for k in keys]
    WSD = [num(k, "WSD") for k in keys]
    # 예상 일사량: 정시 예보값을 그 시각 앞뒤 30분 평균으로 봄
    GC, G, EL = [], [], []
    for k, sk, pt in zip(keys, SKY, PTY):
        t = dt.datetime(int(k[:4]), int(k[4:6]), int(k[6:8]), int(k[8:10]), tzinfo=KST)
        c, g, e = est_ghi(reg["lat"], reg["lon"], t, sk, pt)
        GC.append(c); G.append(g); EL.append(e)
    rad_days = {}
    for k, c, g in zip(keys, GC, G):
        dd = rad_days.setdefault(k[:8], {"clear": 0.0, "est": 0.0, "n": 0, "miss": 0})
        dd["n"] += 1; dd["clear"] += c
        if g is None: dd["miss"] += 1
        else: dd["est"] += g
    rad = []
    for d in sorted(rad_days):
        v = rad_days[d]
        if v["n"] < 24 and d != NOW.strftime("%Y%m%d"): continue
        if v["miss"]: continue
        rad.append({"d": "%s-%s-%s" % (d[:4], d[4:6], d[6:8]), "est": round(v["est"] * 0.0036, 1), "clear": round(v["clear"] * 0.0036, 1),
                    "part": v["n"] < 24})
    k0 = keys[0]
    h0 = "%s-%s-%sT%s:00" % (k0[:4], k0[4:6], k0[6:8], k0[8:10])
    # 일별 최저/최고: 단기(TMN/TMX 우선, 없으면 시간값의 최저·최고)
    days = {}
    for k, t in zip(keys, T):
        d = k[:8]
        if t is None: continue
        dd = days.setdefault(d, {"min": t, "max": t})
        dd["min"] = min(dd["min"], t); dd["max"] = max(dd["max"], t)
    out_days = []
    for d in sorted(set(days) | set(tmn)):
        iso = "%s-%s-%s" % (d[:4], d[4:6], d[6:8])
        mn = tmn.get(d, days.get(d, {}).get("min")); mx = tmx.get(d, days.get(d, {}).get("max"))
        if mn is None: continue
        hrs = sum(1 for k in keys if k[:8] == d)
        if d not in tmn and hrs < 18 and d != NOW.strftime("%Y%m%d"):
            continue  # 하루 일부만 있는 날(예보 끝자락)은 최저기온이 틀어지므로 버리고 중기예보로 채움
        out_days.append({"d": iso, "min": mn, "max": mx, "src": "단기"})
    have = {x["d"] for x in out_days}
    for m in reg["mid"]:
        mid = get_mid(m["id"])
        if not mid: continue
        for d in sorted(mid):
            if d not in have and d >= NOW.date().isoformat():
                out_days.append({"d": d, "min": mid[d], "max": None, "src": "중기", "stn": m["name"]})
        break
    out_days.sort(key=lambda x: x["d"])
    # 일조
    sun = None
    for s in reg["asos"]:
        v = station_sun(s["id"], sun_db)
        if v:
            sun = dict(v, stn=s["name"], km=s["km"]); break
    solar, solar_score = None, None
    try:
        solar, solar_score = apply_calibration(reg, keys, G, GC, Rr, SKY, PTY, rad, sun_db)
    except Exception as e:
        LOG["errors"].append("일사 보정 %s: %s" % (reg["code"], str(e)[:150]))
    return {"code": reg["code"], "sido": reg["sido"], "name": reg["name"],
            "updated": NOW.isoformat(timespec="minutes"), "short_base": base,
            "h0": h0, "T": T, "RH": RH, "R": Rr, "P": P,
            "SKY": SKY, "PTY": PTY, "VEC": VEC, "WSD": WSD, "G": G, "GC": GC, "EL": EL, "rad": rad,
            "days": out_days[:11], "risk": risk(T, RH, Rr), "sun": sun,
            "solar": solar, "solar_score": solar_score}

def main():
    if not key():
        print("KMA_SERVICE_KEY 없음 — 건너뜁니다 (GitHub 저장소 Settings → Secrets에 등록하면 다음 실행부터 수집합니다).")
        return 0
    from build_regions import full_regions
    regions = full_regions()
    only = os.environ.get("ONLY_REGIONS")
    if only: regions = [r for r in regions if r["code"] in only.split(",")]
    os.makedirs(os.path.join(ROOT, "data", "weather"), exist_ok=True)
    sun_db, sun_fresh = load_sun()
    try:
        probe()
    except Exception as e:
        LOG["probe"] = repr(e)[:200]
    try:
        run_calibration()
    except Exception as e:
        LOG["calib"] = {"error": repr(e)[:200]}
    lp = os.path.join(ROOT, "data", "solar", "log.json")
    try:
        SOLAR_LOG.update(json.load(open(lp, encoding="utf-8")))
    except Exception:
        pass
    ok = fail = 0
    for reg in regions:
        try:
            data = build_region(reg, sun_db, sun_fresh)
            with open(os.path.join(ROOT, "data", "weather", reg["code"] + ".json"), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            ok += 1
        except Exception as e:
            fail += 1
            LOG["errors"].append("%s %s: %s" % (reg["code"], reg["name"], str(e)[:200]))
            if fail >= 5 and ok == 0:
                LOG["errors"].append("연속 실패로 중단 — 접속 실패면 해외(GitHub 서버) 접속 차단, 키 오류면 승인·반영 대기(1~2시간)를 확인하세요.")
                break
    with open(os.path.join(ROOT, "data", "sun.json"), "w", encoding="utf-8") as f:
        json.dump(sun_db, f, ensure_ascii=False, separators=(",", ":"))
    os.makedirs(os.path.dirname(lp), exist_ok=True)
    with open(lp, "w", encoding="utf-8") as f:
        json.dump(SOLAR_LOG, f, ensure_ascii=False, separators=(",", ":"))
    LOG["counts"] = {"ok": ok, "fail": fail, "regions": len(regions)}
    LOG["base"] = BASES[BASE_OK["i"]] if BASE_OK["i"] is not None else "접속 안 됨"
    LOG["finished"] = dt.datetime.now(KST).isoformat(timespec="minutes")
    LOG["errors"] = LOG["errors"][:40]
    with open(os.path.join(ROOT, "data", "weather", "_status.json"), "w", encoding="utf-8") as f:
        json.dump(LOG, f, ensure_ascii=False, indent=1)
    print(json.dumps(LOG, ensure_ascii=False, indent=1))
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
