// LuckyBean 1.24B: lifecycle, transit/frozen beans, serial OCR and compact UI.
const REVISION = '1.24B-main.2';
const CACHE_PREFIX = 'luckybean-main-v124b-';
const CACHE_NAME = `${CACHE_PREFIX}main-2`;
const LEGACY_CACHE_PREFIXES = [
  'luckybean-main-v123e-', 'luckybean-main-v123d-', 'luckybean-main-v123-', 'luckybean-v120-test-',
  'luckybean-v121-account-test-', 'luckybean-v122-cloud-safety-test-',
  'luckybean-v123-brewprofiles-integration-test-', 'luckybean-v200-foundation-'
];
const versioned = path => `${path}?v=${REVISION}`;
const CORE = [
  './',
  './index.html',
  './recognition-test.html',
  versioned('./manifest.webmanifest'),
  versioned('./styles.css'),
  versioned('./src/release-1.24b.css'),
  versioned('./src/release-1.24b.js'),
  versioned('./src/features/release-1.24b-integration.js'),
  versioned('./src/features/release-1.24b-finalize.js'),
  versioned('./src/features/release-1.24b-transit-controller.js'),
  versioned('./src/features/release-1.24b-polish.js'),
  versioned('./src/data/local-brew-recipes-1.24b.js'),
  versioned('./src/services/grind-psd-reference-service.js'),
  versioned('./src/domain/recognition/order-recognition-1.24b.js'),
  versioned('./src/ui/app-layout.css'),
  versioned('./src/ui/app-components.css'),
  versioned('./src/ui/bean-card.css'),
  versioned('./src/ui/professional-sensory.css'),
  versioned('./src/ui/sensory-wizard-actions.css'),
  versioned('./src/ui/brew-optimization.css'),
  versioned('./src/app.js'),
  versioned('./src/domain/archive/luckybean-archive-codec.js'),
  versioned('./src/domain/archive/luckybean-archive-service.js'),
  versioned('./src/domain/beans/bean-consumption-summary.js'),
  versioned('./src/domain/beans/bean-lifecycle-service.js'),
  versioned('./src/domain/recognition/recognition-document.js'),
  versioned('./src/domain/recognition/recognition-pipeline.js'),
  versioned('./src/domain/recognition/recognition-date-classifier.js'),
  versioned('./src/domain/recognition/recognition-date-review.js'),
  versioned('./src/recognition-test-page.js'),
  './contracts/luckybean-archive-v1.schema.json',
  './contracts/recognition-document-v1.schema.json',
  './contracts/recognition-date-decision-v1.schema.json',
  './contracts/brew-optimization-v1.schema.json',
  './contracts/brew-optimization-validation-v1.schema.json',
  versioned('./src/core/startup-controller.js'),
  versioned('./src/core/bootstrap.js'),
  versioned('./src/services/cloud-auth-service.js'),
  versioned('./src/services/cloud-sync-service.js'),
  versioned('./src/services/cloud-sync-safety.js'),
  versioned('./src/services/bean-enrichment-service.js'),
  versioned('./src/cloud-codec.js'),
  versioned('./src/services/brew-analysis-service.js'),
  versioned('./src/services/brew-calculation-coordinator.js'),
  versioned('./src/services/brew-api-client.js'),
  versioned('./src/services/brew-profile-catalog-service.js'),
  versioned('./src/services/local-reference-analysis.js'),
  versioned('./src/services/provider-package-service.js'),
  versioned('./src/services/codebook-reconciliation-service.js'),
  versioned('./src/services/provider-bootstrap-controller.js'),
  versioned('./src/ui/provider-status-panel.js'),
  versioned('./src/ui/codebook-reconciliation-screen.js'),
  versioned('./src/ui/codebook-reconciliation-screen.css'),
  versioned('./src/domain/history/history-service.js'),
  versioned('./src/domain/history/history-sensory-service.js'),
  versioned('./src/domain/sensory/brew-optimization-assessment.js'),
  versioned('./src/domain/history/history-comparison.js'),
  versioned('./src/ui/brew-trend-panel.js'),
  versioned('./src/ui/brew-trend-panel.css'),
  versioned('./src/domain/history/history-migration.js'),
  versioned('./src/ui/history/history-screen.js'),
  versioned('./src/ui/history/history-screen.css'),
  versioned('./src/renderers/brew-spatial-view.js'),
  versioned('./src/renderers/brew-spatial-controller.js'),
  versioned('./src/renderers/brew-spatial-view.css'),
  versioned('./src/ui/viewport-controller.js'),
  versioned('./src/ui/navigation-controller.js'),
  versioned('./src/ui/account-sync-panel.js'),
  versioned('./src/ui/appearance-controller.js'),
  versioned('./src/ui/voice-settings-controller.js'),
  versioned('./src/ui/gear-controller.js'),
  versioned('./src/ui/brew-cooling-controller.js'),
  versioned('./src/ui/flavor-guide-controller.js'),
  versioned('./src/ui/onboarding-controller.js'),
  versioned('./src/ui/bean-card-controller.js'),
  versioned('./src/ui/fab-controller.js'),
  versioned('./src/features/runtime-features.js'),
  versioned('./src/features/full-integration-controller-v3.js'),
  versioned('./src/features/freshness-timeline-controller.js'),
  versioned('./src/data-migrations.js'),
  versioned('./src/recognition-bridge.js'),
  versioned('./src/image-quality.js'),
  versioned('./src/recognition-web-ocr.js'),
  versioned('./src/recognition-paddle-ocr.js'),
  versioned('./src/recognition-quality-controller.js'),
  versioned('./src/package-capture-controller.js'),
  versioned('./src/direct-camera-controller.js'),
  versioned('./src/qr-ui-controller.js'),
  versioned('./src/integrity-ui-controller.js'),
  versioned('./src/ui-layout-controller.js'),
  versioned('./src/selection-controller.js'),
  versioned('./src/feature-controller.js'),
  versioned('./src/runtime-controller.js'),
  versioned('./src/bean-groups-controller.js'),
  versioned('./src/group-interaction-controller.js'),
  versioned('./src/ui-upgrade-controller.js'),
  versioned('./src/origin-map-controller.js'),
  versioned('./public/app-logo.webp'),
  versioned('./public/splash-art-red.webp'),
  versioned('./public/splash-art-light.webp'),
  versioned('./public/Luckybean-END.webp'),
  './public/vendor/jsqr/jsQR.js',
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