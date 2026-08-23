#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
活力婷 · 定时数据生成器 (v47)
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
     "kws": ["美股", "道指", "纳指", "标普", "美债", "美联储", "华尔街", "股市", "收盘", "三大指数"],
     "kws_en": ["stock market", "dow jones", "nasdaq", "s&p", "wall street", "federal reserve", "rate", "stocks", "equities"],
     "max": 12},
    {"name": "半导体产业政策与进展及风险",
     "q": 'sourcelang:Chinese (半导体 OR 芯片 OR 集成电路 OR 光刻机 OR 半导体 政策)',
     "q_en": 'sourcelang:English (semiconductor OR chip OR integrated circuit OR lithography OR chip policy)',
     "kws": ["半导体", "芯片", "集成电路", "光刻机", "台积电", "中芯", "晶圆", "先进制程"],
     "kws_en": ["semiconductor", "chip", "tsmc", "asml", "foundry", "lithography", "wafer"],
     "max": 12},
    {"name": "商业航天产业政策与进展",
     "q": 'sourcelang:Chinese (商业航天 OR 卫星互联网 OR 火箭 OR 低空经济 OR 航天 政策)',
     "q_en": 'sourcelang:English (commercial space OR satellite internet OR rocket OR space policy)',
     "kws": ["商业航天", "卫星", "火箭", "低空经济", "航天", "卫星互联网", "发射", "星链"],
     "kws_en": ["space", "rocket", "satellite", "spacex", "launch", "orbit"],
     "max": 12},
    {"name": "新能源产业政策与进展",
     "q": 'sourcelang:Chinese (新能源 OR 光伏 OR 锂电 OR 储能 OR 风电 OR 新能源 政策)',
     "q_en": 'sourcelang:English (new energy OR photovoltaic OR lithium battery OR energy storage OR EV policy)',
     "kws": ["新能源", "光伏", "锂电", "储能", "风电", "动力电池", "充电桩", "氢能", "电动车"],
     "kws_en": ["solar", "battery", "lithium", "energy storage", "ev", "wind", "photovoltaic"],
     "max": 12},
    {"name": "医药行业产业政策与进展",
     "q": 'sourcelang:Chinese (医药 政策 OR 创新药 OR 生物医药 OR 中医药 发展 OR 医药 产业)',
     "q_en": 'sourcelang:English (pharmaceutical policy OR biotech industry OR China pharma OR drug policy)',
     "kws": ["医药", "创新药", "生物医药", "中医药", "医疗器械", "仿制药", "医保", "集采"],
     "kws_en": ["pharma", "biotech", "drug", "fda", "clinical", "innovative drug"],
     "max": 12},
    {"name": "消费产业政策与进展",
     "q": 'sourcelang:Chinese (消费 政策 OR 促消费 OR 消费 复苏 OR 零售 OR 白酒)',
     "q_en": 'sourcelang:English (consumer policy OR consumption recovery OR retail OR China consumer)',
     "kws": ["消费", "促消费", "零售", "白酒", "家电", "汽车", "文旅", "餐饮", "电商"],
     "kws_en": ["consumer", "retail", "spending", "ecommerce", "shopping"],
     "max": 12},
    {"name": "其它重大政策及事件",
     "q": 'sourcelang:Chinese (国务院 OR 政策 发布 OR 重大 事件 OR 央行 OR 发改委 OR 经济 政策)',
     "q_en": 'sourcelang:English (State Council OR PBOC OR NDRC OR China policy OR economic policy)',
     "kws": ["国务院", "央行", "发改委", "经济政策", "财政政策", "货币政策", "降准", "降息"],
     "kws_en": ["policy", "pboc", "state council", "economic", "stimulus", "monetary"],
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


# GDELT 请求限速：两次请求至少间隔 2 秒，降低 429 触发率（Actions 服务器 IP 易被限流）
_LAST_GDELT_REQ = [0.0]


def fetch_gdelt(q, max_records=12, retries=1):
    """从 GDELT 拉取文章。失败时自动重试（指数退避），429 限流时睡长一点。
    返回的 articles 列表；连续失败返回空列表。
    v46：加 2 秒请求间隔，降低 429。
    """
    import time as _time
    # 请求间隔：距离上次请求 < 2s 时补齐
    elapsed = _time.time() - _LAST_GDELT_REQ[0]
    if elapsed < 2.0:
        _time.sleep(2.0 - elapsed)
    url = ("https://api.gdeltproject.org/api/v2/doc/doc?query=" + urllib.parse.quote(q) +
           "&mode=ArtList&format=json&maxrecords=%d&sortby=datedesc" % max_records)
    last_err = None
    for attempt in range(retries + 1):
        try:
            _LAST_GDELT_REQ[0] = _time.time()
            txt = http_get(url, timeout=18)
            d = json.loads(txt)
            arts = d.get("articles", []) or []
            print("  [gdelt] q=%s -> %d 条" % (q[:60], len(arts)), file=sys.stderr)
            return arts
        except Exception as e:
            last_err = e
            msg = str(e)
            # 429 限流时睡久一点（限流窗口通常 1 分钟）
            is_rate = "429" in msg or "Too Many" in msg
            backoff = 5 * (attempt + 1) if is_rate else 2 ** attempt  # 5/10/15s or 1/2/4s
            print("  [warn] GDELT 拉取失败 (attempt %d/%d, backoff=%ds): %s" %
                  (attempt + 1, retries + 1, backoff, msg[:80]), file=sys.stderr)
            if attempt < retries:
                _time.sleep(backoff)
    print("  [error] GDELT 全部重试失败，返回空。query=%s" % q[:80], file=sys.stderr)
    return []


def fetch_tianxing(endpoint, num=50, word=None, retries=2):
    """调用天行数据接口，返回统一格式的文章列表（全部视为国内中文源）。
    重试 2 次（每次超时 25s），429 限流时退避 5/10s。
    v46：兼容更多返回格式；返回空时打印原始 JSON 前 300 字符（定位天行真实返回结构）。
    """
    import time as _time
    if not TIANXING_KEY:
        print("  [tianxing] %s -> 0 条（未配置 KEY）" % endpoint, file=sys.stderr)
        return []
    base = TIANXING_ENDPOINTS.get(endpoint)
    if not base:
        return []
    url = base + "?key=" + urllib.parse.quote(TIANXING_KEY) + "&num=" + str(num)
    if word:
        url += "&word=" + urllib.parse.quote(word)
    last_err = None
    for attempt in range(retries + 1):
        try:
            txt = http_get(url, timeout=25)
            d = json.loads(txt)
            code = d.get("code")
            if code and str(code) != "200":
                tx_err = {
                    110: "接口不存在或未开通", 120: "没有使用权限", 130: "请求过于频繁",
                    150: "当天免费额度已用尽", 210: "AppKey 错误/不存在", 230: "API密钥无效",
                    240: "AppKey 被封禁",
                }.get(int(code), "未知错误")
                print("  [warn] 天行 %s 返回错误码 %s（%s）: %s" %
                      (endpoint, code, tx_err, d.get("msg", "")), file=sys.stderr)
                return []
            # 兼容多种返回格式：newslist / result.list / result.newslist / result.data / data.list
            arr = (d.get("newslist")
                   or d.get("result", {}).get("list")
                   or d.get("result", {}).get("newslist")
                   or d.get("result", {}).get("data")
                   or d.get("data", {}).get("list")
                   or [])
            if isinstance(arr, dict):
                arr = arr.get("list") or arr.get("newslist") or []
            out = []
            for it in arr:
                if not isinstance(it, dict):
                    continue
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
            if not out:
                # 返回空时打印原始 JSON 片段，定位天行真实返回结构
                print("  [tianxing-debug] %s 返回空，原始 JSON 前300字符: %s" %
                      (endpoint, txt[:300].replace("\n", " ")), file=sys.stderr)
            print("  [tianxing] %s -> %d 条" % (endpoint, len(out)), file=sys.stderr)
            return out
        except Exception as e:
            last_err = e
            msg = str(e)
            is_rate = "429" in msg or "Too Many" in msg
            backoff = 5 * (attempt + 1) if is_rate else 3 ** attempt
            print("  [warn] 天行 %s 失败 (attempt %d/%d, backoff=%ds): %s" %
                  (endpoint, attempt + 1, retries + 1, backoff, msg[:80]), file=sys.stderr)
            if attempt < retries:
                _time.sleep(backoff)
    return []


def is_junk_domain(domain):
    """过滤明显非新闻的域名。"""
    if not domain:
        return False
    d = domain.lower().lstrip("www.")
    return d in JUNK_DOMAINS or any(j in d for j in JUNK_DOMAINS)


# 单词边界正则（用于英文/数字短关键词，避免 NDA 命中 standards 这种子串误伤）
_WORD_BOUNDARY = r'(?<![a-z0-9])'  # 前不是字母数字
_WORD_END = r'(?![a-z0-9])'         # 后不是字母数字
_ASCII_KW_RE = re.compile(r'^[a-z0-9+\-./]{1,6}$')


def _kw_in_title(kl, t):
    """判断关键词 kl 是否命中标题 t（已 lower）。
    纯 ASCII 短关键词用单词边界匹配防止子串误伤；中文/长关键词用子串匹配。
    """
    if not kl:
        return False
    if _ASCII_KW_RE.match(kl):
        return bool(re.search(_WORD_BOUNDARY + re.escape(kl) + _WORD_END, t))
    return kl in t


def matches_kws(title, kws):
    if not title or not kws:
        return False
    t = title.lower()
    return any(_kw_in_title(k.lower(), t) for k in kws)


def score_kws(title, kws):
    """返回标题命中关键词的种类数（去重）。"""
    if not title or not kws:
        return 0
    t = title.lower()
    return len({k.lower() for k in kws if _kw_in_title(k.lower(), t)})


# 国内/国际综合判定（按内容本身判定，而非依赖 GDELT 的 sourcecountry 字段）
# 实际场景中 GDELT 的 sourcecountry 字段常常错标（如中国企业的英文新闻被标 US），
# 且 sourcecountry:China 过滤会把真正的中文国内源也漏掉，所以改为综合判定。
_CN_HINTS_RE = re.compile(
    r'\b(china|chinese|beijing|shanghai|hong\s*kong|taiwan|shenzhen|guangzhou|prc|mainland)\b',
    re.IGNORECASE
)

def is_domestic(item):
    """综合判定是否国内中文源。判定规则：
    ① 标题含中文 → 国内；
    ② 标题含 China/Chinese/Shanghai/Beijing 等中国关键词 → 国内（中国企业英文新闻）；
    ③ 域名 .cn/.com.cn/.com.tw/.com.hk → 国内；
    ④ GDELT sourcecountry 为 China/Taiwan/Hong Kong/Macao → 国内。
    其余视为国际。
    """
    title = item.get("title", "") or ""
    if is_cjk(title):
        return True
    if _CN_HINTS_RE.search(title):
        return True
    domain = (item.get("domain") or item.get("src") or "").lower()
    if domain.endswith(".cn") or ".com.cn" in domain or ".com.tw" in domain or ".com.hk" in domain or domain.endswith(".tw") or domain.endswith(".hk"):
        return True
    sc = (item.get("sourcecountry", "") or "").upper()
    if sc in ("CHINA", "TAIWAN", "HONG KONG", "MACAU"):
        return True
    return False


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


def take_unique(items, n, global_seen, require_kws=None):
    """从 items 中取出 n 条，要求：不重复、命中 require_kws、非垃圾源。
    dom 字段用 is_domestic() 动态判定，不再依赖调用方传入。
    """
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
            "dom": is_domestic(a),
        })
        if len(out) >= n:
            break
    return out


def build_tianxing_news_pool():
    """预拉取天行健康 + 国内新闻（仅用于医药要闻）。

    天行 health 是健康/医药垂直频道；guonei 是综合国内新闻（需用关键词搜索才拿得到医药新闻）。
    v47：guonei 改用「医药/药品/医保/新药」关键词搜索，而不是拉取全量综合新闻再过滤。
    """
    if not TIANXING_KEY:
        print("  [tianxing] 未配置 TIANXING_API_KEY，跳过天行新闻源", file=sys.stderr)
        return []
    health = fetch_tianxing("health", num=80)
    # 国内新闻：用医药关键词搜索，拿到医药相关政策/新药/医保新闻
    guonei = []
    for kw in ["医药", "药品", "医保", "新药"]:
        guonei += fetch_tianxing("guonei", num=40, word=kw)
    # 去重（按标题）
    seen = set()
    guonei_dedup = []
    for a in guonei:
        t = a.get("title", "")
        if t and t not in seen:
            seen.add(t)
            guonei_dedup.append(a)
    # health 频道：只排除明显养生/健康科普/生活类标题
    NON_MED_HINTS = ["养生", "食疗", "美容", "减肥", "护肤", "睡眠", "运动", "瑜伽", "健身", "心理", "情绪"]
    health_keep = []
    for a in health:
        t = a.get("title", "")
        if matches_kws(t, MED_CORE_KWS):
            health_keep.append(a)
        elif not matches_kws(t, NON_MED_HINTS):
            health_keep.append(a)
    guonei_keep = [a for a in guonei_dedup if matches_kws(a.get("title", ""), MED_CORE_KWS)]
    print("  [tianxing-news] health=%d guonei(raw=%d dedup=%d) -> keep health=%d guonei=%d" %
          (len(health), len(guonei), len(guonei_dedup), len(health_keep), len(guonei_keep)), file=sys.stderr)
    return health_keep + guonei_keep


def build_tianxing_invest_pool():
    """预拉取天行财经 + 国内新闻（仅用于投资机会）。"""
    if not TIANXING_KEY:
        print("  [tianxing] 未配置 TIANXING_API_KEY，跳过天行投资源", file=sys.stderr)
        return []
    caijing = fetch_tianxing("caijing", num=80)
    guonei = fetch_tianxing("guonei", num=60)
    print("  [tianxing-invest] caijing=%d guonei=%d" % (len(caijing), len(guonei)), file=sys.stderr)
    return caijing + guonei


def build_news(global_seen):
    grouped = {c["cat"]: [] for c in NEWS_CATS}
    sources = []

    # 1) 天行国内医药池（主力，天行=国内中文源）
    tian_pool = build_tianxing_news_pool()
    if tian_pool:
        sources.append("天行数据·健康/国内")

    # 2) 每个分类独立查询 GDELT，按语义归类。
    #    不再按 sourcecountry:China 死过滤（GDELT 实际返回的多为英文标题的中国新闻），
    #    最终国内/国际由 is_domestic() 动态判定（标题中文/China 关键词/.cn 域名 → 国内）。
    #    优先 q_en（英文数据源丰富，能稳定拉到数据），中文 q 作为补充。
    raw_by_cat = {}
    for c in NEWS_CATS:
        cat = c["cat"]
        pool = []
        # 1) 优先 q_en（英文数据源最丰富，实测能拉到 4+ 条）
        if c.get("q_en"):
            pool += fetch_gdelt(c["q_en"], c["max"])
        # 2) 不足时用 q（中文）补充
        if len(pool) < DOM_PER_CAT + INTL_PER_CAT:
            pool += fetch_gdelt(c["q"], c["max"])
        # 3) 再不足用宽泛 fallback 兜底
        if len(pool) < DOM_PER_CAT + INTL_PER_CAT and c.get("fallback"):
            pool += fetch_gdelt(c["fallback"], c["max"])
        norm = []
        for a in pool:
            a = normalize_gdelt(a)
            if a and matches_kws(a["title"], MED_CORE_KWS):
                norm.append(a)
        raw_by_cat[cat] = norm
        print("  [news-raw] %s raw=%d -> kept=%d" %
              (cat, len(pool), len(norm)), file=sys.stderr)

    # 按标题关键词得分把每条候选归到最佳分类（GDELT 英文池）
    best_by_cat = {c["cat"]: [] for c in NEWS_CATS}
    for cat, items in raw_by_cat.items():
        for a in items:
            best = max(NEWS_CATS, key=lambda c: score_kws(a["title"], c["kws"]))
            best_by_cat[best["cat"]].append(a)

    # 天行国内池也按语义归到最佳分类（而不是只按分类关键词硬匹配，避免漏掉）
    tian_best_by_cat = {c["cat"]: [] for c in NEWS_CATS}
    for a in tian_pool:
        best_score = -1
        best_cat = NEWS_CATS[0]["cat"]
        for c in NEWS_CATS:
            s = score_kws(a["title"], c["kws"])
            if s > best_score:
                best_score = s
                best_cat = c["cat"]
        if best_score == 0:
            # 得分全 0 → 兜底归「政策/医保/行业」（政策类标题多含医保/政策/国务院等）
            best_cat = "政策/医保/行业"
        tian_best_by_cat[best_cat].append(a)

    for c in NEWS_CATS:
        cat = c["cat"]

        # 国内候选：天行语义最佳池 + GDELT 语义最佳池中"国内"条目
        dom_candidates = list(tian_best_by_cat.get(cat, []))
        tian_matched = len(dom_candidates)
        cat_pool = best_by_cat.get(cat, [])
        for a in cat_pool:
            if is_domestic(a) and matches_kws(a["title"], c["kws"]):
                dom_candidates.append(a)
        dom_candidates.sort(key=lambda a: score_kws(a["title"], c["kws"]), reverse=True)
        items_dom = take_unique(dom_candidates, DOM_PER_CAT, global_seen, require_kws=MED_CORE_KWS)

        # 国际候选：从该分类的语义最佳池中取非国内 + 不重复
        intl_candidates = [a for a in cat_pool if not is_domestic(a)]
        intl_candidates.sort(key=lambda a: score_kws(a["title"], c["kws"]), reverse=True)
        items_intl = take_unique(intl_candidates, INTL_PER_CAT, global_seen, require_kws=MED_CORE_KWS)

        grouped[cat] = items_dom + items_intl
        if items_dom or items_intl:
            sources.append("GDELT·" + cat)
        print("[news] %s tian=%d cat_pool=%d dom=%d intl=%d" %
              (cat, tian_matched, len(cat_pool), len(items_dom), len(items_intl)), file=sys.stderr)

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

    # 2) 每个模块独立拉取 q_en（英文，GDELT 数据源最丰富，能稳定拉到数据）
    #    7 模块 × 1 次英文查询 = 7 次
    per_mod_en = {}  # cat_name -> normalized list
    for m in INVEST_MODULES:
        if not m.get("q_en"):
            per_mod_en[m["name"]] = []
            continue
        raw = fetch_gdelt(m["q_en"], m["max"])
        norm = [normalize_gdelt(a) for a in raw if normalize_gdelt(a)]
        per_mod_en[m["name"]] = norm
        print("  [invest-mod-en] %s raw=%d norm=%d" %
              (m["name"], len(raw), len(norm)), file=sys.stderr)

    # 3) 共享中文池（3 次，覆盖所有模块的中文关键词）
    all_kws = []
    for m in INVEST_MODULES:
        all_kws.extend(m["kws"][:4])
    all_kws = list(dict.fromkeys(all_kws))  # 去重保持顺序
    shared_cn = []
    chunk = 8
    for i in range(0, len(all_kws), chunk):
        part = all_kws[i:i + chunk]
        shared_cn += fetch_gdelt("sourcelang:Chinese (" + " OR ".join(part) + ")", 20)
    shared_cn_norm = [normalize_gdelt(a) for a in shared_cn if normalize_gdelt(a)]
    print("  [invest-shared-cn] raw=%d -> norm=%d" % (len(shared_cn), len(shared_cn_norm)), file=sys.stderr)

    # 4) 每个模块：天行 + 模块英文池 + 共享中文池
    for m in INVEST_MODULES:
        name = m["name"]
        kws_cn = m["kws"]
        kws_en = m.get("kws_en", [])
        kws_all = kws_cn + kws_en

        # 候选：天行 + 模块英文池 + 共享中文池（英文标题用 kws_en 匹配，中文标题用 kws_cn 匹配）
        all_candidates = [a for a in tian_pool if matches_kws(a["title"], kws_cn)]
        tian_matched = len(all_candidates)
        for a in per_mod_en.get(name, []):
            if matches_kws(a["title"], kws_all):
                all_candidates.append(a)
        for a in shared_cn_norm:
            if matches_kws(a["title"], kws_cn):
                all_candidates.append(a)

        # 国内：候选中 is_domestic() 判国内（用中文关键词排序）
        dom_candidates = [a for a in all_candidates if is_domestic(a)]
        dom_candidates.sort(key=lambda a: score_kws(a["title"], kws_cn), reverse=True)
        dom_items = take_unique(dom_candidates, DOM_PER_MODULE, global_seen)

        # 国际：候选中非国内（用英文关键词排序）
        intl_candidates = [a for a in all_candidates if not is_domestic(a)]
        intl_candidates.sort(key=lambda a: score_kws(a["title"], kws_en) + score_kws(a["title"], kws_cn), reverse=True)
        intl_items = take_unique(intl_candidates, INTL_PER_MODULE, global_seen)

        modules.append({"name": name, "items": dom_items + intl_items})
        if dom_items or intl_items:
            sources.append("GDELT·" + name)
        print("[invest] %s tian=%d per_en=%d shared_cn=%d -> dom=%d intl=%d" %
            (name, tian_matched, len(per_mod_en.get(name, [])),
             len(shared_cn_norm), len(dom_items), len(intl_items)), file=sys.stderr)

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

    # 明确打印天行 KEY 状态（前 4 位 + 长度），方便排查 Secret 是否生效
    if not TIANXING_KEY:
        print("[tianxing-key] ❌ 未配置 TIANXING_API_KEY —— 国内中文源（医药/投资）将完全缺失！", file=sys.stderr)
        print("[tianxing-key] 请在仓库 Settings → Secrets and variables → Actions 添加名为 TIANXING_API_KEY 的 Secret（值=天行 AppKey）。", file=sys.stderr)
    else:
        mask = TIANXING_KEY[:4] + "****" if len(TIANXING_KEY) > 4 else "****"
        print("[tianxing-key] ✅ 已配置（%s，长度 %d）" % (mask, len(TIANXING_KEY)), file=sys.stderr)

    # 医药要闻：始终写入本次真实结果（空则空，绝不回退示例/旧数据）
    grouped, nsources, n_offline = build_news(global_seen)
    # 把天行 KEY 状态塞进 sources 数组首位，让用户手机端状态栏能直接看到（不用看 Actions 日志）
    nsources = list(nsources)
    if TIANXING_KEY:
        nsources.insert(0, "✅ 天行KEY已配置(%s****)" % TIANXING_KEY[:4])
    else:
        nsources.insert(0, "❌ 天行KEY未配置")
    save_json(NEWS_PATH, {
        "updated": now,
        "offline": n_offline,
        "sources": nsources,
        "grouped": grouped,
    })

    # 投资机会：始终写入本次真实结果（空则空，绝不回退示例/旧数据）
    modules, isources, i_offline = build_invest(global_seen)
    isources = list(isources)
    if TIANXING_KEY:
        isources.insert(0, "✅ 天行KEY已配置(%s****)" % TIANXING_KEY[:4])
    else:
        isources.insert(0, "❌ 天行KEY未配置")
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
