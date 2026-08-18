/* ============ 流水记账 / 投资机会 / 喝水 / 健身 / 穿搭 / 娱乐 ============ */
window.Life = (function () {

  /* ---------------- 流水记账 ---------------- */
  function pdate(s) { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function inWeek(s) {
    const now = new Date(); const dow = (now.getDay() + 6) % 7; // 周一为一周开始
    const mon = new Date(now); mon.setDate(now.getDate() - dow); mon.setHours(0, 0, 0, 0);
    const nx = new Date(mon); nx.setDate(mon.getDate() + 7);
    const x = pdate(s); x.setHours(0, 0, 0, 0);
    return x >= mon && x < nx;
  }
  function inMonth(s) { const x = pdate(s), n = new Date(); return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth(); }
  function inYear(s) { return pdate(s).getFullYear() === new Date().getFullYear(); }
  function sumOf(L, fn) { return (L.records || []).filter(r => fn(r.date)).reduce((a, r) => a + r.amount, 0); }

  function renderLedger(c) {
    let L = App.get('ledgerAll', { records: [] });
    let todaySum = 0, catSum = {};
    (L.records || []).forEach(r => {
      if (r.date === App.today()) { todaySum += r.amount; catSum[r.cat] = (catSum[r.cat] || 0) + r.amount; }
    });
    const weekSum = sumOf(L, inWeek), monthSum = sumOf(L, inMonth), yearSum = sumOf(L, inYear);
    let catHtml = DATA.ledgerCats.map(cat =>
      '<div class="row"><span class="grow">' + cat.name + (catSum[cat.key] ? ' <span class="muted text-xs">¥' + catSum[cat.key] + '</span>' : '') + '</span>' +
      '<select id="sub-' + cat.key + '" style="border:1px solid var(--line);border-radius:8px;padding:4px;font-size:12px">' +
      cat.subs.map(s => '<option>' + s + '</option>').join('') + '</select></div>'
    ).join('');

    c.innerHTML =
      '<div class="page-head"><h2>流水记账</h2><div class="date">今日支出 ¥' + todaySum + '</div></div>' +
      '<div class="card"><div class="section-title">记一笔</div>' +
        '<div class="field"><label>大类</label><select id="cat-sel" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%">' +
        DATA.ledgerCats.map(cat => '<option value="' + cat.key + '">' + cat.name + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>细分</label><div id="sub-wrap"></div></div>' +
        '<div class="field"><label>金额</label><input id="amt" type="number" placeholder="0" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%"/></div>' +
        '<div class="field"><label>备注（可选）</label><input id="note" placeholder="如：午餐·公司楼下" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%"/></div>' +
        '<button class="btn block" id="ledger-add">记下了</button></div>' +
      '<div class="card"><div class="section-title">今日分类统计</div>' + catHtml + '</div>' +
      '<div class="card"><div class="section-title">本周 / 本月 / 本年支出</div>' +
        '<div class="row"><span class="grow muted text-sm">本周（周一至今）</span><span class="bold">¥' + weekSum + '</span></div>' +
        '<div class="row"><span class="grow muted text-sm">本月</span><span class="bold">¥' + monthSum + '</span></div>' +
        '<div class="row"><span class="grow muted text-sm">本年</span><span class="bold">¥' + yearSum + '</span></div>' +
        '<div class="muted text-xs mt8">记账数据长期保存，可随时回看各周期支出趋势。</div></div>' +
      '<div class="card mt12"><div class="section-title">数据留存与导出</div>' +
        '<div class="text-sm muted" style="line-height:1.6">所有记账记录已按日期长期保存。可一键导出全部记录，用 Excel 直接打开查看。</div>' +
        '<button class="btn block mt8" id="ledger-export">⬇ 导出全部记账数据（CSV · Excel 可打开）</button></div>';

    const catSel = document.getElementById('cat-sel');
    function fillSub() {
      const cat = DATA.ledgerCats.find(x => x.key === catSel.value);
      document.getElementById('sub-wrap').innerHTML = '<select id="sub-sel" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%">' +
        cat.subs.map(s => '<option>' + s + '</option>').join('') + '</select>';
    }
    fillSub();
    catSel.onchange = fillSub;
    document.getElementById('ledger-add').onclick = () => {
      const cat = DATA.ledgerCats.find(x => x.key === catSel.value);
      const amt = parseFloat(document.getElementById('amt').value);
      if (!amt || amt <= 0) { App.toast('请输入金额'); return; }
      const sub = document.getElementById('sub-sel').value;
      const note = document.getElementById('note').value.trim();
      L.records.push({ cat: cat.name, sub, amount: amt, note, date: App.today() });
      App.set('ledgerAll', L);
      App.achieve('f1', 10, '记一笔账');
      renderLedger(c);
    };
    document.getElementById('ledger-export').onclick = () => {
      const L2 = App.get('ledgerAll', { records: [] });
      const recs = L2.records || [];
      if (!recs.length) { App.toast('还没有记账记录，先记一笔吧'); return; }
      const rows = [['日期', '大类', '细分', '金额(元)', '备注']].concat(
        recs.map(r => [r.date, r.cat, r.sub, r.amount, r.note || ''])
      );
      App.exportCSV('活力婷_流水记账_' + App.today() + '.csv', rows);
      App.toast('已导出 ' + recs.length + ' 条记账记录');
    };
  }

  /* ---------------- 投资机会参考 ---------------- */
  function renderInvest(c) {
    const mode = API.cfg(API.K.investMode, 'rotate');
    const todayStr = App.todayLabel();
    c.innerHTML =
      '<div class="page-head"><h2>投资机会参考</h2><div class="date">' + todayStr + '</div></div>' +
      '<div class="achv-banner" style="background:var(--accent-soft);color:var(--accent)"><div class="big">📈</div><div class="grow"><div class="t">数据来源</div>' +
        '<div class="s" style="opacity:1">每日定时更新（GitHub Actions 每6小时）· 真实财经要闻</div></div>' +
        '<button class="btn sm" id="invest-refresh">刷新</button></div>' +
      '<div class="muted text-xs mb" style="margin:8px 0">要闻由 <b>GitHub Actions 每 6 小时自动拉取</b>全球及中文财经源（GDELT 中文优先），归入 7 大行业模块、每模块 5 条、跨模块去重；联网失败或首次未生成时，展示每日轮换示例。</div>' +
      '<div id="invest-body"><div class="muted text-sm mt12">加载中…</div></div>';

    document.getElementById('invest-refresh').onclick = () => renderInvestBody(c, true);
    renderInvestBody(c, false);
  }

  async function renderInvestBody(c, force) {
    const body = document.getElementById('invest-body');
    if (!body) return;
    // 用户若选择"仅示例"，直接展示每日轮换，不走真实源
    const mode = API.cfg(API.K.investMode, 'auto');
    if (mode === 'example') { renderInvestRotated(body, App.todayLabel()); return; }
    // 始终优先展示真实数据（GitHub Actions 定时生成，已缓存到本地）
    const cache = App.dget('investCache', null);
    if (cache && cache.date === App.today() && cache.isReal && !force) {
      renderInvestLive(cache);
      return;
    }
    const now = Date.now();
    const lastFetch = cache ? (cache.fetchTime || 0) : 0;
    const needFetch = force || !cache || !cache.isReal || cache.date !== App.today() || (now - lastFetch > 10 * 60 * 1000);
    if (needFetch) {
      if (force) body.innerHTML = '<div class="muted text-sm mt12">重新拉取实时财经中…</div>';
      try {
        console.log('[活力婷] 拉取投资数据...');
        const fresh = await API.fetchInvest();
        if (fresh && fresh.isReal) {
          App.dset('investCache', Object.assign({ date: App.today(), fetchTime: Date.now() }, fresh));
          renderInvestLive(fresh);
          return;
        }
      } catch (e) { console.warn('[活力婷] 投资数据拉取失败:', e); }
    }
    if (cache && cache.isReal) return;  // 已展示缓存，不需要回退
    if (force) App.toast('实时拉取失败，显示每日轮换示例');
    renderInvestRotated(body, App.todayLabel());
  }

  function renderInvestRotated(body, todayStr) {
    const di = App.dayIndex();
    const boards = DATA.investBoards || [];
    if (!boards.length) { body.innerHTML = '<div class="muted text-sm">暂无内容</div>'; return; }
    const start = di % boards.length;
    const shown = [];
    for (let k = 0; k < boards.length; k++) shown.push(boards[(start + k) % boards.length]);
    const visible = shown.slice(0, 5); // 每天展示不同的 5 个板块
    let html = '<div class="muted text-xs" style="margin:4px 0 8px;color:var(--ink-3)">更新于 ' + todayStr + ' · 示例 · 每日轮换（第 ' + (di % boards.length + 1) + ' 组 / 共 ' + boards.length + ' 组）</div>';
    let idx = 0;
    visible.forEach(b => {
      html += '<div class="section-title mt12">' + escapeHtml(b.title) + '</div>';
      const items = b.items.slice();
      const off = di % items.length;            // 板块内条目也每日轮换顺序
      const rit = items.slice(off).concat(items.slice(0, off));
      rit.forEach(it => {
        idx++;
        const hh = String(8 + Math.floor(idx / 2)).padStart(2, '0');
        const mm = String((idx % 2) * 28).padStart(2, '0');
        const url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(it.t + ' ' + it.src);
        html += '<div class="card" style="margin-bottom:10px"><div class="flex between center"><div class="bold" style="font-size:13px;line-height:1.4">' + escapeHtml(it.t) + '</div><span class="tag">' + it.tag + '</span></div>' +
          '<div class="text-xs muted mt8">来源：' + escapeHtml(it.src) + ' · ' + todayStr + ' ' + hh + ':' + mm + '</div>' +
          '<div class="text-sm mt8" style="line-height:1.6">' + escapeHtml(it.desc || '结合政策方向与产业景气，关注具备兑现节奏的标的，注意估值与订单兑现风险。') + '</div>' +
          '<div class="mt8"><a class="look-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">看原文 →</a></div></div>';
      });
    });
    body.innerHTML = html;
  }

  function renderInvestLive(data) {
    const body = document.getElementById('invest-body');
    const modeLabel = data.mode === 'tianapi-caijing' ? '天行数据·财经新闻（实时）' : data.mode === 'cached' ? 'GitHub Actions 定时更新（真实财经）' : '实时财经 RSS（联网拉取）';
    let html = '<div class="muted text-xs" style="margin:4px 0 8px;color:#1E9E83">● 实时数据 · 来源：' + (data.sources || []).join('、') + '</div>';
    // 按固定 7 大模块展示（每模块 5 条，跨模块已去重）
    (data.modules || []).forEach(m => {
      const items = m.items || [];
      html += '<div class="section-title mt12">' + escapeHtml(m.name) + ' <span class="muted text-xs">(' + items.length + ')</span></div>';
      if (!items.length) { html += '<div class="muted text-xs">暂无相关动态</div>'; }
      items.forEach(it => {
        const dateStr = it.date ? ('来源：' + escapeHtml(it.src) + ' · ' + it.date) : ('来源：' + escapeHtml(it.src || '财经'));
        const intlTag = (it.dom === false) ? '<span style="font-size:10px;color:#1E9E83;border:1px solid #1E9E83;border-radius:6px;padding:1px 5px;margin-right:6px;vertical-align:middle">国际</span>' : '';
        html += '<div class="card" style="margin-bottom:10px"><div class="bold" style="font-size:13px;line-height:1.4">' + intlTag + escapeHtml(it.title) + '</div>' +
          '<div class="text-xs muted mt8">' + dateStr + '</div>' +
          (it.desc ? '<div class="text-sm mt8" style="line-height:1.6">' + escapeHtml(it.desc) + '</div>' : '') +
          (it.url && it.url !== '#' ? '<div class="mt8"><a class="look-link" href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener">看原文 →</a></div>' : '') + '</div>';
      });
    });
    body.innerHTML = html;
    // 更新状态栏
    const stEl = body.closest('.page')?.querySelector('.achv-banner .s');
    if (stEl) stEl.textContent = modeLabel;
  }

  /* ---------------- 喝水提醒 ---------------- */
  function calcCups(weightKg) { return Math.max(6, Math.round(weightKg * 35 / 200)); } // 每杯200ml
  function renderWater(c) {
    const height = 164, weight = 46.5;
    const cups = calcCups(weight);
    let w = App.dget('water', { cups: [], fit: [] });
    if (!w.cups || w.cups.length !== cups) w.cups = new Array(cups).fill(false);
    if (!w.fit || w.fit.length !== 3) w.fit = [false, false, false];
    const done = w.cups.filter(x => x).length;

    let grid = '';
    w.cups.forEach((x, i) => {
      grid += '<div class="cup-btn ' + (x ? 'done' : '') + '" data-cup="' + i + '">第' + (i + 1) + '杯' + (x ? ' ✓' : '') + '</div>';
    });
    const fitNames = ['健身前', '健身中', '健身后'];
    let fitGrid = '';
    w.fit.forEach((x, i) => { fitGrid += '<div class="cup-btn ' + (x ? 'done' : '') + '" data-fit="' + i + '">' + fitNames[i] + (x ? ' ✓' : '') + '</div>'; });

    const reminds = App.dget('waterReminders', ['09:00', '11:00', '14:00', '16:00', '19:00']);
    let remindHtml = reminds.map((t, i) =>
      '<div class="remind-row"><input type="time" value="' + t + '" data-ri="' + i + '">' +
      '<span class="muted text-xs">每日提醒</span><span class="del" data-ri="' + i + '">删除</span></div>'
    ).join('');
    const notifOn = App.get('waterNotif', false);

    c.innerHTML =
      '<div class="page-head"><h2>喝水提醒</h2><div class="date">身高 ' + height + 'cm · 体重 ' + weight + 'kg</div></div>' +
      '<div class="card"><div class="section-title">今日计划</div>' +
        '<div class="text-sm">基础需水量 ≈ <b class="accent">' + (weight * 35) + ' ml</b>（体重×35），约 <b class="accent">' + cups + ' 杯</b>（200ml/杯）；健身日额外 +3 杯。</div>' +
        '<div class="progress mt12"><i style="width:' + Math.round(done / cups * 100) + '%"></i></div>' +
        '<div class="text-xs muted mt8">已完成 ' + done + '/' + cups + ' 杯</div></div>' +
      '<div class="card"><div class="section-title">早 · 中 · 晚</div><div class="water-grid" id="cup-grid">' + grid + '</div></div>' +
      '<div class="card"><div class="section-title">健身前 · 中 · 后</div><div class="water-grid" id="fit-grid">' + fitGrid + '</div></div>' +
      '<div class="card"><div class="section-title">提醒设置（后台推送）</div>' +
        remindHtml +
        '<div class="flex mt8"><input type="time" id="remind-new" class="full" style="border:1px solid var(--line);border-radius:8px;padding:6px"/><button class="btn sm ml8" id="remind-add">加</button></div>' +
        '<button class="btn block mt12 ' + (notifOn ? 'ghost' : '') + '" id="notif-btn">' + (notifOn ? '已开启提醒通知 ✓' : '开启提醒通知') + '</button>' +
        '<div class="muted text-xs mt8">开启后，到设定时间会在手机/浏览器弹出喝水提醒（需授权通知）。</div></div>';

    c.querySelectorAll('[data-cup]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.cup;
        if (w.cups[i]) { w.cups[i] = false; } else { w.cups[i] = true; App.achieve('f1', 10, '喝一杯水'); }
        App.dset('water', w); renderWater(c);
      };
    });
    c.querySelectorAll('[data-fit]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.fit;
        if (w.fit[i]) { w.fit[i] = false; } else { w.fit[i] = true; App.achieve('f1', 10, '健身补水'); }
        App.dset('water', w); renderWater(c);
      };
    });
    c.querySelectorAll('input[type=time][data-ri]').forEach(inp => {
      inp.onchange = () => {
        const ri = +inp.dataset.ri;
        const arr = App.dget('waterReminders', reminds);
        arr[ri] = inp.value; App.dset('waterReminders', arr);
        App.toast('已更新提醒时间');
      };
    });
    c.querySelectorAll('.remind-row .del').forEach(d => {
      d.onclick = () => {
        const ri = +d.dataset.ri;
        const arr = App.dget('waterReminders', reminds);
        arr.splice(ri, 1); App.dset('waterReminders', arr); renderWater(c);
      };
    });
    document.getElementById('remind-add').onclick = () => {
      const v = document.getElementById('remind-new').value;
      if (!v) return;
      const arr = App.dget('waterReminders', reminds);
      arr.push(v); App.dset('waterReminders', arr); renderWater(c);
    };
    document.getElementById('notif-btn').onclick = () => enableWaterNotif(c);
  }

  function enableWaterNotif(c) {
    if (typeof Notification === 'undefined') { App.toast('当前浏览器不支持通知'); return; }
    const ask = () => {
      App.set('waterNotif', true);
      App.toast('已开启喝水提醒 💧');
      scheduleReminders();
      if (c) renderWater(c);
    };
    if (Notification.permission === 'granted') ask();
    else if (Notification.permission === 'denied') App.toast('通知被拒绝，请在浏览器设置里允许');
    else Notification.requestPermission().then(p => { if (p === 'granted') ask(); else App.toast('未授权通知'); });
  }

  function scheduleReminders() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const reminds = App.get('waterReminders', ['09:00', '11:00', '14:00', '16:00', '19:00']);
    const now = new Date();
    reminds.forEach(t => {
      const parts = t.split(':');
      const h = +parts[0], m = +parts[1];
      const fire = new Date(); fire.setHours(h, m, 0, 0);
      let ms = fire - now;
      if (ms < 0) ms += 86400000;
      setTimeout(() => {
        try { new Notification('活力婷 · 喝水提醒 💧', { body: '该喝水啦，保持身体水分～' }); } catch (e) {}
        App.toast('💧 喝水时间到');
        if (App.get('waterNotif', false)) scheduleReminders();
      }, ms);
    });
  }

  /* ---------------- 健身计划（肩/背/腰 分化 + 休息日 + 面部瑜伽） ---------------- */
  function weekLabels() { return ['日', '一', '二', '三', '四', '五', '六']; }
  function renderFitness(c) {
    const today = App.today();
    const weekday = new Date().getDay();           // 0=日 .. 6=六
    const di = App.dayIndex();
    const restDays = App.get('fitRestDays', []) || [];
    const override = App.dget('fitOverride', '') === today;
    const isRest = !override && restDays.indexOf(weekday) >= 0;
    const focus = isRest ? '休息' : (DATA.fitWeekPlan[weekday] || '有氧放松');

    let f = App.dget('fitness', { date: '', done: false });
    if (f.date !== today) f = { date: today, done: false };

    // 按部位从动作池取 4 个，按日轮换
    let planEx = [];
    if (focus === '有氧放松') planEx = [{ name: '快走/慢跑 20 分钟', rep: '' }, { name: '拉伸放松 10 分钟', rep: '' }, { name: '泡沫轴放松', rep: '' }];
    else if (focus !== '休息') planEx = pickRot(DATA.fitSplit[focus] || [], 4, di);

    let html = '<div class="page-head"><h2>健身计划</h2><div class="date">' + App.todayLabel() + '</div></div>';
    html += '<div class="achv-banner"><div class="big">' + (isRest ? '😴' : '💪') + '</div><div class="grow"><div class="t">' +
      (isRest ? '今日休息日' : '今日主攻 · ' + focus) + '</div><div class="s" style="opacity:1">' +
      (isRest ? '好好恢复，明天状态更好' : (planEx.length + ' 个动作 · 约 40 分钟')) + '</div></div></div>';

    if (!isRest) {
      html += '<div class="card"><div class="section-title">训练安排（' + focus + '）</div>' +
        (planEx.length ? planEx.map(p => '<div class="row"><span class="dot"></span><span class="grow">' + p.name +
          (p.rep ? ' <span class="muted text-xs">· ' + p.rep + '</span>' : '') + '</span></div>').join('') :
          '<div class="muted text-sm">今天轻松恢复日，做点拉伸就好</div>') + '</div>';
    } else {
      html += '<div class="card"><div class="text-sm">今天是你设置的休息日，给身体一点恢复时间 💤。想动一动也可以切到训练。</div>' +
        '<button class="btn sm mt8" id="override-rest">今天也练 →</button></div>';
    }

    html += '<button class="btn block mt12 ' + (f.done ? 'ghost' : '') + '" id="fit-btn">' + (f.done ? '今日已打卡 ✓' : '完成打卡') + '</button>';
    if (f.done) html += '<div class="card mt12" style="border-color:var(--accent)"><div class="bold accent">🏆 健身打卡完成！</div><div class="text-sm muted mt8">获得成就奖，去大树施肥吧。</div></div>';

    // 休息日设置
    html += '<div class="card mt12"><div class="section-title">休息日设置</div><div class="muted text-xs" style="margin:-2px 0 8px">勾选星期几为休息日（可多选），当天自动安排休息</div>' +
      '<div class="rest-row" id="rest-row">' + weekLabels().map((nm, i) =>
        '<span class="cup-btn ' + (restDays.indexOf(i) >= 0 ? 'done' : '') + '" data-wd="' + i + '">周' + nm + '</span>').join('') + '</div></div>';

    // 面部瑜伽每日打卡
    let fy = App.dget('faceYoga', { date: '', done: false });
    if (fy.date !== today) fy = { date: today, done: false }; else fy.date = today;
    const fyItem = DATA.faceYoga[di % DATA.faceYoga.length];
    html += '<div class="card mt12"><div class="section-title">😊 面部瑜伽（每日打卡）</div>' +
      '<div class="text-sm" style="line-height:1.5">' + escapeHtml(fyItem.name) + ' <span class="muted text-xs">· ' + fyItem.time + ' · ' + fyItem.effect + '</span></div>' +
      '<div class="text-xs muted mt8">' + escapeHtml(fyItem.how) + '</div>' +
      '<button class="btn sm mt8 ' + (fy.done ? 'ghost' : '') + '" id="fy-btn">' + (fy.done ? '今日已打卡 ✓' : '面部瑜伽打卡') + '</button></div>';

    c.innerHTML = html;

    const fb = document.getElementById('fit-btn');
    if (fb) fb.onclick = () => { f.done = true; App.dset('fitness', f); App.achieve('f3', 35, '健身打卡'); App.toast('健身打卡 +35 营养 🌳'); renderFitness(c); };
    const orBtn = document.getElementById('override-rest');
    if (orBtn) orBtn.onclick = () => { App.dset('fitOverride', today); renderFitness(c); };
    c.querySelectorAll('#rest-row .cup-btn').forEach(b => {
      b.onclick = () => {
        const wd = +b.dataset.wd;
        const arr = App.get('fitRestDays', []);
        const idx = arr.indexOf(wd);
        if (idx >= 0) arr.splice(idx, 1); else arr.push(wd);
        App.set('fitRestDays', arr);
        renderFitness(c);
      };
    });
    const fyb = document.getElementById('fy-btn');
    if (fyb) fyb.onclick = () => { fy.done = true; App.dset('faceYoga', fy); App.achieve('f1', 10, '面部瑜伽'); App.toast('面部瑜伽 +10 营养 🌿'); renderFitness(c); };
  }

  /* ---------------- 妆容穿搭（真实天气 + 小红书） ---------------- */
  function bandTemp(t) {
    if (t >= 30) return { name: '炎热', tip: '轻薄透气、防晒第一' };
    if (t >= 26) return { name: '温暖', tip: '棉麻衬衫、短袖都舒服' };
    if (t >= 18) return { name: '舒适', tip: '长袖/薄针织正合适' };
    if (t >= 10) return { name: '微凉', tip: '加一件外套或开衫' };
    return { name: '偏冷', tip: '厚外套+内搭，注意保暖' };
  }
  /* 按日期从池中每日轮换取 n 条（保证每天不一样） */
  function pickRot(pool, n, di) {
    const len = pool.length;
    const start = ((di % len) + len) % len;
    const out = [];
    for (let k = 0; k < n; k++) out.push(pool[(start + k) % len]);
    return out;
  }
  function buildDress(w, weekend, di) {
    return pickRot(weekend ? DATA.dressWeekend : DATA.dressWeekday, 3, di);
  }
  function weatherTips(w) {
    const b = bandTemp(w.temp); const rainy = /雨|雪|雾|雷/.test(w.cond);
    const tips = ['🌡 ' + b.name + '（' + w.temp + '℃）：' + b.tip];
    if (rainy) tips.push('☔ 今日' + w.cond + '：备轻便伞 / 防水小白鞋');
    if (w.humidity && w.humidity > 75) tips.push('💧 湿度 ' + w.humidity + '%：选吸湿排汗面料');
    if (w.temp >= 28) tips.push('☀ 紫外线强：帽子/墨镜，露肤度适中');
    return tips;
  }
  function lookCard(item, emoji) {
    const kw = encodeURIComponent(item.text.slice(0, 24));
    return '<div class="card look-card" style="margin-bottom:10px;display:flex;gap:10px;align-items:center">' +
      '<div class="look-emoji">' + (emoji || '✨') + '</div>' +
      '<div class="look-body grow"><div class="text-sm" style="line-height:1.5">' + escapeHtml(item.text) + '</div>' +
      '<span class="look-link" data-xhs="' + kw + '">在小红书看灵感 →</span></div></div>';
  }

  /* 优先唤起小红书 App，未安装则回退到网页（解决独立 PWA 下 target=_blank 不跳转问题） */
  function openXHS(kw) {
    const web = 'https://www.xiaohongshu.com/search_result?keyword=' + kw;
    const ua = navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua);
    App.toast('正在打开小红书…');
    if (iOS) {
      const scheme = 'xhsdiscover://search/result?keyword=' + kw;
      const start = Date.now();
      window.location.href = scheme;
      setTimeout(function () { if (!document.hidden && Date.now() - start < 2000) window.location.href = web; }, 1000);
    } else {
      const intent = 'intent://search_result?keyword=' + kw + '#Intent;package=com.xingin.xhs;scheme=https;end';
      window.location.href = intent;
      setTimeout(function () { window.location.href = web; }, 1000);
    }
  }
  function bindXHS(root) {
    if (!root) return;
    root.querySelectorAll('[data-xhs]').forEach(el => {
      el.onclick = () => openXHS(el.dataset.xhs);
    });
  }

  async function renderDress(c) {
    const weekend = App.isWeekend();
    const di = App.dayIndex();
    const styleTip = weekend ? '周末 · 活力四射' : '工作日 · 活力又不失正式';
    const makeup = pickRot(weekend ? DATA.makeupWeekend : DATA.makeupWeekday, 3, di);
    c.innerHTML =
      '<div class="page-head"><h2>妆容穿搭</h2><div class="date" id="dress-w">读取天气中…</div></div>' +
      '<div class="achv-banner" style="background:var(--accent-soft);color:var(--accent)"><div class="big">💄</div><div class="grow"><div class="t">今日建议风格</div><div class="s" style="opacity:1">' + styleTip + '</div></div><button class="btn sm" id="dress-refresh">刷新</button></div>' +
      '<div class="muted text-xs mb" style="margin:8px 0">妆容与穿搭均含配图参考，可一键去小红书看更多灵感</div>' +
      '<div class="section-title mt12">💄 妆容建议</div><div id="makeup-list"></div>' +
      '<div class="section-title mt12">👗 穿搭建议</div><div id="dress-list"><div class="muted text-sm">加载中…</div></div>';

    document.getElementById('dress-refresh').onclick = () => { App.dset('weatherCache', null); renderDress(c); };

    const mEl = document.getElementById('makeup-list');
    mEl.innerHTML = makeup.map(o => lookCard(o, '💄')).join('');
    bindXHS(mEl);

    let w = App.dget('weatherCache', null);
    if (!w || w.date !== App.today()) {
      try { w = await API.fetchWeather(API.cfg(API.K.weatherCity, '上海')); w.date = App.today(); App.dset('weatherCache', w); }
      catch (e) { w = null; }
    }
    const dEl = document.getElementById('dress-list');
    const wEl = document.getElementById('dress-w');
    if (!w) {
      wEl.textContent = '天气获取失败（离线）';
      dEl.innerHTML = buildDress(w, weekend, di).map(o => lookCard(o, '👗')).join('') +
        '<div class="muted text-xs mt8">（示例天气，联网后显示真实穿搭建议）</div>';
      bindXHS(dEl);
      return;
    }
    wEl.textContent = w.city + ' ' + w.temp + '℃ ' + w.cond + (w.humidity ? ' · 湿度' + w.humidity + '%' : '');
    const clothes = buildDress(w, weekend, di);
    dEl.innerHTML = clothes.map(o => lookCard(o, '👗')).join('') +
      '<div class="muted text-xs mt8">' + weatherTips(w).map(escapeHtml).join(' · ') + '</div>';
    bindXHS(dEl);
  }
  /* 配图点击已改为小红书外链，无需额外绑定 */

  /* ---------------- 今日娱乐（按日期每日更新：历史上的今天/笑话/脑筋急转弯/冷知识/热话题 + 实时热点） ---------------- */
  function funCard(title, body) {
    return '<div class="card"><div class="section-title">' + title + '</div><div class="text-sm" style="line-height:1.7">' + escapeHtml(body) + '</div></div>';
  }
  function renderFunLive(c, items) {
    const el = document.getElementById('fun-live');
    const body = document.getElementById('fun-live-body');
    const stT = document.getElementById('fun-st-t');
    const stS = document.getElementById('fun-st-s');
    if (!el || !items || !items.length) return;
    el.className = '';
    // 更新状态栏
    if (stT) stT.textContent = '实时热点 · 天行数据';
    if (stS) stS.textContent = items.length + ' 条 · 更新于 ' + new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
    // 渲染内容
    if (body) body.innerHTML = items.slice(0, 8).map(it =>
      '<div class="card" style="margin-bottom:10px"><div class="flex between center"><div class="bold text-sm" style="line-height:1.4">' + escapeHtml(it.title) + '</div>' +
      (it.tag ? '<span class="tag">' + escapeHtml(it.tag) + '</span>' : '') + '</div>' +
      (it.url && it.url !== '#' ? '<div class="mt8"><a class="look-link" href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener">看原文 →</a></div>' : '') +
      '</div>'
    ).join('');
  }
  async function loadFunLive(c) {
    const cache = App.dget('funCache', null);
    // v11: 网络优先 — 先展示缓存，后台刷新
    if (cache && cache.date === App.today() && cache.items && cache.items.length) {
      renderFunLive(c, cache.items);
    }
    // 始终尝试拉取（距上次 > 10 分钟 或 无缓存）
    const now = Date.now();
    const lastFetch = cache ? (cache.fetchTime || 0) : 0;
    const needFetch = !cache || cache.date !== App.today() || !cache.items || !cache.items.length || (now - lastFetch > 10 * 60 * 1000);
    if (needFetch) {
      try {
        console.log('[活力婷] 拉取娱乐热点...');
        const r = await API.fetchFun();
        if (r && r.items && r.items.length) {
          App.dset('funCache', { date: App.today(), items: r.items, fetchTime: Date.now() });
          renderFunLive(c, r.items);  // 用新数据替换
        }
      } catch (e) { console.warn('[活力婷] 娱乐热点拉取失败:', e); }
    }
  }

  async function renderFun(c) {
    const di = App.dayIndex();
    const d = new Date();
    const md = d.getMonth() + 1, dd = d.getDate();
    const histCNList = (DATA.funHistoryCN || []).filter(o => o.m === md && o.d === dd);
    const histCN = histCNList.length ? histCNList[0] : DATA.funHistoryCN[di % DATA.funHistoryCN.length];
    const histWorldList = (DATA.funHistoryWorld || []).filter(o => o.m === md && o.d === dd);
    const histWorld = histWorldList.length ? histWorldList[0] : DATA.funHistoryWorld[di % DATA.funHistoryWorld.length];
    const joke = DATA.funJoke[di % DATA.funJoke.length];
    const brain = DATA.funBrain[di % DATA.funBrain.length];
    const fact = DATA.funFact[(di + 7) % DATA.funFact.length];
    const topic = DATA.funTopic[(di + 13) % DATA.funTopic.length];

    c.innerHTML =
      '<div class="page-head"><h2>今日娱乐</h2><div class="date">每日新鲜 · ' + App.todayLabel() + '</div></div>' +
      // 实时热点区域（置顶，天行数据优先）
      '<div id="fun-live" class="hidden"><div class="achv-banner" style="background:var(--accent-soft);color:var(--accent);margin:8px 0"><div class="big">🔥</div><div class="grow"><div class="t" id="fun-st-t">实时热点</div><div class="s text-xs" id="fun-st-s" style="opacity:1">加载中…</div></div></div><div id="fun-live-body"></div></div>' +
      // 本地内容（固定轮换，始终显示）
      funCard('📅 历史上的今天 · 中国', histCN.t) +
      funCard('🌍 历史上的今天 · 世界各地', histWorld.t) +
      funCard('😄 每日一笑', joke) +
      '<div class="card"><div class="section-title">🤔 脑筋急转弯</div>' +
        '<div class="text-sm" style="line-height:1.7">' + escapeHtml(brain.q) + '</div>' +
        '<span class="look-link" data-brain="1">看答案 →</span>' +
        '<div class="fun-ans hidden" id="brain-ans">' + escapeHtml(brain.a) + '</div></div>' +
      funCard('💡 趣味冷知识', fact) +
      funCard('🔥 今日热话题 · ' + topic.tag, topic.t) +
      '<div class="muted text-xs mt12">基础内容每日轮换；联网时自动补充实时热点（体育/科技等）。</div>';

    const ba = document.querySelector('[data-brain]');
    if (ba) ba.onclick = () => {
      const ans = document.getElementById('brain-ans');
      if (ans) { ans.classList.toggle('hidden'); ba.textContent = ans.classList.contains('hidden') ? '看答案 →' : '收起答案'; }
    };
    loadFunLive(c);
  }

  function escapeHtml(s) { return (s || '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

  App.register('ledger', renderLedger);
  App.register('invest', renderInvest);
  App.register('water', renderWater);
  App.register('fitness', renderFitness);
  App.register('dress', renderDress);
  App.register('fun', renderFun);
  return { scheduleReminders };
})();
