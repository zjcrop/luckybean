// LuckyBean 1.24P: resilient offline shell with lazy feature/runtime caching.
const REVISION = '1.24P-main.2';
const CACHE_PREFIX = 'luckybean-main-v124p-';
const CACHE_NAME = `${CACHE_PREFIX}main-2-web-startup`;
const LEGACY_CACHE_PREFIXES = [
  'luckybean-main-v124b-', 'luckybean-main-v123e-', 'luckybean-main-v123d-', 'luckybean-main-v123-', 'luckybean-v120-test-',
  'luckybean-v121-account-test-', 'luckybean-v122-cloud-safety-test-',
  'luckybean-v123-brewprofiles-integration-test-', 'luckybean-v200-foundation-'
];
const versioned = path => `${path}?v=${REVISION}`;

// Keep first-install traffic deliberately small. Everything else is cached by the
// same-origin fetch handler after it is actually used. This avoids turning one
// intermittent GitHub Pages request into a complete service-worker install failure.
const BOOTSTRAP_CORE = [
  './',
  './index.html',
  './release.json',
  versioned('./manifest.webmanifest'),
  versioned('./styles.css'),
  versioned('./src/ui/app-layout.css'),
  versioned('./src/ui/app-components.css'),
  versioned('./src/core/startup-controller.js'),
  versioned('./src/core/bootstrap.js'),
  versioned('./public/app-logo.webp'),
  versioned('./public/splash-art-red.webp'),
  versioned('./public/splash-art-light.webp')
];

async function cacheBootstrapBestEffort() {
  const cache = await caches.open(CACHE_NAME);
  // Do not use cache.addAll(): on lossy/filtered networks a single failed request
  // must not invalidate the whole offline shell installation.
  await Promise.allSettled(BOOTSTRAP_CORE.map(async path => {
    try {
      const request = new Request(path, { cache: 'reload' });
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
    } catch {
      // Runtime network-first fetch will retry when the resource is actually used.
    }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(cacheBootstrapBestEffort().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        || LEGACY_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(fetch(new Request(request, { cache: 'reload' })).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      return cached || caches.match('./index.html');
    }));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(fetch(new Request(request, { cache: 'reload' })).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(() => caches.match(request)));
    return;
  }

  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    })));
  }
});
