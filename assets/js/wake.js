/* ============ 唤醒界面 ============ */
window.Wake = (function () {
  const Q = DATA.wakeQuotes;
  function quoteForToday() { return Q[App.hash(App.today()) % Q.length]; }

  function flowerSVG() {
    let petals = '';
    for (let i = 0; i < 8; i++) {
      petals += '<ellipse cx="24" cy="12" rx="5" ry="9" fill="#F279A0" transform="rotate(' + (i * 45) + ' 24 24)"/>';
    }
    return '<svg width="56" height="56" viewBox="0 0 48 48">' + petals + '<circle cx="24" cy="24" r="6" fill="#fff"/></svg>';
  }

  function photoHTML() {
    const saved = App.get('wakePhoto', '');
    if (saved) return '<img class="wake-photo" id="wake-photo" src="' + escapeHtml(saved) + '" alt="我的照片">';
    return '<div class="wake-photo placeholder" id="wake-photo">' + flowerSVG() + '</div>';
  }

  function uvLevel(uv) {
    if (uv === '--' || uv == null) return '—';
    uv = +uv;
    if (uv <= 2) return '低';
    if (uv <= 5) return '中等';
    if (uv <= 7) return '高';
    if (uv <= 10) return '很高';
    return '极高';
  }

  function renderWeather(w) {
    return escapeHtml(w.city) + ' · ' + escapeHtml(w.cond) + ' ' + w.temp + '℃ · 紫外线' + uvLevel(w.uv);
  }

  function render() {
    const el = document.getElementById('wake-screen');
    const q = quoteForToday();
    el.innerHTML =
      '<div class="wake-content">' +
        '<div class="wake-weather" id="wake-weather">读取天气中…</div>' +
        '<div class="decor-circle"><div class="wake-photo-wrap" id="wake-photo-wrap" title="点击更换照片">' + photoHTML() + '</div></div>' +
        '<input type="file" id="wake-photo-input" accept="image/*" class="hidden">' +
        '<div class="wake-date">' + App.todayLabel() + '</div>' +
        '<div class="wake-title">嗨，活力婷</div>' +
        '<div class="wake-main">' + q.main + '</div>' +
        '<div class="wake-sub">' + q.sub + '</div>' +
        '<button class="wake-btn" id="wake-start">开始今天 ✨</button>' +
        '<div class="wake-hint">点一下，开启今日计划</div>' +
      '</div>';
    document.getElementById('wake-start').onclick = enter;
    initPhoto();
    loadWeather();
  }

  function initPhoto() {
    const wrap = document.getElementById('wake-photo-wrap');
    const input = document.getElementById('wake-photo-input');
    if (wrap) wrap.onclick = () => input.click();
    if (input) input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) { App.toast('图片请小于 1MB'); return; }
      const reader = new FileReader();
      reader.onload = e => {
        App.set('wakePhoto', e.target.result);
        const ph = document.getElementById('wake-photo');
        if (ph) { ph.outerHTML = photoHTML(); initPhoto(); }
        App.toast('照片已更新');
      };
      reader.readAsDataURL(file);
    };
  }

  async function loadWeather() {
    const box = document.getElementById('wake-weather');
    if (!box) return;
    const city = API.cfg(API.K.weatherCity, '上海');
    let w = App.dget('weatherCache', null);
    if (w && w.date === App.today()) { box.innerHTML = renderWeather(w); return; }
    box.innerHTML = '读取天气中…';
    try {
      w = await API.fetchWeather(city);
      w.date = App.today();
      App.dset('weatherCache', w);
      if (box) box.innerHTML = renderWeather(w);
    } catch (e) {
      if (box) box.innerHTML = '天气获取失败（离线）· ' + escapeHtml(city);
    }
  }

  function enter() {
    const w = document.getElementById('wake-screen');
    const m = document.getElementById('main-app');
    w.classList.add('hidden');
    m.classList.remove('hidden');
    App.go('overview');
  }

  function init() {
    // 每次打开 APP 都显示唤醒页（点击"开始今天"后进入主应用）
    render();
  }

  function escapeHtml(s) { return (s || '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

  return { init, render, enter };
})();
