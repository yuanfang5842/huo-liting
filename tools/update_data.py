#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
活力婷 · 定时数据生成器
- 医药要闻：GDELT 全球媒体监测，按三大分类直接归类
- 投资机会：GDELT 金融分板块查询，按板块打标签（同一稳定可达源，规避失效 RSS）
生成 assets/data/news.json 与 assets/data/invest.json，由 GitHub Actions 提交回仓库。
PWA 读取同域 JSON，规避浏览器跨域 / 网络墙问题，手机端稳定显示真实数据。
"""
import json
import os
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWS_PATH = os.path.join(ROOT, "assets", "data", "news.json")
INVEST_PATH = os.path.join(ROOT, "assets", "data", "invest.json")

UA = {"User-Agent": "Mozilla/5.0 (compatible; HuoLitingBot/1.0)"}

NEWS_CATS = [
    {
        "cat": "国内新药/临床/科研",
        "q": '(新药 OR 临床 OR 医药 OR 研发 OR 创新药 OR 生物制药) sourcecountry:China OR (China pharmaceutical OR Chinese drug OR China biotech OR "China FDA")',
        "max": 12,
    },
    {
        "cat": "海外FDA与全球进展",
        "q": '(FDA OR EMA) (drug OR vaccine OR approves OR approved OR trial) OR domain:fda.gov',
        "max": 12,
    },
    {
        "cat": "政策/医保/行业",
        "q": '(domain:nhsa.gov.cn OR domain:nmpa.gov.cn OR domain:nhc.gov.cn OR domain:gov.cn) OR (pharmaceutical (policy OR industry OR pricing OR market))',
        "max": 12,
    },
]

INVEST_QUERIES = [
    {"tag": "医药", "q": '(pharmaceutical OR biotech OR "China drug" OR vaccine) (market OR stock OR approves OR revenue OR earnings)', "max": 8},
    {"tag": "科技", "q": '(AI OR semiconductor OR chip OR robotics) (stock OR market OR earnings OR IPO)', "max": 8},
    {"tag": "新能源", "q": '(electric vehicle OR lithium OR solar OR renewable) (stock OR market OR earnings)', "max": 8},
    {"tag": "消费", "q": '(consumer OR retail OR luxury) (China market OR earnings OR sales)', "max": 8},
    {"tag": "金融", "q": '(bank OR insurance OR brokerage) (China market OR earnings OR policy)', "max": 8},
    {"tag": "地产基建", "q": '(real estate OR property OR infrastructure) (China market OR policy OR bonds)', "max": 8},
]


def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "ignore")


def fmt_pub(s):
    if not s:
        return ""
    s = s.strip()
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(s)
        if dt:
            return "%d月%d日" % (dt.month, dt.day)
    except Exception:
        pass
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return "%d月%d日" % (dt.month, dt.day)
    except Exception:
        pass
    return s[:10]


def fetch_gdelt(q, max_records=12):
    url = ("https://api.gdeltproject.org/api/v2/doc/doc?query=" + urllib.parse.quote(q) +
           "&mode=ArtList&format=json&maxrecords=%d&sortby=datedesc" % max_records)
    try:
        txt = http_get(url)
        d = json.loads(txt)
        return d.get("articles", []) or []
    except Exception as e:
        print("  [warn] GDELT 拉取失败:", e, file=sys.stderr)
        return []


def build_news():
    grouped = {c["cat"]: [] for c in NEWS_CATS}
    sources = []
    for c in NEWS_CATS:
        arts = fetch_gdelt(c["q"], c["max"])
        if arts:
            sources.append("GDELT·" + c["cat"])
        for a in arts:
            title = (a.get("title") or "").strip()
            if not title:
                continue
            grouped[c["cat"]].append({
                "title": title,
                "src": a.get("domain") or "GDELT",
                "url": a.get("url") or "#",
                "date": fmt_pub(a.get("seendate") or ""),
                "module": c["cat"],
            })
    total = sum(len(v) for v in grouped.values())
    offline = total == 0
    return grouped, sources, offline


def build_invest():
    items = []
    sources = []
    for q in INVEST_QUERIES:
        arts = fetch_gdelt(q["q"], q["max"])
        if arts:
            sources.append("GDELT·" + q["tag"])
        for a in arts:
            title = (a.get("title") or "").strip()
            if not title:
                continue
            items.append({
                "title": title,
                "src": a.get("domain") or "GDELT",
                "url": a.get("url") or "#",
                "date": fmt_pub(a.get("seendate") or ""),
                "tag": q["tag"],
                "desc": "",
            })
    seen = set()
    uniq = []
    for it in items:
        k = it["title"] + it["src"]
        if k in seen:
            continue
        seen.add(k)
        uniq.append(it)
    uniq = uniq[:20]
    offline = len(uniq) == 0
    return uniq, sources, offline


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("  saved:", path)


def main():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    grouped, nsources, n_offline = build_news()
    if n_offline and os.path.exists(NEWS_PATH):
        print("[news] 本次拉取为空，保留已有文件，不覆盖。")
    else:
        save_json(NEWS_PATH, {
            "updated": now,
            "offline": n_offline,
            "sources": nsources or ["GDELT 全球监测"],
            "grouped": grouped,
        })

    iitems, isources, i_offline = build_invest()
    if i_offline and os.path.exists(INVEST_PATH):
        print("[invest] 本次拉取为空，保留已有文件，不覆盖。")
    else:
        save_json(INVEST_PATH, {
            "updated": now,
            "offline": i_offline,
            "sources": isources or ["GDELT 全球监测"],
            "items": iitems,
        })

    print("[done] news.offline=%s invest.offline=%s" % (n_offline, i_offline))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        traceback.print_exc()
        # 任何意外都不应让 GitHub Actions 失败：保留已有数据即可
        sys.exit(0)
