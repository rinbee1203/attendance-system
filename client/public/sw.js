// AttendQR Service Worker v3
// Increment CACHE_NAME to bust ALL old caches on every deploy
const CACHE_NAME = 'attendqr-v3';

self.addEventListener('install', (e) => {
  // Don't pre-cache anything — avoid stale bundle references
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Delete ALL old caches immediately — this fixes stale bundle 404s
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => {
        console.log('[SW] Deleting old cache:', k);
        return caches.delete(k);
      }))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // ONLY handle same-origin requests — never touch CDN/fonts/external APIs
  if (url.origin !== self.location.origin) return;

  // Never cache API calls
  if (url.pathname.startsWith('/api/')) return;

  // Never cache the service worker itself
  if (url.pathname === '/sw.js') return;

  // For navigation (page loads) — always go to network, never cache
  // This prevents stale index.html from being served after a new deploy
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('/').then(cached =>
          cached || new Response('App is offline. Please reconnect.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          })
        )
      )
    );
    return;
  }

  // Static assets — network first, cache as fallback for offline
  if (e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // Only cache successful same-origin responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(e.request))
    );
  }
});

// Background sync for offline check-in queue
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-checkins') {
    e.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SYNC_OFFLINE_CHECKINS' }))
      )
    );
  }
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
