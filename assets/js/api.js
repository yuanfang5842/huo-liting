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
    investMode: 'investMode', llmProvider: 'llmProvider',
  };

  function cfg(k, d) { return App.get(k, d); }
  function setCfg(k, v) { App.set(k, v); }

  /* 新闻 5 大模块（全局） */
  const MODS = ['行业政策与市场', '新药与管线', '企业产品动态', '临床研究', '趋势与观点'];
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
    { mod: '新药与管线', kw: ['新药', '获批', '临床', '试验', '管线', 'FDA', 'IND', 'NDA', '三期', '二期', '一期', '上市', '批件', 'GLP', 'ADC', 'PD-1', 'mRNA'] },
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
    // 天行数据·健康经纬（医药专用，需开通该接口）。该接口已开启 CORS（Access-Control-Allow-Origin: *），
    // 浏览器可【直接】调用，无需经任何代理。请在控制台开通「健康经纬」接口并填有效 AppKey。
    // 备选：国内新闻(guonei)返回全品类新闻(含煤炭等非医药内容)，不适合医药要闻场景。
    const raw = 'https://apis.tianapi.com/health/index?key=' + encodeURIComponent(key) + '&num=30';
    let txt;
    try {
      const r = await fetch(raw, { signal: AbortSignal.timeout(9000) });
      txt = await r.text();
    } catch (e) {
      throw new Error('NET:天行数据请求失败：浏览器无法连接 apis.tianapi.com（请检查网络；若所在网络限制该域名，请在「设置→今日医药要闻」切回 RSS 模式）');
    }
    let d;
    try { d = JSON.parse(txt); } catch (e) { throw new Error('NET:天行数据返回内容无法解析（网络/代理异常）'); }
    console.log('[活力婷 API] 天行原始响应:', JSON.stringify(d).slice(0, 500));
    // 天行实际返回格式（v13 实测确认）：
    //   {code:200, msg:"success", result:{curpage:1, allnum:30, newslist:[{...}]}}
    // newslist 嵌套在 result 内！必须逐层提取
    const list = d.newslist
      || (d.result && d.result.newslist)
      || (d.data && Array.isArray(d.data) ? d.data : d.data && d.data.list)
      || (d.list && Array.isArray(d.list) ? d.list : [])
      || [];
    if (d.code !== 200 && d.code !== '200') {
      throw new Error('TIAN:' + (TIAN_ERR[d.code] || ('接口返回 code=' + d.code + ', ' + (d.msg || '未知错误'))));
    }
    if (!Array.isArray(list) || list.length === 0) {
      // 调试：把返回的所有 key 打出来，方便手机端排查
      const keys = Object.keys(d).join(', ');
      const preview = JSON.stringify(d).slice(0, 200);
      throw new Error('TIAN:接口返回成功(code=200)但无新闻数据。返回内容: ' + preview + '（可能原因：①该Key未开通「健康经纬」接口 ②接口返回格式变更 ③请求频率超限）。请到天行控制台确认已开通「健康经纬」');
    }
    // 按医疗相关度分类（health 接口已为医药专类，此处做细分类）
    const med = [], other = [];
    list.forEach(it => {
      if (!it.title) return;
      const mod = categorize(it.title);
      // 解析日期：支持 "2024-08-16" / "08-16 14:30" / "2024年08月16日" 等格式
      let dateStr = '';
      const rawDate = it.date || it.time || it.pubdate || '';
      if (rawDate) {
        const d = rawDate.replace(/年|月/g, '-').replace(/日/g, '').trim();
        if (d.length >= 10) dateStr = d.slice(5, 10).replace('-', '/') + (d.length > 10 ? ' ' + d.slice(11, 16) : '');
        else if (d.length >= 5) dateStr = d.replace('-', '/');
        else dateStr = rawDate;
      }
      // URL 清理：确保是完整链接
      let url = (it.url || it.link || '').trim();
      if (url && !url.startsWith('http') && url !== '#') url = 'https://' + url;
      if (!url) url = '#';
      const obj = { title: it.title, src: it.source || '天行数据', url: url, date: dateStr || '今日', module: mod };
      med.push(obj);  // health 接口全是医药相关，不再分 med/other
    });
    const picked = med.concat(other).slice(0, 30);
    const grouped = {}; MODS.forEach(m => grouped[m] = []);
    picked.forEach(o => { (grouped[o.module] = grouped[o.module] || []).push(o); });
    MODS.forEach(m => grouped[m] = (grouped[m] || []).slice(0, 6));
    return { isReal: true, mode: 'tianapi', grouped, sources: ['天行数据·健康经纬'] };
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

  /* 全网补充源：从官方政策站点（gov.cn 系）抓取「行业政策与市场」要闻。
   * GDELT 支持按域名过滤，可覆盖国家医保局/卫健委/药监局/国务院政策库/上海阳光采购网等。
   * best-effort：CORS 或网络不通时静默跳过，不影响主流程。 */
  async function fetchNewsGdeltPolicy() {
    const domains = ['nhsa.gov.cn', 'nhc.gov.cn', 'nmpa.gov.cn', 'gov.cn', 'samr.gov.cn', 'ybj.sh.gov.cn'];
    const q = domains.map(d => 'domain:' + d).join(' ');
    const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(q) +
      '&mode=ArtList&format=json&maxrecords=25&sortby=datedesc';
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
      if (!r.ok) return null;
      const d = await r.json();
      const arts = d.articles || [];
      if (!arts.length) return null;
      return arts.filter(a => a.title).map(a => ({
        title: a.title, src: a.domain || 'GDELT政策源', url: a.url || '#',
        date: fmtPub(a.seendate || ''), module: '行业政策与市场'
      }));
    } catch (e) { return null; }
  }

  // 统一入口（带每日缓存，默认优先天行数据）
  async function fetchNews() {
    const mode = cfg(K.newsMode, 'tianapi');  // v11: 默认改天行（RSS 公共代理已全挂）
    if (mode === 'tianapi') {
      const key = cfg(K.tianapiKey, '');
      if (!key) throw new Error('NO_KEY:未填写天行数据 AppKey（请到「设置 → 今日医药要闻」填写）');
      console.log('[活力婷 API] 走天行数据模式拉取新闻...');
      let data = await fetchNewsTianapi(key); // 可能抛 TIAN:/NET: 错误，由新闻页展示原因
      // 全网补充：从官方政策站点（医保局/卫健委/药监局/国务院政策库等 gov.cn 系）补充「行业政策与市场」要闻
      try {
        const pol = await fetchNewsGdeltPolicy();
        if (pol && pol.length) {
          data.grouped['行业政策与市场'] = (data.grouped['行业政策与市场'] || []).concat(pol).slice(0, 8);
          data.sources = (data.sources || []).concat(['GDELT·官方政策源(全网监测)']);
        }
      } catch (e) { console.warn('[活力婷 API] 政策源补充失败(忽略):', e.message); }
      return data;
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
    if (cfg(K.llmProvider, '') === 'local') throw new Error('LOCAL_ENGINE:使用免费本地规则引擎（零成本·无需联网）');
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
      // 先拿原始文本，再尝试解析——比直接 r.json() 更稳健，能捕获异常格式
      const rawText = await r.text().catch(() => '');
      // ★ 调试：保存原始响应，出错时可通过 __llmDebug 查看
      window.__llmRawResponse = rawText;
      if (!r.ok) {
        // 常见错误码给出中文提示
        if (r.status === 402) throw new Error('PAYMENT_402:大模型账户余额不足！请到你的大模型平台（硅基流动/DeepSeek等）充值后再试。当前为本地估算模式。');
        if (r.status === 401) throw new Error('AUTH_401:API Key 无效或已过期。请检查「设置→逻辑口语」中的 Key 是否正确。');
        if (r.status === 429) throw new Error('RATE_429:请求太频繁，请稍后再试。');
        throw new Error('HTTP_' + r.status + (rawText ? ' ' + rawText.slice(0, 200) : ''));
      }
      // 尝试解析 JSON，失败时记录原始响应用于排查
      let d;
      try { d = JSON.parse(rawText); } catch (parseErr) {
        console.error('[活力婷 LLM] 响应非 JSON（前200字符）:', rawText.slice(0, 200));
        // ★ 显示调试面板：让用户能看到原始返回内容
        if (window.__llmDebug) window.__llmDebug('=== LLM 原始响应（非 JSON）===\n状态码: ' + r.status + '\nContent-Type: ' + (r.headers.get('content-type') || '未知') + '\n\n前500字符:\n' + rawText.slice(0, 500));
        // 部分代理/网关可能在正常 JSON 外面包了一层，尝试提取
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) try { d = JSON.parse(jsonMatch[0]); } catch (_) { /* 最终放弃 */ }
        if (!d) throw new Error('PARSE:接口返回不是合法 JSON（前100字符：' + rawText.slice(0, 100).replace(/[\r\n]/g, ' ') + '）。可能是接口暂异常或 model 名不匹配，已用本地规则引擎兜底。');
      }
      // 兼容多种 OpenAI 兼容格式的返回结构
      let content = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content)
        || (d.output && d.output.text)
        || (d.result && d.result)
        || '';
      // ★ 关键修复：部分接口（如硅基流动 DeepSeek-V3）可能返回对象而非字符串
      // 此时必须强制转为字符串，否则 extractJSON 里 String(obj) 会变成 "[object Object]" 导致 JSON Parse error
      if (typeof content !== 'string') {
        console.warn('[活力婷 LLM] content 非字符串，类型:', typeof content, '值:', content);
        // ★ 显示调试面板
        if (window.__llmDebug) window.__llmDebug('=== LLM content 类型异常 ===\ntypeof content = ' + typeof content + '\ncontent 值:\n' + JSON.stringify(content).slice(0, 500) + '\n\n完整响应前300字符:\n' + rawText.slice(0, 300));
        try { content = JSON.stringify(content); } catch (_) { content = String(content); }
      }
      if (!content || content.trim() === '') {
        console.warn('[活力婷 LLM] 无法提取内容，原始响应:', rawText.slice(0, 300));
        throw new Error('EMPTY:接口返回了数据但无法提取回复内容（model 可能不支持当前参数）。已用本地规则引擎兜底。');
      }
      return content;
    };
    let raw;
    try {
      raw = await one(true); // 先带 json_object
      console.log('[活力婷 LLM] one() 返回类型:', typeof raw, '长度:', String(raw).length, '前150字符:', String(raw).slice(0, 150));
    } catch (e) {
      const msg = e.message || '';
      if (msg.indexOf('HTTP_400') === 0 || msg.indexOf('PARSE:') === 0 || msg.indexOf('EMPTY:') === 0 || msg.indexOf('JSON Parse error') === 0) {
        // 400=不支持参数；PARSE/EMPTY/JSON Parse=返回格式异常 → 去掉 response_format 再试一次
        console.warn('[活力婷 LLM] 带格式请求失败，尝试不带 response_format 重试:', msg);
        // ★ 显示调试面板（首次失败时）
        if (window.__llmDebug && window.__llmRawResponse) {
          window.__llmDebug('=== 首次请求失败（将重试）===\n错误: ' + msg + '\n\n原始响应前600字符:\n' + window.__llmRawResponse.slice(0, 600));
        }
        try { raw = await one(false); }
        catch (e2) {
          // ★ 重试也失败时显示调试面板
          if (window.__llmDebug) window.__llmDebug('=== 重试（无response_format）也失败了 ===\n首次错误: ' + msg + '\n重试错误: ' + (e2.message || e2) + '\n\n原始响应:\n' + (window.__llmRawResponse || '无'));
          throw new Error(e2.message || e.message);
        }
      } else if (e instanceof TypeError || /Failed to fetch|NetworkError|Load failed|TypeError/i.test(msg)) {
        // 浏览器跨域(CORS)拦截或网络不通：OpenAI/Anthropic 等海外接口常见
        throw new Error('CORS:浏览器直连被跨域(CORS)拦截，或网络不通。请改用支持浏览器直连的国内接口（硅基流动/月之暗面/DeepSeek），或在「设置→逻辑口语」开启代理并填写你自己的代理地址');
      } else throw e;
    }
    return extractJSON(raw);
  }

  /* 从模型返回中稳健提取 JSON（兼容 ```json 围栏 / 前后多余文字 / 对象型 content） */
  function extractJSON(s) {
    if (!s) throw new Error('PARSE:模型返回为空');
    let t = String(s).trim();
    // ★ 调试：记录原始输入
    console.log('[活力婷 LLM] extractJSON 输入类型:', typeof s, '长度:', t.length, '前120字符:', t.slice(0, 120));
    // 防御：如果 String() 后得到 "[object Object]" 说明原始值是对象，尝试 JSON.stringify
    if (t === '[object Object]' || t === '[object Array]') {
      console.warn('[活力婷 LLM] extractJSON 收到对象型输入，尝试序列化');
      try { t = JSON.stringify(s); } catch (_) { throw new Error('PARSE:模型返回了无法序列化的对象'); }
    }
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) { t = fence[1].trim(); console.log('[活力婷 LLM] 提取到围栏内容, 长度:', t.length); }
    const start = t.search(/[{[]/);
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (start >= 0 && end > start) { t = t.slice(start, end + 1); console.log('[活力婷 LLM] 提取JSON子串, 长度:', t.length, '前120字符:', t.slice(0, 120)); }
    try { return JSON.parse(t); }
    catch (e) {
      const errMsg = 'JSON Parse error: ' + e.message + '（前80字符：' + t.slice(0, 80).replace(/[\r\n]/g, ' ') + '）';
      console.error('[活力婷 LLM] extractJSON 最终失败:', errMsg);
      console.error('[活力婷 LLM] 完整待解析字符串:', t);
      // ★ 显示调试面板
      if (window.__llmDebug) window.__llmDebug(
        '=== extractJSON 解析失败 ===\n' +
        '错误: ' + e.message + '\n\n' +
        '=== 原始输入（typeof ' + typeof s + '，长度 ' + String(s).length + '）===\n' +
        String(s).slice(0, 800) + '\n\n' +
        '=== 最终待解析字符串（长度 ' + t.length + '）===\n' +
        t.slice(0, 800)
      );
      throw new Error(errMsg);
    }
  }

  /* ---------- 今日娱乐：天行实时数据（体育/科技/综合热点） ---------- */
  // 复用用户已有的天行 Key，拉取娱乐相关实时内容
  async function fetchFunTianapi(key) {
    const endpoints = [
      { name: '体育', url: 'https://apis.tianapi.com/tiyu/index?key=' + encodeURIComponent(key) + '&num=5' },
      { name: '科技探索', url: 'https://apis.tianapi.com/keji/index?key=' + encodeURIComponent(key) + '&num=5' },
    ];
    const allItems = [];
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep.url, { signal: AbortSignal.timeout(8000) });
        const txt = await r.text();
        const d = JSON.parse(txt);
        if (d.code === 200) {
          const list = d.newslist || (d.result && d.result.newslist) || [];
          list.forEach(it => {
            if (!it.title) return;
            let url = (it.url || '').trim();
            if (url && !url.startsWith('http')) url = 'https://' + url;
            allItems.push({ title: it.title, src: it.source || ('天行·' + ep.name), url: url || '#', tag: ep.name });
          });
        }
      } catch (e) { console.warn('[活力婷] 娱乐源 ' + ep.name + ' 拉取失败:', e.message); }
    }
    if (!allItems.length) return null;
    return { isReal: true, mode: 'tianapi-fun', items: allItems.slice(0, 10), sources: endpoints.map(e => '天行·' + e.name) };
  }

  async function fetchFun() {
    // 优先走天行（复用新闻 Key）
    const key = cfg(K.tianapiKey, '');
    if (key) {
      try {
        const r = await fetchFunTianapi(key);
        if (r) return r;
      } catch (e) { /* 天行失败，降级 */ }
    }
    // 降级：尝试 RSS（大概率也挂了）
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

  /* 天行数据·财经新闻（复用同一 Key，需开通「财经新闻」接口） */
  async function fetchInvestTianapi(key) {
    const raw = 'https://apis.tianapi.com/caijing/index?key=' + encodeURIComponent(key) + '&num=20';
    let txt;
    try {
      const r = await fetch(raw, { signal: AbortSignal.timeout(9000) });
      txt = await r.text();
    } catch (e) { throw new Error('NET:无法连接天行数据'); }
    let d;
    try { d = JSON.parse(txt); } catch (e) { throw new Error('NET:返回内容解析失败'); }
    console.log('[活力婷 API] 天行财经原始响应:', JSON.stringify(d).slice(0, 300));
    const list = d.newslist || (d.result && d.result.newslist) || [];
    if (d.code !== 200 && d.code !== '200') throw new Error('TIAN:' + (d.msg || ('code=' + d.code)));
    if (!Array.isArray(list) || list.length === 0) throw new Error('TIAN:无财经数据（请确认已开通「财经新闻」接口）');
    // 投资分类标签
    const TAGS = [
      { kw: ['新能源','光伏','锂电','储能','风电'], tag: '新能源' },
      { kw: ['医药','生物','疫苗','临床','药'], tag: '医药' },
      { kw: ['半导体','芯片','AI','算力','大模型'], tag: '科技' },
      { kw: ['消费','零售','白酒','食品','家电'], tag: '消费' },
      { kw: ['房地产','基建','建材','水泥'], tag: '地产基建' },
    ];
    function tagFor(t) {
      for (const g of TAGS) if (g.kw.some(k => t.indexOf(k) >= 0)) return g.tag;
      return '财经';
    }
    return {
      isReal: true, mode: 'tianapi-caijing', sources: ['天行数据·财经新闻'],
      items: list.slice(0, 20).map(it => ({
        title: it.title || '', src: it.source || '天行财经', url: it.url || '#',
        desc: it.description || '',
        tag: tagFor(it.title || ''),
        date: it.ctime ? it.ctime.split(' ')[0] : '',
      })),
    };
  }

  async function fetchInvest() {
    // 优先尝试天行财经（如果配了 Key）
    const tianKey = cfg(K.tianapiKey, '');
    if (tianKey) {
      try { return await fetchInvestTianapi(tianKey); } catch (e) { console.log('[活力婷] 天行财经失败:', e.message); }
    }
    // 降级 RSS
    try { return await fetchInvestRSS(); } catch (e) { return null; }
  }

  return {
    cfg, setCfg, K,
    fetchWeather, fetchNews, fetchFun, fetchInvest, callLLM,
  };
})();
