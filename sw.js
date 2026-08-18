/* ============ 活力婷 · Service Worker（离线缓存） ============ */
const CACHE = 'huo-liting-v31';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/css/style.css',
  'assets/js/data.js',
  'assets/js/core.js',
  'assets/js/wake.js',
  'assets/js/overview.js',
  'assets/js/news.js',
  'assets/js/train.js',
  'assets/js/life.js',
  'assets/js/achievement.js',
  'assets/js/settings.js',
  'assets/js/app.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 外部 API（天气/新闻/大模型）始终走网络，失败不缓存
  if (url.origin !== location.origin) {
    e.respondWith(fetch(req).catch(() => new Response('', { status: 504 })));
    return;
  }
  // 应用外壳：网络优先，失败回退缓存（保证每次部署都能拿到最新代码，离线时仍可用）
  e.respondWith(
    fetch(req).then(resp => {
      if (resp && resp.status === 200) caches.open(CACHE).then(c => c.put(req, resp.clone()));
      return resp;
    }).catch(() => caches.match(req).then(cached => cached || new Response('', { status: 504 })))
  );
});
