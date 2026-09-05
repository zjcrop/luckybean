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

// Runtime/offline contract inventory. These resources are intentionally NOT fetched
// during service-worker installation; same-origin network-first requests cache them
// after actual use. Keeping the inventory explicit preserves auditability without
// making first load depend on a large all-or-nothing precache transaction.
const LAZY_RUNTIME_RESOURCES = [
  './src/app.js',
  './src/services/cloud-sync-safety.js',
  './src/services/brew-analysis-service.js',
  './src/services/provider-package-service.js',
  './src/services/execution-text-sanitizer.js',
  './src/ui/appearance-controller.js',
  './src/ui/voice-settings-controller.js',
  './src/features/runtime-features.js',
  './src/features/release-1.24b-transit-controller.js',
  './src/features/release-1.24b-group-navigation.js',
  './src/features/release-1.24b-about-controller.js',
  './src/features/release-1.24b-freshness-detail.js',
  './src/features/recognition-batch-progress-controller.js',
  './src/ui/sortable-controller.js',
  './src/features/sensory-tag-sort-controller.js',
  './src/domain/recognition/recognition-field-resolver-1.24b.js',
  './src/ui/gear-controller.js',
  './src/renderers/brew-spatial-view.js',
  './src/domain/history/history-service.js',
  './src/recognition-bridge.js',
  './public/Luckybean-END.webp',
  './public/vendor/jsvectormap/world.js'
];
void LAZY_RUNTIME_RESOURCES;

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
