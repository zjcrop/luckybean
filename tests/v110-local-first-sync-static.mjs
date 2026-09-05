import fs from 'node:fs';
import assert from 'node:assert/strict';

const index = fs.readFileSync('index.html', 'utf8');
const db = fs.readFileSync('src/db-storage-core.js', 'utf8');
const cloudAuth = fs.readFileSync('src/services/cloud-auth-service.js', 'utf8');
const cloudSync = fs.readFileSync('src/services/cloud-sync-service.js', 'utf8');
const appearance = fs.readFileSync('src/ui/appearance-controller.js', 'utf8');
const fab = fs.readFileSync('src/ui/fab-controller.js', 'utf8');
const analysis = fs.readFileSync('src/services/brew-analysis-service.js', 'utf8');
const history = fs.readFileSync('src/domain/history/history-service.js', 'utf8');
const spatial = fs.readFileSync('src/renderers/brew-spatial-view.js', 'utf8');
const runtimeFeatures = fs.readFileSync('src/features/runtime-features.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const release = JSON.parse(fs.readFileSync('release.json', 'utf8'));

assert.match(index, /services\/cloud-auth-service\.js/);
assert.match(index, /services\/cloud-sync-service\.js/);
assert.match(index, /ui\/appearance-controller\.js/);
assert.match(index, /ui\/fab-controller\.js/);
assert.match(index, /features\/runtime-features\.js/);

assert.match(db, /const DB_NAME = 'luckybean'/);
assert.match(db, /syncMetadata/);
assert.match(db, /syncOutbox/);
assert.match(db, /replaceStores/);
assert.match(db, /activateCodebook/);

assert.match(cloudAuth, /luckybean\.cloud\.auth\.session/);
assert.match(cloudAuth, /rememberDays/);
assert.match(cloudAuth, /LuckyBeanCloudAuth/);
assert.match(cloudAuth, /grant_type=password/);
assert.match(cloudAuth, /ensureAutomatic/);

assert.match(cloudSync, /LuckyBeanCloudSync/);
assert.match(cloudSync, /luckybean_sync_manifests/);
assert.match(cloudSync, /luckybean_sync_chunks/);
assert.match(cloudSync, /LEGACY_ENCRYPTED/);
assert.match(cloudSync, /deletion-confirmation-required/);
assert.match(cloudSync, /lastRemoteRevision/);
assert.match(cloudSync, /DEBOUNCE_MS = 8000/);

assert.match(appearance, /splash-art-red\.webp/);
assert.match(appearance, /splash-art-light\.webp/);
assert.match(appearance, /LuckyBeanAppearanceController/);
assert.doesNotMatch(appearance, /MutationObserver/);
assert.match(fab, /LuckyBeanFabController/);
assert.match(fab, /visualViewport/);

assert.match(analysis, /brew-analysis\/2\.1/);
assert.match(analysis, /brew-spatial\/1\.3/);
assert.match(analysis, /brew-flavor-state\/1\.0/);
assert.match(analysis, /clientAdjusted:\s*false/);
assert.match(history, /commitCompletedBrew/);
assert.match(history, /inventoryEventId/);
assert.doesNotMatch(history, /status:\s*['"](?:planned|completed|terminated)/);
assert.match(spatial, /class BrewSpatialView/);
assert.match(spatial, /pointerdown/);
assert.match(spatial, /pinchDistance/);

// Runtime features are now split into startup-critical and on-demand sets. Keep the original
// guarantees (declared catalog, guarded dynamic import, failure reporting) without requiring every
// feature to be eagerly imported during application bootstrap.
assert.match(runtimeFeatures, /CORE_FEATURES/);
assert.match(runtimeFeatures, /LAZY_FEATURES/);
assert.match(runtimeFeatures, /const catalog = new Map/);
assert.match(runtimeFeatures, /for \(const runtimeFeature of CORE_FEATURES\)/);
assert.match(runtimeFeatures, /const task = import\(entry\.path\)/);
assert.match(runtimeFeatures, /LuckyBeanRuntimeFeatures/);
assert.match(runtimeFeatures, /runtime-feature-error/);
assert.match(runtimeFeatures, /shared-sortable/);
assert.match(runtimeFeatures, /BEAN_GROUP_RUNTIME_REVISION = RELEASE_REVISION/);
assert.match(runtimeFeatures, /warmRecognition/);
assert.match(runtimeFeatures, /origin-map/);
assert.doesNotMatch(runtimeFeatures.split('const LAZY_FEATURES')[0], /recognition-paddle-ocr|package-capture|direct-camera|origin-map/);
assert.doesNotMatch(runtimeFeatures, /v109-history-management\.js|v099-trajectory-signal-bridge\.js|v099i-trajectory-space\.js/);
assert.doesNotMatch(runtimeFeatures, /v095-ui\.js|theme-bridge\.js/);

assert.ok(sw.includes(`CACHE_PREFIX = '${release.cachePrefix}'`));
assert.ok(sw.includes(`CACHE_NAME = \`${'${CACHE_PREFIX}'}${release.cacheRevision}\``));
assert.ok(sw.includes(`REVISION = '${release.revision}'`));
assert.match(sw, /LEGACY_CACHE_PREFIXES = \[/);
assert.match(sw, /'luckybean-main-v124b-'/);
assert.match(sw, /'luckybean-main-v123e-'/);
assert.match(sw, /'luckybean-main-v123d-'/);
assert.match(sw, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);

console.log('v110 local-first sync/static contracts: OK');
