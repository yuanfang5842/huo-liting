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

  /* 读取同域 JSON（GitHub Actions 定时生成的真实数据，无跨域/无网络墙，手机稳定）。
     v45 修复：去掉 ?t= 时间戳（避免某些手机浏览器/CDN 对带时间戳 URL 的诡异缓存行为），
     用 cache: 'no-store' 强制不缓存；保留 15s 超时 + 1 次重试。 */
  async function fetchJsonCached(path, ms) {
    const timeout = ms || 15000;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(path, { signal: AbortSignal.timeout(timeout), cache: 'no-store' });
        if (!r.ok) { if (attempt === 0) continue; return null; }
        return await r.json();
      } catch (e) {
        if (attempt === 0) { continue; }
        return null;
      }
    }
    return null;
  }

  /* 医药要闻三大模块（后台自动归类展示） */
  const MODS = ['国内新药/临床/科研', '海外FDA与全球进展', '政策/医保/行业'];
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

  /* ====== GDELT 全球监测：三大模块并行查询（免费·无需 key·浏览器直连·已验证可跨域） ======
   * 每个模块用一条针对性查询【直接归类】，避免依赖脆弱的关键词猜分类导致某桶为空。
   * 这是医药要闻的【主数据源】，默认即生效，无需任何配置。 */
  const NEWS_CATS = [
    {
      cat: '国内新药/临床/科研',
      q: 'sourcelang:Chinese (新药 OR 临床 OR 创新药 OR 生物医药 OR 临床试验 OR 研发 获批)',
      max: 12,
    },
    {
      cat: '海外FDA与全球进展',
      q: 'sourcelang:Chinese (FDA OR EMA OR 美国 药 获批 OR 海外 新药 OR 全球 疫苗 OR 欧盟 药品)',
      max: 12,
    },
    {
      cat: '政策/医保/行业',
      q: 'sourcelang:Chinese (医保 OR 集采 OR 医药政策 OR 医疗改革 OR 药品 谈判 OR 中成药 OR 医药 行业)',
      max: 12,
    },
  ];

  async function fetchNewsGdeltCats() {
    const results = await Promise.all(NEWS_CATS.map(async c => {
      const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(c.q) +
        '&mode=ArtList&format=json&maxrecords=' + c.max + '&sortby=datedesc';
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
        if (!r.ok) return [];
        const d = await r.json();
        const arts = d.articles || [];
        return arts.filter(a => a.title).map(a => ({
          title: a.title, src: a.domain || 'GDELT', url: a.url || '#',
          date: fmtPub(a.seendate || ''), module: c.cat,
        }));
      } catch (e) { return []; }
    }));
    const grouped = {}; NEWS_CATS.forEach(c => grouped[c.cat] = []);
    results.forEach(list => list.forEach(it => { (grouped[it.module] = grouped[it.module] || []).push(it); }));
    const total = NEWS_CATS.reduce((s, c) => s + grouped[c.cat].length, 0);
    if (!total) return null;
    const sources = [];
    NEWS_CATS.forEach((c, i) => { if (results[i] && results[i].length) sources.push('GDELT·' + c.cat); });
    return { isReal: true, mode: 'gdelt', grouped, sources };
  }

  /* 可选增强：天行「国内新闻 guonei」接口（需 key + 开通）。
   * 仅取【标题含医药关键词】的条目，按三大模块归类后并入，避免把煤炭/地产等泛新闻混进来。 */
  function categorize3(text) {
    const t = text || '';
    if (/FDA|EMA|fda\.gov|European Medicines|approved|trial|海外|global|美国|欧盟|欧洲/i.test(t)) return '海外FDA与全球进展';
    if (/医保|集采|政策|药监局|卫健委|目录|招标|控费|DRG|行业|市场|融资|营收|药企|医保局|改革/.test(t)) return '政策/医保/行业';
    return '国内新药/临床/科研';
  }
  async function fetchNewsTianapiGuonei(key) {
    const raw = 'https://apis.tianapi.com/guonei/index?key=' + encodeURIComponent(key) + '&num=30';
    let txt;
    try { txt = await (await fetch(raw, { signal: AbortSignal.timeout(9000) })).text(); }
    catch (e) { throw new Error('NET:天行数据请求失败'); }
    let d; try { d = JSON.parse(txt); } catch (e) { throw new Error('NET:返回解析失败'); }
    if (d.code !== 200 && d.code !== '200') throw new Error('TIAN:' + (TIAN_ERR[d.code] || ('接口返回 code=' + d.code)));
    const list = d.newslist || (d.result && d.result.newslist) || [];
    if (!list.length) throw new Error('TIAN:无国内新闻数据（请确认已开通「国内新闻」接口）');
    const kws = ['药', '临床', '医保', '集采', 'FDA', '疫苗', '生物', '研发', '管线', '医疗', '健康', '制药', '新药', '中医药'];
    const picked = list.filter(it => it.title && kws.some(k => it.title.indexOf(k) >= 0)).slice(0, 20);
    const grouped = {}; MODS.forEach(m => grouped[m] = []);
    picked.forEach(it => {
      let url = (it.url || '').trim(); if (url && !url.startsWith('http')) url = 'https://' + url; if (!url) url = '#';
      const mod = categorize3(it.title);
      grouped[mod].push({ title: it.title, src: it.source || '天行·国内', url, date: (it.date || '').slice(5, 10).replace('-', '/') || '今日', module: mod });
    });
    return { isReal: true, mode: 'tianapi', grouped, sources: ['天行数据·国内新闻(医药过滤)'] };
  }

  // 统一入口：优先读同域定时 JSON（稳定），JSON 暂缺时退回浏览器直连 GDELT 兜底
  async function fetchNews() {
    const cached = await fetchJsonCached('assets/data/news.json', 8000);
    if (cached && cached.grouped) {
      const total = Object.values(cached.grouped).reduce((a, b) => a + (b ? b.length : 0), 0);
      if (total > 0) {
        return {
          isReal: true, mode: 'cached',
          grouped: cached.grouped,
          sources: cached.sources || ['GitHub Actions 定时更新'],
          updated: cached.updated || '',
        };
      }
    }
    // 同域 JSON 暂缺（首次 Actions 未跑）→ 退回浏览器直连 GDELT 兜底
    const mode = cfg(K.newsMode, 'gdelt');  // 默认 GDELT 全球监测（免费·无需 key）
    let data = null;
    try { data = await fetchNewsGdeltCats(); }
    catch (e) { console.warn('[活力婷 API] GDELT 失败:', e.message); }
    if (!data) return null;  // 极端断网 → 由调用方回退示例
    // 可选增强：模式为 tianapi 且已填 key 时，补充国内新闻（仅医药相关，去重并入）
    if (mode === 'tianapi') {
      const key = cfg(K.tianapiKey, '');
      if (key) {
        try {
          const t = await fetchNewsTianapiGuonei(key);
          if (t) {
            MODS.forEach(m => {
              const exist = data.grouped[m] || [];
              const extra = (t.grouped[m] || []).filter(x => !exist.some(y => y.title === x.title));
              data.grouped[m] = exist.concat(extra).slice(0, 10);
            });
            data.sources = (data.sources || []).concat(t.sources);
          }
        } catch (e) { console.warn('[活力婷 API] 天行补充失败(忽略):', e.message); }
      }
    }
    return data;
  }

  /* ---------- 大模型：OpenAI 兼容（稳健版） ---------- */
  async function callLLM(systemPrompt, userPrompt, asText) {
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
    if (asText) return raw;            // 自由文本场景（解读/反馈/建议）直接返回字符串，调用方切勿再 JSON.parse
    return extractJSON(raw);
  }

  // callLLMText: 返回模型原始文本，专用于「解读 / 反馈 / 建议」等自由文本场景（单一入口，内部已做健壮解析与重试）
  async function callLLMText(systemPrompt, userPrompt) {
    return await callLLM(systemPrompt, userPrompt, true);
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
    // 优先读取同域定时 JSON（稳定、无跨域）；JSON 暂缺或模块全空时回退示例/兜底
    const cached = await fetchJsonCached('assets/data/invest.json', 8000);
    if (cached && cached.modules && cached.modules.length) {
      const totalItems = cached.modules.reduce((s, m) => s + ((m && m.items) ? m.items.length : 0), 0);
      if (totalItems > 0) {
        return { isReal: true, mode: 'cached', sources: cached.sources || ['GitHub Actions 定时更新'], modules: cached.modules };
      }
    }
    // 兜底：天行财经 / 财经 RSS（返回 items，按 tag 归并为 modules 适配渲染）
    const tianKey = cfg(K.tianapiKey, '');
    let fallback = null;
    if (tianKey) { try { fallback = await fetchInvestTianapi(tianKey); } catch (e) { console.log('[活力婷] 天行财经失败:', e.message); } }
    if (!fallback) { try { fallback = await fetchInvestRSS(); } catch (e) { return null; } }
    if (fallback && fallback.items && fallback.items.length) {
      const groups = {};
      fallback.items.forEach(it => { const g = it.tag || '财经'; (groups[g] = groups[g] || []).push(it); });
      return {
        isReal: true, mode: fallback.mode || 'invest', sources: fallback.sources || ['实时财经'],
        modules: Object.keys(groups).map(n => ({ name: n, items: groups[n] })),
      };
    }
    return null;
  }

  return {
    cfg, setCfg, K,
    fetchWeather, fetchNews, fetchFun, fetchInvest, callLLM, callLLMText,
    llmReady: () => cfg(K.llmProvider, '') !== 'local' && !!cfg(K.llmKey, ''),
  };
})();
