// LuckyBean local-first sync test release: 1.1.0-test
const CACHE_NAME = 'luckybean-1.1.0-test';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest?v=1.1.0-test',
  './styles.css?v=1.1.0-test',
  './src/app.js?v=1.1.0-test',
  './src/core/startup-controller.js?v=1.1.0-test',
  './src/core/bootstrap.js?v=1.1.0-test',
  './src/services/cloud-auth-service.js?v=1.1.0-test',
  './src/services/cloud-sync-service.js?v=1.1.0-test',
  './src/services/brew-analysis-service.js?v=1.1.0-test',
  './src/services/local-reference-analysis.js?v=1.1.0-test',
  './src/domain/history/history-service.js?v=1.1.0-test',
  './src/renderers/brew-spatial-view.js?v=1.1.0-test',
  './src/renderers/brew-spatial-controller.js?v=1.1.0-test',
  './src/renderers/brew-spatial-view.css?v=1.1.0-test',
  './src/ui/account-sync-panel.js?v=1.1.0-test',
  './src/ui/appearance-controller.js?v=1.1.0-test',
  './src/ui/fab-controller.js?v=1.1.0-test',
  './src/features/compatibility-bundle.js?v=1.1.0-test',
  './src/v099i-migrations.js?v=1.1.0-test',
  './src/v096-web-ocr.js?v=1.1.0-test',
  './src/v099g-paddle-ocr.js?v=1.1.0-test',
  './src/v099d-ocr-quality.js?v=1.1.0-test',
  './src/v096-package-capture.js?v=1.1.0-test',
  './src/v096-direct-camera.js?v=1.1.0-test',
  './src/v095-postbrew-sensory.js?v=1.1.0-test',
  './src/v095-qr-ui.js?v=1.1.0-test',
  './src/v096-integrity-ui.js?v=1.1.0-test',
  './src/v097-ui-fixes.js?v=1.1.0-test',
  './src/v098-selection-bridge.js?v=1.1.0-test',
  './src/v098-feature-fixes.js?v=1.1.0-test',
  './src/v099-runtime.js?v=1.1.0-test',
  './src/v099t-bean-groups.js?v=1.1.0-test',
  './src/v099m-group-controller.js?v=1.1.0-test',
  './src/v099f-ui-upgrade.js?v=1.1.0-test',
  './src/v099g-world-map.js?v=1.1.0-test',
  './src/v099p-settings-rebuild.js?v=1.1.0-test',
  './src/v109-history-management.js?v=1.1.0-test',
  './public/app-logo.webp?v=1.1.0-test',
  './public/splash-art-red.webp?v=1.1.0-test',
  './public/splash-art-light.webp?v=1.1.0-test',
  './public/fallback-codebook.json',
  './public/legacy-flavor-map.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
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
