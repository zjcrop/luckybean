// LuckyBean local-first sync test release: 1.2.1-account-test
const CACHE_PREFIX = 'luckybean-v121-account-test-';
const CACHE_NAME = `${CACHE_PREFIX}1.2.1-account-test`;
const LEGACY_CACHE_PREFIXES = ['luckybean-v120-test-'];
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest?v=1.2.1-account-test',
  './styles.css?v=1.2.1-account-test',
  './src/app.js?v=1.2.1-account-test',
  './src/core/startup-controller.js?v=1.2.1-account-test',
  './src/core/bootstrap.js?v=1.2.1-account-test',
  './src/services/cloud-auth-service.js?v=1.2.1-account-test',
  './src/services/cloud-sync-service.js?v=1.2.1-account-test',
  './src/cloud-codec.js?v=1.2.1-account-test',
  './src/services/brew-analysis-service.js?v=1.2.1-account-test',
  './src/services/local-reference-analysis.js?v=1.2.1-account-test',
  './src/services/provider-package-service.js?v=1.2.1-account-test',
  './src/services/codebook-reconciliation-service.js?v=1.2.1-account-test',
  './src/services/provider-bootstrap-controller.js?v=1.2.1-account-test',
  './src/ui/provider-status-panel.js?v=1.2.1-account-test',
  './src/ui/codebook-reconciliation-screen.js?v=1.2.1-account-test',
  './src/ui/codebook-reconciliation-screen.css?v=1.2.1-account-test',
  './src/domain/history/history-service.js?v=1.2.1-account-test',
  './src/domain/history/history-comparison.js?v=1.2.1-account-test',
  './src/ui/brew-trend-panel.js?v=1.2.1-account-test',
  './src/ui/brew-trend-panel.css?v=1.2.1-account-test',
  './src/domain/history/history-migration.js?v=1.2.1-account-test',
  './src/ui/history/history-screen.js?v=1.2.1-account-test',
  './src/ui/history/history-screen.css?v=1.2.1-account-test',
  './src/renderers/brew-spatial-view.js?v=1.2.1-account-test',
  './src/renderers/brew-spatial-controller.js?v=1.2.1-account-test',
  './src/renderers/brew-spatial-view.css?v=1.2.1-account-test',
  './src/ui/account-sync-panel.js?v=1.2.1-account-test',
  './src/ui/appearance-controller.js?v=1.2.1-account-test',
  './src/ui/voice-settings-controller.js?v=1.2.1-account-test',
  './src/ui/fab-controller.js?v=1.2.1-account-test',
  './src/features/runtime-features.js?v=1.2.1-account-test',
  './src/data-migrations.js?v=1.2.1-account-test',
  './src/recognition-web-ocr.js?v=1.2.1-account-test',
  './src/recognition-paddle-ocr.js?v=1.2.1-account-test',
  './src/recognition-quality-controller.js?v=1.2.1-account-test',
  './src/package-capture-controller.js?v=1.2.1-account-test',
  './src/direct-camera-controller.js?v=1.2.1-account-test',
  './src/postbrew-sensory-controller.js?v=1.2.1-account-test',
  './src/qr-ui-controller.js?v=1.2.1-account-test',
  './src/integrity-ui-controller.js?v=1.2.1-account-test',
  './src/ui-layout-controller.js?v=1.2.1-account-test',
  './src/selection-controller.js?v=1.2.1-account-test',
  './src/feature-controller.js?v=1.2.1-account-test',
  './src/runtime-controller.js?v=1.2.1-account-test',
  './src/bean-groups-controller.js?v=1.2.1-account-test',
  './src/group-interaction-controller.js?v=1.2.1-account-test',
  './src/ui-upgrade-controller.js?v=1.2.1-account-test',
  './src/origin-map-controller.js?v=1.2.1-account-test',

  './public/app-logo.webp?v=1.2.1-account-test',
  './public/splash-art-red.webp?v=1.2.1-account-test',
  './public/splash-art-light.webp?v=1.2.1-account-test',
  './public/fallback-codebook.json',
  './public/legacy-flavor-map.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
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
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('./index.html', response.clone()));
      return response;
    }).catch(() => caches.match('./index.html')));
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
      caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    })));
  }
});
