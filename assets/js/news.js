/* ============ 今日医药要闻（真实接口 + 降级） v11-网络优先 ============ */
window.News = (function () {
  const MODS = ['行业政策与市场', '新药与管线(研发·获批)', '企业与产品动态', '临床与研究', '趋势与观点'];
  const srcLine = DATA.newsSources.join(' · ');

  function escapeHtml(s) { return (s || '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }
  function escAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
  function itemId(it) { return App.hash(it.title + '|' + it.src + '|' + it.url); }

  /* 打开「深度解读」详情浮层 */
  function showInterpret(el) {
    const it = { t: el.dataset.t, src: el.dataset.src, date: el.dataset.date, url: el.dataset.url, desc: el.dataset.desc };
    const body = document.getElementById('detail-body');
    if (!body) return;
    const descHtml = it.desc && it.desc.trim()
      ? '<div class="text-sm" style="line-height:1.75">' + escapeHtml(it.desc) + '</div>'
      : '<div class="muted text-sm">该条为实时要闻，暂未生成本地解读文案（联网接入新闻源后可补充逐篇解读）。</div>';
    body.innerHTML =
      '<div class="page-head"><h2 style="font-size:17px">📖 深度解读</h2></div>' +
      '<div class="bold" style="font-size:14px;line-height:1.55">' + escapeHtml(it.t) + '</div>' +
      '<div class="text-xs muted mt8">来源：' + escapeHtml(it.src || '') + (it.date ? ' · ' + escapeHtml(it.date) : '') + '</div>' +
      '<div class="card mt12"><div class="section-title">解读（市场 / 行业 / 医院医生患者 / 老百姓工作生活）</div>' + descHtml + '</div>' +
      (it.url && it.url !== '#' ? '<a class="look-link" href="' + escAttr(it.url) + '" target="_blank" rel="noopener">看原文 →</a>' : '');
    document.getElementById('detail-modal').classList.remove('hidden');
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
    st.textContent = '真实要闻 · ' + (data.mode === 'tianapi' ? '天行数据' : data.mode === 'gdelt' ? 'GDELT 全球监测' : '公开 RSS 聚合');
    ss.innerHTML = '实时来源：' + (data.sources || []).join('、') + ' · 已按 5 模块分类';
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
    let html = '';
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
            '<span class="orig" data-interpret data-t="' + escAttr(it.title) + '" data-src="' + escAttr(it.src) + '" data-date="' + escAttr(it.date || '') + '" data-url="' + escAttr(it.url) + '" data-desc="' + escAttr(it.desc || '') + '">解读 💡</span>' +
            '<span class="orig" data-url="' + escapeHtml(it.url) + '" data-id="' + id + '">看原文 →</span>' +
          '</div></div>';
      });
      html += '</div>';
    });
    return html;
  }

  function bindReal(body) {
    body.querySelectorAll('[data-interpret]').forEach(el => { el.onclick = () => showInterpret(el); });
    body.querySelectorAll('.orig:not([data-interpret])').forEach(el => {
      el.onclick = () => {
        const url = el.dataset.url;
        const id = el.dataset.id;
        const r = App.dget('newsReadIds', []);
        if (!r.includes(id)) { r.push(id); App.dset('newsReadIds', r); App.dset('newsRead', r.length); }
        App.achieve('f1', 10, '阅读要闻');
        el.parentElement.querySelector('.title').textContent = '✓ ' + el.parentElement.querySelector('.title').textContent.replace(/^✓ /, '');
        if (url && url !== '#') window.open(url, '_blank');
        else App.toast('该条暂无原文链接');
      };
    });
  }

  function mockHtml() {
    const read = App.dget('newsReadIds', []);
    let html = '';
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
            '<span class="orig" data-interpret data-t="' + escAttr(it.t) + '" data-src="' + escAttr(it.src) + '" data-date="' + escAttr(it.date) + '" data-url="' + escAttr(url) + '" data-desc="' + escAttr(it.desc || '') + '">解读 💡</span>' +
            '<span class="orig" data-id="' + id + '" data-mock="1" data-url="' + escapeHtml(url) + '">' + (isRead ? '已读 ✓' : '看原文 →') + '</span>' +
          '</div></div>';
      });
      html += '</div>';
    });
    return html;
  }

  function bindMock(body) {
    body.querySelectorAll('[data-interpret]').forEach(el => { el.onclick = () => showInterpret(el); });
    body.querySelectorAll('.orig[data-mock]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.id;
        const r = App.dget('newsReadIds', []);
        if (!r.includes(id)) { r.push(id); App.dset('newsReadIds', r); App.dset('newsRead', r.length); }
        App.achieve('f1', 10, '阅读要闻');
        el.textContent = '已读 ✓';
        el.parentElement.querySelector('.title').textContent = '✓ ' + el.parentElement.querySelector('.title').textContent.replace(/^✓ /, '');
        if (el.dataset.url) window.open(el.dataset.url, '_blank');
      };
    });
  }

  App.register('news', renderNews);
  return {};
})();
