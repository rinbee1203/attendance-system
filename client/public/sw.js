const CACHE_NAME = 'attendqr-v2';

// Only cache the app shell — same-origin files only
const SHELL_URLS = ['/'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_URLS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // ── CRITICAL: Only handle same-origin requests ─────────────────────────────
  // All cross-origin requests (CDNs, fonts, external APIs) pass through untouched
  // This prevents CSP violations from sw.js trying to fetch external resources
  if (url.origin !== self.location.origin) return;

  // Let API calls pass through — handled by the app
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests — serve index from cache or network
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/').then(cached => {
        return cached || fetch(e.request).catch(() =>
          new Response('App is offline. Please reconnect.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        );
      })
    );
    return;
  }

  // Static assets (GET only) — cache first, fallback to network
  if (e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return response;
        }).catch(() => new Response('Offline', { status: 503 }));
      })
    );
  }
});

// Background sync — notify app to process offline check-in queue
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-checkins') {
    e.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_OFFLINE_CHECKINS' }));
      })
    );
  }
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
