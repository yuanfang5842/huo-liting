#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
活力婷 · 定时数据生成器 (v31)
- 医药要闻：天行数据（国内中文源） + GDELT（国际源）双源结合。
  每个分类 10 条 = 7 条中国国内(含中国台湾) + 3 条国际；跨分类/跨模块全局去重，标题不重复。
- 投资机会：天行财经/国内 + GDELT 国际，固定 7 个行业模块，每模块 5 条 = 4 条中国国内 + 1 条国际英文。
- 国内/国际判定：天行数据全部视为国内中文源；GDELT 以 sourcecountry 为准（China/Taiwan 及 .tw 域名视为国内）。
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

# 天行数据 AppKey（GitHub Actions 通过 Secrets 注入）
TIANXING_KEY = (os.environ.get('TIANXING_API_KEY') or '').strip()
TIANXING_ENDPOINTS = {
    "health": "https://apis.tianapi.com/health/index",
    "guonei": "https://apis.tianapi.com/guonei/index",
    "caijing": "https://apis.tianapi.com/caijing/index",
}

# 国内判定：以 GDELT sourcecountry 为准；台湾(地区)归于国内；无国家信息时以标题语言兜底(中文→国内)
DOMESTIC_COUNTRIES = {'China', 'Taiwan'}
def region_of(a):
    cc = (a.get('sourcecountry') or '').strip()
    if cc in DOMESTIC_COUNTRIES:
        return 'dom'
    dom = (a.get('domain') or '').lower()
    if dom.endswith('.tw') or dom.endswith('.tw.'):
        return 'dom'
    if not cc:
        return 'dom' if is_cjk(a.get('title', '')) else 'intl'
    return 'intl'

# 医药要闻：强医药核心词过滤，防止健康/养生/泛财经内容混入
MED_CORE_KWS = ["药", "临床", "FDA", "EMA", "医保", "集采", "谈判", "目录", "疫苗", "生物", "制药", "医药", "医疗", "健康", "疾病", "医院", "医生", "患者", "疗法", "治疗", "药品", "新药", "中医药", "中成药", "化药", "仿制药", "创新药", "抗体", "ADC", "CAR-T", "mRNA", "PD-1", "双抗", "基因治疗", "罕见病", "孤儿药"]

# 医药要闻三大分类（GDELT 中文优先查询 + 英文兜底）
NEWS_CATS = [
    {
        "cat": "国内新药/临床/科研",
        "q": 'sourcelang:Chinese (新药 OR 临床 OR 创新药 OR 生物医药 OR 临床试验 OR 研发 获批)',
        "q_en": 'sourcelang:English (new drug OR clinical trial OR innovative drug OR biotech OR drug approval)',
        "fallback": '(新药 OR 临床 OR 创新药 OR 生物医药 OR 临床试验)',
        "kws": ["新药", "临床", "创新药", "生物医药", "研发", "获批", "上市", "试验", "疫苗", "管线", "适应症", "双抗", "ADC", "CAR-T", "基因治疗", "生物类似药"],
        "max": 30,
    },
    {
        "cat": "海外FDA与全球进展",
        "q": 'sourcelang:Chinese (FDA OR EMA OR 美国 药 获批 OR 海外 新药 OR 全球 疫苗 OR 欧盟 药品)',
        "q_en": 'sourcelang:English (FDA OR EMA OR drug approval OR orphan drug OR expedited approval)',
        "fallback": '(FDA OR EMA OR 海外 新药 OR 全球 医药)',
        "kws": ["FDA", "EMA", "美国", "欧盟", "海外", "全球", "国际", "辉瑞", "默沙东", "诺华", "罗氏", "强生", "阿斯利康", "礼来", "诺和诺德", "赛诺菲"],
        "max": 30,
    },
    {
        "cat": "政策/医保/行业",
        "q": 'sourcelang:Chinese (医保 OR 集采 OR 医药政策 OR 医疗改革 OR 药品 谈判 OR 中成药 OR 医药 行业)',
        "q_en": 'sourcelang:English (China healthcare OR drug reimbursement OR centralized procurement OR NDRC healthcare)',
        "fallback": '(医保 OR 集采 OR 医药 政策 OR 医疗 改革)',
        "kws": ["医保", "集采", "政策", "医改", "医疗改革", "药品", "谈判", "中成药", "医药", "国家医保", "卫健委", "药监局", "NMPA", "国务院", "医保局", "DRG", "DIP"],
        "max": 30,
    },
]

# 投资机会：固定 7 个行业模块（GDELT 中文优先查询 + 国际英文查询），每模块 5 条 = 4 国内 + 1 国际英文
INVEST_MODULES = [
    {"name": "昨日美股等国外股市表现",
     "q": 'sourcelang:Chinese (美股 OR 道指 OR 纳指 OR 标普 OR 美股 收评 OR 美债 收益率)',
     "q_en": 'sourcelang:English (US stocks OR Dow Jones OR Nasdaq OR S&P 500 OR US market rally)',
     "kws": ["美股", "道指", "纳指", "标普", "美债", "美联储", "华尔街", "股市", "收盘", "三大指数"],
     "fallback": '(美股 OR 道指 OR 纳指 OR 标普)', "max": 12},
    {"name": "半导体产业政策与进展及风险",
     "q": 'sourcelang:Chinese (半导体 OR 芯片 OR 集成电路 OR 光刻机 OR 半导体 政策 OR 半导体 风险)',
     "q_en": 'sourcelang:English (semiconductor OR chip OR integrated circuit OR lithography OR chip ban)',
     "kws": ["半导体", "芯片", "集成电路", "光刻机", "台积电", "中芯", "ASML", "晶圆", "先进制程", "Chiplet", "EDA"],
     "fallback": '(半导体 OR 芯片 OR 集成电路)', "max": 12},
    {"name": "商业航天产业政策与进展",
     "q": 'sourcelang:Chinese (商业航天 OR 卫星互联网 OR 火箭 OR 低空经济 OR 航天 政策)',
     "q_en": 'sourcelang:English (commercial space OR satellite internet OR rocket OR low altitude economy)',
     "kws": ["商业航天", "卫星", "火箭", "低空经济", "航天", "卫星互联网", "空天", "发射", "星链", "遥感"],
     "fallback": '(商业航天 OR 卫星 OR 低空经济)', "max": 12},
    {"name": "新能源产业政策与进展",
     "q": 'sourcelang:Chinese (新能源 OR 光伏 OR 锂电 OR 储能 OR 风电 OR 新能源 政策)',
     "q_en": 'sourcelang:English (new energy OR photovoltaic OR lithium battery OR energy storage OR wind power)',
     "kws": ["新能源", "光伏", "锂电", "储能", "风电", "动力电池", "充电桩", "氢能", "电动车", "宁德时代", "比亚迪"],
     "fallback": '(新能源 OR 光伏 OR 锂电 OR 储能)', "max": 12},
    {"name": "医药行业产业政策与进展",
     "q": 'sourcelang:Chinese (医药 政策 OR 创新药 OR 生物医药 OR 中医药 发展 OR 医药 产业)',
     "q_en": 'sourcelang:English (pharmaceutical OR biotech OR innovative drug OR drug policy OR China pharma)',
     "kws": ["医药", "创新药", "生物医药", "中医药", "医疗器械", "CXO", "仿制药", "医保", "集采", "药企"],
     "fallback": '(医药 政策 OR 创新药 OR 生物医药)', "max": 12},
    {"name": "消费产业政策与进展",
     "q": 'sourcelang:Chinese (消费 政策 OR 促消费 OR 消费 复苏 OR 零售 OR 白酒)',
     "q_en": 'sourcelang:English (consumer policy OR consumption recovery OR retail OR China consumer)',
     "kws": ["消费", "促消费", "零售", "白酒", "家电", "汽车", "文旅", "餐饮", "电商", "直播带货", "内需"],
     "fallback": '(消费 政策 OR 促消费 OR 零售)', "max": 12},
    {"name": "其它重大政策及事件",
     "q": 'sourcelang:Chinese (国务院 OR 政策 发布 OR 重大 事件 OR 央行 OR 发改委 OR 经济 政策)',
     "q_en": 'sourcelang:English (State Council OR PBOC OR NDRC OR China policy OR economic policy)',
     "kws": ["国务院", "央行", "发改委", "经济政策", "财政政策", "货币政策", "降准", "降息", "重大事件", "发布会"],
     "fallback": '(国务院 OR 央行 OR 发改委 OR 经济政策)', "max": 12},
]

PER_MODULE = 5          # 每模块总条数
DOM_PER_MODULE = 4      # 每模块国内条数
INTL_PER_MODULE = 1     # 每模块国际英文条数
NEWS_PER_CAT = 10       # 每分类总条数
DOM_PER_CAT = 7         # 每分类国内条数
INTL_PER_CAT = 3        # 每分类国际条数


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
    # Tianxing: "2021-02-04 05:00"
    try:
        dt = datetime.strptime(s[:10], "%Y-%m-%d")
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


def fetch_tianxing(endpoint, num=50, word=None):
    """调用天行数据接口，返回统一格式的文章列表（全部视为国内中文源）。"""
    if not TIANXING_KEY:
        return []
    base = TIANXING_ENDPOINTS.get(endpoint)
    if not base:
        return []
    url = base + "?key=" + urllib.parse.quote(TIANXING_KEY) + "&num=" + str(num)
    if word:
        url += "&word=" + urllib.parse.quote(word)
    try:
        txt = http_get(url, timeout=25)
        d = json.loads(txt)
        # 天行同时支持旧格式 newslist 与新格式 result.list
        arr = d.get("newslist") or d.get("result", {}).get("list") or []
        out = []
        for it in arr:
            title = (it.get("title") or "").strip()
            if not title:
                continue
            desc = (it.get("description") or it.get("digest") or "").strip()
            out.append({
                "title": title,
                "url": it.get("url") or "#",
                "src": it.get("source") or ("天行·" + endpoint),
                "date": fmt_pub(it.get("ctime") or it.get("pubDate") or ""),
                "desc": desc,
                "dom": True,
                "_from": "tianxing",
            })
        print("  [tianxing] %s -> %d 条" % (endpoint, len(out)), file=sys.stderr)
        return out
    except Exception as e:
        print("  [warn] 天行 %s 失败:" % endpoint, e, file=sys.stderr)
        return []


def matches_kws(title, kws):
    if not title:
        return False
    t = title.lower()
    return any(k in t for k in kws)


def take_unique(items, n, global_seen, domestic, require_kws=None):
    out = []
    for a in items:
        title = (a.get("title") or "").strip()
        if not title:
            continue
        if require_kws and not matches_kws(title, require_kws):
            continue
        if title in global_seen:
            continue  # 跨分类/跨模块全局去重
        global_seen.add(title)
        out.append({
            "title": title,
            "src": a.get("src") or a.get("domain") or "GDELT",
            "url": a.get("url") or "#",
            "date": a.get("date") or fmt_pub(a.get("seendate") or ""),
            "desc": a.get("desc", ""),
            "dom": domestic,   # True=中国国内(含台湾)，False=国际
        })
        if len(out) >= n:
            break
    return out


def build_tianxing_health_pool():
    """预拉取天行健康资讯（仅用于医药要闻），并严格过滤医药核心词。"""
    if not TIANXING_KEY:
        return []
    raw = fetch_tianxing("health", num=80)
    # 标题必须命中至少一个医药核心词，否则视为养生/科普/泛健康内容丢弃
    return [a for a in raw if matches_kws(a.get("title", ""), MED_CORE_KWS)]


def build_tianxing_invest_pool():
    """预拉取天行财经/国内新闻（仅用于投资机会），合并为国内财经源池。"""
    if not TIANXING_KEY:
        return []
    pool = []
    pool += fetch_tianxing("caijing", num=60)
    pool += fetch_tianxing("guonei", num=60)
    return pool


def build_news(global_seen):
    grouped = {c["cat"]: [] for c in NEWS_CATS}
    sources = []

    # 医药要闻国内源：仅天行 health 接口 + 强医药核心词过滤
    tian_pool = build_tianxing_health_pool()
    if tian_pool:
        sources.append("天行数据·健康资讯")

    for c in NEWS_CATS:
        print("[news] querying:", c["cat"], file=sys.stderr)

        # 国内 7 条：优先天行按分类关键词过滤（已保证命中医药核心词）
        dom_from_tian = [a for a in tian_pool if matches_kws(a.get("title", ""), c["kws"])]
        # 天行不足时，用 GDELT 中文优先 + sourcecountry:China 补国内
        gdelt_dom = []
        if len(dom_from_tian) < DOM_PER_CAT:
            pool = fetch_gdelt(c["q"] + " sourcecountry:China", c["max"])
            if not pool and c.get("fallback"):
                pool = fetch_gdelt(c["fallback"] + " sourcecountry:China", c["max"])
            gdelt_dom = [a for a in pool if region_of(a) == "dom"]

        items_dom = take_unique(dom_from_tian + gdelt_dom, DOM_PER_CAT, global_seen, True)

        # 国际 3 条：GDELT 国际英文/中文（该分类的国际查询）
        intl_pool = fetch_gdelt(c["q"], c["max"])
        if not intl_pool and c.get("fallback"):
            # fallback 英文查询去掉中文泛词，避免命中泛财经/加密内容
            intl_pool = fetch_gdelt(c["fallback"], c["max"])
        intl = [a for a in intl_pool if region_of(a) == "intl"]
        if len(intl) < INTL_PER_CAT and c.get("q_en"):
            extra = fetch_gdelt(c["q_en"], c["max"])
            intl += [a for a in extra if region_of(a) == "intl"]
        items_intl = take_unique(intl, INTL_PER_CAT, global_seen, False)

        grouped[c["cat"]] = items_dom + items_intl
        if items_dom or items_intl:
            sources.append("GDELT·" + c["cat"])
        print("[news]", c["cat"], "dom=%d intl=%d" % (len(items_dom), len(items_intl)), file=sys.stderr)

    total = sum(len(v) for v in grouped.values())
    offline = total == 0
    return grouped, sources, offline


def build_invest(global_seen):
    modules = []
    sources = []

    # 投资机会国内源：天行 caijing + guonei（财经/国内新闻）
    tian_pool = build_tianxing_invest_pool()
    if tian_pool:
        sources.append("天行数据·财经/国内")

    for m in INVEST_MODULES:
        print("[invest] querying:", m["name"], file=sys.stderr)

        # 国内 4 条：优先天行按模块关键词过滤
        dom_from_tian = [a for a in tian_pool if matches_kws(a.get("title", ""), m["kws"])]
        # 天行不足时，GDELT 中文优先 + sourcecountry:China
        gdelt_dom = []
        if len(dom_from_tian) < DOM_PER_MODULE:
            pool = fetch_gdelt(m["q"] + " sourcecountry:China", m["max"])
            if len(pool) < DOM_PER_MODULE:
                pool += fetch_gdelt(m["q"], m["max"])
            gdelt_dom = [a for a in pool if region_of(a) == "dom"]

        dom_items = take_unique(dom_from_tian + gdelt_dom, DOM_PER_MODULE, global_seen, True)

        # 国际英文 1 条：GDELT 英文查询
        en_pool = fetch_gdelt(m.get("q_en") or m["q"], m["max"])
        intl_items = take_unique(en_pool, INTL_PER_MODULE, global_seen, False)

        modules.append({"name": m["name"], "items": dom_items + intl_items})
        if dom_items or intl_items:
            sources.append("GDELT·" + m["name"])
        print("[invest]", m["name"], "dom=%d intl=%d" % (len(dom_items), len(intl_items)), file=sys.stderr)

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

    if not TIANXING_KEY:
        print("[warn] 未配置 TIANXING_API_KEY，将只使用 GDELT 源。", file=sys.stderr)

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
