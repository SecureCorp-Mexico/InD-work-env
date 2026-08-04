/* SecureVu Map PWA — v21-alarm-float-border: SOS/Tamper frame colors; keep v20 3D+SV link + v19 dedupe + rail; never pin HTML/JS. */
const CACHE = 'svmap-shell-v21-alarm-float-border';
const PRECACHE = [
  '/manifest.webmanifest',
  '/logo.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
];

self.addEventListener('install', event => {
  // Bust sticky rollback/v7–v8 controllers immediately.
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

/** Hashed bundles + HTML must never be served stale from SW. */
function mustNetwork(url) {
  const p = url.pathname;
  return p === '/'
    || p.endsWith('.html')
    || p.startsWith('/assets/')
    || p === '/sw.js';
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isApiOrMedia(url)) return;

  if (mustNetwork(url) || req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => {
        if (req.mode === 'navigate') {
          return new Response(
            '<!doctype html><meta charset=utf-8><title>Offline</title>' +
            '<p>Sin conexión. Reintenta.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }
        return Response.error();
      }),
    );
    return;
  }

  event.respondWith(
    fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req)),
  );
});
