// LuckyBean 1.23D main-sync.6: one main source for Web/PWA and Android.
const CACHE_PREFIX = 'luckybean-main-v123d-';
const CACHE_NAME = `${CACHE_PREFIX}main-sync-6`;
const LEGACY_CACHE_PREFIXES = ['luckybean-main-v123-', 'luckybean-v120-test-', 'luckybean-v121-account-test-', 'luckybean-v122-cloud-safety-test-', 'luckybean-v123-brewprofiles-integration-test-', 'luckybean-v200-foundation-'];
const CORE = [
  './',
  './index.html',
  './recognition-test.html',
  './manifest.webmanifest?v=1.23D-main-sync.6',
  './styles.css?v=1.23D-full-integration.3',
  './src/app.js?v=1.23D-main-sync.5',
  './src/domain/archive/luckybean-archive-codec.js?v=1.23D-main-sync.4',
  './src/domain/archive/luckybean-archive-service.js?v=1.23D-main-sync.4',
  './src/domain/beans/bean-consumption-summary.js',
  './src/domain/recognition/recognition-document.js?v=1.23D-main-sync.4',
  './src/domain/recognition/recognition-date-classifier.js?v=1.23D-main-sync.4',
  './src/domain/recognition/recognition-date-review.js?v=1.23D-main-sync.4',
  './src/recognition-test-page.js?v=1.23D-main-sync.4',
  './contracts/luckybean-archive-v1.schema.json',
  './contracts/recognition-document-v1.schema.json',
  './contracts/recognition-date-decision-v1.schema.json',
  './src/core/startup-controller.js?v=1.23D-full-integration.3',
  './src/core/bootstrap.js?v=1.23D-main-sync.4',
  './src/services/cloud-auth-service.js?v=1.23D-main-sync.4',
  './src/services/cloud-sync-service.js?v=1.23D-main-sync.4',
  './src/services/cloud-sync-safety.js?v=1.23D-main-sync.4',
  './src/cloud-codec.js?v=1.23D-main-sync.4',
  './src/services/brew-analysis-service.js?v=1.23D-main-sync.4',
  './src/services/brew-api-client.js?v=1.23D-main-sync.4',
  './src/services/brew-profile-catalog-service.js?v=1.23D-main-sync.4',
  './src/services/local-reference-analysis.js?v=1.23D-main-sync.4',
  './src/services/provider-package-service.js?v=1.23D-main-sync.4',
  './src/services/codebook-reconciliation-service.js?v=1.23D-main-sync.4',
  './src/services/provider-bootstrap-controller.js?v=1.23D-main-sync.4',
  './src/ui/provider-status-panel.js?v=1.23D-main-sync.4',
  './src/ui/codebook-reconciliation-screen.js?v=1.23D-main-sync.4',
  './src/ui/codebook-reconciliation-screen.css?v=1.23D-main-sync.4',
  './src/domain/history/history-service.js?v=1.23D-main-sync.4',
  './src/domain/history/history-comparison.js?v=1.23D-main-sync.4',
  './src/ui/brew-trend-panel.js?v=1.23D-main-sync.4',
  './src/ui/brew-trend-panel.css?v=1.23D-main-sync.4',
  './src/domain/history/history-migration.js?v=1.23D-main-sync.4',
  './src/ui/history/history-screen.js?v=1.23D-main-sync.4',
  './src/ui/history/history-screen.css?v=1.23D-main-sync.4',
  './src/renderers/brew-spatial-view.js?v=1.23D-main-sync.4',
  './src/renderers/brew-spatial-controller.js?v=1.23D-main-sync.4',
  './src/renderers/brew-spatial-view.css?v=1.23D-main-sync.4',
  './src/ui/account-sync-panel.js?v=1.23D-main-sync.4',
  './src/ui/appearance-controller.js?v=1.23D-main-sync.4',
  './src/ui/voice-settings-controller.js?v=1.23D-main-sync.4',
  './src/ui/fab-controller.js?v=1.23D-main-sync.4',
  './src/features/runtime-features.js?v=1.23D-main-sync.4',
  './src/features/full-integration-controller-v3.js?v=1.23D-full-integration.3',
  './src/features/gear-regression-fix-controller.js?v=1.23D-full-integration.4',
  './src/features/legacy-timer-guard.js?v=1.23D-full-integration.3',
  './src/features/experience-fixes-controller.js?v=1.23D-full-integration.3',
  './src/data-migrations.js?v=1.23D-main-sync.4',
  './src/recognition-web-ocr.js?v=1.23D-main-sync.4',
  './src/recognition-paddle-ocr.js?v=1.23D-main-sync.4',
  './src/recognition-quality-controller.js?v=1.23D-main-sync.4',
  './src/package-capture-controller.js?v=1.23D-full-integration.4',
  './src/direct-camera-controller.js?v=1.23D-main-sync.4',
  './src/qr-ui-controller.js?v=1.23D-main-sync.4',
  './src/integrity-ui-controller.js?v=1.23D-main-sync.4',
  './src/ui-layout-controller.js?v=1.23D-main-sync.4',
  './src/selection-controller.js?v=1.23D-main-sync.4',
  './src/feature-controller.js?v=1.23D-main-sync.4',
  './src/runtime-controller.js?v=1.23D-main-sync.4',
  './src/bean-groups-controller.js?v=1.23D-main-sync.4',
  './src/group-interaction-controller.js?v=1.23D-main-sync.4',
  './src/ui-upgrade-controller.js?v=1.23D-main-sync.4',
  './src/origin-map-controller.js?v=1.23D-main-sync.4',

  './public/app-logo.webp?v=1.23D-main-sync.4',
  './public/splash-art-red.webp?v=1.23D-main-sync.4',
  './public/splash-art-light.webp?v=1.23D-main-sync.4',
  './public/Luckybean-END.webp?v=1.23D-main-sync.4',
  './public/vendor/jsvectormap/jsvectormap.min.css',
  './public/vendor/jsvectormap/jsvectormap.min.js',
  './public/vendor/jsvectormap/world.js',
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
