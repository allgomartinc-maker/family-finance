// Offline cache. Bump VERSION on every deploy so phones pick up the new files.
const VERSION = 'ff-v36';
const FB = '13.1.0'; // keep in sync with FB_VERSION in sync.js
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'logic.js', 'store.js', 'data.js',
  'config.js', 'sync.js', 'syncplan.js', 'clean.js', 'pin.js', 'login.js',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'fonts/vazirmatn-arabic.woff2', 'fonts/vazirmatn-latin.woff2', 'fonts/lalezar-arabic.woff2', 'fonts/lalezar-latin.woff2',
  'img/meat.jpg', 'img/chicken.jpg', 'img/fish.jpg', 'img/rice.jpg', 'img/flour.jpg', 'img/bread.jpg', 'img/oil.jpg', 'img/beans.jpg', 'img/dal.jpg', 'img/potato.jpg', 'img/tomato.jpg', 'img/onion.jpg', 'img/garlic.jpg', 'img/carrot.jpg', 'img/cucumber.jpg', 'img/pepper.jpg', 'img/lemon.jpg', 'img/apple.jpg', 'img/banana.jpg', 'img/egg.jpg', 'img/milk.jpg', 'img/yogurt.jpg', 'img/cheese.jpg', 'img/tea.jpg', 'img/sugar.jpg', 'img/salt.jpg', 'img/soap.jpg', 'img/tissue.jpg', 'img/baby.jpg', 'img/u_sack.jpg', 'img/u_bottle.jpg', 'img/u_kg.jpg',
  ...['app', 'auth', 'firestore'].map((m) => `https://www.gstatic.com/firebasejs/${FB}/firebase-${m}.js`),
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'];
const CDN = ['https://www.gstatic.com/', 'https://cdnjs.cloudflare.com/'];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new VERSION never stores stale files.
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// App files + pinned CDN libraries: cache first. Everything else (Firebase traffic) goes straight to the network.
self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  const own = url.startsWith(self.location.origin);
  if (e.request.method !== 'GET' || !(own || CDN.some((c) => url.startsWith(c)))) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: own }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && !own) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
