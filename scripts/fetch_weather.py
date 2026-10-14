# -*- coding: utf-8 -*-
"""기상청 공공데이터로 '우리 지역' 카드 데이터를 만듭니다. GitHub Actions에서 실행.
필요: 환경변수 KMA_SERVICE_KEY (공공데이터포털 '일반 인증키(Decoding)' — Encoding 키를 넣어도 자동으로 풀어 씁니다)
활용신청 필요한 API 3종: 기상청_단기예보 조회서비스 / 기상청_중기예보 조회서비스 / 기상청_지상(종관, ASOS) 일자료 조회서비스
출력: data/weather/<code>.json (시군별), data/sun.json (일조 하루 1회 캐시), data/weather/_status.json (실행 기록)"""
import json, os, re, sys, time, datetime as dt
from urllib.parse import unquote
import requests

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
    rows = [(r.get("tm"), r.get("sumSsHr")) for r in items(body)]
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
            "normal": normal, "normal_years": len(sums), "ratio": (round(s / normal * 100) if normal else None)}

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
def build_region(reg, sun_db, sun_fresh):
    base, rows = get_short(reg["nx"], reg["ny"])
    by = {}
    tmn, tmx = {}, {}
    for it in rows:
        d, t, c, v = it["fcstDate"], it["fcstTime"], it["category"], it["fcstValue"]
        key_ = d + t
        if c in ("TMP", "REH", "PCP", "POP"):
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
        sid = str(s["id"])
        if sid not in _sun_tried and (sid not in sun_db["stations"] or sun_db["stations"][sid] is None):
            _sun_tried.add(sid)
            try:
                sun_db["stations"][sid] = sun_for_station(s["id"])
            except Exception as e:
                LOG["errors"].append("ASOS %s: %s" % (sid, e)); sun_db["stations"][sid] = None
        v = sun_db["stations"].get(sid)
        if v:
            sun = dict(v, stn=s["name"], km=s["km"]); break
    return {"code": reg["code"], "sido": reg["sido"], "name": reg["name"],
            "updated": NOW.isoformat(timespec="minutes"), "short_base": base,
            "h0": h0, "T": T, "RH": RH, "R": Rr, "P": P,
            "days": out_days[:11], "risk": risk(T, RH, Rr), "sun": sun}

def main():
    if not key():
        print("KMA_SERVICE_KEY 없음 — 건너뜁니다 (GitHub 저장소 Settings → Secrets에 등록하면 다음 실행부터 수집합니다).")
        return 0
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
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
