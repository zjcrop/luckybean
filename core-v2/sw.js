const CACHE = 'luckybean-core-v2-2.0.0-alpha.1';
const CORE = [
  './index.html',
  './styles.css',
  './boot.js',
  './app.js',
  './native-bridge-loader.js',
  './qr-tools.js',
  './pwa.js',
  './manifest.webmanifest',
  '../src/db.js',
  '../src/storage-router.js',
  '../src/db-storage-core.js',
  '../src/codebook.js',
  '../src/brew-engine.js',
  '../src/brew-engine-core.js',
  '../src/brew-profiles.js',
  '../src/qr.js',
  '../src/qr-core.js',
  '../src/share-codec.js',
  '../src/share-codec-core.js',
  '../src/privacy-codec-v096.js',
  '../src/core-v2/contracts.js',
  '../src/core-v2/domain/inventory.js',
  '../src/core-v2/backup/backup-core.js',
  '../src/core-v2/sync/outbox.js',
  '../src/core-v2/platform/native-storage.js',
  '../src/core-v2/platform/platform-ui.js',
  '../public/coffee-codebook-v2.json',
  '../public/app-logo.webp'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('luckybean-core-v2-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || !response.ok || response.type === 'opaque') return response;
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      });
    }).catch(() => request.mode === 'navigate' ? caches.match('./index.html') : Response.error())
  );
});
