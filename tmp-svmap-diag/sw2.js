/* SecureVu Map PWA — shell estático; nunca cachea /api ni media. */
const CACHE = 'svmap-shell-v2';
const PRECACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/manifest.webmanifest',
  '/logo.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isApiOrMedia(url) {
  const p = url.pathname;
  return p.startsWith('/api/')
    || p.startsWith('/sv/')
    || p.startsWith('/ucm-ws');
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isApiOrMedia(url)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('/index.html').then(r => r || caches.match('/login.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const fetched = fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
