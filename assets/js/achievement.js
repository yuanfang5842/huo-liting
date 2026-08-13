/* ============ 成就系统：肥料种大树（全年成长 + 修剪互动） ============ */
window.Achieve = (function () {

  // 成长模型版本：升级后会把旧模型的大树自动重置为小苗，重新体验「从小开始长大」
  const MODEL_VER = 2;
  // 累计营养目标：约 1~2 个月坚持打卡即可长成大树（数值更小 = 每次施肥可见变化更明显）
  const GROWTH_GOAL = 600;
  const DECAY = 150;         // 连续 3 天未打卡衰减的营养
  const DEAD_NUTRIENTS = 30; // 营养低于此值判定枯萎

  function blank() {
    return { nutrients: 0, lastActive: '', planted: App.today(), dead: false, log: [], pruned: false, yearStart: App.today(), streak: 0, inv: {}, f4date: '', model: MODEL_VER };
  }
  function state() { return App.get('achv', null) || (App.set('achv', blank()), blank()); }
  function growthPct(a) { return Math.min(100, Math.max(0, Math.round((a.nutrients || 0) / GROWTH_GOAL * 100))); }

  // 旧成长模型的大树 → 重置为小苗，重新体验从小长大的乐趣
  function migrate() {
    const a = App.get('achv', null);
    if (a && a.model !== MODEL_VER) App.set('achv', blank());
  }
  function stageName(n) {
    if (n <= 0) return '🌱 刚刚种下';
    if (n < 16) return '🌱 萌芽';
    if (n < 55) return '🌿 幼苗';
    if (n < 140) return '🌳 小树';
    if (n < 320) return '🌲 大树';
    return '🌸 枝繁叶茂';
  }

  function dayGap(a, b) {
    const d1 = new Date(a), d2 = new Date(b);
    return Math.round((d2 - d1) / 86400000);
  }

  /* 成就触发入口（其它模块打卡时调用）
     完成打卡任务 -> 获得对应肥料（计入库存 inv），不直接生长；
     只有在大树浮层里「施肥」才会消耗库存、让树长大。
     type 即肥料 id（f1/f2/f3），与 DATA.fertilizers 对应。 */
  function handle(type, amount, label) {
    const a = state();
    const today = App.today();
    if (a.lastActive) {
      if (a.lastActive !== today) {
        const gap = dayGap(a.lastActive, today);
        if (gap === 1) a.streak = (a.streak || 0) + 1;
        else a.streak = 1; // 中断后从今天重新计
        if (gap >= 3 && !a.dead) {
          a.nutrients = Math.max(0, a.nutrients - DECAY);
          if (a.nutrients <= DEAD_NUTRIENTS) a.dead = true;
        }
      }
    } else {
      a.streak = 1;
    }
    // 获得肥料（进入库存，不直接加营养）
    a.inv = a.inv || {};
    a.inv[type] = (a.inv[type] || 0) + 1;
    // 当日覆盖多类型（日常+日志/训练+学习）即视为「满勤」，自动发放满勤肥 f4
    const got = Object.keys(a.inv).filter(k => a.inv[k] > 0);
    if (a.f4date !== today && got.includes('f1') && got.includes('f2') && got.includes('f3')) {
      a.inv.f4 = (a.inv.f4 || 0) + 1;
      a.f4date = today;
    }
    a.lastActive = today;
    a.log.unshift({ d: today, label, amount });
    if (a.log.length > 30) a.log.pop();
    App.set('achv', a);
  }

  /* 按「累计营养值」连续生长：种子→萌芽→小树→大树→繁茂，每次施肥都可见变大。
     背景（天空+草地渐变）改由 CSS 提供，SVG 仅画树，便于铺满整个浮层。 */
  function drawTree(n, dead, pruned) {
    const vp = n <= 0 ? 0 : 1 - 1 / (1 + n / 90);       // 前期快、后期缓，保证每次施肥都有可见变化
    const scale = 0.15 + Math.min(1, vp) * 0.95;         // 0.15(种子) → ~1.1(满)
    const t = Math.min(1, n / GROWTH_GOAL);              // 形态丰富度 0→1

    const trunkColor = dead ? '#9e9282' : '#5d3a1a';
    const trunkDark = dead ? '#8a8274' : '#4a2e13';
    const leafBase = dead ? '#b5b9bd' : '#2d6a31';
    const leafLight = dead ? '#c9cdd1' : '#4a8f3f';
    const leafDark = dead ? '#a0a4a8' : '#1e4f22';
    const groundFar = dead ? '#b8a67a' : '#7cb67c';
    const groundNear = dead ? '#c9b68c' : '#9ccf7a';

    let svg = '<svg class="tree-svg" viewBox="0 0 240 300">';
    if (!dead) svg += '<circle cx="196" cy="52" r="14" fill="#fff" opacity=".85"/>'; // 月亮（夜空点缀）
    // 草地（叠在 CSS 草地上增加层次）
    svg += '<ellipse cx="120" cy="272" rx="150" ry="40" fill="' + groundNear + '"/>';
    svg += '<ellipse cx="120" cy="280" rx="118" ry="22" fill="' + groundFar + '" opacity=".7"/>';

    svg += '<g transform="translate(120,272) scale(' + scale.toFixed(3) + ') translate(-120,-272)">';

    if (n <= 0) {
      // 刚种下：土里冒出一点嫩芽
      svg += '<ellipse cx="120" cy="272" rx="9" ry="4" fill="' + trunkDark + '" opacity=".5"/>';
      svg += '<path d="M120,272 Q121,260 118,253 Q122,260 120,272 Z" fill="' + leafLight + '"/>';
    } else if (n < 16) {
      // 萌芽：细茎 + 两片小叶
      svg += '<path d="M118,272 Q120,252 116,234 Q121,250 123,272 Z" fill="' + trunkColor + '"/>';
      svg += '<ellipse cx="113" cy="235" rx="8" ry="5" fill="' + leafLight + '"/>';
      svg += '<ellipse cx="127" cy="239" rx="7" ry="4" fill="' + leafBase + '"/>';
    } else {
      const topY = 272 - (46 + t * 110);   // 树干顶端随成长升高
      const halfW = 9 + t * 9;             // 树干随成长变粗
      svg += '<path d="M' + (120 - halfW) + ',272 Q' + (120 - halfW * 0.4) + ',250 ' + (120 - 4) + ',' + topY +
             ' L' + (120 + 4) + ',' + topY + ' Q' + (120 + halfW * 0.4) + ',250 ' + (120 + halfW) + ',272 Q120,282 ' + (120 - halfW) + ',272 Z" fill="' + trunkColor + '"/>';
      // 根系
      svg += '<path d="M' + (120 - halfW) + ',272 Q' + (120 - halfW - 16) + ',282 ' + (120 - halfW - 30) + ',278" stroke="' + trunkDark + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
      svg += '<path d="M' + (120 + halfW) + ',272 Q' + (120 + halfW + 16) + ',282 ' + (120 + halfW + 30) + ',278" stroke="' + trunkDark + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
      // 树枝
      svg += '<path d="M120,' + (topY + 8) + ' Q92,' + (topY - 18) + ' 64,' + (topY - 12) + '" stroke="' + trunkColor + '" stroke-width="' + (4 + t * 3) + '" fill="none" stroke-linecap="round"/>';
      svg += '<path d="M120,' + (topY + 8) + ' Q148,' + (topY - 18) + ' 176,' + (topY - 12) + '" stroke="' + trunkColor + '" stroke-width="' + (4 + t * 3) + '" fill="none" stroke-linecap="round"/>';
      if (t > 0.4) svg += '<path d="M120,' + (topY + 2) + ' Q120,' + (topY - 40) + ' 120,' + (topY - 60) + '" stroke="' + trunkColor + '" stroke-width="' + (3 + t * 2) + '" fill="none" stroke-linecap="round"/>';
      // 树冠（随 t 变大、变多层）
      const cs = 0.55 + t * 0.6;
      const ccx = 120, ccy = topY - 28;
      const crown = pruned
        ? [[0, 0, 95, 48], [0, -22, 74, 38], [0, -40, 50, 24]]
        : [[0, 0, 102, 52], [-58, 6, 64, 42], [58, 6, 64, 42], [0, -38, 72, 34], [-42, -26, 52, 30], [42, -26, 52, 30], [0, -58, 40, 22]];
      crown.forEach(o => {
        svg += '<ellipse cx="' + (ccx + o[0] * cs) + '" cy="' + (ccy + o[1] * cs) + '" rx="' + (o[2] * cs) + '" ry="' + (o[3] * cs) + '" fill="' + (o[1] < -20 ? leafDark : leafLight) + '"/>';
      });
      // 散落叶片（多则密）
      if (!dead) {
        const leaves = Math.floor(t * 14) + 3;
        for (let i = 0; i < leaves; i++) {
          const ang = (i / leaves) * Math.PI * 2 + i;
          const r = 40 + (i % 6) * 10;
          const lx = ccx + Math.cos(ang) * r * cs;
          const ly = ccy + Math.sin(ang) * (r * 0.4) * cs;
          svg += '<ellipse cx="' + Math.round(lx) + '" cy="' + Math.round(ly) + '" rx="' + (2.5 + t * 2) + '" ry="' + (1.8 + t * 1.5) + '" fill="' + (i % 2 ? leafLight : leafDark) + '" opacity=".85"/>';
        }
      }
    }

    // 树下小花（枯萎时变枯草）
    if (dead) {
      svg += '<path d="M80,276 Q85,266 90,276" stroke="#b89b6a" stroke-width="2" fill="none"/>';
      svg += '<path d="M150,276 Q155,266 160,276" stroke="#b89b6a" stroke-width="2" fill="none"/>';
    } else if (n >= 30) {
      svg += flower(78, 274, '#F279A0');
      svg += flower(120, 278, '#F4B740');
      svg += flower(162, 274, '#F279A0');
      if (n >= 200) { svg += flower(96, 272, '#B47AEA'); svg += flower(144, 272, '#F279A0'); }
    }

    svg += '</g>';
    if (dead) svg += '<text x="120" y="150" text-anchor="middle" font-size="14" fill="#fff" opacity=".9">已枯萎 · 重新种植</text>';
    svg += '</svg>';
    return svg;
  }

  function flower(x, y, c) {
    let p = '';
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2;
      const px = x + Math.cos(a) * 4, py = y + Math.sin(a) * 4;
      p += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="2.4" fill="' + c + '"/>';
    }
    p += '<circle cx="' + x + '" cy="' + y + '" r="2" fill="#FFD56B"/>';
    return p;
  }

  function openTree() {
    const a = state();
    const growth = growthPct(a);
    const modal = document.getElementById('tree-modal');
    const body = document.getElementById('tree-body');
    const fertHtml = DATA.fertilizers.map(f => {
      const cnt = (a.inv && a.inv[f.id]) || 0;
      const disabled = cnt <= 0 ? ' disabled' : '';
      const sub = cnt > 0 ? ('库存 ' + cnt + ' · 点击施肥') : '完成对应打卡获得';
      return '<div class="f' + disabled + '" data-f="' + f.id + '">' + f.icon + '<b>+' + f.gain + '</b>' + f.name +
        '<div class="text-xs muted">' + sub + '</div></div>';
    }).join('');
    const logHtml = (a.log || []).slice(0, 6).map(l => '<div class="row"><span class="grow text-sm">' + l.label + '</span><span class="text-xs muted">' + l.d + ' +' + l.amount + '</span></div>').join('') || '<div class="muted text-sm">还没有成就，去打卡收集肥料吧</div>';

    const yStart = a.yearStart || a.planted || App.today();
    const dayOfYear = dayGap(yStart, App.today()) + 1;
    const pruneBtn = (!a.dead && growth >= 12)
      ? '<button class="btn sm mt12" id="prune-btn">' + (a.pruned ? '✂️ 已修剪（自然生长）' : '✂️ 修剪一下') + '</button>'
      : '';

    const stage = stageName(a.nutrients);
    const treeStage = '<div class="tree-stage' + (a.dead ? ' dead' : '') + '"><div class="tree-svg-wrap">' + drawTree(a.nutrients, a.dead, a.pruned) + '</div>' +
      '<div class="text-sm tree-cap">' + stage + ' · 持续打卡 = 持续施肥，树会越长越大 🌿</div>' +
      '<div class="text-xs tree-cap2">今年第 ' + dayOfYear + ' / 365 天 · 连续打卡 ' + (a.streak || 0) + ' 天</div>' +
      '<div class="progress mt8 tree-prog"><i style="width:' + growth + '%"></i></div>' +
      '<div class="text-xs tree-cap2">今年成长 ' + growth + '%（坚持打卡，树会越长越大）</div>' +
      '<button class="btn sm ghost mt8" id="replant-any">🌱 重新种一棵</button>' +
      pruneBtn +
      '<div class="tree-fert-card"><div class="section-title mt12">用获得的肥料施肥</div><div class="muted text-xs" style="margin:-2px 0 8px">完成打卡任务才会获得肥料，点下方卡片即可施肥让树长大</div><div class="fert">' + fertHtml + '</div></div></div>';
    const deadCard = a.dead ? '<div class="card mt12" style="border-color:#E5634D"><div class="bold" style="color:#E5634D">树枯萎了，营养跟不上会死亡</div><div class="text-sm muted mt8">重新种一棵，从今天继续打卡。</div><button class="btn block mt12" id="replant">重新种植</button></div>' : '';

    body.innerHTML =
      '<div class="page-head"><h2 style="font-size:18px">🌳 我的大树</h2><div class="date">累计营养 ' + a.nutrients + ' · 成长 ' + growth + '%</div></div>' +
      treeStage + deadCard +
      '<div class="card mt12"><div class="section-title">最近成就</div>' + logHtml + '</div>';

    modal.classList.toggle('dead', !!a.dead);
    modal.classList.remove('hidden');
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => modal.classList.add('hidden'));
    const replant = document.getElementById('replant');
    if (replant) replant.onclick = () => { App.set('achv', blank()); openTree(); };
    const replantAny = document.getElementById('replant-any');
    if (replantAny) replantAny.onclick = () => {
      if (window.confirm('确定重新种一棵？当前大树会清零，从嫩芽重新开始。')) { App.set('achv', blank()); openTree(); }
    };
    const prune = document.getElementById('prune-btn');
    if (prune) prune.onclick = () => {
      const s = state();
      s.pruned = !s.pruned;
      App.set('achv', s);
      App.toast(s.pruned ? '修剪完成，树形更精神了 ✂️' : '切换为自然生长 🌿');
      openTree();
    };
    body.querySelectorAll('[data-f]').forEach(b => {
      b.onclick = () => {
        const f = DATA.fertilizers.find(x => x.id === b.dataset.f);
        if (!f) return;
        const s = state();
        s.inv = s.inv || {};
        if (!s.inv[f.id] || s.inv[f.id] <= 0) {
          App.toast('还没有「' + f.name + '」，去完成打卡任务获得吧');
          return;
        }
        if (s.dead) { App.toast('树已枯萎，先重新种植'); return; }
        s.inv[f.id] -= 1;          // 消耗一份库存肥料
        s.nutrients += f.gain;      // 实际施肥，树长大
        s.lastActive = App.today();
        App.set('achv', s);
        App.toast('施肥成功 +' + f.gain + ' 营养 🌱');
        openTree();
      };
    });
  }

  function init() {
    migrate(); // 旧模型的大树自动重置为小苗
    const a = state();
    if (a.lastActive && a.lastActive !== App.today()) {
      const gap = dayGap(a.lastActive, App.today());
      if (gap >= 3 && !a.dead) {
        a.nutrients = Math.max(0, a.nutrients - DECAY);
        if (a.nutrients <= DEAD_NUTRIENTS) a.dead = true;
        App.set('achv', a);
      }
    }
  }

  App.onAchieve(handle);
  return { openTree, init };
})();
