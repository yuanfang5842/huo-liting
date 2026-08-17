/* ============ 今日医药要闻（真实接口 + 降级） v11-网络优先 ============ */
window.News = (function () {
  const MODS = ['行业政策与市场', '新药与管线', '企业产品动态', '临床研究', '趋势与观点'];
  const srcLine = DATA.newsSources.join(' · ');
  // 用户的 WorkBuddy 每日药闻简报空间（带登录态的私有空间，客户端无法自动抓取，提供「打开+粘贴存档」工作流）
  const PHARMA_BRIEF_URL = 'https://www.workbuddy.cn/space/d/9cUvRmOIFcQtkLQeOYns9O?ext2=copy_link';

  // AI 深度解读系统提示（自由文本，无需 JSON；由 callLLMText 返回纯文本）
  const NEWS_INTERP_SYS = '你是资深医药行业分析师，擅长把专业医药新闻讲得通俗易懂。用户会给你一条医药健康新闻的标题与摘要。请输出一段面向普通人的深度解读（300 字以内）：① 一句话讲清这条新闻是什么；② 对行业/企业的影响；③ 对普通人的启发（健康/工作/职业/投资任选角度）。用自然口语、分点叙述，不要使用 JSON 格式，直接给纯文本。';

  function escapeHtml(s) { return (s || '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }
  function escAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
  function itemId(it) { return App.hash(it.title + '|' + it.src + '|' + it.url); }

  /* 官方政策源卡片：行业政策与市场首选的权威发布渠道（直接外链） */
  function govCardHtml() {
    const sites = [
      { n: '国家卫生健康委员会', u: 'http://www.nhc.gov.cn/' },
      { n: '国家医疗保障局', u: 'http://www.nhsa.gov.cn/' },
      { n: '国务院政策文件库', u: 'https://www.gov.cn/zhengce/zhengceku/' },
      { n: '国家药品监督管理局', u: 'https://www.nmpa.gov.cn/' },
      { n: '上海阳光医药采购网', u: 'http://www.smpaa.cn/' },
      { n: '中国政府网', u: 'https://www.gov.cn/' },
    ];
    const chips = sites.map(s => '<a class="chip gov-link" href="' + s.u + '" target="_blank" rel="noopener" style="flex-direction:row;justify-content:flex-start;margin-bottom:6px">' + escapeHtml(s.n) + ' ↗</a>').join('');
    return '<div class="card mt12" style="border-color:var(--accent)"><div class="section-title">🏛 官方政策源 · 行业政策与市场首选</div>' +
      '<div class="muted text-xs" style="margin:-4px 0 8px;line-height:1.65">以下为权威官方发布渠道，建议直接查看最新医药政策/文件。本区要闻也会通过 GDELT 全网监测从这些站点做补充。</div>' +
      '<div class="row" style="flex-wrap:wrap;gap:6px">' + chips + '</div></div>';
  }

  /* 打开「深度解读」详情浮层 - v15: 规则引擎解读 + 可选AI增强 */
  function showInterpret(el) {
    const it = { t: el.dataset.t, src: el.dataset.src, date: el.dataset.date, url: el.dataset.url, desc: el.dataset.desc };
    const body = document.getElementById('detail-body');
    if (!body) return;

    // 规则引擎：根据标题关键词生成基础解读（无需大模型）
    const title = it.t || '';
    let interp = '';
    const hasDrug = /药|新药|疫苗|生物|制药|临床|获批|上市|研发|管线|试验/.test(title);
    const hasPolicy = /政策|医保|集采|医改|改革|规划|方案|通知|意见|办法|条例|监管|审批/.test(title);
    const hasCompany = /公司|企业|集团|医药|生物科技|制药|医疗健康|药业|医药/.test(title);
    const hasMarket = /市场|行业|融资|投资|估值|股价|营收|增长|下滑|亏损|盈利|并购|收购|IPO|上市/.test(title);
    const hasHospital = /医院|诊所|医生|护士|患者|诊疗|治疗|手术|诊断|检查|科室|门诊|住院/.test(title);
    const hasTech = /AI|人工智能|数字|智能|创新|技术|平台|系统|设备|器械|影像|基因|细胞/.test(title);

    if (hasPolicy) {
      interp += '<p><b>📋 政策视角：</b>该条涉及医药行业政策法规变化，可能影响企业合规成本、市场准入门槛、产品定价策略及患者用药可及性。建议关注后续实施细则和过渡期安排。</p>';
    }
    if (hasDrug) {
      interp += '<p><b>💊 产品视角：</b>该条涉及药物/疫苗/生物制品的研发进展或监管动态。关注点包括：临床试验阶段（I/II/III期）、适应症范围、竞品格局、上市时间预期及潜在市场规模。</p>';
    }
    if (hasCompany) {
      interp += '<p><b>🏢 企业视角：</b>该条涉及医药企业经营动态。可从核心竞争力（研发管线/销售网络/产能布局）、财务健康状况、战略方向（创新转型/国际化/并购整合）等维度跟踪其长期价值。</p>';
    }
    if (hasMarket) {
      interp += '<p><b>📈 市场视角：</b>该条涉及资本市场或行业趋势。需结合宏观环境（利率/流动性）、行业周期位置、估值水平综合判断短期波动与长期趋势的关系。</p>';
    }
    if (hasHospital) {
      interp += '<p><b>🏥 临床视角：</b>该条涉及医疗服务端动态。关注对临床实践的影响：诊疗路径是否改变、患者获益程度、医疗资源分配效率及医护工作流程调整。</p>';
    }
    if (hasTech) {
      interp += '<p><b>🔬 技术视角：</b>该条涉及医药科技创新。评估技术成熟度（实验室/临床/商业化阶段）、落地壁垒（监管/成本/接受度）及对现有诊疗模式的颠覆潜力。</p>';
    }
    if (!interp) {
      interp = '<p>该条为医药健康领域实时要闻。建议从以下角度跟进：<br>① 对自身健康管理的影响（如涉及药品/疫苗/公共卫生）；<br>② 对行业从业者的启示（如涉及政策/市场/技术变革）；<br>③ 对投资决策的参考价值（如涉及上市公司动态）。</p>';
    }

    // 是否配置了可用的大模型（决定是否展示「AI 深度解读」按钮）
    const llmOk = (API.llmReady && API.llmReady());
    const llmNote = llmOk ? '' :
      '<div class="muted text-xs mt8" style="color:var(--ink-3)">💡 配置大模型 Key 后可获取 AI 深度解读（当前为规则引擎分析）。到「设置 → 大模型配置」填写即可启用。</div>';
    const aiBlock = llmOk
      ? '<button class="btn sm mt8" id="ai-interp-btn">🤖 AI 深度解读</button><div id="ai-interp-box"></div>'
      : llmNote;

    const descHtml = it.desc && it.desc.trim()
      ? '<div class="text-sm" style="line-height:1.75"><b>📝 原文摘要：</b>' + escapeHtml(it.desc) + '</div>'
      : '';

    body.innerHTML =
      '<div class="page-head"><h2 style="font-size:17px">📖 深度解读</h2></div>' +
      '<div class="bold" style="font-size:14px;line-height:1.55">' + escapeHtml(it.t) + '</div>' +
      '<div class="text-xs muted mt8">来源：' + escapeHtml(it.src || '') + (it.date ? ' · ' + escapeHtml(it.date) : '') + '</div>' +
      '<div class="card mt12"><div class="section-title">多维度解读</div>' + descHtml + '<div style="line-height:1.8">' + interp + '</div>' + aiBlock + '</div>' +
      (it.url && it.url !== '#' ? '<div class="mt12"><a class="look-link" href="' + escAttr(it.url) + '" target="_blank" rel="noopener">🔗 看完整原文 →</a></div>' : '<div class="muted text-xs mt12">⚠️ 该条暂无原文链接</div>');
    document.getElementById('detail-modal').classList.remove('hidden');

    // 绑定 AI 深度解读按钮（仅在配置了大模型时存在）
    const aiBtn = document.getElementById('ai-interp-btn');
    if (aiBtn) aiBtn.onclick = () => genAiInterp(it);
  }

  /* 调用大模型生成自由文本深度解读（callLLMText 返回字符串，无需 JSON.parse） */
  async function genAiInterp(it) {
    const box = document.getElementById('ai-interp-box');
    const btn = document.getElementById('ai-interp-btn');
    if (!box) return;
    if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
    box.innerHTML = '<div class="muted text-sm">🤖 AI 深度解读生成中…</div>';
    const userPrompt = '新闻标题：' + (it.t || '') + '\n' +
      (it.desc ? ('原文摘要：' + it.desc + '\n') : '') +
      '来源：' + (it.src || '未知');
    try {
      const text = await API.callLLMText(NEWS_INTERP_SYS, userPrompt);
      box.innerHTML =
        '<div class="card mt12" style="border-color:var(--accent)"><div class="section-title">🤖 AI 深度解读</div>' +
        '<div style="line-height:1.8">' + escapeHtml(text).replace(/\n/g, '<br>') + '</div>' +
        '<div class="muted text-xs mt8" style="color:var(--ink-3)">由「设置 → 大模型配置」所选模型实时生成。</div></div>';
    } catch (e) {
      const m = e.message || '';
      if (m.indexOf('LOCAL_ENGINE') === 0 || m.indexOf('NO_KEY') === 0) {
        box.innerHTML = '<div class="muted text-xs mt8" style="color:var(--ink-3)">💡 在「设置 → 大模型配置」填写 Key 后即可获取 AI 深度解读。</div>';
      } else if (m.indexOf('CORS') === 0) {
        box.innerHTML = '<div class="muted text-xs mt8" style="color:#c0392b">⚠️ ' + escapeHtml(m) + '</div>';
      } else {
        box.innerHTML = '<div class="muted text-xs mt8" style="color:var(--ink-3)">⚠️ AI 解读生成失败（' + escapeHtml(m.slice(0, 60)) + '），已为你保留上方规则引擎解读。</div>';
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🤖 AI 深度解读'; }
    }
  }

  /* ====== 核心：网络优先策略 ======
   * 1. 立即展示缓存数据（如有），保证秒开体验
   * 2. 同时后台发起真实请求拉取最新内容
   * 3. 拿到新数据后自动替换 UI，用户无感知更新
   * 4. 如果缓存是 mock/失败标记，始终尝试重新拉取
   * 5. 强制刷新（点按钮）先清缓存再拉
   */
  function renderNews(c) {
    c.innerHTML =
      '<div class="page-head"><h2>今日医药要闻</h2><div class="date">' + App.todayLabel() + '</div></div>' +
      '<div id="brief-card">' + pharmaBriefingHtml() + '</div>' +
      '<div id="news-status" class="achv-banner" style="background:var(--accent-soft);color:var(--accent)">' +
        '<div class="big">📡</div><div class="grow"><div class="t" id="news-st-t">加载中…</div>' +
        '<div class="s text-xs" id="news-st-s" style="opacity:1">来源：' + srcLine + '</div></div>' +
        '<button class="btn sm" id="news-refresh">刷新</button></div>' +
      '<div id="news-body"><div class="muted text-sm mt12">加载中…</div></div>' +
      '<div class="card mt12" id="news-help"><div class="section-title">🔧 刷新不出来？按这 4 步排查</div>' +
        '<div class="text-sm" style="line-height:1.75;color:var(--ink-2)">最稳的方式是用「天行数据 tianapi」：它已支持<b>浏览器直连、无需代理</b>。RSS 模式经公共代理，在部分网络下会被拦截。按顺序试：<br>' +
        '① 确认手机已联网，切到稳定的 Wi-Fi 或 4G/5G；<br>' +
        '② 回到本页点右上角「刷新」多试 1-2 次；<br>' +
        '③ 去「设置 → 今日医药要闻」，把接口切到「天行数据 tianapi」并填入免费 AppKey（tianapi.com 申请），成功率最高；<br>' +
        '④ 仍不行就是当前网络限制，App 会展示示例并保持你的已读进度，不影响使用。</div></div>';
    document.getElementById('news-refresh').onclick = () => backgroundLoad(c, true);
    bindPharmaBrief(c);

    // Step 1: 立即展示缓存（如果有有效数据）
    const cache = App.dget('newsCache', null);
    if (cache && cache.date === App.today() && cache.data && !cache.isMock) {
      renderData(cache.data, false);
    } else if (cache && cache.date === App.today() && cache.isMock) {
      // mock 缓存 → 显示占位，但一定要重新拉取
      renderData(null, true);
    } else {
      // 无缓存 → 显示占位
      renderData(null, true);
    }

    // Step 2: 始终后台拉取最新（除非已有今天成功缓存且距上次拉取 < 10 分钟）
    const now = Date.now();
    const lastFetch = cache ? (cache.fetchTime || 0) : 0;
    const needFetch = !cache || cache.isMock || cache.date !== App.today() || (now - lastFetch > 10 * 60 * 1000);
    if (needFetch) {
      backgroundLoad(c, false);
    } else {
      updateStatus(cache.data);
    }
  }

  function renderData(data, isMock) {
    const body = document.getElementById('news-body');
    const status = document.getElementById('news-status');
    if (!body || !status) return;
    if (isMock) {
      status.querySelector('#news-st-t').textContent = '示例数据（实时源暂不可用）';
      status.querySelector('#news-st-s').innerHTML = '来源：' + srcLine + ' · 可在「设置」配置新闻接口或网络后重试';
      status.style.background = '#FFF6E6'; status.style.color = '#B26A00';
      body.innerHTML = mockHtml();
      bindMock(body);
      return;
    }
    updateStatus(data);
    body.innerHTML = realHtml(data);
    bindReal(body);
  }

  /* 更新状态栏 */
  function updateStatus(data) {
    const st = document.getElementById('news-st-t');
    const ss = document.getElementById('news-st-s');
    const sta = document.getElementById('news-status');
    if (!st || !ss || !sta) return;
    if (!data) return;
    st.textContent = '真实要闻 · ' + (data.mode === 'tianapi' ? '天行·健康经纬' : data.mode === 'gdelt' ? 'GDELT 全球监测' : '公开 RSS 聚合');
    ss.innerHTML = '实时来源：' + (data.sources || []).join('、') + ' · 已按 5 模块分类 · 更新于 ' + new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
    sta.style.background = 'var(--accent-soft)'; sta.style.color = 'var(--accent)';
  }

  async function backgroundLoad(c, force) {
    if (force) {
      // 强制刷新：先清缓存
      App.dset('newsCache', null);
      const body = document.getElementById('news-body');
      if (body) body.innerHTML = '<div class="muted text-sm mt12">正在重新拉取实时要闻…</div>';
    }
    const body = document.getElementById('news-body');
    if (!body) return;

    let data = null, err = null;
    try {
      console.log('[活力婷] 开始拉取医药要闻...');
      data = await API.fetchNews();
      console.log('[活力婷] 要闻结果:', data ? ('成功, mode=' + data.mode) : '空');
    } catch (e) {
      err = e;
      console.error('[活力婷] 要闻拉取失败:', e.message || e);
      data = null;
    }

    if (data) {
      const total = (data.grouped ? Object.values(data.grouped).reduce((a, b) => a + b.length, 0) : 0);
      const cacheEntry = { date: App.today(), data: data, isMock: false, fetchTime: Date.now() };
      App.dset('newsCache', cacheEntry);
      renderData(data, false);   // ← 强制刷新 UI（含状态栏）
      App.toast('已刷新真实要闻 ' + total + ' 条 ✓');
    } else {
      // 拉取失败：检查是否已有今天的真实缓存（有就不覆盖，保留已显示的真数据）
      const existing = App.dget('newsCache', null);
      const hasRealData = existing && !existing.isMock && existing.date === App.today() && existing.data;
      if (!hasRealData) {
        // 没有有效缓存 → 回退到示例
        App.dset('newsCache', { date: App.today(), data: null, isMock: true, fetchTime: Date.now() });
        renderData(null, true);
      }
      // 只在没有真数据时才弹错误提示（避免"数据明明显示了还报错"的困扰）
      if (!hasRealData) {
        let tip = '实时源拉取失败：多为网络/代理/跨域限制，详见下方「4 步排查」';
        if (err) {
          const msg = err.message || '';
          if (msg.indexOf('TIAN:') === 0) {
            tip = '天行数据：' + msg.slice(5);
            // 同时在状态栏显示详细信息（toast 会消失，状态栏常驻）
            const st = document.getElementById('news-st-t');
            const ss = document.getElementById('news-st-s');
            const sta = document.getElementById('news-status');
            if (st) st.textContent = '⚠ 天行数据异常';
            if (ss) ss.innerHTML = '<span style="font-size:12px;opacity:0.8">' + escapeHtml(msg.slice(5).slice(0, 150)) + '</span>';
            if (sta) { sta.style.background = '#FFF0F0'; sta.style.color = '#C00'; }
          }
          else if (msg.indexOf('PAYMENT_402') === 0) tip = '大模型余额不足，请充值后重试';
          else if (msg.indexOf('NET:') === 0) tip = msg.slice(4);
          else if (msg.indexOf('NO_KEY') === 0) tip = '未填写接口密钥（请到「设置 → 今日医药要闻」配置）';
          else if (msg.indexOf('AUTH_401') === 0) tip = 'API Key 无效或已过期，请检查设置';
          else tip = '拉取异常：' + msg.slice(0, 120);
        }
        App.toast(tip);
      } else {
        console.warn('[活力婷] 后台拉取失败但已有今日缓存，静默降级:', err?.message || err);
      }
    }
  }

  function realHtml(data) {
    const read = App.dget('newsReadIds', []);
    let html = govCardHtml();
    MODS.forEach(m => {
      const list = data.grouped[m] || [];
      html += '<div class="news-mod"><div class="head">' + m + ' <span class="muted text-xs">(' + list.length + ')</span></div>';
      if (list.length === 0) { html += '<div class="muted text-xs">暂无相关要闻</div>'; }
      list.forEach(it => {
        const id = itemId(it);
        const isRead = read.includes(id);
        html += '<div class="news-item">' +
          '<div class="title">' + (isRead ? '✓ ' : '') + escapeHtml(it.title) + '</div>' +
          '<div class="meta"><span class="src">' + escapeHtml(it.src) + '</span><span>' + (it.date || '') + '</span></div>' +
          '<div class="news-actions">' +
            '<span class="orig" data-interpret data-id="' + id + '" data-t="' + escAttr(it.title) + '" data-src="' + escAttr(it.src) + '" data-date="' + escAttr(it.date || '') + '" data-url="' + escAttr(it.url) + '" data-desc="' + escAttr(it.desc || '') + '">解读 💡</span>' +
          '</div></div>';
      });
      html += '</div>';
    });
    return html;
  }

  function bindReal(body) {
    body.querySelectorAll('[data-interpret]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.id;
        if (id) {
          const r = App.dget('newsReadIds', []);
          if (!r.includes(id)) { r.push(id); App.dset('newsReadIds', r); App.dset('newsRead', r.length); }
          App.achieve('f1', 10, '阅读要闻');
          const titleEl = el.closest('.news-item') && el.closest('.news-item').querySelector('.title');
          if (titleEl && titleEl.textContent.indexOf('✓ ') !== 0) titleEl.textContent = '✓ ' + titleEl.textContent;
        }
        showInterpret(el);
      };
    });
  }

  function mockHtml() {
    const read = App.dget('newsReadIds', []);
    let html = govCardHtml();
    MODS.forEach(m => {
      html += '<div class="news-mod"><div class="head">' + m + '</div>';
      DATA.news[m].forEach((it, i) => {
        const id = 'mock-' + m + '-' + i;
        const isRead = read.includes(id);
        const url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(it.t + ' ' + it.src);
        html += '<div class="news-item">' +
          '<div class="title">' + (isRead ? '✓ ' : '') + escapeHtml(it.t) + '</div>' +
          '<div class="meta"><span class="src">' + it.src + '</span><span>' + it.date + '</span></div>' +
          '<div class="news-actions">' +
            '<span class="orig" data-interpret data-id="' + id + '" data-t="' + escAttr(it.t) + '" data-src="' + escAttr(it.src) + '" data-date="' + escAttr(it.date) + '" data-url="' + escAttr(url) + '" data-desc="' + escAttr(it.desc || '') + '">解读 💡</span>' +
          '</div></div>';
      });
      html += '</div>';
    });
    return html;
  }

  function bindMock(body) {
    body.querySelectorAll('[data-interpret]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.id;
        if (id) {
          const r = App.dget('newsReadIds', []);
          if (!r.includes(id)) { r.push(id); App.dset('newsReadIds', r); App.dset('newsRead', r.length); }
          App.achieve('f1', 10, '阅读要闻');
          el.textContent = '已读 ✓';
          const titleEl = el.closest('.news-item') && el.closest('.news-item').querySelector('.title');
          if (titleEl && titleEl.textContent.indexOf('✓ ') !== 0) titleEl.textContent = '✓ ' + titleEl.textContent;
        }
        showInterpret(el);
      };
    });
  }

  /* ====== 每日药闻简报（WorkBuddy 同步） ====== */
  function briefStore() { return App.get('pharmaBrief', {}) || {}; }
  function briefDates() { return Object.keys(briefStore()).sort().reverse(); }
  function detectBriefDate(text) {
    const m = (text || '').match(/pharma-briefing-(\d{4}-\d{2}-\d{2})/i);
    return m ? m[1] : App.today();
  }
  function pharmaBriefingHtml() {
    const store = briefStore();
    const dates = briefDates();
    const hasToday = !!store[App.today()];
    const dispDate = hasToday ? App.today() : (dates[0] || null);
    const entry = dispDate ? store[dispDate] : null;
    const selOpts = dates.length
      ? dates.map(d => '<option value="' + d + '"' + (d === dispDate ? ' selected' : '') + '>' + d + (d === App.today() ? '（今天）' : '') + '</option>').join('')
      : '<option>— 暂无存档 —</option>';
    const body = entry
      ? '<div style="line-height:1.75;white-space:pre-wrap;font-size:13px">' + escapeHtml(entry.text) + '</div>'
      : '<div class="muted text-sm">还没有今日简报。点下方「粘贴今日简报」，从你的 WorkBuddy 空间复制后粘贴并保存，即按日期存档、每日自动呈现。</div>';
    return '<div class="card mt12" style="border-color:var(--accent)">' +
      '<div class="section-title">📋 每日药闻简报 · WorkBuddy 同步</div>' +
      '<div class="muted text-xs" style="margin:-4px 0 8px;line-height:1.5">来源：你的 WorkBuddy 每日简报空间（每日更新）。' +
        '<a href="' + PHARMA_BRIEF_URL + '" target="_blank" rel="noopener" style="color:var(--accent)">打开空间 ↗</a></div>' +
      (dates.length ? '<div class="flex" style="gap:6px;align-items:center;margin-bottom:8px"><span class="muted text-xs">查看：</span><select id="brief-sel" style="border:1px solid var(--line);border-radius:8px;padding:4px 6px;font-size:12px;flex:1;min-width:0">' + selOpts + '</select></div>' : '') +
      '<div id="brief-body">' + body + '</div>' +
      '<details class="mt8"><summary style="cursor:pointer;color:var(--accent);font-size:12px">＋ 粘贴今日简报（从空间复制后粘贴，按日期存档）</summary>' +
        '<textarea id="brief-in" class="full mt8" placeholder="粘贴 pharma-briefing-YYYY-MM-DD 内容…&#10;（若首行含日期，将自动归入对应日期；否则归入今天）" style="border:1px solid var(--line);border-radius:10px;padding:8px;font-size:13px;min-height:90px"></textarea>' +
        '<button class="btn sm mt8" id="brief-save">保存为今日/对应日期简报</button>' +
        '<span id="brief-msg" class="muted text-xs ml8"></span>' +
      '</details>' +
      '</div>';
  }
  function bindPharmaBrief(c) {
    const sel = document.getElementById('brief-sel');
    if (sel) sel.onchange = () => {
      const d = sel.value; const e = briefStore()[d];
      const body = document.getElementById('brief-body');
      if (body) body.innerHTML = e
        ? '<div style="line-height:1.75;white-space:pre-wrap;font-size:13px">' + escapeHtml(e.text) + '</div>'
        : '<div class="muted text-sm">该日期暂无简报。</div>';
    };
    const save = document.getElementById('brief-save');
    if (save) save.onclick = () => {
      const ta = document.getElementById('brief-in');
      const txt = (ta.value || '').trim();
      if (!txt) { App.toast('请先粘贴简报内容'); return; }
      const date = detectBriefDate(txt);
      const store = briefStore();
      store[date] = { text: txt, savedAt: Date.now() };
      App.set('pharmaBrief', store);
      const card = document.getElementById('brief-card');
      if (card) { card.innerHTML = pharmaBriefingHtml(); bindPharmaBrief(c); }
      App.toast('简报已保存：' + date);
    };
  }

  App.register('news', renderNews);
  return {};
})();
