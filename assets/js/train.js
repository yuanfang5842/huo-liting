/* ============ 管理技能训练 + 英语学习 + 逻辑口语 ============ */
window.Train = (function () {

  /* ---------------- 管理技能提升训练 ---------------- */
  const SKILL_KEYS = ['目标拆解','沟通协调','团队激励','决策判断','时间精力管理','结构化思维','执行力','影响力','复盘力'];
  const REVIEW_SYS = '你是一位资深企业管理与领导力教练。用户正在完成「管理技能提升训练」的一天训练。' +
    '当天训练主题、方法、完成标准以及用户填写的 3 条训练记录已提供。' +
    '请从「理解准确度」「实践可行度」「反思深度」三个维度给出专业点评，并给出 2-3 条具体、可执行的改进建议。' +
    '输出严格 JSON：{"score":0-100,"summary":"一段总体评价","suggestions":["建议1","建议2","建议3"]}。';

  function buildTasks(d) {
    return [
      { t: d.t + ' · 理解方法', how: d.how, check: '能用自己的话复述今日方法要点' },
      { t: d.t + ' · 最小实践', how: '结合你当前的工作或生活场景，按上述方法完成一次 smallest 实践。', check: d.check },
      { t: d.t + ' · 反思输出', how: '记录一条心得：这次实践你学到了什么？下次遇到类似情况会怎么调整？', check: '完成本日反思记录' }
    ];
  }
  function ensureTasks(p, d) {
    if (!p) p = {};
    if (!p.tasks || !Array.isArray(p.tasks)) {
      // 兼容旧数据：p.done / p.note
      p.tasks = [];
      for (let i = 0; i < 3; i++) p.tasks.push({ done: !!p.done, note: i === 1 ? (p.note || '') : '' });
    }
    while (p.tasks.length < 3) p.tasks.push({ done: false, note: '' });
    return p;
  }
  function dayTasksDone(p) { return p && p.tasks && p.tasks.every(t => t.done); }

  function renderManage(c) {
    let m = App.dget('manage', null);
    if (!m) { renderQuiz(c); return; }
    const skill = DATA.manageSkills[m.skill] || DATA.manageSkills['结构化思维'];
    m.progress = m.progress || {};

    let daysDone = 0, daysWithReview = 0;
    let daysHtml = '';
    skill.days.forEach((d, i) => {
      const n = i + 1;
      let p = ensureTasks(m.progress[n], d);
      m.progress[n] = p;
      if (dayTasksDone(p)) daysDone++;
      if (p.aiReview) daysWithReview++;
      const tasks = buildTasks(d);
      let taskHtml = '';
      tasks.forEach((tk, ti) => {
        const tp = p.tasks[ti] || { done: false, note: '' };
        taskHtml +=
          '<div class="task-row ' + (tp.done ? 'done' : '') + '" style="padding:10px 0;border-bottom:1px solid var(--line)">' +
            '<div class="dh" style="gap:10px"><div class="check ' + (tp.done ? 'done' : '') + '" data-day="' + n + '" data-ti="' + ti + '">' + (tp.done ? '✓' : '') + '</div>' +
            '<span class="grow bold text-sm">' + escapeHtml(tk.t) + '</span></div>' +
            '<div class="how">' + escapeHtml(tk.how) + '</div>' +
            '<div class="check-std">✅ 完成标准：' + escapeHtml(tk.check) + '</div>' +
            '<textarea data-day="' + n + '" data-ti="' + ti + '" placeholder="我的实践 / 一句话记录…">' + escapeHtml(tp.note || '') + '</textarea>' +
          '</div>';
      });

      let reviewHtml = '';
      if (dayTasksDone(p)) {
        if (p.aiReview) {
          reviewHtml =
            '<div class="feedback-card mt8"><div class="ft">AI 教练点评 · ' + (p.aiReview.score || 0) + ' 分</div>' +
            '<div class="text-sm" style="line-height:1.6">' + escapeHtml(p.aiReview.summary || '') + '</div>' +
            '<ul class="text-xs muted mt8" style="padding-left:16px;line-height:1.7">' +
              (p.aiReview.suggestions || []).map(s => '<li>' + escapeHtml(s) + '</li>').join('') + '</ul></div>';
        } else {
          reviewHtml = '<button class="btn block mt8" data-review="' + n + '">🤖 生成专业点评与改进建议</button>';
        }
      }

      daysHtml += '<div class="day-card ' + (dayTasksDone(p) ? 'done' : '') + '">' +
        '<div class="dh"><span class="n">Day' + n + '</span><span class="grow bold text-sm">' + escapeHtml(d.t) + '</span>' +
        '<span class="tag gray">' + (p.tasks.filter(t => t.done).length) + '/3</span></div>' +
        '<div class="task-list">' + taskHtml + '</div>' + reviewHtml + '</div>';
    });
    App.dset('manage', m); // 保存迁移后的结构

    const allDone = daysDone >= skill.days.length;
    let effect;
    if (daysDone === 0) effect = '还没开始训练，今天先完成 Day1 的三条训练，迈出第一步。';
    else if (!allDone) effect = '已完成 ' + daysDone + '/' + skill.days.length + ' 天 · ' + daysWithReview + ' 天已有 AI 点评。建议每天都生成点评，把训练真正变成能力。';
    else effect = '本期 ' + skill.period + ' 天全部完成 🏆 用「复盘力」把收获沉淀成 SOP，让它一直为你所用。';
    const rating = m.rating || 0;
    let stars = '';
    for (let s = 1; s <= 5; s++) stars += '<span class="star ' + (s <= rating ? 'on' : '') + '" data-r="' + s + '">★</span>';

    c.innerHTML =
      '<div class="page-head"><h2>管理技能提升训练</h2><div class="date">' + App.todayLabel() + '</div></div>' +
      '<div class="achv-banner"><div class="big">🎯</div><div><div class="t">推荐模块：' + m.skill + '</div>' +
        '<div class="s">周期 ' + skill.period + ' 天 · 已完成 ' + daysDone + '/' + skill.days.length + ' · 启动 ' + (m.startedDate || '') + '</div></div></div>' +
      '<div class="card"><div class="section-title">训练计划（每天 3 条训练）</div>' + daysHtml + '</div>' +
      '<div class="card"><div class="section-title">训练效果</div>' +
        '<div class="text-sm" style="line-height:1.6">' + escapeHtml(effect) + '</div>' +
        '<div class="muted text-xs mt8">本期整体训练效果自评：</div>' +
        '<div class="rate" id="rate">' + stars + '</div>' +
        (rating ? '<div class="effect-line" id="rate-note">' + rateNote(rating) + '</div>' : '') +
      '</div>' +
      (allDone ? '<div class="card" style="border-color:var(--accent)"><div class="bold accent">🏆 本期训练已通关！</div><div class="text-sm muted mt8">已点亮成就奖，去大树施肥吧。</div></div>' : '') +
      '<button class="btn block mt12 ghost" id="manage-reset">重新评估</button>';

    // task 打卡 / 笔记
    c.querySelectorAll('.check[data-day][data-ti]').forEach(b => {
      b.onclick = () => {
        const n = +b.dataset.day, ti = +b.dataset.ti;
        const mm = App.dget('manage', m);
        mm.progress[n] = ensureTasks(mm.progress[n], skill.days[n - 1]);
        const tp = mm.progress[n].tasks[ti];
        tp.done = !tp.done;
        App.dset('manage', mm);
        if (tp.done) {
          App.achieve('f1', 12, '完成训练项');
          App.toast('训练项完成 +12 营养 🌳');
          if (dayTasksDone(mm.progress[n])) {
            App.achieve('f3', 35, '完成训练日');
            App.toast('本日训练通关 +35 营养 🌳');
          }
        }
        renderManage(c);
      };
    });
    c.querySelectorAll('textarea[data-day][data-ti]').forEach(b => {
      b.oninput = () => {
        const n = +b.dataset.day, ti = +b.dataset.ti;
        const mm = App.dget('manage', m);
        mm.progress[n] = ensureTasks(mm.progress[n], skill.days[n - 1]);
        mm.progress[n].tasks[ti].note = b.value;
        App.dset('manage', mm);
      };
    });
    // 生成点评
    c.querySelectorAll('[data-review]').forEach(b => {
      b.onclick = () => {
        const n = +b.dataset.review;
        const mm = App.dget('manage', m);
        mm.progress[n] = ensureTasks(mm.progress[n], skill.days[n - 1]);
        App.dset('manage', mm);
        genReview(c, mm, n, skill.days[n - 1]);
      };
    });

    const rateBox = document.getElementById('rate');
    if (rateBox) rateBox.querySelectorAll('.star').forEach(st => {
      st.onclick = () => {
        const mm = App.dget('manage', m); mm.rating = +st.dataset.r; App.dset('manage', mm);
        const note = document.getElementById('rate-note');
        if (note) note.textContent = rateNote(mm.rating);
        else rateBox.insertAdjacentHTML('afterend', '<div class="effect-line" id="rate-note">' + rateNote(mm.rating) + '</div>');
        rateBox.querySelectorAll('.star').forEach(x => x.classList.toggle('on', +x.dataset.r <= mm.rating));
      };
    });
    document.getElementById('manage-reset').onclick = () => { App.dset('manage', null); renderManage(c); };
  }

  async function genReview(c, m, n, d) {
    const p = ensureTasks(m.progress[n], d);
    m.progress[n] = p;
    const tasks = buildTasks(d);
    const notes = tasks.map((tk, i) => '训练' + (i + 1) + '：' + tk.t + '\n方法/标准：' + tk.how + '\n用户记录：' + (p.tasks[i].note || '（未填写）')).join('\n\n');
    const user = '训练主题：' + d.t + '\n\n' + notes;
    try {
      const raw = await API.callLLM(REVIEW_SYS, user);
      const res = JSON.parse(raw);
      p.aiReview = {
        score: Math.max(0, Math.min(100, Math.round(res.score || 0))),
        summary: res.summary || '',
        suggestions: Array.isArray(res.suggestions) ? res.suggestions.slice(0, 4) : []
      };
    } catch (e) {
      p.aiReview = localReview(p.tasks);
    }
    App.dset('manage', m);
    renderManage(c);
  }

  function localReview(tasks) {
    const len = tasks.reduce((a, t) => a + (t.note || '').length, 0);
    const score = Math.min(92, 55 + Math.floor(len / 5));
    return {
      score,
      summary: '已收到你的训练记录。持续把方法落到具体场景，训练效果会越来越扎实（当前为本地估算，配置大模型 Key 后点评更精准）。',
      suggestions: [
        '把「最小实践」写具体：在什么场景、对什么人、做了什么、结果如何。',
        '反思时多问一句「下次我会怎么调整」，而不仅是描述过程。',
        '完成后尝试用一句话把今日方法教给同事/朋友（费曼法）。'
      ]
    };
  }

  function rateNote(r) {
    const map = {1:'刚起步，别急，先建立手感。',2:'有感觉了，再多练两天就顺。',3:'稳步前进，保持节奏。',4:'很稳，已经形成肌肉记忆。',5:'游刃有余，可以尝试教别人（费曼法）。'};
    return map[r] || '';
  }

  function renderQuiz(c) {
    let html = '<div class="page-head"><h2>管理技能提升训练</h2><div class="date">先了解你的情况</div></div>' +
      '<div class="card"><div class="section-title">情况问卷</div>';
    DATA.manageQuiz.forEach((q, qi) => {
      html += '<div class="field"><label>' + (qi + 1) + '. ' + q.q + '</label>';
      q.opts.forEach(o => { html += '<div class="chip" data-q="' + qi + '" data-o="' + o + '" style="flex-direction:row;justify-content:flex-start;margin-bottom:6px">' + o + '</div>'; });
      html += '</div>';
    });
    html += '</div><button class="btn block mt12" id="quiz-submit" disabled>根据我的情况推荐</button>';
    c.innerHTML = html;

    const ans = {};
    c.querySelectorAll('.chip[data-q]').forEach(ch => {
      ch.onclick = () => {
        const qi = ch.dataset.q;
        c.querySelectorAll('.chip[data-q="' + qi + '"]').forEach(x => x.style.background = '');
        ch.style.background = 'var(--accent-soft)';
        ans[qi] = ch.dataset.o;
        const all = DATA.manageQuiz.every((_, i) => ans[i]);
        document.getElementById('quiz-submit').disabled = !all;
      };
    });
    document.getElementById('quiz-submit').onclick = () => {
      const weak = ans[1]; // 最薄弱项
      const skill = SKILL_KEYS.includes(weak) ? weak : (SKILL_KEYS.includes(ans[3]) ? ans[3] : '结构化思维');
      App.dset('manage', { skill, quiz: ans, progress: {}, rating: 0, startedDate: App.today() });
      App.achieve('f1', 10, '完成评估');
      renderManage(c);
    };
  }

  /* ---------------- 英语学习 ---------------- */
  function buildPool() {
    const map = {}; const list = [];
    DATA.WORD_POOL.forEach(o => { const k = o.w.toLowerCase(); if (!map[k]) { map[k] = o.cn; list.push({ w: o.w, cn: o.cn, phon: (DATA.PHON && DATA.PHON[k]) || '', src: o.src || '' }); } });
    return { list, map };
  }
  /* 语音朗读（Web Speech API，离线可用，统一英式发音） */
  let _voices = [];
  function loadVoices() { try { _voices = window.speechSynthesis.getVoices() || []; } catch (e) { _voices = []; } }
  // 优先英式（en-GB）女声；其次任意英式；再任意英文女声；最后任意英文
  function pickVoice() {
    if (!_voices.length) loadVoices();
    const enGB = _voices.filter(x => /en[-_]GB/i.test(x.lang));
    const en = _voices.filter(x => /^en/i.test(x.lang));
    const isFemale = n => /female|libby|emma|lucy|hazel|susan|serena|kate|mia|grace|aria|zira|victoria|rachel|hannah/i.test(n || '');
    const firstFemale = arr => arr.find(x => isFemale(x.name));
    return firstFemale(enGB) || enGB[0] || firstFemale(en) || en[0] || null;
  }
  /* 云端 TTS（OpenAI 兼容 audio/speech）播放，返回是否成功 */
  async function ttsPlay(text) {
    const on = API.cfg(API.K.ttsOn, false);
    const key = API.cfg(API.K.ttsKey, '');
    if (!on || !key) return false;
    const base = API.cfg(API.K.ttsBase, 'https://api.openai.com/v1');
    const model = API.cfg(API.K.ttsModel, 'tts-1');
    const voice = API.cfg(API.K.ttsVoice, 'alloy');
    try {
      const r = await fetch(base.replace(/\/$/, '') + '/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ model, input: text, voice, response_format: 'mp3' }),
      });
      if (!r.ok) return false;
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      a.onended = () => { try { URL.revokeObjectURL(url); } catch (e) {} };
      a.play().catch(() => {});
      return true;
    } catch (e) { return false; }
  }
  /* 单词/短句朗读：优先云端 TTS，否则浏览器英式女声 */
  function speak(text, rate) {
    if (API.cfg(API.K.ttsOn, false) && API.cfg(API.K.ttsKey, '')) { ttsPlay(text); return; }
    try {
      if (!('speechSynthesis' in window)) { App.toast('当前环境不支持语音朗读'); return; }
      loadVoices();
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB';
      u.rate = rate || 0.92;
      u.pitch = 1.0;
      const v = pickVoice();
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch (e) { App.toast('朗读失败，请重试'); }
  }
  /* 文章全文朗读：优先云端 TTS（最自然、连读断句由服务商处理），否则浏览器英式女声分段 */
  function speakNatural(text) {
    if (API.cfg(API.K.ttsOn, false) && API.cfg(API.K.ttsKey, '')) {
      ttsPlay(text);
      App.toast('正在用云端 TTS 朗读（自然断句）…');
      return;
    }
    try {
      if (!('speechSynthesis' in window)) { App.toast('当前环境不支持语音朗读'); return; }
      loadVoices();
      window.speechSynthesis.cancel();
      const v = pickVoice();
      const paras = (text || '').split(/\n+/).map(p => p.trim()).filter(Boolean);
      let delay = 0;
      const SENT = 70, SENT_PAUSE = 300, PARA_PAUSE = 700; // 毫秒
      paras.forEach(para => {
        const sents = para.match(/[^.!?]+[.!?]*\s*/g) || [para];
        sents.forEach((sent, si) => {
          const s = sent.trim();
          if (!s) return;
          const at = delay;
          setTimeout(() => {
            const u = new SpeechSynthesisUtterance(s);
            u.lang = 'en-GB';
            u.rate = 0.95;
            // 句中轻微起伏、句末略降，模拟说话的语气与感情
            u.pitch = (si === sents.length - 1) ? 0.9 : (si % 2 ? 1.06 : 0.98);
            if (v) u.voice = v;
            try { window.speechSynthesis.speak(u); } catch (e) {}
          }, at);
          delay += s.length * SENT + SENT_PAUSE;
          if (si === sents.length - 1) delay += PARA_PAUSE; // 段落之间多停一会儿
        });
      });
    } catch (e) { App.toast('朗读失败，请重试'); }
  }
  window.__ttsTest = function (t) { speak(t || 'Hello, this is a British female voice test.'); };
  function dailyWords() {
    const { list, map } = buildPool();
    const N = 30;
    const maxOff = Math.max(0, list.length - N);
    const off = (App.dayIndex() * 7) % (maxOff + 1);
    return { words: list.slice(off, off + N), map };
  }
  function wrapWords(text, map) {
    return text.replace(/[A-Za-z]+/g, m => {
      const k = m.toLowerCase();
      const cn = map[k] || (DATA.EN_DICT && DATA.EN_DICT[k]) || '';
      const phon = (DATA.PHON && DATA.PHON[k]) || '';
      return '<span class="w" data-cn="' + escapeHtml(cn) + '" data-phon="' + escapeHtml(phon) + '">' + m + '</span>';
    });
  }
  /* 文章阅读优选：按当日 30 词与文章词汇重叠度，挑选最相关的一篇 */
  function pickArticle(wordList, map) {
    const arts = DATA.EN_ARTICLES || [];
    if (!arts.length) return { en: [], cn: [] };
    if (arts.length === 1) return arts[0];
    const set = new Set((wordList || []).map(w => w.toLowerCase()));
    let best = -1, bestArt = arts[App.dayIndex() % arts.length];
    arts.forEach((a, i) => {
      const words = (a.en.join(' ').match(/[A-Za-z]+/g) || []).map(w => w.toLowerCase());
      const seen = new Set(); let overlap = 0;
      words.forEach(w => { if (set.has(w) && !seen.has(w)) { overlap++; seen.add(w); } });
      const score = overlap * 10 + (i === (App.dayIndex() % arts.length) ? 1 : 0);
      if (score > best) { best = score; bestArt = a; }
    });
    return bestArt;
  }

  /* ---------------- 学习效果验收（看词选义） ---------------- */
  let quiz = null;
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function buildQuiz(words) {
    const pool = words.slice(); shuffle(pool);
    const qs = pool.slice(0, Math.min(10, pool.length)).map(w => {
      const others = shuffle(words.filter(x => x.cn !== w.cn)).slice(0, 3).map(x => x.cn);
      const opts = shuffle([w.cn].concat(others));
      return { w: w.w, phon: w.phon, answer: w.cn, opts };
    });
    return { idx: 0, qs, correct: 0, done: false };
  }
  function quizBest() { return App.dget('englishQuiz', { best: 0, history: [] }); }
  function quizSummaryHtml() {
    const q = quizBest();
    if (!q.history || !q.history.length) return '<div class="muted text-sm">还没有测试记录，点下面开始吧。</div>';
    const recent = q.history.slice(-5).map(h => h.score + '%').join(' · ');
    return '<div class="text-sm">历史最佳：<b class="accent">' + (q.best || 0) + '%</b></div>' +
      '<div class="muted text-xs mt8">最近 ' + q.history.length + ' 次：' + recent + '</div>';
  }
  function renderQuizBox(c) {
    const box = document.getElementById('quiz-box');
    if (!box) return;
    if (!quiz) { box.innerHTML = quizSummaryHtml(); return; }
    if (quiz.done) {
      const total = quiz.qs.length;
      const score = Math.round(quiz.correct / total * 100);
      const q = quizBest();
      q.history = q.history || [];
      q.history.push({ date: App.today(), score });
      if (q.history.length > 30) q.history = q.history.slice(-30);
      q.best = Math.max(q.best || 0, score);
      App.dset('englishQuiz', q);
      const btn = document.getElementById('quiz-start'); if (btn) btn.textContent = '再来一次';
      quiz = null;
      box.innerHTML = '<div class="text-center" style="padding:8px 0">' +
        '<div style="font-size:28px;font-weight:800" class="accent">' + score + '%</div>' +
        '<div class="text-sm">答对 ' + quiz.correct + '/' + total + ' 词</div>' +
        (score >= 80 ? '<div class="text-sm mt8">👍 掌握得不错，继续保持！</div>' : '<div class="text-sm mt8">再复习一遍今日单词，巩固一下记忆。</div>') +
        '</div>';
      return;
    }
    const q = quiz.qs[quiz.idx];
    let html = '<div class="quiz-q"><div class="row center between"><span class="muted text-xs">第 ' + (quiz.idx + 1) + '/' + quiz.qs.length + ' 题</span>' +
      '<button class="spk" data-spk="' + escapeHtml(q.w) + '" title="听发音">🔊</button></div>' +
      '<div class="quiz-word bold" style="font-size:20px;margin:6px 0">' + escapeHtml(q.w) +
      (q.phon ? ' <span class="phon">/' + q.phon + '/</span>' : '') + '</div><div class="quiz-opts">';
    q.opts.forEach(o => { html += '<button class="quiz-opt" data-opt="' + escapeHtml(o) + '">' + escapeHtml(o) + '</button>'; });
    html += '</div></div>';
    box.innerHTML = html;
    box.querySelectorAll('.quiz-opt').forEach(b => {
      b.onclick = () => {
        const correct = b.dataset.opt === q.answer;
        if (correct) quiz.correct++;
        b.classList.add(correct ? 'right' : 'wrong');
        box.querySelectorAll('.quiz-opt').forEach(x => { x.disabled = true; if (x.dataset.opt === q.answer) x.classList.add('right'); });
        quiz.idx++;
        setTimeout(() => renderQuizBox(c), 650);
      };
    });
    const sb = box.querySelector('.spk');
    if (sb) sb.onclick = (ev) => { ev.stopPropagation(); speak(q.w); };
  }
  function startQuiz(c) {
    const { words } = dailyWords();
    quiz = buildQuiz(words);
    renderQuizBox(c);
  }

  function renderEnglish(c) {
    const { words, map } = dailyWords();
    const e = App.dget('english', { doneWords: [], articleRead: false, articleIdx: App.dayIndex() % DATA.EN_ARTICLES.length });
    if (e.articleIdx == null) e.articleIdx = App.dayIndex() % DATA.EN_ARTICLES.length;
    const done = e.doneWords || [];
    const doneCount = words.filter((_, i) => done[i]).length;

    let list = '<div class="wrap-words">';
    words.forEach((w, i) => {
      const learnt = !!done[i];
      list += '<div class="word-chip ' + (learnt ? 'done' : '') + '" data-i="' + i + '">' +
        '<div class="wc-row"><span class="bold text-sm">' + w.w + '</span>' +
        '<button class="spk" data-spk="' + escapeHtml(w.w) + '" title="听发音">🔊</button></div>' +
        (w.phon ? '<span class="phon">/' + w.phon + '/</span>' : '') +
        (w.src ? '<span class="wsrc src-' + escapeHtml(w.src) + '">' + escapeHtml(w.src) + '</span>' : '') +
        '<span class="cn">' + w.cn + '</span>' + (learnt ? '<span class="ck">✓</span>' : '') + '</div>';
    });
    list += '</div>';

    const art = pickArticle(words.map(x => x.w), map);
    const enHtml = art.en.map(p => '<p class="article-p">' + wrapWords(p, map) + '</p>').join('');
    const cnHtml = art.cn.map(p => '<p class="article-p muted">' + escapeHtml(p) + '</p>').join('');

    c.innerHTML =
      '<div class="page-head"><h2>英语学习</h2><div class="date">每日 30 词 + 1 篇阅读 · 点词看释义</div></div>' +
      '<div class="achv-banner"><div class="big">🌍</div><div><div class="t">今日词汇 ' + doneCount + '/30</div>' +
        '<div class="s">文章阅读：' + (e.articleRead ? '已完成 ✓' : '未读') + '</div></div></div>' +
      '<div class="card"><div class="section-title">今日 30 词（点击单词打卡）</div>' + list +
        (doneCount >= 30 ? '<div class="effect-line mt8">今日 30 词已全部打卡 🎉</div>' : '') + '</div>' +
      '<div class="card"><div class="section-title">📝 学习效果验收</div>' +
        '<div class="muted text-xs" style="margin:-2px 0 8px;line-height:1.6">用今日 30 词出题（看词选义），检验你是否真记住了。可多次测试，记录历史最佳。</div>' +
        '<div id="quiz-box">' + quizSummaryHtml() + '</div>' +
        '<button class="btn block mt8" id="quiz-start">开始验收测试</button></div>' +
      '<div class="card"><div class="section-title">文章阅读（中英对照 · 点词看音标与释义）</div>' +
        '<button class="btn ghost block mt8" id="listen-all">🔊 听全文朗读（英式·自然断句）</button>' +
        enHtml + cnHtml +
        '<button class="btn block mt12 ' + (e.articleRead ? 'ghost' : '') + '" id="article-btn">' + (e.articleRead ? '已读 ✓' : '我读完了') + '</button></div>' +
      '<div id="word-pop" class="word-pop hidden"></div>';

    c.querySelectorAll('.word-chip').forEach(ch => {
      ch.onclick = () => {
        const i = +ch.dataset.i;
        const ee = App.dget('english', e);
        ee.doneWords = ee.doneWords || [];
        const was = !!ee.doneWords[i];
        ee.doneWords[i] = !was;
        App.dset('english', ee);
        if (!was) App.achieve('f1', 10, '单词打卡');
        ch.classList.toggle('done', !was);
        const ck = ch.querySelector('.ck');
        if (!was && !ck) ch.insertAdjacentHTML('beforeend', '<span class="ck">✓</span>');
        else if (was && ck) ck.remove();
        const cnt = words.filter((_, k) => ee.doneWords[k]).length;
        const tEl = c.querySelector('.achv-banner .t');
        if (tEl) tEl.textContent = '今日词汇 ' + cnt + '/30';
        if (cnt >= 30 && !ee.vocabDone) { ee.vocabDone = true; App.achieve('f3', 35, '完成词汇打卡'); }
        if (cnt >= 30 && !c.querySelector('.effect-line')) {
          c.querySelector('.wrap-words').insertAdjacentHTML('afterend', '<div class="effect-line mt8">今日 30 词已全部打卡 🎉</div>');
        }
      };
    });

    const pop = document.getElementById('word-pop');
    c.querySelectorAll('.article-p .w').forEach(sp => {
      sp.onclick = () => {
        const w = sp.textContent;
        const cn = sp.dataset.cn;
        const phon = sp.dataset.phon;
        pop.innerHTML = '<div class="pop-word">' + escapeHtml(w) + ' <button class="pop-spk" data-spk="' + escapeHtml(w) + '">🔊</button></div>' +
          (phon ? '<div class="pop-phon">/' + escapeHtml(phon) + '/</div>' : '<div class="pop-phon muted">暂无音标</div>') +
          (cn ? '<div class="pop-cn">' + escapeHtml(cn) + '</div>' : '<div class="pop-cn muted">暂无释义</div>');
        pop.classList.remove('hidden');
        const appR = document.getElementById('app').getBoundingClientRect();
        const r = sp.getBoundingClientRect();
        const left = r.left - appR.left + r.width / 2;
        const top = r.top - appR.top;
        pop.style.left = Math.max(60, Math.min(330, left)) + 'px';
        pop.style.top = (top - 8) + 'px';
        pop.style.transform = 'translate(-50%, -100%)';
        const sb = pop.querySelector('.pop-spk');
        if (sb) sb.onclick = (ev) => { ev.stopPropagation(); speak(w); };
        clearTimeout(pop._t);
        pop._t = setTimeout(() => pop.classList.add('hidden'), 2600);
      };
    });

    c.querySelectorAll('.spk').forEach(b => {
      b.onclick = (ev) => { ev.stopPropagation(); speak(b.dataset.spk); };
    });

    const la = document.getElementById('listen-all');
    if (la) la.onclick = () => {
      const full = (art.en && art.en.length ? art.en : DATA.EN_ARTICLES[0].en).join('\n\n');
      speakNatural(full);
      App.toast('正在朗读全文（英式·自然断句）…');
    };

    const qs = document.getElementById('quiz-start');
    if (qs) qs.onclick = () => startQuiz(c);

    document.getElementById('article-btn').onclick = () => {
      const ee = App.dget('english', e);
      ee.articleRead = true; App.dset('english', ee);
      App.achieve('f3', 35, '完成文章阅读');
      App.toast('阅读完成 +35 营养 🌳'); renderEnglish(c);
    };
  }

  /* ---------------- 逻辑口语训练（接大模型） ---------------- */
  const SPEAK_SYS = '你是一位严谨的中文表达教练。用户围绕给定话题给出一段口语表达。请从以下 5 个维度评估：' +
    '观点（是否有清晰、可成立的中心论点）、逻辑（论证链条是否连贯、无跳跃）、框架（是否先结论后支撑、结构清晰）、' +
    '表达深度（是否举例/数据、避免空泛）、总结升华（结尾是否回扣主题、有收束）。' +
    '每个维度给 0-100 分并写一句简短建议。给综合评分 overall 与一段总体改进建议 summary。' +
    '并给出一段「标准参考版本」standard：针对该话题、结构完整（先结论后支撑、有例子、有收束）、语言流畅的示范回答（150字以内）。' +
    '只输出 JSON：{"dims":[{"key":"观点","score":85,"note":"..."},...],"overall":88,"summary":"...","standard":"..."}';

  function renderSpeak(c) {
    const topic = DATA.speakTopics[App.dayIndex() % DATA.speakTopics.length];
    let s = App.dget('speak', { date: App.today(), submitted: false, topic: topic.t });
    if (s.date !== App.today()) { s = { date: App.today(), submitted: false, topic: topic.t }; App.dset('speak', s); }

    c.innerHTML =
      '<div class="page-head"><h2>逻辑口语训练</h2><div class="date">今日随机话题</div></div>' +
      '<div class="card" style="border-color:var(--accent)"><div class="tag">' + topic.cat + '</div>' +
        '<div class="bold mt8" style="line-height:1.5">' + escapeHtml(s.topic) + '</div></div>' +
      '<div class="card"><div class="section-title">我的表达</div>' +
        '<textarea id="speak-in" class="full" style="min-height:120px" placeholder="围绕话题组织你的表达，尽量有观点、有结构…">' + (s.text || '') + '</textarea>' +
        '<button class="btn block mt12" id="speak-submit">提交，获取修正建议</button>' +
        '<div id="speak-note" class="muted text-xs mt8"></div></div>' +
      '<div id="speak-result"></div>';

    document.getElementById('speak-submit').onclick = async () => {
      const text = document.getElementById('speak-in').value;
      if (text.trim().length < 10) { App.toast('多写一点，至少组织几句'); return; }
      s.text = text; s.submitted = true; App.dset('speak', s);
      App.achieve('f3', 35, '完成口语训练');
      await runEval(c, s.topic, text);
    };
    if (s.submitted && s.result) renderResult(c, s.result, s.note || '');
    else if (s.submitted) runEval(c, s.topic, s.text);
  }

  async function runEval(c, topic, text) {
    const box = document.getElementById('speak-result');
    const note = document.getElementById('speak-note');
    box.innerHTML = '<div class="card"><div class="section-title">修正建议（5 维度）</div><div class="muted text-sm">大模型评估中…</div></div>';
    try {
      const raw = await API.callLLM(SPEAK_SYS, '话题：' + topic + '\n\n我的表达：' + text);
      const res = JSON.parse(raw);
      // 规整 5 维度顺序
      const order = ['观点', '逻辑', '框架', '表达深度', '总结升华'];
      res.dims.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
      App.dset('speak', Object.assign(App.dget('speak', {}), { result: res, note: '' }));
      renderResult(c, res, '');
    } catch (e) {
      const fb = localEval(text);
      const flag = (e.message === 'NO_KEY') ? 'NO_KEY' : (e.message || 'ERR');
      App.dset('speak', Object.assign(App.dget('speak', {}), { result: fb, note: flag }));
      renderResult(c, fb, flag);
    }
  }

  function renderResult(c, res, noteFlag) {
    const box = document.getElementById('speak-result');
    if (!box) return;
    let html = '<div class="card"><div class="section-title">修正建议（5 维度）</div>';
    (res.dims || []).forEach(d => {
      const score = Math.max(0, Math.min(100, Math.round(d.score)));
      html += '<div class="dim"><div class="top"><span>' + escapeHtml(d.key) + '</span><span class="accent">' + score + '</span></div>' +
        '<div class="bar"><i style="width:' + score + '%"></i></div>' +
        '<div class="note">' + escapeHtml(d.note || '') + '</div></div>';
    });
    html += '<div class="mt12 bold">综合评分 <span class="accent">' + Math.round(res.overall || 0) + '</span></div>';
    if (res.summary) html += '<div class="text-sm muted mt8" style="line-height:1.5">总评：' + escapeHtml(res.summary) + '</div>';
    html += '</div>';
    if (res.standard) html += '<div class="card mt12" style="border-color:var(--accent)"><div class="section-title">标准参考版本</div><div class="text-sm" style="line-height:1.6">' + escapeHtml(res.standard) + '</div></div>';
    box.innerHTML = html;

    const note = document.getElementById('speak-note');
    if (note) {
      if (!noteFlag || noteFlag === 'OK') note.textContent = '✓ 已通过大模型真实评估';
      else if (noteFlag === 'NO_KEY') note.innerHTML = '⚠ 未配置大模型：当前为本地估算。去「设置」填入 API Key 即可获得真实点评。';
      else {
        let reason = noteFlag;
        if (reason.indexOf('CORS:') === 0) reason = reason.slice(5);
        else if (reason.indexOf('NET:') === 0) reason = '浏览器跨域(CORS)被拦截或网络不通：请改用支持 CORS 的国内接口（硅基流动/月之暗面/DeepSeek），或在「设置 → 逻辑口语」开启代理并填你自己的代理地址。';
        else if (reason.indexOf('HTTP_') === 0) reason = '接口返回错误：' + reason.slice(5) + '（多为 Key 无效 / 模型名错误 / 不支持 JSON 格式）';
        else if (reason.indexOf('PARSE:') === 0) reason = '模型返回无法解析为 JSON：' + reason.slice(6);
        else if (reason.indexOf('TIAN:') === 0) reason = reason.slice(5);
        note.innerHTML = '⚠ 大模型调用失败：' + reason + '（已用本地估算兜底）';
      }
    }
  }

  /* 本地启发式兜底（无 key 时） */
  function localEval(text) {
    const len = text.length;
    const dims = DATA.speakDims.map(d => {
      let score, note;
      if (d.key === '观点') { score = len > 40 ? 80 : 55; note = '有中心论点，建议一句话先亮明你的立场。'; }
      else if (d.key === '逻辑') { score = (text.includes('因为') || text.includes('所以') || text.includes('首先')) ? 82 : 60; note = '论证有因果/顺序词，连贯性不错；注意别跳步。'; }
      else if (d.key === '框架') { score = (text.includes('第一') || text.includes('首先') || text.includes('一、')) ? 85 : 58; note = '用了分点结构，清晰。没有的话，先结论后支撑更好。'; }
      else if (d.key === '表达深度') { score = len > 80 ? 78 : 50; note = len > 80 ? '有展开和例子，较有深度。' : '偏空泛，加一个具体例子或数据会更有力。'; }
      else { score = (text.includes('总之') || text.includes('所以') || text.includes('总结')) ? 80 : 55; note = '结尾回扣主题能升华，建议用一句收束。'; }
      return { key: d.key, score, note };
    });
    const overall = Math.round(dims.reduce((a, b) => a + b.score, 0) / dims.length);
    return {
      dims, overall,
      summary: '继续练，框架感会越来越稳 💪（这是本地估算，配置大模型后更准确）',
      standard: '（本地启发式，无法生成范文）建议结构：① 一句话亮明立场；② 用「因为…所以…」分 2-3 点论证；③ 给一个具体例子；④ 一句总结回扣主题。在「设置」填入大模型 Key 后，将针对本话题生成完整标准范文。'
    };
  }

  function escapeHtml(s) { return (s || '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

  /* 预载语音列表（英式优先），避免首次朗读时拿不到 voice */
  if ('speechSynthesis' in window) { try { window.speechSynthesis.onvoiceschanged = loadVoices; loadVoices(); } catch (e) {} }

  App.register('manage', renderManage);
  App.register('english', renderEnglish);
  App.register('speak', renderSpeak);
  return {};
})();
