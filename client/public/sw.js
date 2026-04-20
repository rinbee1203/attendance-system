const CACHE_NAME = 'attendqr-v1';
const OFFLINE_QUEUE_KEY = 'offline-checkin-queue';

// Cache essential app shell
const SHELL_URLS = ['/', '/index.html', '/static/js/main.chunk.js', '/static/js/bundle.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_URLS).catch(() => {}); // graceful fail
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

  // Let API calls through — handle offline queueing in the app
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first for app shell
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        if (response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});

// Background sync for offline check-in queue
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-checkins') {
    e.waitUntil(syncOfflineCheckins());
  }
});

async function syncOfflineCheckins() {
  try {
    // Get all clients to access their localStorage via postMessage
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ type: 'SYNC_OFFLINE_CHECKINS' });
    }
  } catch (err) {
    console.error('Sync error:', err);
  }
}

// Listen for messages from main thread
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
