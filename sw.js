// LuckyBean 1.23D: main deployment with recognition contracts and portable archive v1.
const CACHE_PREFIX = 'luckybean-main-v123d-';
const CACHE_NAME = `${CACHE_PREFIX}deploy-1`;
const LEGACY_CACHE_PREFIXES = ['luckybean-main-v123-', 'luckybean-v120-test-', 'luckybean-v121-account-test-', 'luckybean-v122-cloud-safety-test-', 'luckybean-v123-brewprofiles-integration-test-', 'luckybean-v200-foundation-'];
const CORE = [
  './',
  './index.html',
  './recognition-test.html',
  './manifest.webmanifest?v=1.23D',
  './styles.css?v=1.23D',
  './src/app.js?v=1.23D',
  './src/domain/archive/luckybean-archive-codec.js?v=1.23D',
  './src/domain/archive/luckybean-archive-service.js?v=1.23D',
  './src/domain/recognition/recognition-document.js?v=1.23D',
  './src/domain/recognition/recognition-date-classifier.js?v=1.23D',
  './src/domain/recognition/recognition-date-review.js?v=1.23D',
  './src/recognition-test-page.js?v=1.23D',
  './contracts/luckybean-archive-v1.schema.json',
  './contracts/recognition-document-v1.schema.json',
  './contracts/recognition-date-decision-v1.schema.json',
  './src/core/startup-controller.js?v=1.23D',
  './src/core/bootstrap.js?v=1.23D',
  './src/services/cloud-auth-service.js?v=1.23D',
  './src/services/cloud-sync-service.js?v=1.23D',
  './src/services/cloud-sync-safety.js?v=1.23D',
  './src/cloud-codec.js?v=1.23D',
  './src/services/brew-analysis-service.js?v=1.23D',
  './src/services/brew-api-client.js?v=1.23D',
  './src/services/brew-profile-catalog-service.js?v=1.23D',
  './src/services/local-reference-analysis.js?v=1.23D',
  './src/services/provider-package-service.js?v=1.23D',
  './src/services/codebook-reconciliation-service.js?v=1.23D',
  './src/services/provider-bootstrap-controller.js?v=1.23D',
  './src/ui/provider-status-panel.js?v=1.23D',
  './src/ui/codebook-reconciliation-screen.js?v=1.23D',
  './src/ui/codebook-reconciliation-screen.css?v=1.23D',
  './src/domain/history/history-service.js?v=1.23D',
  './src/domain/history/history-comparison.js?v=1.23D',
  './src/ui/brew-trend-panel.js?v=1.23D',
  './src/ui/brew-trend-panel.css?v=1.23D',
  './src/domain/history/history-migration.js?v=1.23D',
  './src/ui/history/history-screen.js?v=1.23D',
  './src/ui/history/history-screen.css?v=1.23D',
  './src/renderers/brew-spatial-view.js?v=1.23D',
  './src/renderers/brew-spatial-controller.js?v=1.23D',
  './src/renderers/brew-spatial-view.css?v=1.23D',
  './src/ui/account-sync-panel.js?v=1.23D',
  './src/ui/appearance-controller.js?v=1.23D',
  './src/ui/voice-settings-controller.js?v=1.23D',
  './src/ui/fab-controller.js?v=1.23D',
  './src/features/runtime-features.js?v=1.23D',
  './src/data-migrations.js?v=1.23D',
  './src/recognition-web-ocr.js?v=1.23D',
  './src/recognition-paddle-ocr.js?v=1.23D',
  './src/recognition-quality-controller.js?v=1.23D',
  './src/package-capture-controller.js?v=1.23D',
  './src/direct-camera-controller.js?v=1.23D',
  './src/qr-ui-controller.js?v=1.23D',
  './src/integrity-ui-controller.js?v=1.23D',
  './src/ui-layout-controller.js?v=1.23D',
  './src/selection-controller.js?v=1.23D',
  './src/feature-controller.js?v=1.23D',
  './src/runtime-controller.js?v=1.23D',
  './src/bean-groups-controller.js?v=1.23D',
  './src/group-interaction-controller.js?v=1.23D',
  './src/ui-upgrade-controller.js?v=1.23D',
  './src/origin-map-controller.js?v=1.23D',

  './public/app-logo.webp?v=1.23D',
  './public/splash-art-red.webp?v=1.23D',
  './public/splash-art-light.webp?v=1.23D',
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
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html'))));
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
