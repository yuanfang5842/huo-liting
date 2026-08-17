/* ============ 今日总览 + 精进日志 ============ */
window.Overview = (function () {

  /* ---------- 今日总览 ---------- */
  function renderOverview(c) {
    const j = App.dget('journal', { tasks: [] });
    const done = (j.tasks || []).filter(t => t.status === 'done').length;
    const todoTotal = (j.tasks || []).length;
    const newsRead = App.dget('newsRead', 0);
    const newsTotal = Object.values(DATA.news).reduce((a, b) => a + b.length, 0);
    const water = App.dget('water', { cups: [] });
    const waterDone = (water.cups || []).filter(x => x).length;
    const focusMin = App.dget('focusMin', 0);

    c.innerHTML =
      '<div class="page-head"><h2>今日总览</h2><div class="date">' + App.todayLabel() + ' · 主题色 ' + App.themeName() + '</div></div>' +
      '<div class="card" style="background:linear-gradient(135deg,var(--accent),var(--accent-deep));color:#fff;border:none">' +
        '<div style="font-size:12px;opacity:.9">早安，活力婷</div>' +
        '<div style="font-size:17px;font-weight:800;margin:4px 0">今天也要好好生活 🌿</div>' +
        '<div style="font-size:12px;opacity:.85">完成 3 项专注，就能领先昨天的自己</div>' +
      '</div>' +
      '<div class="stats-grid mt12">' +
        stat(done + '/' + todoTotal, '待办事项') +
        stat(newsRead + '/' + newsTotal, '已读要闻') +
        stat(waterDone + '/8', '喝水杯数') +
        stat(focusMin + '', '专注分钟') +
      '</div>' +
      focusCard(j) +
      '<div class="card"><div class="section-title">快捷入口</div><div class="quick-grid" id="quick-grid"></div></div>';

    const grid = document.getElementById('quick-grid');
    [['ledger','流水记账'],['invest','投资机会'],['water','喝水提醒'],['english','英语学习']].forEach(([id, name]) => {
      const chip = App.h('<div class="chip"><div class="ic">' + App.icon(id === 'ledger' ? 'wallet' : id === 'invest' ? 'trend' : id === 'water' ? 'drop' : 'globe') + '</div><div class="t">' + name + '</div></div>');
      chip.onclick = () => App.go(id);
      grid.appendChild(chip);
    });
  }
  function stat(v, l) { return '<div class="stat"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }

  function focusCard(j) {
    const items = (j.tasks || []).slice(0, 3).map(t => '<div class="row"><span class="dot"></span><span class="grow">' + escapeHtml(t.text) + '</span></div>').join('') || '<div class="muted text-sm">还没有添加今日要事，去精进日志记一笔吧</div>';
    return '<div class="card mt12"><div class="section-title">今日聚焦</div>' + items + '</div>';
  }

  /* ---------- 精进日志（支持按日期查看/规划未来与翻看以往） ---------- */
  const MAX_TASKS = 3;
  let selDate = App.today(); // 当前选中的日志日期（默認今天，可前后翻/跳到未来规划）
  function blank() { return { tasks: [], goals: {}, schedule: [], record: '', feeling: '' }; }
  function getJ() { return App.dgetOn('journal', null, selDate) || blank(); }
  function saveJ(j) { App.dsetOn('journal', j, selDate); }

  // AI 精进日志反馈系统提示（自由文本，无需 JSON；由 callLLMText 返回纯文本）
  const JOURNAL_FB_SYS = '你是个人成长教练。用户会给你今天的「要事+策略/方法+时间安排+精进记录+感悟」。请输出一段真诚、具体、可执行的反馈与明天建议（250 字以内）：点出今天的亮点，指出 1-2 个可改进的具体点，并给一句明天的行动建议。用自然口语、分点叙述，不要使用 JSON 格式，直接给纯文本。';
  /* 每日日志快照归档（用于跨日导出全部日志；按当前选中日期归档，未来/以往均正确） */
  function archiveJournal(j) {
    const arr = App.get('journalArchive', []) || [];
    const snap = {
      date: selDate,
      tasks: j.tasks || [],
      goals: j.goals || {},
      schedule: j.schedule || [],
      record: j.record || '',
      feeling: j.feeling || ''
    };
    const idx = arr.findIndex(x => x.date === snap.date);
    if (idx >= 0) arr[idx] = snap; else arr.push(snap);
    App.set('journalArchive', arr);
  }

  function renderJournal(c) {
    let j = getJ();
    const tasks = j.tasks || [];

    const isToday = selDate === App.today();
    const dt = selDate === App.shiftDate(App.today(), 1) ? '明天' :
      selDate === App.shiftDate(App.today(), -1) ? '昨天' : (isToday ? '今天' : '');
    const dateTag = dt || (selDate > App.today() ? '未来规划' : '历史记录');

    let taskHtml = '<div id="task-list"></div>';
    if (tasks.length >= MAX_TASKS) taskHtml += '<div class="muted text-xs mt8">最多 3 件（与策略/方法一一对应）</div>';
    else taskHtml +=
      '<div class="muted text-xs mt8">💡 框架提示：目标 → 关键动作 → 可验证结果。例：完成 Q3 方案 = 周三前写完 v1 + 找 2 人评审</div>' +
      '<div class="flex mt8"><input id="task-in" class="full" placeholder="用「目标→动作→结果」写一件要事…" style="border:1px solid var(--line);border-radius:10px;padding:8px;font-size:13px"/>' +
      '<button class="btn sm ml8" id="task-add">添加</button></div>';

    // 今日目标：与要事一一对应
    let goalHtml = '';
    if (tasks.length === 0) {
      goalHtml = '<div class="muted text-sm">先添加今日要事，策略/方法会自动对应这三件事。</div>';
    } else {
      tasks.forEach((t) => {
        const g = j.goals[t.id] || {};
        goalHtml +=
          '<div class="day-card" style="margin-bottom:10px"><div class="dh"><span class="grow bold text-sm">' + escapeHtml(t.text) + '</span></div>' +
          '<div class="field" style="margin:8px 0 0"><label>策略</label><textarea data-goal="' + t.id + '" data-field="strategy" placeholder="达成这件事的总体策略…">' + escapeHtml(g.strategy || '') + '</textarea></div>' +
          '<div class="field" style="margin:8px 0 0"><label>方法</label><textarea data-goal="' + t.id + '" data-field="method" placeholder="具体怎么做，第一步是什么…">' + escapeHtml(g.method || '') + '</textarea></div></div>';
      });
    }

    c.innerHTML =
      '<div class="page-head"><h2>精进日志</h2><div class="date">' + App.dateLabel(selDate) + '</div></div>' +
      '<div class="card" style="padding:10px 12px">' +
        '<div class="flex" style="align-items:center;justify-content:space-between">' +
          '<button class="btn sm" id="date-prev" style="width:38px">‹</button>' +
          '<div style="text-align:center;line-height:1.3"><div class="bold text-sm">' + App.dateLabel(selDate) + '</div>' +
          '<div class="muted text-xs" style="color:var(--accent)">' + dateTag + '</div></div>' +
          '<button class="btn sm" id="date-next" style="width:38px">›</button>' +
        '</div>' +
        '<div class="flex mt8" style="gap:6px;align-items:center;justify-content:center">' +
          '<button class="btn sm ghost" id="date-today">回到今天</button>' +
          '<input type="date" id="date-pick" value="' + selDate + '" style="border:1px solid var(--line);border-radius:8px;padding:5px 6px;font-size:12px;color:var(--ink-2)"/>' +
        '</div>' +
      '</div>' +
      quadCardHtml() +
      '<div class="card"><div class="section-title">今日要事（最多 3 件）</div>' + taskHtml + '</div>' +
      '<div class="card"><div class="section-title">策略 & 方法（对应要事）</div>' + goalHtml + '</div>' +
      '<div class="card"><div class="section-title">时间安排</div>' +
        '<div class="muted text-xs" style="margin:-4px 0 8px;line-height:1.6">勾选「确认」标记已定的安排（含未来已确定事项），再点「→四象限」放入本周计划，避免重复填写。</div>' +
        '<div id="sched-list"></div>' +
        '<div class="flex mt8"><input id="sched-time" placeholder="09:00" style="width:70px;border:1px solid var(--line);border-radius:10px;padding:8px;font-size:13px"/>' +
        '<input id="sched-text" class="full ml8" placeholder="安排事项…" style="border:1px solid var(--line);border-radius:10px;padding:8px;font-size:13px"/>' +
        '<button class="btn sm ml8" id="sched-add">加</button></div></div>' +
      '<div class="card"><div class="section-title">今日精进记录及感悟</div>' +
        '<div class="field"><label>精进记录</label><textarea id="rec" placeholder="今天学到了什么、做了什么…">' + escapeHtml(j.record || '') + '</textarea></div>' +
        '<div class="field"><label>感悟</label><textarea id="feel" placeholder="一点体会…">' + escapeHtml(j.feeling || '') + '</textarea></div></div>' +
      '<div class="feedback-card" id="fb-card">' + feedbackInnerHtml(j) + '</div>' +
      '<button class="btn block mt12" id="journal-save">保存今日日志</button>' +
      '<button class="btn block mt8 ghost" id="journal-export">⬇ 导出全部日志（CSV · Excel 可打开）</button>';

    renderTasks(c);
    renderSched(c);
    renderQuad(c);

    // 日期导航：前后翻 / 回到今天 / 跳到指定日期（含未来规划与历史回看）
    const rebindDate = () => renderJournal(c);
    document.getElementById('date-prev').onclick = () => { selDate = App.shiftDate(selDate, -1); rebindDate(); };
    document.getElementById('date-next').onclick = () => { selDate = App.shiftDate(selDate, 1); rebindDate(); };
    document.getElementById('date-today').onclick = () => { selDate = App.today(); rebindDate(); };
    document.getElementById('date-pick').onchange = (e) => { if (e.target.value) { selDate = e.target.value; rebindDate(); } };

    const addBtn = document.getElementById('task-add');
    if (addBtn) addBtn.onclick = () => {
      const v = document.getElementById('task-in').value.trim();
      if (!v) return;
      const jj = getJ();
      if ((jj.tasks || []).length >= MAX_TASKS) { App.toast('最多 3 件要事'); return; }
      jj.tasks = jj.tasks || [];
      jj.tasks.push({ id: Date.now(), text: v, status: '' });
      saveJ(jj);
      App.toast('已添加要事');
      renderJournal(c);
    };
    document.getElementById('sched-add').onclick = () => {
      const tm = document.getElementById('sched-time').value.trim();
      const tx = document.getElementById('sched-text').value.trim();
      if (!tx) return;
      const jj = getJ();
      jj.schedule = jj.schedule || [];
      jj.schedule.push({ id: Date.now(), time: tm, text: tx, done: false, confirmed: false, syncedQ: 0 });
      saveJ(jj);
      document.getElementById('sched-time').value = '';
      document.getElementById('sched-text').value = '';
      renderSched(c);
    };
    // 目标输入自动保存
    c.querySelectorAll('[data-goal]').forEach(ta => {
      ta.oninput = () => {
        const jj = getJ();
        jj.goals = jj.goals || {};
        jj.goals[ta.dataset.goal] = jj.goals[ta.dataset.goal] || {};
        jj.goals[ta.dataset.goal][ta.dataset.field] = ta.value;
        saveJ(jj);
      };
    });
    // 记录/感悟自动保存
    ['rec', 'feel'].forEach(id => {
      const el = document.getElementById(id);
      el.oninput = () => { const jj = getJ(); jj[id === 'rec' ? 'record' : 'feeling'] = el.value; saveJ(jj); };
    });
    document.getElementById('journal-save').onclick = () => {
      const jj = getJ();
      jj.record = document.getElementById('rec').value;
      jj.feeling = document.getElementById('feel').value;
      saveJ(jj);
      archiveJournal(jj);
      App.achieve('f2', 20, '完成精进日志');
      App.toast('已保存，今日精进 +20 营养 🌱');
    };
    document.getElementById('journal-export').onclick = () => {
      const arr = App.get('journalArchive', []) || [];
      if (!arr.length) { App.toast('还没有可导出的日志，先保存今日日志'); return; }
      const rows = [['日期', '今日要事与策略/方法', '时间安排', '精进记录', '今日感悟']];
      arr.forEach(e => {
        const tasks = (e.tasks || []).map(t => {
          const g = (e.goals || {})[t.id] || {};
          return '· ' + t.text + (t.status === 'done' ? ' ✓' : '') +
            (g.strategy ? ' [策略]' + g.strategy : '') +
            (g.method ? ' [方法]' + g.method : '');
        }).join('  ');
        const sched = (e.schedule || []).map(s => s.time + ' ' + s.text + (s.done ? ' ✓' : '')).join('  ');
        rows.push([e.date, tasks, sched, e.record || '', e.feeling || '']);
      });
      App.exportCSV('活力婷_精进日志_' + App.today() + '.csv', rows);
      App.toast('已导出 ' + arr.length + ' 天日志');
    };
    bindAiFeedback(c);
  }

  function refreshFeedback(c) {
    const box = document.getElementById('fb-card');
    if (box) box.innerHTML = feedbackInnerHtml(getJ());
    bindAiFeedback(c);
  }

  // 反馈卡片内部结构：规则引擎即时反馈 + （配置了大模型时）AI 深度分析按钮
  function feedbackInnerHtml(j) {
    const llmOk = (API.llmReady && API.llmReady());
    return '<div class="ft">💡 今日建议反馈</div>' +
      '<div id="fb-body">' + genFeedback(j) + '</div>' +
      (llmOk
        ? '<button class="btn sm mt8" id="ai-fb-btn">🤖 用 AI 深度分析今日</button><div id="ai-fb-box"></div>'
        : '<div class="muted text-xs mt8" style="color:var(--ink-3)">💡 在「设置 → 大模型配置」填写 Key 后，可让 AI 针对你今天的日志给出深度反馈。</div>');
  }

  // 绑定 AI 反馈按钮（每次重渲染后调用）
  function bindAiFeedback(c) {
    const btn = document.getElementById('ai-fb-btn');
    if (btn) btn.onclick = () => genAiFeedback(c);
  }

  // 调用大模型生成自由文本反馈（callLLMText 返回字符串，无需 JSON.parse）
  async function genAiFeedback(c) {
    const box = document.getElementById('ai-fb-box');
    const btn = document.getElementById('ai-fb-btn');
    if (!box) return;
    if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
    box.innerHTML = '<div class="muted text-sm">🤖 AI 深度分析生成中…</div>';
    const j = getJ();
    const tasks = (j.tasks || []).map(t => {
      const g = j.goals[t.id] || {};
      return '· ' + t.text + (t.status === 'done' ? '（已完成）' : '') +
        (g.strategy ? ' 策略：' + g.strategy : '') + (g.method ? ' 方法：' + g.method : '');
    }).join('\n');
    const sched = (j.schedule || []).map(s => s.time + ' ' + s.text).join('\n');
    const userPrompt = '【今日要事】\n' + (tasks || '（无）') + '\n\n【时间安排】\n' + (sched || '（无）') +
      '\n\n【精进记录】\n' + (j.record || '（空）') + '\n\n【今日感悟】\n' + (j.feeling || '（空）');
    try {
      const text = await API.callLLMText(JOURNAL_FB_SYS, userPrompt);
      box.innerHTML =
        '<div class="card mt12" style="border-color:var(--accent)"><div class="section-title">🤖 AI 深度反馈</div>' +
        '<div style="line-height:1.8">' + escapeHtml(text).replace(/\n/g, '<br>') + '</div>' +
        '<div class="muted text-xs mt8" style="color:var(--ink-3)">由「设置 → 大模型配置」所选模型实时生成。</div></div>';
    } catch (e) {
      const m = e.message || '';
      if (m.indexOf('LOCAL_ENGINE') === 0 || m.indexOf('NO_KEY') === 0) {
        box.innerHTML = '<div class="muted text-xs mt8" style="color:var(--ink-3)">💡 在「设置 → 大模型配置」填写 Key 后即可获取 AI 深度反馈。</div>';
      } else if (m.indexOf('CORS') === 0) {
        box.innerHTML = '<div class="muted text-xs mt8" style="color:#c0392b">⚠️ ' + escapeHtml(m) + '</div>';
      } else {
        box.innerHTML = '<div class="muted text-xs mt8" style="color:var(--ink-3)">⚠️ AI 反馈生成失败（' + escapeHtml(m.slice(0, 60)) + '），已为你保留上方本地反馈。</div>';
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🤖 用 AI 深度分析今日'; }
    }
  }

  function genFeedback(j) {
    const tasks = j.tasks || [];
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const recFilled = (j.record || '').trim().length > 0;
    const feelFilled = (j.feeling || '').trim().length > 0;
    const tips = [];
    if (total === 0) {
      tips.push('先记下今天的 1-3 件要事，目标才有落点。');
    } else {
      if (done === total) tips.push('今天要事全部完成，执行力在线 💪 明天可把目标拆得更细，挑战更高难度。');
      else if (done > 0) tips.push('完成 ' + done + '/' + total + ' 件，未完成的建议用番茄钟拆成 25 分钟小步，先动起来最关键。');
      else tips.push('还没有要事完成，挑一件最容易的先做，启动后阻力会小很多。');
      tasks.forEach(t => {
        const g = j.goals[t.id] || {};
        if (t.status === 'done' && (!g.strategy || !g.method))
          tips.push('「' + truncate(t.text, 12) + '」已完成，但目标还没写清策略/方法，补一句具体动作，下次可复制。');
      });
    }
    if (!recFilled) tips.push('花 2 分钟记下今天的关键收获，沉淀比完成更值钱。');
    if (!feelFilled) tips.push('写一句今日感悟，帮大脑给今天画上句号。');
    if (total > 0 && done === total && recFilled && feelFilled) tips.push('今日闭环做得很好，保持「做完—记录—感悟」的飞轮 🌟');
    return tips.map(t => '<div class="row" style="border:none;padding:6px 0"><span class="dot"></span><span class="grow text-sm">' + escapeHtml(t) + '</span></div>').join('');
  }

  function truncate(s, n) { s = (s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

  /* ---------- 本周《时间四象限》管理法（按选中日期所在周持久化） ---------- */
  function weekKeyFor(dateStr) {
    const d = App.parseDate(dateStr);
    const onejan = new Date(d.getFullYear(), 0, 1);
    const wk = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return d.getFullYear() + '-W' + wk;
  }
  function weekRangeLabel(dateStr) {
    const d = App.parseDate(dateStr);
    const dow = (d.getDay() + 6) % 7; // 周一为 0
    const mon = new Date(d); mon.setDate(d.getDate() - dow);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return App.fmtDate(mon).slice(5) + ' ~ ' + App.fmtDate(sun).slice(5);
  }
  function getQuad(wk) {
    let q = App.get('quad_' + wk, null);
    if (!q) {
      // 兼容旧版：若曾用单一 quad 且周一致，则迁移
      const legacy = App.get('quad', null);
      if (legacy && legacy.week === wk) { q = legacy; App.set('quad_' + wk, q); App.set('quad', null); }
      else q = { week: wk, items: { 1: [], 2: [], 3: [], 4: [] } };
    }
    return q;
  }
  function saveQuad(q, wk) { App.set('quad_' + wk, q); }
  function quadCardHtml() {
    const wk = weekKeyFor(selDate);
    const Q = [
      { n: 1, t: '重要 · 紧急', sub: '立刻做' },
      { n: 2, t: '重要 · 不紧急', sub: '排计划做（成长关键）' },
      { n: 3, t: '紧急 · 不重要', sub: '尽量授权/集中做' },
      { n: 4, t: '不重要 · 不紧急', sub: '少做或删掉' },
    ];
    let g = '<div class="card"><div class="section-title">📊 本周《时间四象限》管理法</div>' +
      '<div class="muted text-xs" style="margin:-6px 0 6px;color:var(--accent)">周期：' + weekRangeLabel(selDate) + '（' + (wk === weekKeyFor(App.today()) ? '本周' : '所选日期所在周') + '）</div>' +
      '<div class="muted text-xs" style="margin:0 0 10px;line-height:1.6">把本周的事放进四个格子：先搞定「重要且紧急」，留出时间做「重要不紧急」（这才是成长关键），「紧急不重要」尽量授权，「不重要不紧急」少做或删掉。安排项点「→四象限」可一键放入。</div>' +
      '<div class="quad-grid">';
    Q.forEach(q => {
      g += '<div class="quad q' + q.n + '"><div class="qh">' + q.t + ' <span class="muted text-xs">· ' + q.sub + '</span></div>' +
        '<div class="qlist" id="q-list-' + q.n + '"></div>' +
        '<div class="qadd"><input id="q-in-' + q.n + '" placeholder="加一件…" style="border:1px solid var(--line);border-radius:8px;padding:6px;font-size:12px"/>' +
        '<button class="qadd-btn" data-q="' + q.n + '">加</button></div></div>';
    });
    g += '</div></div>';
    return g;
  }
  function renderQuad(c) {
    const wk = weekKeyFor(selDate);
    const q = getQuad(wk);
    [1, 2, 3, 4].forEach(n => {
      const list = document.getElementById('q-list-' + n);
      if (!list) return;
      list.innerHTML = '';
      (q.items[n] || []).forEach(it => {
        const tag = it.fromSched ? ' <span class="qi-link" title="来自时间安排同步">🔗</span>' : '';
        const row = App.h('<div class="qi"><span class="qt">' + escapeHtml(it.text) + tag + '</span><span class="qx">✕</span></div>');
        row.querySelector('.qx').onclick = () => {
          const qq = getQuad(wk);
          qq.items[n] = (qq.items[n] || []).filter(x => x.id !== it.id);
          saveQuad(qq, wk); renderQuad(c);
        };
        list.appendChild(row);
      });
    });
    c.querySelectorAll('.qadd-btn').forEach(b => {
      b.onclick = () => {
        const n = +b.dataset.q;
        const inp = document.getElementById('q-in-' + n);
        const v = inp.value.trim();
        if (!v) return;
        const qq = getQuad(wk);
        qq.items[n] = qq.items[n] || [];
        qq.items[n].push({ id: Date.now(), text: v });
        saveQuad(qq, wk);
        inp.value = '';
        renderQuad(c);
      };
    });
    c.querySelectorAll('.quad .qadd input').forEach(inp => {
      inp.onkeydown = (e) => { if (e.key === 'Enter') { const btn = inp.parentElement.querySelector('.qadd-btn'); if (btn) btn.click(); } };
    });
  }

  function renderTasks(c) {
    const j = getJ();
    const list = document.getElementById('task-list');
    if (!list) return;
    list.innerHTML = '';
    (j.tasks || []).forEach(t => {
      const row = App.h('<div class="row"><span class="grow">' + escapeHtml(t.text) + '</span></div>');
      const del = App.h('<span style="color:var(--ink-3);cursor:pointer;font-size:12px;margin-left:4px">✕</span>');
      del.onclick = () => {
        const jj = getJ();
        jj.tasks = (jj.tasks || []).filter(x => x.id !== t.id);
        if (jj.goals) delete jj.goals[t.id];
        saveJ(jj);
        renderJournal(c);
      };
      const st = App.h('<div class="check ' + (t.status === 'done' ? 'done' : 'fail') + '" title="点击切换：完成绿勾 / 未完成红叉">' + (t.status === 'done' ? '✓' : '✗') + '</div>');
      st.onclick = () => {
        if (t.status === 'done') { t.status = ''; }
        else { t.status = 'done'; App.achieve('f2', 20, '完成要事'); }
        saveJ(j);
        renderJournal(c);
      };
      const wrap = App.h('<span style="display:flex;gap:8px;align-items:center"></span>');
      wrap.appendChild(st); wrap.appendChild(del);
      row.appendChild(wrap);
      list.appendChild(row);
    });
  }

  /* 安排项「→四象限」当前展开的选择器（仅一个项同时展开） */
  let schedPickerFor = 0;

  function renderSched(c) {
    const j = getJ();
    const list = document.getElementById('sched-list');
    if (!list) return;
    list.innerHTML = '';
    (j.schedule || []).forEach(s => {
      const syncLabel = s.syncedQ ? ('Q' + s.syncedQ + ' ✓') : '→四象限';
      const row = App.h('<div class="sched-row ' + (s.done ? 'done' : '') + (s.confirmed ? ' confirmed' : '') + '">' +
        '<div class="sr1"><span class="check ' + (s.done ? 'done' : 'fail') + '">' + (s.done ? '✓' : '') + '</span>' +
        '<span class="bold text-sm" style="width:44px">' + escapeHtml(s.time || '') + '</span>' +
        '<span class="grow">' + escapeHtml(s.text) + '</span></div>' +
        '<div class="sr2">' +
          '<span class="sched-confirm" data-id="' + s.id + '">' + (s.confirmed ? '已确认' : '确认') + '</span>' +
          '<span class="sched-sync" data-id="' + s.id + '">' + syncLabel + '</span>' +
          '<span class="del" data-id="' + s.id + '">✕</span>' +
        '</div></div>');
      row.querySelector('.check').onclick = (e) => { e.stopPropagation(); s.done = !s.done; saveJ(j); renderSched(c); };
      row.querySelector('.grow').onclick = () => { s.done = !s.done; saveJ(j); renderSched(c); };
      row.querySelector('.sched-confirm').onclick = () => { s.confirmed = !s.confirmed; saveJ(j); renderSched(c); };
      row.querySelector('.sched-sync').onclick = () => { schedPickerFor = (schedPickerFor === s.id ? 0 : s.id); renderSched(c); };
      row.querySelector('.del').onclick = (e) => { e.stopPropagation(); removeSched(c, s); };
      list.appendChild(row);
      // 内联象限选择器
      if (schedPickerFor === s.id) {
        const wk = weekKeyFor(selDate);
        const q = getQuad(wk);
        const picker = App.h('<div class="quad-pick" data-id="' + s.id + '">' +
          '<span class="muted text-xs">放入：</span>' +
          [1, 2, 3, 4].map(n => '<button class="qp qp' + n + '" data-q="' + n + '">Q' + n + '</button>').join('') +
          (s.syncedQ ? '<button class="qp qp-x" data-q="0">移除</button>' : '') +
          '</div>');
        picker.querySelectorAll('.qp').forEach(b => {
          b.onclick = () => {
            const n = +b.dataset.q;
            if (n === 0) unsyncSched(c, s);
            else syncSchedToQuad(c, s, n);
            schedPickerFor = 0;
          };
        });
        list.appendChild(picker);
      }
    });
    if ((j.schedule || []).length === 0) {
      list.innerHTML = '<div class="muted text-xs" style="padding:4px 2px">还没有时间安排。可填写当天或未来已确定的事项，确认后同步到本周四象限。</div>';
    }
  }

  function removeSched(c, s) {
    const j = getJ();
    if (s.syncedQ) {
      const wk = weekKeyFor(selDate);
      const q = getQuad(wk);
      q.items[s.syncedQ] = (q.items[s.syncedQ] || []).filter(x => x.fromSched !== s.id);
      saveQuad(q, wk);
    }
    j.schedule = (j.schedule || []).filter(x => x.id !== s.id);
    saveJ(j);
    renderSched(c); renderQuad(c);
  }

  /* 把已确认安排同步进本周四象限（按当前日志日期所在周） */
  function syncSchedToQuad(c, s, qn) {
    const j = getJ();
    const it = (j.schedule || []).find(x => x.id === s.id);
    if (!it) return;
    const wk = weekKeyFor(selDate);
    const q = getQuad(wk);
    // 先移除该安排在此象限的旧副本（支持改放其他象限）
    q.items[qn] = (q.items[qn] || []).filter(x => x.fromSched !== it.id);
    q.items[qn].push({ id: Date.now(), text: (it.time ? it.time + ' ' : '') + it.text, fromSched: it.id });
    saveQuad(q, wk);
    it.syncedQ = qn;
    saveJ(j);
    renderSched(c); renderQuad(c);
    App.toast('已同步到本周四象限 Q' + qn);
  }

  function unsyncSched(c, s) {
    const j = getJ();
    const it = (j.schedule || []).find(x => x.id === s.id);
    if (!it || !it.syncedQ) return;
    const wk = weekKeyFor(selDate);
    const q = getQuad(wk);
    q.items[it.syncedQ] = (q.items[it.syncedQ] || []).filter(x => x.fromSched !== it.id);
    saveQuad(q, wk);
    const prev = it.syncedQ; it.syncedQ = 0;
    saveJ(j);
    renderSched(c); renderQuad(c);
    App.toast('已从本周四象限 Q' + prev + ' 移除');
  }

  function escapeHtml(s) { return (s || '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

  App.register('overview', renderOverview);
  App.register('journal', renderJournal);
  return {};
})();
