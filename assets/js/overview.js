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

  /* ---------- 精进日志 ---------- */
  const MAX_TASKS = 3;
  function blank() { return { tasks: [], goals: {}, schedule: [], record: '', feeling: '' }; }
  function getJ() { return App.dget('journal', null) || blank(); }
  function saveJ(j) { App.dset('journal', j); }

  function renderJournal(c) {
    let j = getJ();
    const tasks = j.tasks || [];

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

    const fb = genFeedback(j);

    c.innerHTML =
      '<div class="page-head"><h2>精进日志</h2><div class="date">' + App.todayLabel() + '</div></div>' +
      quadCardHtml() +
      '<div class="card"><div class="section-title">今日要事（最多 3 件）</div>' + taskHtml + '</div>' +
      '<div class="card"><div class="section-title">策略 & 方法（对应要事）</div>' + goalHtml + '</div>' +
      '<div class="card"><div class="section-title">时间安排</div>' +
        '<div id="sched-list"></div>' +
        '<div class="flex mt8"><input id="sched-time" placeholder="09:00" style="width:70px;border:1px solid var(--line);border-radius:10px;padding:8px;font-size:13px"/>' +
        '<input id="sched-text" class="full ml8" placeholder="安排事项…" style="border:1px solid var(--line);border-radius:10px;padding:8px;font-size:13px"/>' +
        '<button class="btn sm ml8" id="sched-add">加</button></div></div>' +
      '<div class="card"><div class="section-title">今日精进记录及感悟</div>' +
        '<div class="field"><label>精进记录</label><textarea id="rec" placeholder="今天学到了什么、做了什么…">' + escapeHtml(j.record || '') + '</textarea></div>' +
        '<div class="field"><label>感悟</label><textarea id="feel" placeholder="一点体会…">' + escapeHtml(j.feeling || '') + '</textarea></div></div>' +
      '<div class="feedback-card" id="fb-card"><div class="ft">💡 今日建议反馈（本地规则引擎生成 · 未调用大模型）</div>' + fb + '</div>' +
      '<button class="btn block mt12" id="journal-save">保存今日日志</button>';

    renderTasks(c);
    renderSched(c);
    renderQuad(c);

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
      jj.schedule.push({ id: Date.now(), time: tm, text: tx });
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
      App.achieve('f2', 20, '完成精进日志');
      App.toast('已保存，今日精进 +20 营养 🌱');
    };
  }

  function refreshFeedback(c) {
    const box = document.getElementById('fb-card');
    if (box) box.innerHTML = '<div class="ft">💡 今日建议反馈（根据完成情况自动生成）</div>' + genFeedback(getJ());
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

  /* ---------- 本周《时间四象限》管理法（按 ISO 周持久化） ---------- */
  function weekKey() {
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const wk = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return d.getFullYear() + '-W' + wk;
  }
  function getQuad() {
    const cur = weekKey();
    let q = App.get('quad', null);
    if (!q || q.week !== cur) q = { week: cur, items: { 1: [], 2: [], 3: [], 4: [] } };
    return q;
  }
  function saveQuad(q) { App.set('quad', q); }
  function quadCardHtml() {
    const Q = [
      { n: 1, t: '重要 · 紧急', sub: '立刻做' },
      { n: 2, t: '重要 · 不紧急', sub: '排计划做（成长关键）' },
      { n: 3, t: '紧急 · 不重要', sub: '尽量授权/集中做' },
      { n: 4, t: '不重要 · 不紧急', sub: '少做或删掉' },
    ];
    let g = '<div class="card"><div class="section-title">📊 本周《时间四象限》管理法</div>' +
      '<div class="muted text-xs" style="margin:-6px 0 10px;line-height:1.6">把本周的事放进四个格子：先搞定「重要且紧急」，留出时间做「重要不紧急」（这才是成长关键），「紧急不重要」尽量授权，「不重要不紧急」少做或删掉。</div>' +
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
    const q = getQuad();
    [1, 2, 3, 4].forEach(n => {
      const list = document.getElementById('q-list-' + n);
      if (!list) return;
      list.innerHTML = '';
      (q.items[n] || []).forEach(it => {
        const row = App.h('<div class="qi"><span class="qt">' + escapeHtml(it.text) + '</span><span class="qx">✕</span></div>');
        row.querySelector('.qx').onclick = () => {
          const qq = getQuad();
          qq.items[n] = (qq.items[n] || []).filter(x => x.id !== it.id);
          saveQuad(qq); renderQuad(c);
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
        const qq = getQuad();
        qq.items[n] = qq.items[n] || [];
        qq.items[n].push({ id: Date.now(), text: v });
        saveQuad(qq);
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

  function renderSched(c) {
    const j = getJ();
    const list = document.getElementById('sched-list');
    if (!list) return;
    list.innerHTML = '';
    (j.schedule || []).forEach(s => {
      const row = App.h('<div class="row sched-row ' + (s.done ? 'done' : '') + '">' +
        '<span class="check ' + (s.done ? 'done' : 'fail') + '">' + (s.done ? '✓' : '') + '</span>' +
        '<span class="dot"></span><span class="bold text-sm" style="width:46px">' + s.time + '</span>' +
        '<span class="grow">' + escapeHtml(s.text) + '</span><span class="del">✕</span></div>');
      const toggle = () => { s.done = !s.done; saveJ(j); renderSched(c); };
      row.querySelector('.check').onclick = (e) => { e.stopPropagation(); toggle(); };
      row.querySelector('.grow').onclick = () => toggle();
      row.querySelector('.del').onclick = (e) => { e.stopPropagation(); j.schedule = (j.schedule || []).filter(x => x.id !== s.id); saveJ(j); renderSched(c); };
      list.appendChild(row);
    });
  }

  function escapeHtml(s) { return (s || '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

  App.register('overview', renderOverview);
  App.register('journal', renderJournal);
  return {};
})();
