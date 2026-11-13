// Offline cache. Bump VERSION on every deploy so phones pick up the new files.
const VERSION = 'ff-v9';
const FB = '13.1.0'; // keep in sync with FB_VERSION in sync.js
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'logic.js', 'store.js', 'data.js',
  'config.js', 'sync.js', 'syncplan.js', 'clean.js', 'pin.js',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
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
