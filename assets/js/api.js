/* ============ 活力婷 · 真实接口接入层 ============
 * 天气：Open-Meteo（免费、无需 key、支持 CORS）
 * 新闻：真实 RSS 源（经 codetabs 代理，无需 key）或 天行数据 tianapi（配置 key 后更稳定）
 * 大模型：OpenAI 兼容 Chat Completions（配置 key 后启用）
 * 所有接口均做失败降级，保证 App 始终可用。
 */
window.API = (function () {
  const K = {
    llmBase: 'llmBase', llmKey: 'llmKey', llmModel: 'llmModel', llmProxy: 'llmProxy', llmProxyUrl: 'llmProxyUrl',
    weatherCity: 'weatherCity', newsMode: 'newsMode', tianapiKey: 'tianapiKey',
    ttsOn: 'ttsOn', ttsBase: 'ttsBase', ttsKey: 'ttsKey', ttsModel: 'ttsModel', ttsVoice: 'ttsVoice',
    investMode: 'investMode',
  };

  function cfg(k, d) { return App.get(k, d); }
  function setCfg(k, v) { App.set(k, v); }

  /* 新闻 5 大模块（全局） */
  const MODS = ['行业政策与市场', '新药与管线(研发·获批)', '企业与产品动态', '临床与研究', '趋势与观点'];
  /* 天行数据错误码 → 中文提示 */
  const TIAN_ERR = {
    100: '接口无返回信息', 110: '接口不存在或暂未开通（请在天行控制台开通「国内新闻」接口）',
    120: '没有使用权限', 130: '请求过于频繁，请稍后再试', 140: '路径错误或缺少参数',
    150: '当天免费额度已用尽（可在天行充值，或次日重试）', 210: 'AppKey 错误/不存在（请检查设置里填写的 Key）',
    240: 'AppKey 被封禁',
  };
  /* LLM POST 走代理（用于绕过浏览器跨域 CORS；填写你自己的代理地址，密钥会经过该代理） */
  function proxify(url) {
    const p = cfg(K.llmProxyUrl, '').trim();
    const base = p || 'https://api.codetabs.com/v1/proxy/?quest=';
    return base + encodeURIComponent(url);
  }

  /* ---------- WMO 天气代码 → 中文 ---------- */
  const WMO = {
    0: '晴', 1: '晴间多云', 2: '多云', 3: '阴',
    45: '雾', 48: '雾凇',
    51: '毛毛雨', 53: '毛毛雨', 55: '毛毛雨',
    56: '冻毛雨', 57: '冻毛雨',
    61: '小雨', 63: '中雨', 65: '大雨',
    66: '冻雨', 67: '冻雨',
    71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
    80: '阵雨', 81: '阵雨', 82: '强阵雨',
    85: '阵雪', 86: '强阵雪',
    95: '雷阵雨', 96: '雷阵雨伴雹', 99: '强雷暴',
  };
  function wmo(c) { return WMO[c] !== undefined ? WMO[c] : '未知'; }

  /* ---------- 天气：Open-Meteo ---------- */
  async function fetchWeather(city) {
    city = city || cfg(K.weatherCity, '上海');
    // 1) 地理编码拿经纬度
    let lat = 31.2304, lon = 121.4737, resolved = city;
    try {
      const g = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' +
        encodeURIComponent(city) + '&count=1&language=zh&format=json', { signal: AbortSignal.timeout(8000) });
      const gd = await g.json();
      if (gd && gd.results && gd.results[0]) {
        lat = gd.results[0].latitude; lon = gd.results[0].longitude;
        resolved = gd.results[0].name + (gd.results[0].admin1 ? '·' + gd.results[0].admin1 : '');
      }
    } catch (e) { /* 用默认坐标兜底 */ }

    // 2) 天气预报
    const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,weather_code,relative_humidity_2m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai';
    const r = await fetch(u, { signal: AbortSignal.timeout(9000) });
    const d = await r.json();
    const cur = d.current || {};
    return {
      isReal: true,
      city: resolved,
      temp: Math.round(cur.temperature_2m),
      code: cur.weather_code,
      cond: wmo(cur.weather_code),
      humidity: cur.relative_humidity_2m != null ? cur.relative_humidity_2m : '--',
      uv: cur.uv_index != null ? cur.uv_index : '--',
      min: d.daily ? Math.round(d.daily.temperature_2m_min[0]) : null,
      max: d.daily ? Math.round(d.daily.temperature_2m_max[0]) : null,
    };
  }

  /* ---------- 新闻：真实源 ---------- */
  // 用户列出的源中，有公开 RSS 的接入；无 RSS 的官方站点作为"看原文"外链。
  const RSS_FEEDS = [
    { label: '央视新闻', url: 'https://rss.cctv.com/news.xml' },
    { label: '每日经济新闻', url: 'https://www.nbd.com.cn/rss/' },
    { label: '21世纪经济报道', url: 'https://m.21jingji.com/rss/' },
    { label: '东方财富网', url: 'https://rss.eastmoney.com/stock.xml' },
  ];
  const PROXIES = [
    u => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u),
    u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  ];
  async function fetchViaProxy(target) {
    for (const mk of PROXIES) {
      try {
        const r = await fetch(mk(target), { signal: AbortSignal.timeout(5000) });
        const txt = await r.text();
        if (txt && txt.length > 80 && txt.indexOf('<') >= 0) return txt;
      } catch (e) { /* 试下一个代理 */ }
    }
    return null;
  }

  // 关键词 → 5 大模块
  const CAT_RULES = [
    { mod: '行业政策与市场', kw: ['医保', '集采', '目录', '政策', '卫健委', '药监局', '改革', '支付', '招标', '控费', 'DRG', '集采'] },
    { mod: '新药与管线(研发·获批)', kw: ['新药', '获批', '临床', '试验', '管线', 'FDA', 'IND', 'NDA', '三期', '二期', '一期', '上市', '批件', 'GLP', 'ADC', 'PD-1', 'mRNA'] },
    { mod: '企业与产品动态', kw: ['财报', '融资', '营收', '合作', '收购', '估值', '公司', 'Biotech', '药企', '业绩', '上市', '产品'] },
    { mod: '临床与研究', kw: ['研究', '论文', '柳叶刀', '期刊', '真实世界', '数据', '试验', '临床', '循证'] },
    { mod: '趋势与观点', kw: ['观点', '专栏', '趋势', '观察', '认为', '未来', '将', '解读', '启示'] },
  ];
  function categorize(text) {
    for (const r of CAT_RULES) {
      if (r.kw.some(k => text.indexOf(k) >= 0)) return r.mod;
    }
    return '行业政策与市场';
  }

  function parseFeed(xml, label) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    const nodes = doc.querySelectorAll('item, entry');
    const out = [];
    nodes.forEach(n => {
      const title = (n.querySelector('title')?.textContent || '').trim();
      let link = (n.querySelector('link')?.textContent || n.querySelector('link')?.getAttribute('href') || '').trim();
      if (!link && n.querySelector('link')) { const l = n.querySelector('link'); link = l.getAttribute('href') || l.textContent || ''; }
      const pub = (n.querySelector('pubDate, published, updated')?.textContent || '').trim();
      if (!title) return;
      out.push({ title, src: label, url: link || '#', date: fmtPub(pub), module: categorize(title) });
    });
    return out;
  }
  function fmtPub(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return s.slice(0, 10);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  async function fetchNewsRSS() {
    const items = [];
    await Promise.all(RSS_FEEDS.map(async f => {
      try {
        const xml = await fetchViaProxy(f.url);
        if (xml) parseFeed(xml, f.label).forEach(it => items.push(it));
      } catch (e) { /* 单源失败忽略 */ }
    }));
    // 去重 + 按模块归并
    const seen = new Set();
    const uniq = items.filter(it => { const k = it.title + it.src; if (seen.has(k)) return false; seen.add(k); return true; });
    if (uniq.length === 0) return null;
    const grouped = {}; MODS.forEach(m => grouped[m] = []);
    uniq.forEach(it => { (grouped[it.module] = grouped[it.module] || []).push(it); });
    // 每个模块最多 6 条
    MODS.forEach(m => grouped[m] = (grouped[m] || []).slice(0, 6));
    return { isReal: true, mode: 'rss', grouped, sources: RSS_FEEDS.map(f => f.label) };
  }

  async function fetchNewsTianapi(key) {
    // 天行数据·国内新闻（需开通该接口）。该接口已开启 CORS（Access-Control-Allow-Origin: *），
    // 浏览器可【直接】调用，无需经任何代理。请在控制台开通「国内新闻」接口并填有效 AppKey。
    const raw = 'https://apis.tianapi.com/guonei/index?key=' + encodeURIComponent(key) + '&num=30';
    let txt;
    try {
      const r = await fetch(raw, { signal: AbortSignal.timeout(9000) });
      txt = await r.text();
    } catch (e) {
      throw new Error('NET:天行数据请求失败：浏览器无法连接 apis.tianapi.com（请检查网络；若所在网络限制该域名，请在「设置→今日医药要闻」切回 RSS 模式）');
    }
    let d;
    try { d = JSON.parse(txt); } catch (e) { throw new Error('NET:天行数据返回内容无法解析（网络/代理异常）'); }
    console.log('[活力婷 API] 天行原始响应:', JSON.stringify(d).slice(0, 300));
    // 天行成功格式：{code:200, msg:"success", newslist:[...]}
    // 兼容：newslist 可能在不同字段名或嵌套层级
    const list = d.newslist || d.data || d.list || d.result || [];
    if (d.code !== 200 && d.code !== '200') {
      throw new Error('TIAN:' + (TIAN_ERR[d.code] || ('接口返回 code=' + d.code + ', ' + (d.msg || '未知错误'))));
    }
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error('TIAN:接口返回成功但无新闻数据（请确认已在天行控制台开通「国内新闻」接口）');
    }
    // 按医疗相关度筛选：医保/集采/药/临床/医院等关键词优先
    const MED = ['医', '药', '临床', '医院', '卫生', '健康', '疫苗', '生物', '制药', '处方', '医保', '医改', '疾控', '护士', '患者', '中医', '养生', '治病', '疾病', '医疗'];
    const med = [], other = [];
    list.forEach(it => {
      if (!it.title) return;
      const mod = categorize(it.title);
      const obj = { title: it.title, src: it.source || '天行数据', url: it.url || '#', date: (it.date || '').slice(5, 10).replace('-', '月') + '日', module: mod };
      (MED.some(k => it.title.indexOf(k) >= 0) ? med : other).push(obj);
    });
    const picked = med.concat(other).slice(0, 30);
    const grouped = {}; MODS.forEach(m => grouped[m] = []);
    picked.forEach(o => { (grouped[o.module] = grouped[o.module] || []).push(o); });
    MODS.forEach(m => grouped[m] = (grouped[m] || []).slice(0, 6));
    return { isReal: true, mode: 'tianapi', grouped, sources: ['天行数据·国内新闻（已按医疗相关优先）'] };
  }

  async function fetchNewsGdelt() {
    const q = '医药 医疗 医保 创新药 临床';
    const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(q) +
      '&mode=ArtList&format=json&maxrecords=30&sortby=datedesc';
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
      if (!r.ok) return null;
      const d = await r.json();
      const arts = d.articles || [];
      if (!arts.length) return null;
      const grouped = {}; MODS.forEach(m => grouped[m] = []);
      arts.forEach(a => {
        const t = a.title || '';
        if (!t) return;
        const mod = categorize(t);
        grouped[mod].push({ title: t, src: a.domain || 'GDELT', url: a.url || '#', date: fmtPub(a.seendate || ''), module: mod });
      });
      MODS.forEach(m => grouped[m] = (grouped[m] || []).slice(0, 6));
      const total = MODS.reduce((s, m) => s + grouped[m].length, 0);
      if (!total) return null;
      return { isReal: true, mode: 'gdelt', grouped, sources: ['GDELT 全球媒体监测'] };
    } catch (e) { return null; }
  }

  // 统一入口（带每日缓存，默认优先天行数据）
  async function fetchNews() {
    const mode = cfg(K.newsMode, 'tianapi');  // v11: 默认改天行（RSS 公共代理已全挂）
    if (mode === 'tianapi') {
      const key = cfg(K.tianapiKey, '');
      if (!key) throw new Error('NO_KEY:未填写天行数据 AppKey（请到「设置 → 今日医药要闻」填写）');
      console.log('[活力婷 API] 走天行数据模式拉取新闻...');
      return await fetchNewsTianapi(key); // 可能抛 TIAN:/NET: 错误，由新闻页展示原因
    }
    // RSS 模式：先公开 RSS，再 GDELT，最后兜底天行（仅当用户已配 Key）
    console.log('[活力婷 API] 走 RSS 模式拉取新闻...');
    let res = null;
    try { res = await fetchNewsRSS(); } catch (e) { console.warn('[活力婷 API] RSS 失败:', e); res = null; }
    if (!res) { try { res = await fetchNewsGdelt(); } catch (e) { console.warn('[活力婷 API] GDELT 失败:', e); res = null; } }
    if (!res && cfg(K.tianapiKey, '')) {
      console.log('[活力婷 API] RSS/GDELT 均失败，尝试天行兜底...');
      try { res = await fetchNewsTianapi(cfg(K.tianapiKey, '')); } catch (e) { throw e; }  // v11: 不再静默吞错
    }
    return res;
  }

  /* ---------- 大模型：OpenAI 兼容（稳健版） ---------- */
  async function callLLM(systemPrompt, userPrompt) {
    const base = (cfg(K.llmBase, 'https://api.siliconflow.cn/v1') || '').trim() || 'https://api.siliconflow.cn/v1';
    const key = cfg(K.llmKey, '');
    const model = (cfg(K.llmModel, 'deepseek-ai/DeepSeek-V3') || '').trim() || 'deepseek-ai/DeepSeek-V3';
    if (!key) throw new Error('NO_KEY');
    let url = base.replace(/\/$/, '') + '/chat/completions';
    if (cfg(K.llmProxy, false)) {
      const pu = cfg(K.llmProxyUrl, '').trim();
      if (!pu) throw new Error('CORS:已开启代理但未填写代理地址；请填写你自己的跨域代理（如 https://你的代理/?url=），或直接关闭代理、改用支持浏览器直连的国内接口（硅基流动/月之暗面/DeepSeek）');
      url = pu.replace(/\/?$/, '/') + encodeURIComponent(url);
    }
    const mk = (withFmt) => {
      const b = { model, temperature: 0.6, messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ] };
      if (withFmt) b.response_format = { type: 'json_object' };
      return b;
    };
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = 'Bearer ' + key;
    const one = async (withFmt) => {
      const r = await fetch(url, { method: 'POST', headers, signal: AbortSignal.timeout(30000), body: JSON.stringify(mk(withFmt)) });
      if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('HTTP_' + r.status + (t ? ' ' + t.slice(0, 140) : '')); }
      const d = await r.json();
      return d.choices[0].message.content;
    };
    let raw;
    try {
      raw = await one(true); // 先带 json_object
    } catch (e) {
      const msg = e.message || '';
      if (msg.indexOf('HTTP_400') === 0) {
        try { raw = await one(false); } // 部分接口不支持 response_format，去掉再试
        catch (e2) { throw new Error(e.message); }
      } else if (e instanceof TypeError || /Failed to fetch|NetworkError|Load failed|TypeError/i.test(msg)) {
        // 浏览器跨域(CORS)拦截或网络不通：OpenAI/Anthropic 等海外接口常见
        throw new Error('CORS:浏览器直连被跨域(CORS)拦截，或网络不通。请改用支持浏览器直连的国内接口（硅基流动/月之暗面/DeepSeek），或在「设置→逻辑口语」开启代理并填写你自己的代理地址');
      } else throw e;
    }
    return extractJSON(raw);
  }

  /* 从模型返回中稳健提取 JSON（兼容 ```json 围栏 / 前后多余文字） */
  function extractJSON(s) {
    if (!s) throw new Error('PARSE:模型返回为空');
    let t = String(s).trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const start = t.search(/[{[]/);
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (start >= 0 && end > start) t = t.slice(start, end + 1);
    try { return JSON.parse(t); }
    catch (e) { throw new Error('PARSE:模型返回不是合法 JSON（' + t.slice(0, 50) + '…）'); }
  }

  /* ---------- 今日娱乐：实时娱乐热点（best-effort，失败回退生成内容） ---------- */
  const FUN_FEEDS = [
    { label: '豆瓣电影', url: 'https://www.douban.com/feed/latest_movies' },
    { label: '豆瓣读书', url: 'https://www.douban.com/feed/latest_books' },
  ];
  async function fetchFunRSS() {
    const items = [];
    await Promise.all(FUN_FEEDS.map(async f => {
      try {
        const xml = await fetchViaProxy(f.url);
        if (xml) parseFeed(xml, f.label).forEach(it => items.push(it));
      } catch (e) { /* 单源失败忽略 */ }
    }));
    const seen = new Set();
    const uniq = items.filter(it => { const k = it.title + it.src; if (seen.has(k)) return false; seen.add(k); return true; });
    if (!uniq.length) return null;
    return { isReal: true, mode: 'fun', items: uniq.slice(0, 8), sources: FUN_FEEDS.map(f => f.label) };
  }
  async function fetchFun() {
    try { return await fetchFunRSS(); } catch (e) { return null; }
  }

  /* ---------- 投资机会：实时财经 RSS（best-effort，失败回退示例） ---------- */
  const FIN_FEEDS = [
    { label: '东方财富', url: 'https://rss.eastmoney.com/stock.xml' },
    { label: '财联社', url: 'https://www.cls.cn/rss' },
  ];
  async function fetchInvestRSS() {
    const items = [];
    await Promise.all(FIN_FEEDS.map(async f => {
      try {
        const xml = await fetchViaProxy(f.url);
        if (xml) parseFeed(xml, f.label).forEach(it => items.push(it));
      } catch (e) { /* 单源失败忽略 */ }
    }));
    const seen = new Set();
    const uniq = items.filter(it => { const k = it.title + it.src; if (seen.has(k)) return false; seen.add(k); return true; });
    if (!uniq.length) return null;
    return {
      isReal: true, mode: 'invest', sources: FIN_FEEDS.map(f => f.label),
      items: uniq.slice(0, 12).map(it => ({
        title: it.title, src: it.src, url: it.url || '#', tag: '财经',
        desc: '实时财经动态，点击「看原文」了解更多。',
      })),
    };
  }
  async function fetchInvest() {
    try { return await fetchInvestRSS(); } catch (e) { return null; }
  }

  return {
    cfg, setCfg, K,
    fetchWeather, fetchNews, fetchFun, fetchInvest, callLLM,
  };
})();
