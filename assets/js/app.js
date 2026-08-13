/* ============ 应用入口 ============ */
(function () {
  function buildNav() {
    const nav = document.getElementById('nav-list');
    nav.innerHTML = '';
    const collapsed = App.get('grpCollapsed', {});

    // 今日总览（常驻，不折叠）
    const ov = document.createElement('div');
    ov.className = 'nav-item active';
    ov.dataset.id = 'overview';
    ov.innerHTML = '<span class="ico">' + App.icon('grid') + '</span><span class="label">今日总览</span>';
    ov.onclick = () => { closeSidebarMobile(); App.go('overview'); };
    nav.appendChild(ov);

    let lastGroup = null;
    let box = null;
    DATA.nav.forEach(item => {
      if (item.group && item.group !== lastGroup) {
        lastGroup = item.group;
        const isCol = !!collapsed[item.group];
        const g = document.createElement('div');
        g.className = 'nav-group' + (isCol ? ' collapsed' : '');
        g.innerHTML = '<span class="chev">▾</span>' + item.group;
        // 用块级变量捕获各自的分组容器，避免多个分组共用外层 box 引用导致折叠错乱
        const groupBox = document.createElement('div');
        groupBox.className = 'nav-group-box';
        groupBox.style.display = isCol ? 'none' : 'flex';
        g.onclick = () => {
          const c2 = App.get('grpCollapsed', {});
          c2[item.group] = !c2[item.group];
          App.set('grpCollapsed', c2);
          g.classList.toggle('collapsed', !!c2[item.group]);
          groupBox.style.display = c2[item.group] ? 'none' : 'flex';
        };
        nav.appendChild(g);
        nav.appendChild(groupBox);
        box = groupBox;
      }
      if (item.divider || !item.id) return;
      if (!box) return;
      const el = document.createElement('div');
      el.className = 'nav-item';
      el.dataset.id = item.id;
      el.innerHTML = '<span class="ico">' + App.icon(item.icon) + '</span><span class="label">' + item.name + '</span>';
      el.onclick = () => { closeSidebarMobile(); App.go(item.id); };
      box.appendChild(el);
    });

    // 底部常驻：我的大树 / 设置
    const foot = document.createElement('div');
    foot.className = 'nav-group-box';
    foot.style.display = 'flex';
    const tree = document.createElement('div');
    tree.className = 'nav-item';
    tree.innerHTML = '<span class="ico">' + App.icon('tree') + '</span><span class="label">我的大树</span>';
    tree.onclick = () => { closeSidebarMobile(); Achieve.openTree(); };
    const setEl = document.createElement('div');
    setEl.className = 'nav-item';
    setEl.innerHTML = '<span class="ico">' + App.icon('gear') + '</span><span class="label">设置</span>';
    setEl.onclick = () => { closeSidebarMobile(); App.go('settings'); };
    foot.appendChild(tree); foot.appendChild(setEl);
    nav.appendChild(foot);

    document.getElementById('nav-collapse').onclick = closeSidebar;
    document.getElementById('nav-reopen').onclick = openSidebar;
    document.getElementById('nav-overlay').onclick = closeSidebar;
  }

  function isMobile() { return window.innerWidth <= 600; }
  function openSidebar() {
    if (isMobile()) {
      document.getElementById('sidebar').classList.add('open');
      document.getElementById('nav-overlay').classList.remove('hidden');
    } else {
      document.getElementById('main-app').classList.remove('nav-collapsed');
      document.getElementById('nav-reopen').classList.add('hidden');
    }
  }
  function closeSidebar() {
    if (isMobile()) {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('nav-overlay').classList.add('hidden');
    } else {
      document.getElementById('main-app').classList.add('nav-collapsed');
      document.getElementById('nav-reopen').classList.remove('hidden');
    }
  }
  function closeSidebarMobile() { if (isMobile()) closeSidebar(); }

  function initAvatar() {
    const img = document.getElementById('brand-avatar');
    const input = document.getElementById('brand-avatar-input');
    if (!img || !input) return;
    const saved = App.get('brandAvatar', '');
    if (saved) img.src = saved;
    img.onclick = () => input.click();
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) { App.toast('图片请小于 1MB'); return; }
      const reader = new FileReader();
      reader.onload = e => { App.set('brandAvatar', e.target.result); img.src = e.target.result; App.toast('头像已更新'); };
      reader.readAsDataURL(file);
    };
  }

  function initGestures() {    const app = document.getElementById('app');
    if (!app) return;
    let sx = 0, sy = 0, ex = 0, ey = 0;
    app.addEventListener('touchstart', e => {
      if (!e.touches[0]) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    app.addEventListener('touchend', e => {
      if (!e.changedTouches[0]) return;
      ex = e.changedTouches[0].clientX; ey = e.changedTouches[0].clientY;
      const dx = ex - sx, dy = ey - sy;
      if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 1.2) return;
      const sidebar = document.getElementById('sidebar');
      if (dx > 0 && sx < 40 && !sidebar.classList.contains('open')) openSidebar();
      else if (dx < 0 && sidebar.classList.contains('open')) closeSidebar();
    }, { passive: true });
  }

  function setupModals() {
    document.addEventListener('click', e => {
      const cl = e.target.closest('[data-close]');
      if (cl) { const m = document.getElementById(cl.dataset.close); if (m) m.classList.add('hidden'); return; }
      if (e.target.classList && e.target.classList.contains('modal')) e.target.classList.add('hidden');
    });
  }

  function init() {
    App.applyDailyTheme();
    Achieve.init();
    buildNav();
    initAvatar();
    initGestures();
    setupModals();
    Wake.init();
    if (window.Life && Life.scheduleReminders) Life.scheduleReminders();
    registerSW();
    captureInstall();
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  function captureInstall() {
    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
    window.__installApp = function () {
      if (!deferred) { App.toast('请通过浏览器菜单"添加到主屏幕"安装'); return; }
      deferred.prompt();
      deferred.userChoice.then(() => { deferred = null; });
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
