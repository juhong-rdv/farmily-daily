# -*- coding: utf-8 -*-
"""KAMIS(aT 농산물유통정보) Open API로 서울 도매가격(상품·중품)을 받아 시세 이중화용으로 저장합니다.
필요: 환경변수 KAMIS_CERT_KEY, KAMIS_CERT_ID (kamis.or.kr → Open API 신청에서 발급)
출력: kamis-prices.json (가장 최근 거래일), archive-kamis/YYYY-MM-DD.json (날짜별 보관), data/kamis_status.json
가락시장 경락가(garakprice)와는 집계 기준이 달라 prices.json 이력과 섞지 않습니다."""
import json, os, re, sys, time, datetime as dt
import requests

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
KST = dt.timezone(dt.timedelta(hours=9))
NOW = dt.datetime.now(KST)
URL = "https://www.kamis.or.kr/service/price/xml.do"
CATS = {"100": "식량작물", "200": "채소류", "400": "과일류"}

# 이력(prices.json priority_display) 표기와 KAMIS 품목·품종 대응 (상품 등급만)
PRIORITY_RULES = [
    ("오이(백다다기)", "오이", ["다다기"]),
    ("토마토", "토마토", None),
    ("방울토마토", "방울토마토", None),
    ("파프리카(빨강)", "파프리카", ["빨강", "적색", "파프리카"]),
    ("애호박", "호박", ["애호박"]),
    ("풋고추(일반)", "풋고추", ["풋고추"]),
    ("상추", "상추", ["청"]),
    ("배추", "배추", None),
    ("무", "무", None),
]

def num(v):
    v = str(v or "").replace(",", "").strip()
    try:
        return int(float(v)) if v not in ("", "-") else None
    except ValueError:
        return None

def fetch(day, cat):
    p = {"action": "dailyPriceByCategoryList", "p_product_cls_code": "02", "p_country_code": "1101",
         "p_regday": day.isoformat(), "p_convert_kg_yn": "N", "p_item_category_code": cat,
         "p_cert_key": os.environ["KAMIS_CERT_KEY"].strip(), "p_cert_id": os.environ["KAMIS_CERT_ID"].strip(),
         "p_returntype": "json"}
    last = None
    for i in range(3):
        try:
            r = requests.get(URL, params=p, timeout=25, headers={"User-Agent": "farmily-daily-data/1.0"})
            j = r.json()
            data = j.get("data")
            if isinstance(data, dict):
                if str(data.get("error_code", "000")) not in ("000", ""):
                    return [], "error_code %s" % data.get("error_code")
                it = data.get("item") or []
                return (it if isinstance(it, list) else [it]), None
            return [], "data=%s" % str(data)[:60]  # 자료 없음은 ["001"] 형태로 옴
        except Exception as e:
            last = repr(e)[:160]
            time.sleep(2 * (i + 1))
    return [], last

def norm(it):
    prev = {}
    for n in range(2, 8):
        lab, val = it.get("day%d" % n), num(it.get("dpr%d" % n))
        if lab and val is not None: prev[re.sub(r"\s+", " ", str(lab))] = val
    return {"item": it.get("item_name"), "kind": it.get("kind_name"), "rank": it.get("rank"),
            "unit": it.get("unit"), "price": num(it.get("dpr1")), "day1": it.get("day1"), "prev": prev}

def main():
    st = {"run": NOW.isoformat(timespec="minutes"), "errors": []}
    if not os.environ.get("KAMIS_CERT_KEY") or not os.environ.get("KAMIS_CERT_ID"):
        print("KAMIS_CERT_KEY / KAMIS_CERT_ID 없음 — 건너뜁니다.")
        return 0
    found = None
    for back in range(0, 6):  # 오늘부터 거꾸로, 가격이 실린 가장 최근 거래일 찾기
        day = (NOW - dt.timedelta(days=back)).date()
        rows = []
        for cat in CATS:
            its, err = fetch(day, cat)
            if err: st["errors"].append("%s %s: %s" % (day, cat, err))
            rows += [dict(norm(x), cat=CATS[cat]) for x in its]
            time.sleep(0.3)
        rows = [r for r in rows if r["price"] is not None and r["rank"] in ("상품", "중품")]
        if len(rows) >= 10:
            found = (day, rows); break
    if not found:
        st["result"] = "자료 없음"
        json.dump(st, open(os.path.join(ROOT, "data", "kamis_status.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(json.dumps(st, ensure_ascii=False, indent=1))
        return 1
    day, rows = found
    pri = []
    for name, item, kinds in PRIORITY_RULES:
        cand = [r for r in rows if r["rank"] == "상품" and r["item"] == item and
                (kinds is None or any(k in (r["kind"] or "") for k in kinds))]
        if item == "토마토":
            cand = [r for r in cand if "방울" not in (r["kind"] or "") and "대추" not in (r["kind"] or "")]
        if item == "풋고추":
            cand = [r for r in cand if not any(x in (r["kind"] or "") for x in ("청양", "꽈리", "오이맛", "홍"))]
        if cand:
            c = cand[0]
            pri.append({"name": name, "kamis_item": c["item"], "kamis_kind": c["kind"], "unit": c["unit"],
                        "price": c["price"], "prev": c["prev"]})
    out = {"note": "KAMIS 서울 도매가격(가락시장 등 서울 도매 평균, aT 농산물유통정보). 가락시장 경락가 상등급(garakprice)과 집계 기준이 달라 prices.json 이력과 섞지 않습니다. prev의 키는 KAMIS가 붙인 비교 시점 이름(1일전·1주일전·1개월전·1년전·평년 등)입니다.",
           "date": day.isoformat(), "source": "KAMIS 서울 도매(상품·중품)", "fetched": NOW.isoformat(timespec="minutes"),
           "priority": pri, "items": rows}
    os.makedirs(os.path.join(ROOT, "archive-kamis"), exist_ok=True)
    for path in (os.path.join(ROOT, "kamis-prices.json"), os.path.join(ROOT, "archive-kamis", day.isoformat() + ".json")):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    st.update(result="ok", date=day.isoformat(), items=len(rows), priority=[p["name"] for p in pri])
    json.dump(st, open(os.path.join(ROOT, "data", "kamis_status.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(st, ensure_ascii=False, indent=1))
    return 0

if __name__ == "__main__":
    sys.exit(main())
