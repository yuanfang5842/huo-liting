#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
活力婷 · 定时数据生成器 (v35)
- 医药要闻：天行数据（国内中文主力源） + GDELT（国际英文补充源）。
  每个分类 10 条 = 7 条中国国内(含中国台湾) + 3 条国际；跨分类/跨模块全局去重。
- 投资机会：天行财经/国内（国内主力源） + GDELT（国际英文补充源）。
  固定 7 个行业模块，每模块 5 条 = 4 条中国国内 + 1 条国际英文。
- 国内/国际判定：
  ① 标题含中文(CJK) → 国内；② .tw / .hk 域名 → 国内；③ sourcecountry 为 China/Taiwan/Hong Kong/Macau → 国内。
  其余（英文标题 + 非中国域名）→ 国际。
- 强相关过滤：医药新闻必须命中 MED_CORE_KWS；投资新闻必须命中对应模块关键词；
  GDELT 中文查询结果必须同时命中分类关键词，防止 sourcecountry=China 的噪音污染。
- 生成 assets/data/news.json 与 assets/data/invest.json，由 GitHub Actions 提交回仓库。
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

# 国内/国际判定改为「按来源区分」（见 build_news / build_invest）：
#   国内 = 天行数据 + GDELT(sourcecountry:China 且标题为中文)
#   国际 = GDELT 英文查询(q_en)
# 不再用「标题含任意中文字 → 国内」的单字符启发式，避免中文报道海外事件被错判国内。


# 医药要闻：强医药核心词过滤，防止健康/养生/泛财经/活动页混入
# 注意：不要用单独一个中文字「药」做关键词——子串匹配会过度命中（药店/药材/药企…都算），
# 导致无关内容被误收。改用更具体的词（药品/医药/新药/制药…）。
MED_CORE_KWS = [
    "临床", "FDA", "EMA", "医保", "集采", "谈判", "目录", "疫苗", "生物", "制药", "医药", "医疗", "疾病",
    "医院", "医生", "患者", "疗法", "治疗", "新药", "中医药", "中成药", "化药", "仿制药", "创新药",
    "抗体", "ADC", "CAR-T", "mRNA", "PD-1", "双抗", "基因治疗", "罕见病", "孤儿药", "IND", "NDA", "GLP", "GMP",
    "药监", "卫健委", "医保局", "DRG", "DIP", "药企", "疗效", "副作用", "适应症"
]

# 垃圾源黑名单：这些域名通常产出活动、博客、奢侈品、酒店等非新闻内容
JUNK_DOMAINS = {
    'thebeijinger.com', 'wenxuecity.com', 'blog.wenxuecity.com',
    'k.sina.com.cn', 'sina.com.cn', 'weibo.com',
}

# 医药要闻三大分类
NEWS_CATS = [
    {
        "cat": "国内新药/临床/科研",
        "q": 'sourcelang:Chinese (新药 OR 临床 OR 创新药 OR 生物医药 OR 临床试验 OR 研发 获批)',
        "q_en": 'sourcelang:English (clinical trial OR new drug development OR biotech research OR drug pipeline)',
        "fallback": '(新药 OR 临床 OR 创新药 OR 生物医药 OR 临床试验)',
        "kws": ["新药", "临床", "创新药", "生物医药", "研发", "获批", "上市", "试验", "疫苗", "管线", "适应症", "双抗", "ADC", "CAR-T", "基因治疗", "生物类似药", "IND", "NDA"],
        "max": 20,
    },
    {
        "cat": "海外FDA与全球进展",
        "q": 'sourcelang:Chinese (FDA OR EMA OR 美国 药 获批 OR 海外 新药 OR 全球 疫苗 OR 欧盟 药品)',
        "q_en": 'sourcelang:English (FDA approval OR EMA approval OR orphan drug OR expedited approval OR breakthrough therapy)',
        "fallback": '(FDA OR EMA OR 海外 新药 OR 全球 医药)',
        "kws": ["FDA", "EMA", "美国", "欧盟", "海外", "全球", "国际", "辉瑞", "默沙东", "诺华", "罗氏", "强生", "阿斯利康", "礼来", "诺和诺德", "赛诺菲", "孤儿药", "加速批准", "突破性疗法"],
        "max": 20,
    },
    {
        "cat": "政策/医保/行业",
        "q": 'sourcelang:Chinese (医保 OR 集采 OR 医药政策 OR 医疗改革 OR 药品 谈判 OR 中成药 OR 医药 行业)',
        "q_en": 'sourcelang:English (China healthcare policy OR drug reimbursement OR centralized procurement OR NMPA OR China pharma policy)',
        "fallback": '(医保 OR 集采 OR 医药 政策 OR 医疗 改革)',
        "kws": ["医保", "集采", "政策", "医改", "医疗改革", "药品", "谈判", "中成药", "医药", "国家医保", "卫健委", "药监局", "NMPA", "国务院", "医保局", "DRG", "DIP", "定价", "目录"],
        "max": 20,
    },
]

# 投资机会：固定 7 个行业模块
INVEST_MODULES = [
    {"name": "昨日美股等国外股市表现",
     "q": 'sourcelang:Chinese (美股 OR 道指 OR 纳指 OR 标普 OR 美股 收评)',
     "q_en": 'sourcelang:English (US stock market OR Dow Jones OR Nasdaq OR S&P 500 OR Wall Street)',
     "kws": ["美股", "道指", "纳指", "标普", "美债", "美联储", "华尔街", "股市", "收盘", "三大指数", "Dow", "Nasdaq", "S&P"],
     "max": 12},
    {"name": "半导体产业政策与进展及风险",
     "q": 'sourcelang:Chinese (半导体 OR 芯片 OR 集成电路 OR 光刻机 OR 半导体 政策)',
     "q_en": 'sourcelang:English (semiconductor OR chip OR integrated circuit OR lithography OR chip policy)',
     "kws": ["半导体", "芯片", "集成电路", "光刻机", "台积电", "中芯", "ASML", "晶圆", "先进制程", "Chiplet", "EDA"],
     "max": 12},
    {"name": "商业航天产业政策与进展",
     "q": 'sourcelang:Chinese (商业航天 OR 卫星互联网 OR 火箭 OR 低空经济 OR 航天 政策)',
     "q_en": 'sourcelang:English (commercial space OR satellite internet OR rocket OR space policy)',
     "kws": ["商业航天", "卫星", "火箭", "低空经济", "航天", "卫星互联网", "空天", "发射", "星链", "遥感"],
     "max": 12},
    {"name": "新能源产业政策与进展",
     "q": 'sourcelang:Chinese (新能源 OR 光伏 OR 锂电 OR 储能 OR 风电 OR 新能源 政策)',
     "q_en": 'sourcelang:English (new energy OR photovoltaic OR lithium battery OR energy storage OR EV policy)',
     "kws": ["新能源", "光伏", "锂电", "储能", "风电", "动力电池", "充电桩", "氢能", "电动车", "宁德时代", "比亚迪"],
     "max": 12},
    {"name": "医药行业产业政策与进展",
     "q": 'sourcelang:Chinese (医药 政策 OR 创新药 OR 生物医药 OR 中医药 发展 OR 医药 产业)',
     "q_en": 'sourcelang:English (pharmaceutical policy OR biotech industry OR China pharma OR drug policy)',
     "kws": ["医药", "创新药", "生物医药", "中医药", "医疗器械", "CXO", "仿制药", "医保", "集采", "药企"],
     "max": 12},
    {"name": "消费产业政策与进展",
     "q": 'sourcelang:Chinese (消费 政策 OR 促消费 OR 消费 复苏 OR 零售 OR 白酒)',
     "q_en": 'sourcelang:English (consumer policy OR consumption recovery OR retail OR China consumer)',
     "kws": ["消费", "促消费", "零售", "白酒", "家电", "汽车", "文旅", "餐饮", "电商", "直播带货", "内需"],
     "max": 12},
    {"name": "其它重大政策及事件",
     "q": 'sourcelang:Chinese (国务院 OR 政策 发布 OR 重大 事件 OR 央行 OR 发改委 OR 经济 政策)',
     "q_en": 'sourcelang:English (State Council OR PBOC OR NDRC OR China policy OR economic policy)',
     "kws": ["国务院", "央行", "发改委", "经济政策", "财政政策", "货币政策", "降准", "降息", "重大事件", "发布会"],
     "max": 12},
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


def is_junk_domain(domain):
    """过滤明显非新闻的域名。"""
    if not domain:
        return False
    d = domain.lower().lstrip("www.")
    return d in JUNK_DOMAINS or any(j in d for j in JUNK_DOMAINS)


def matches_kws(title, kws):
    if not title or not kws:
        return False
    t = title.lower()
    return any(k.lower() in t for k in kws)


def score_kws(title, kws):
    """返回标题命中关键词的种类数（去重）。"""
    if not title or not kws:
        return 0
    t = title.lower()
    return len({k.lower() for k in kws if k.lower() in t})


def normalize_gdelt(a):
    """把 GDELT 返回的文章转换为统一格式。"""
    title = (a.get("title") or "").strip()
    if not title:
        return None
    domain = a.get("domain") or ""
    return {
        "title": title,
        "url": a.get("url") or "#",
        "src": a.get("domain") or "GDELT",
        "date": fmt_pub(a.get("seendate") or ""),
        "desc": "",
        "domain": domain,
        "sourcecountry": a.get("sourcecountry") or "",
    }


def take_unique(items, n, global_seen, domestic, require_kws=None):
    """从 items 中取出 n 条，要求：不重复、命中 require_kws、非垃圾源。"""
    out = []
    for a in items:
        title = (a.get("title") or "").strip()
        if not title:
            continue
        if require_kws and not matches_kws(title, require_kws):
            continue
        if is_junk_domain(a.get("domain") or a.get("src")):
            continue
        if title in global_seen:
            continue
        global_seen.add(title)
        out.append({
            "title": title,
            "src": a.get("src") or a.get("domain") or "GDELT",
            "url": a.get("url") or "#",
            "date": a.get("date") or "",
            "desc": a.get("desc", ""),
            "dom": domestic,
        })
        if len(out) >= n:
            break
    return out


def build_tianxing_news_pool():
    """预拉取天行健康 + 国内新闻（仅用于医药要闻），并严格过滤医药核心词。"""
    if not TIANXING_KEY:
        return []
    raw = fetch_tianxing("health", num=80) + fetch_tianxing("guonei", num=60)
    # 标题必须命中至少一个医药核心词
    return [a for a in raw if matches_kws(a.get("title", ""), MED_CORE_KWS)]


def build_tianxing_invest_pool():
    """预拉取天行财经 + 国内新闻（仅用于投资机会）。"""
    if not TIANXING_KEY:
        return []
    return fetch_tianxing("caijing", num=80) + fetch_tianxing("guonei", num=60)


def build_news(global_seen):
    grouped = {c["cat"]: [] for c in NEWS_CATS}
    sources = []

    # 1) 天行国内医药池（主力，天行=国内中文源）
    tian_pool = build_tianxing_news_pool()
    if tian_pool:
        sources.append("天行数据·健康/国内")

    # 2) 每个分类独立查询，互不抢条目
    #    —— 根治旧版「首分类把相关条目吸干、后续分类全空」的分配 bug
    for c in NEWS_CATS:
        cat = c["cat"]

        # 国内候选：天行按分类关键词匹配 + GDELT 中文 sourcecountry:China（标题须为中文，避免英文中国源误判国内）
        dom_candidates = [a for a in tian_pool if matches_kws(a["title"], c["kws"])]
        gdelt_dom = fetch_gdelt(c["q"] + " sourcecountry:China", c["max"])
        for a in gdelt_dom:
            a = normalize_gdelt(a)
            if a and matches_kws(a["title"], c["kws"]) and matches_kws(a["title"], MED_CORE_KWS) and is_cjk(a["title"]):
                dom_candidates.append(a)
        dom_candidates.sort(key=lambda a: score_kws(a["title"], c["kws"]), reverse=True)
        items_dom = take_unique(dom_candidates, DOM_PER_CAT, global_seen, True, require_kws=MED_CORE_KWS)

        # 国际候选：该分类专属英文查询，标题命中医药核心词且为英文（非中文）
        intl_candidates = []
        pool = []
        if c.get("q_en"):
            pool += fetch_gdelt(c["q_en"], c["max"])
        if len(pool) < INTL_PER_CAT and c.get("fallback"):
            pool += fetch_gdelt(c["fallback"], c["max"])
        for a in pool:
            a = normalize_gdelt(a)
            if a and matches_kws(a["title"], MED_CORE_KWS) and not is_cjk(a["title"]):
                intl_candidates.append(a)
        intl_candidates.sort(key=lambda a: score_kws(a["title"], c["kws"]), reverse=True)
        items_intl = take_unique(intl_candidates, INTL_PER_CAT, global_seen, False, require_kws=MED_CORE_KWS)

        grouped[cat] = items_dom + items_intl
        if items_dom or items_intl:
            sources.append("GDELT·" + cat)
        print("[news] %s dom=%d intl=%d" % (cat, len(items_dom), len(items_intl)), file=sys.stderr)

    total = sum(len(v) for v in grouped.values())
    offline = total == 0
    return grouped, sources, offline


def build_invest(global_seen):
    modules = []
    sources = []

    # 1) 天行财经/国内池（主力）
    tian_pool = build_tianxing_invest_pool()
    if tian_pool:
        sources.append("天行数据·财经/国内")

    # 2) 每个模块独立查询：国内=天行/中文GDELT，国际=模块专属英文查询
    for m in INVEST_MODULES:
        name = m["name"]

        # 国内候选：天行按模块关键词 + GDELT 中文 sourcecountry:China（中文标题）
        dom_candidates = [a for a in tian_pool if matches_kws(a["title"], m["kws"])]
        gdelt_dom = fetch_gdelt(m["q"] + " sourcecountry:China", m["max"])
        if len(gdelt_dom) < DOM_PER_MODULE:
            # 兜底：用模块关键词构造更宽泛的中文查询，避免模块因特定词无结果而空白
            broad = "sourcelang:Chinese (" + " OR ".join(m["kws"][:4]) + ") sourcecountry:China"
            gdelt_dom += fetch_gdelt(broad, m["max"])
        for a in gdelt_dom:
            a = normalize_gdelt(a)
            if a and matches_kws(a["title"], m["kws"]) and is_cjk(a["title"]):
                dom_candidates.append(a)
        dom_candidates.sort(key=lambda a: score_kws(a["title"], m["kws"]), reverse=True)
        dom_items = take_unique(dom_candidates, DOM_PER_MODULE, global_seen, True)

        # 国际英文候选：模块专属 q_en，标题命中模块关键词且为英文（非中文）
        intl_candidates = []
        pool = fetch_gdelt(m.get("q_en") or m["q"], m["max"])
        if len(pool) < INTL_PER_MODULE:
            pool += fetch_gdelt("sourcelang:English (" + " OR ".join(m["kws"][:4]) + ")", m["max"])
        for a in pool:
            a = normalize_gdelt(a)
            if a and matches_kws(a["title"], m["kws"]) and not is_cjk(a["title"]):
                intl_candidates.append(a)
        intl_candidates.sort(key=lambda a: score_kws(a["title"], m["kws"]), reverse=True)
        intl_items = take_unique(intl_candidates, INTL_PER_MODULE, global_seen, False)

        modules.append({"name": name, "items": dom_items + intl_items})
        if dom_items or intl_items:
            sources.append("GDELT·" + name)
        print("[invest] %s dom=%d intl=%d" % (name, len(dom_items), len(intl_items)), file=sys.stderr)

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
    global_seen = set()

    if not TIANXING_KEY:
        print("[warn] 未配置 TIANXING_API_KEY，将只使用 GDELT 源。", file=sys.stderr)

    grouped, nsources, n_offline = build_news(global_seen)
    if n_offline and os.path.exists(NEWS_PATH):
        print("[news] 本次拉取为空，保留已有文件，不覆盖。")
    else:
        save_json(NEWS_PATH, {
            "updated": now,
            "offline": n_offline,
            "sources": nsources,
            "grouped": grouped,
        })

    modules, isources, i_offline = build_invest(global_seen)
    if i_offline and os.path.exists(INVEST_PATH):
        print("[invest] 本次拉取为空，保留已有文件，不覆盖。")
    else:
        save_json(INVEST_PATH, {
            "updated": now,
            "offline": i_offline,
            "sources": isources,
            "modules": modules,
        })


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("[error] 数据生成异常:", e, file=sys.stderr)
        import traceback
        traceback.print_exc()
