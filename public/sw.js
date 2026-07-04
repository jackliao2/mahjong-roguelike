// Mahjong Quiz — Service Worker
// Strategy: cache-first for same-origin assets, network-first for HTML navigations
// with cache fallback. This enables offline play after the first visit.

const CACHE_NAME = 'mahjong-quiz-v10';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/play.html',
  '/blog.html',
  '/how-to-play.html',
  '/yaku-list.html',
  '/games-like-balatro.html',
  '/riichi-vs-chinese-mahjong.html',
  '/mahjong-brain-benefits.html',
  '/riichi-mahjong-strategy.html',
  '/license.html',
  '/contact.html',
  '/privacy.html',
  '/terms.html',
  '/cookies.html',
  '/manifest.json',
  '/favicon.svg',
  '/og-image.svg',
  '/immersion.css',
  '/immersion.js',
  '/ads.txt',
];

// ===== Install: precache core pages =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {
      // If any precache fails (e.g., offline on first install), ignore —
      // the SW still activates and caches on demand.
    })
  );
  self.skipWaiting();
});

// ===== Activate: clean up old caches =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ===== Fetch: cache-first for assets, network-first for navigations =====
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests for same-origin
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Skip analytics and font requests (let them go to network or fail silently)
  if (url.hostname.includes('umami') || url.hostname.includes('fonts.googleapis') || url.hostname.includes('fonts.gstatic')) {
    return;
  }

  // Navigation requests (HTML pages): network-first, fall back to cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/play.html')))
    );
    return;
  }

  // Static assets: network-first for JS/CSS (so updates show immediately),
  // cache-first for everything else
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (!res || res.status !== 200) return caches.match(req).then((c) => c || res);
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || new Response('', { status: 504 })))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Only cache successful, same-type responses
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      });
    })
  );
});
