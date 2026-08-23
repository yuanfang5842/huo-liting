/* ============ 活力婷 · 核心层 ============ */
window.App = (function () {
  const LS = '__huo_liting__';
  const store = {};
  try { Object.assign(store, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) {}

  function save() { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) {} }
  function get(k, d) { return store[k] !== undefined ? store[k] : d; }
  function set(k, v) { store[k] = v; save(); }

  /* 日期 */
  const pad = n => (n < 10 ? '0' + n : '' + n);
  function today() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayLabel() { const d = new Date(); const wk = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]; return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + wk; }
  function dayIndex() { const d = new Date(); return Math.floor((d - new Date(d.getFullYear(),0,0)) / 86400000); }
  function isWeekend() { const d = new Date().getDay(); return d === 0 || d === 6; }

  /* 每日数据命名空间 */
  function dkey(k) { return 'D:' + today() + ':' + k; }
  function dget(k, d) { return get(dkey(k), d); }
  function dset(k, v) { set(dkey(k), v); }

  /* 按指定日期读写每日数据（精进日志/四象限跨日规划用） */
  function dgetOn(k, d, dateStr) { return get('D:' + (dateStr || today()) + ':' + k, d); }
  function dsetOn(k, v, dateStr) { set('D:' + (dateStr || today()) + ':' + k, v); }

  /* 日期工具 */
  function parseDate(s) { const p = (s || today()).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function shiftDate(s, delta) { const d = parseDate(s); d.setDate(d.getDate() + delta); return fmtDate(d); }
  function dateLabel(s) {
    const d = parseDate(s);
    const wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + wk;
  }

  /* 简单 hash */
  function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; } return Math.abs(h); }

  /* 主题：每日变换活力色 */
  const palettes = [
    { a:'#1E9E83', s:'#E6F5F1', d:'#157C66' },
    { a:'#FF7A59', s:'#FFEDE6', d:'#E05836' },
    { a:'#8B5CF6', s:'#F1ECFE', d:'#6D3FD1' },
    { a:'#3B9FE0', s:'#E6F3FC', d:'#2476B8' },
    { a:'#F4B740', s:'#FDF3DC', d:'#D6951B' },
    { a:'#F25C9A', s:'#FDE6F0', d:'#D63B79' },
    { a:'#5BBF6A', s:'#E8F7EA', d:'#3E9C4D' },
  ];
  function applyDailyTheme() {
    const p = palettes[hash(today()) % palettes.length];
    const r = document.documentElement.style;
    r.setProperty('--accent', p.a);
    r.setProperty('--accent-soft', p.s);
    r.setProperty('--accent-deep', p.d);
    return p;
  }
  function themeName() {
    const names = ['翡翠绿','珊瑚橙','活力紫','晴空蓝','芒果黄','莓粉','青柠绿'];
    return names[hash(today()) % names.length];
  }

  /* 图标 */
  const ICONS = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    book:'<path d="M5 4.5C4.7 4.5 4.5 4.7 4.5 5v14c0 .3.2.5.5.5H11V4.5H5Z"/><path d="M19 4.5c.3 0 .5.2.5.5v14c0 .3-.2.5-.5.5H13V4.5h6Z"/>',
    pill:'<path d="M10.5 3.5l10 10-7 7-10-10 7-7Z"/><path d="M9 9l6 6"/>',
    target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.6 2.4 14.4 0 17M12 3.5c-2.4 2.6-2.4 14.4 0 17"/>',
    chat:'<path d="M8 9h8M8 13h5"/><path d="M19 11c0 3.3-2.7 6-6 6H9.5L6 20v-3c-1.7-1.1-2.5-3-2.5-5 0-3.3 2.7-6 6-6h3.5c3.3 0 6 2.7 6 6Z"/>',
    wallet:'<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.2"/>',
    trend:'<path d="M3.5 15.5l5-5 4 4 7-7"/><path d="M15 7.5h4.5V12"/>',
    drop:'<path d="M12 3.5C12 3.5 5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 3.5 12 3.5Z"/>',
    dumbbell:'<path d="M6.5 9v6M3.5 10.5v3M17.5 9v6M20.5 10.5v3M6.5 12h11"/>',
    shirt:'<path d="M8.5 4l3.5 2 3.5-2 4 3-3 3-1-1v9H8.5v-9l-1 1-3-3 4-3Z"/>',
    star:'<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17l-5.3 2.6 1-5.8L3.5 9.7l5.9-.9L12 3.5Z"/>',
    tree:'<path d="M12 3.5l5 8h-3l4 7H6l4-7H7l5-8Z"/><path d="M12 18.5V21"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  };
  function icon(name) {
    const p = ICONS[name] || '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }

  /* toast */
  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
  }

  /* 路由 */
  const routes = {};
  let current = null;
  function register(id, fn) { routes[id] = fn; }
  function go(id) {
    if (!routes[id]) return;
    current = id;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.id === id));
    const c = document.getElementById('content');
    c.scrollTop = 0;
    routes[id](c);
  }

  /* 成就触发入口（具体实现在 achievement.js） */
  let achievementHook = null;
  function onAchieve(fn) { achievementHook = fn; }
  function achieve(type, amount, label) { if (achievementHook) achievementHook(type, amount, label); }

  /* 创建元素小工具 */
  function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

  /* 导出 CSV（Excel 可直接打开，带 UTF-8 BOM 防中文乱码） */
  function exportCSV(filename, rows) {
    const esc = s => {
      s = (s == null ? '' : String(s));
      if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const csv = '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (e) {} }, 200);
    } catch (e) { toast('导出失败：' + (e.message || e)); }
  }

  /* 版本号（用于确认浏览器是否加载了最新代码） */
  window.HUOLITING_VERSION = 'v46';

  return {
    get, set, dget, dset, dgetOn, dsetOn, today, todayLabel, dayIndex, isWeekend, hash,
    applyDailyTheme, themeName, icon, toast, register, go, onAchieve, achieve, h, exportCSV,
    parseDate, fmtDate, shiftDate, dateLabel,
  };
})();
