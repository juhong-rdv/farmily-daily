# -*- coding: utf-8 -*-
"""종관기상관측(ASOS) 시간자료를 관측소별로 쌓아 둡니다 (하우스 시뮬레이션 보정·직전 시간 재현용).
필요: 공공데이터포털 '기상청_지상(종관, ASOS) 시간자료 조회서비스' 활용신청 (같은 KMA_SERVICE_KEY 사용).
출력: data/obs/<지점번호>.csv  — tm,ta,hm,ws,wd,rn,icsr,dc10Tca  (최근 KEEP_DAYS일만 유지)
시간자료는 '전날까지' 제공되므로 하루 한 번 전날 자료까지 덧붙입니다."""
import csv, os, datetime as dt

COLS = ["tm", "ta", "hm", "ws", "wd", "rn", "icsr", "dc10Tca"]
KEEP_DAYS = 400
FIRST_DAYS = 35

def path(root, stn):
    return os.path.join(root, "data", "obs", "%s.csv" % stn)

def load(root, stn):
    out = {}
    try:
        with open(path(root, stn), encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                if r.get("tm"): out[r["tm"]] = r
    except FileNotFoundError:
        pass
    return out

def save(root, stn, rows, now):
    cut = (now - dt.timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
    os.makedirs(os.path.dirname(path(root, stn)), exist_ok=True)
    with open(path(root, stn), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        for k in sorted(rows):
            if k[:10] >= cut:
                w.writerow({c: (rows[k].get(c) if rows[k].get(c) is not None else "") for c in COLS})

def update(stn, call, items, now, root, log):
    """처음엔 최근 FIRST_DAYS일, 그다음부터는 마지막 기록 이후~전날 23시까지. 받은 줄 수를 돌려줌."""
    rows = load(root, stn)
    end = (now - dt.timedelta(days=1)).date()
    if rows:
        last = dt.datetime.strptime(max(rows), "%Y-%m-%d %H:%M")
        if last.date() >= end and last.hour >= 23:
            return 0
        start = (last - dt.timedelta(hours=3)).date()
    else:
        start = end - dt.timedelta(days=FIRST_DAYS - 1)
    got, page = 0, 1
    while True:
        body = call("/AsosHourlyInfoService/getWthrDataList", {"pageNo": page, "numOfRows": 999, "dataCd": "ASOS", "dateCd": "HR",
                    "startDt": start.strftime("%Y%m%d"), "startHh": "00", "endDt": end.strftime("%Y%m%d"), "endHh": "23", "stnIds": stn})
        it = items(body)
        if it and "icsr" not in it[0] and not log.get("obs_keys"):
            log["obs_keys"] = sorted(it[0].keys())  # 진단: 항목 이름이 다를 때 확인용
        for r in it:
            if r.get("tm"):
                rows[r["tm"]] = {c: r.get(c, "") for c in COLS}; got += 1
        total = int((body or {}).get("totalCount", 0) or 0)
        if not body or page * 999 >= total: break
        page += 1
    save(root, stn, rows, now)
    return got
