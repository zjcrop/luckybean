// LuckyBean 1.24P: resilient offline shell with lazy feature/runtime caching.
const REVISION = '1.24P-main.20-dsb';
const CACHE_PREFIX = 'luckybean-main-v124p-';
const CACHE_NAME = `${CACHE_PREFIX}dsb-offline-20261027`;
const LEGACY_CACHE_PREFIXES = [
  'luckybean-main-v124b-', 'luckybean-main-v123e-', 'luckybean-main-v123d-', 'luckybean-main-v123-', 'luckybean-v120-test-',
  'luckybean-v121-account-test-', 'luckybean-v122-cloud-safety-test-',
  'luckybean-v123-brewprofiles-integration-test-', 'luckybean-v200-foundation-'
];
const versioned = path => `${path}?v=${REVISION}`;
const newerDocumentClients = new Set();

// Runtime/offline contract inventory. These resources are intentionally NOT fetched
// during service-worker installation; same-origin requests cache them
// after actual use. Keeping the inventory explicit preserves auditability without
// making first load depend on a large all-or-nothing precache transaction.
const LAZY_RUNTIME_RESOURCES = [
  './src/app.js',
  './src/domain/recognition/recognition-performance-policy.js',
  './src/domain/beans/bean-group-settings.js',
  './src/domain/recognition/recognition-dictionary-aliases.js',
  './src/domain/recognition/recognition-flavor-layout.js',
  './src/services/cloud-sync-safety.js',
  './src/services/brew-analysis-service.js',
  './src/services/provider-package-service.js',
  './src/services/execution-text-sanitizer.js',
  './src/services/recognition-ai-service.js',
  './src/services/grind-psd-reference-service.js',
  './src/ui/appearance-controller.js',
  './src/ui/voice-settings-controller.js',
  './src/ui/navigation-controller.js',
  './src/ui/interaction-foundation.js',
  './src/ui/interaction-foundation.css',
  './src/ui/brew-action-emphasis.css',
  './src/ui/brew-interaction-emphasis.css',
  './src/ui/gear-controller.js',
  './src/ui/sortable-controller.js',
  './src/features/runtime-features.js',
  './src/features/freshness-timeline-controller.js',
  './src/features/release-1.24b-transit-controller.js',
  './src/features/release-1.24b-group-navigation.js',
  './src/features/release-1.24b-about-controller.js',
  './src/features/release-1.24b-finalize.js',
  './src/features/release-1.24b-polish.js',
  './src/features/release-1.24b-ui-policy.js',
  './src/features/release-1.24b-freshness-detail.js',
  './src/features/recognition-batch-progress-controller.js',
  './src/features/recognition-multi-entry-controller.js',
  './src/domain/recognition/recognition-entry-splitter.js',
  './src/domain/recognition/recognition-evidence-signals.js',
  './src/domain/recognition/recognition-evidence-fixture.js',
  './src/domain/recognition/recognition-evidence-signals.js',
  './src/domain/recognition/recognition-evidence-fixture.js',
  './src/features/sensory-tag-sort-controller.js',
  './src/domain/recognition/recognition-field-resolver-1.24b.js',
  './src/domain/recognition/order-recognition-1.24b.js',
  './src/data/local-brew-recipes-1.24b.js',
  './src/renderers/brew-spatial-view.js',
  './src/domain/history/history-service.js',
  './src/domain/brew/timer-state-machine.js',
  './src/recognition-bridge.js',
  './public/Luckybean-END.webp',
  './public/vendor/jsvectormap/world.js'
];
void LAZY_RUNTIME_RESOURCES;

const BOOTSTRAP_CORE = [
  './',
  './index.html',
  './release.json',
  './public/bean-display-index.json',
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
      // Runtime cache misses retry when the resource is actually used.
    }
  }));
}

function cacheSuccessfulResponse(event, response) {
  const request = event.request;
  if (!response.ok || newerDocumentClients.has(event.clientId)) return;
  // Clone while the response body is still unused. Callers may consume the
  // returned response immediately (for example, OCR model fetches in a Worker).
  let cacheCopy;
  try { cacheCopy = response.clone(); } catch { return; }
  const pending = caches.open(CACHE_NAME)
    .then(cache => cache.put(request, cacheCopy))
    .catch(() => {});
  event.waitUntil(pending);
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

async function readCachedResponse(request, { navigation = false } = {}) {
  let timer;
  try {
    const lookup = caches.open(CACHE_NAME).then(async cache => await cache.match(request) || (navigation ? await cache.match('./index.html') : null)).catch(() => null);
    return await Promise.race([lookup, new Promise(resolve => { timer = setTimeout(() => resolve(null), 250); })]);
  } finally { clearTimeout(timer); }
}

async function networkWithCachedDeadline(event, cached, { navigation = false } = {}) {
  const request = event.request;
  let networkDocumentRevision = REVISION;
  const finish = response => {
    if (navigation && response !== cached && networkDocumentRevision !== REVISION) newerDocumentClients.add(event.resultingClientId || event.clientId);
    return response;
  };
  const network = fetch(new Request(request, { cache: 'no-cache' })).then(async response => {
    if (!response.ok && cached) return cached;
    if (navigation && response.ok) {
      const html = await response.clone().text();
      const documentRevision = html.match(/name=["']release-revision["']\s+content=["']([^"']+)/)?.[1];
      if (documentRevision && documentRevision !== REVISION) {
        // Before the new SW claims this navigation, unversioned module imports
        // must not read the preceding release's cache.
        networkDocumentRevision = documentRevision;
        return response;
      }
    }
    cacheSuccessfulResponse(event, response);
    if (navigation && response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy)).catch(() => {}));
    }
    return response;
  }).catch(error => { if (cached) return cached; throw error; });
  if (!cached) return network.then(finish);
  // Fresh HTML/metadata still get a network check, but a slow connection cannot
  // hold the local application hostage. Keep that check alive in the background.
  event.waitUntil(network.then(() => {}, () => {}));
  let timer;
  try {
    return finish(await Promise.race([network, new Promise(resolve => { timer = setTimeout(() => resolve(cached), navigation ? 800 : 2000); })]));
  } finally { clearTimeout(timer); }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await readCachedResponse(request, { navigation:true });
      return networkWithCachedDeadline(event, cached, { navigation:true });
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = newerDocumentClients.has(event.clientId) ? null : await readCachedResponse(request);
      // All app assets belong to this revision's cache. New releases change the
      // cache name; re-downloading every module on every warm start wastes time.
      if (!/(?:^|\/)(?:release|version)\.json$/.test(url.pathname) && cached) return cached;
      return networkWithCachedDeadline(event, cached);
    })());
    return;
  }

  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(readCachedResponse(request).then(cached => cached || fetch(request).then(response => {
      cacheSuccessfulResponse(event, response);
      return response;
    })));
  }
});
