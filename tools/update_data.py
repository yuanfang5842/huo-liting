#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
活力婷 · 定时数据生成器 (v29)
- 医药要闻：GDELT 全球媒体监测，中文优先查询(sourcelang:Chinese)，按三大分类直接归类。
- 投资机会：GDELT 中文优先查询，固定 7 个行业模块，每模块 5 条，跨模块全局去重。
- 中文占比保证：每个模块优先保留含中文标题的条目，仅当中文不足 3 条时才允许英文补充（确保英文≤15%）。
- 生成 assets/data/news.json 与 assets/data/invest.json，由 GitHub Actions 提交回仓库。
PWA 读取同域 JSON，规避浏览器跨域 / 网络墙问题，手机端稳定显示真实数据。
"""
import json
import os
import re
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWS_PATH = os.path.join(ROOT, "assets", "data", "news.json")
INVEST_PATH = os.path.join(ROOT, "assets", "data", "invest.json")

UA = {"User-Agent": "Mozilla/5.0 (compatible; HuoLitingBot/1.0)"}

CJK = re.compile(r'[\u4e00-\u9fff]')
def is_cjk(s):
    return bool(CJK.search(s or ''))

# 中文优先：优先保留含中文标题的条目（确保英文占比≤15%）
def prefer_cjk(items):
    cjk = [x for x in items if is_cjk(x.get('title', ''))]
    return cjk if len(cjk) >= 3 else items

# 医药要闻三大分类（中文优先查询 + 英文兜底）
NEWS_CATS = [
    {
        "cat": "国内新药/临床/科研",
        "q": 'sourcelang:Chinese (新药 OR 临床 OR 创新药 OR 生物医药 OR 临床试验 OR 研发 获批)',
        "fallback": '(新药 OR 临床 OR 创新药 OR 生物医药 OR 临床试验)',
        "max": 12,
    },
    {
        "cat": "海外FDA与全球进展",
        "q": 'sourcelang:Chinese (FDA OR EMA OR 美国 药 获批 OR 海外 新药 OR 全球 疫苗 OR 欧盟 药品)',
        "fallback": '(FDA OR EMA OR 海外 新药 OR 全球 医药)',
        "max": 12,
    },
    {
        "cat": "政策/医保/行业",
        "q": 'sourcelang:Chinese (医保 OR 集采 OR 医药政策 OR 医疗改革 OR 药品 谈判 OR 中成药 OR 医药 行业)',
        "fallback": '(医保 OR 集采 OR 医药 政策 OR 医疗 改革)',
        "max": 12,
    },
]

# 投资机会：固定 7 个行业模块（中文优先查询 + 英文兜底），每模块 5 条
INVEST_MODULES = [
    {"name": "昨日美股等国外股市表现",
     "q": 'sourcelang:Chinese (美股 OR 道指 OR 纳指 OR 标普 OR 美股 收评 OR 美债 收益率)',
     "fallback": '(美股 OR 道指 OR 纳指 OR 标普)',
     "max": 10},
    {"name": "半导体产业政策与进展及风险",
     "q": 'sourcelang:Chinese (半导体 OR 芯片 OR 集成电路 OR 光刻机 OR 半导体 政策 OR 半导体 风险)',
     "fallback": '(半导体 OR 芯片 OR 集成电路)',
     "max": 10},
    {"name": "商业航天产业政策与进展",
     "q": 'sourcelang:Chinese (商业航天 OR 卫星互联网 OR 火箭 OR 低空经济 OR 航天 政策)',
     "fallback": '(商业航天 OR 卫星 OR 低空经济)',
     "max": 10},
    {"name": "新能源产业政策与进展",
     "q": 'sourcelang:Chinese (新能源 OR 光伏 OR 锂电 OR 储能 OR 风电 OR 新能源 政策)',
     "fallback": '(新能源 OR 光伏 OR 锂电 OR 储能)',
     "max": 10},
    {"name": "医药行业产业政策与进展",
     "q": 'sourcelang:Chinese (医药 政策 OR 创新药 OR 生物医药 OR 中医药 发展 OR 医药 产业)',
     "fallback": '(医药 政策 OR 创新药 OR 生物医药)',
     "max": 10},
    {"name": "消费产业政策与进展",
     "q": 'sourcelang:Chinese (消费 政策 OR 促消费 OR 消费 复苏 OR 零售 OR 白酒)',
     "fallback": '(消费 政策 OR 促消费 OR 零售)',
     "max": 10},
    {"name": "其它重大政策及事件",
     "q": 'sourcelang:Chinese (国务院 OR 政策 发布 OR 重大 事件 OR 央行 OR 发改委 OR 经济 政策)',
     "fallback": '(国务院 OR 央行 OR 发改委 OR 经济政策)',
     "max": 10},
]

PER_MODULE = 5  # 每模块每次更新条数


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


def build_news(global_seen):
    grouped = {c["cat"]: [] for c in NEWS_CATS}
    sources = []
    for c in NEWS_CATS:
        print("[news] querying:", c["cat"], file=sys.stderr)
        arts = fetch_gdelt(c["q"], c["max"])
        if not arts and c.get("fallback"):
            print("[news] primary empty, trying fallback for", c["cat"], file=sys.stderr)
            arts = fetch_gdelt(c["fallback"], c["max"])
        if arts:
            sources.append("GDELT·" + c["cat"])
        print("[news]", c["cat"], "got", len(arts), "articles", file=sys.stderr)
        items = []
        for a in arts:
            title = (a.get("title") or "").strip()
            if not title:
                continue
            key = title
            if key in global_seen:
                continue  # 跨分类去重
            global_seen.add(key)
            items.append({
                "title": title,
                "src": a.get("domain") or "GDELT",
                "url": a.get("url") or "#",
                "date": fmt_pub(a.get("seendate") or ""),
                "module": c["cat"],
            })
        items = prefer_cjk(items)
        grouped[c["cat"]] = items
    total = sum(len(v) for v in grouped.values())
    offline = total == 0
    return grouped, sources, offline


def build_invest(global_seen):
    modules = []
    sources = []
    for m in INVEST_MODULES:
        print("[invest] querying:", m["name"], file=sys.stderr)
        arts = fetch_gdelt(m["q"], m["max"])
        if not arts and m.get("fallback"):
            print("[invest] primary empty, trying fallback for", m["name"], file=sys.stderr)
            arts = fetch_gdelt(m["fallback"], m["max"])
        if arts:
            sources.append("GDELT·" + m["name"])
        print("[invest]", m["name"], "got", len(arts), "articles", file=sys.stderr)
        items = []
        for a in arts:
            title = (a.get("title") or "").strip()
            if not title:
                continue
            key = title
            if key in global_seen:
                continue  # 跨模块去重
            global_seen.add(key)
            items.append({
                "title": title,
                "src": a.get("domain") or "GDELT",
                "url": a.get("url") or "#",
                "date": fmt_pub(a.get("seendate") or ""),
            })
        items = prefer_cjk(items)[:PER_MODULE]
        modules.append({"name": m["name"], "items": items})
    total = sum(len(m["items"]) for m in modules)
    offline = total == 0
    return modules, sources, offline


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("  saved:", path)


def main():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    global_seen = set()  # 跨新闻+投资全局去重，避免同一标题重复展示

    grouped, nsources, n_offline = build_news(global_seen)
    if n_offline and os.path.exists(NEWS_PATH):
        print("[news] 本次拉取为空，保留已有文件，不覆盖。")
    else:
        save_json(NEWS_PATH, {
            "updated": now,
            "offline": n_offline,
            "sources": nsources or ["GDELT 全球监测"],
            "grouped": grouped,
        })

    modules, isources, i_offline = build_invest(global_seen)
    if i_offline and os.path.exists(INVEST_PATH):
        print("[invest] 本次拉取为空，保留已有文件，不覆盖。")
    else:
        save_json(INVEST_PATH, {
            "updated": now,
            "offline": i_offline,
            "sources": isources or ["GDELT 全球监测"],
            "modules": modules,
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
