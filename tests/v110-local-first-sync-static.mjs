import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = path => fs.existsSync(new URL(`../${path}`, import.meta.url));

const index = read('index.html');
const startup = read('src/core/startup-controller.js');
const bootstrap = read('src/core/bootstrap.js');
const auth = read('src/services/cloud-auth-service.js');
const sync = read('src/services/cloud-sync-service.js');
const db = read('src/db.js');
const panel = read('src/ui/account-sync-panel.js');
const appearance = read('src/ui/appearance-controller.js');
const fab = read('src/ui/fab-controller.js');
const runtimeFeatures = read('src/features/runtime-features.js');
const analysis = read('src/services/brew-analysis-service.js');
const history = read('src/domain/history/history-service.js');
const spatial = read('src/renderers/brew-spatial-view.js');
const sw = read('sw.js');
const manifest = JSON.parse(read('manifest.webmanifest'));

assert.match(index, /1\.2\.3-main-test/);
assert.match(index, /src\/core\/startup-controller\.js/);
assert.match(index, /src\/core\/bootstrap\.js/);
assert.match(index, /src\/services\/cloud-auth-service\.js/);
assert.match(index, /src\/services\/cloud-sync-service\.js/);
assert.match(index, /src\/ui\/appearance-controller\.js/);
assert.match(index, /src\/ui\/fab-controller\.js/);
assert.match(index, /src\/features\/runtime-features\.js/);
assert.doesNotMatch(index, /<script[^>]+src="\.\/src\/app\.js/);
assert.doesNotMatch(index, /<script[^>]+src="\.\/src\/v/);
assert.doesNotMatch(index, /v109-supabase-auth-gate\.js/);
assert.doesNotMatch(index, /v099f-cloud-sync\.js/);
assert.doesNotMatch(index, /v099j-runtime-stability\.js|v099o-dom-stability\.js|v099h-splash-assets\.js|v099d-radar-scroll\.js|v097-fab-gesture\.js/);

assert.match(startup, /ensureLocalDevice/);
assert.doesNotMatch(startup, /ensureLocalIdentity|LB-LOCAL-/);
assert.match(startup, /luckybean:local-app-ready/);
assert.match(startup, /点击进入/);
assert.match(startup, /navigator\.serviceWorker\.register\('\.\/sw\.js\?v=1\.2\.3-main-test'/);
assert.match(startup, /await ensureLocalDevice\(\)[\s\S]*await import\('\.\.\/app\.js\?v=1\.2\.3-main-test'\)/);
assert.doesNotMatch(startup, /fetch\s*\(/);

assert.match(auth, /REMEMBER_MS\s*=\s*7\s*\*\s*24/);
assert.match(auth, /grant_type=refresh_token/);
assert.match(auth, /warmSession/);
assert.doesNotMatch(auth, /localStorage\.setItem\([^\n]*password/i);

assert.match(sync, /DEBOUNCE_MS\s*=\s*8000/);
assert.match(sync, /changedRows/);
assert.match(sync, /body:\s*(?:prepared\.)?changedRows/);
assert.match(sync, /luckybean:data-changed/);
assert.match(sync, /cipher:\s*'none'/);
assert.match(sync, /remoteChangedElsewhere/);
assert.doesNotMatch(sync, /setInterval\s*\(/);
assert.doesNotMatch(sync, /PASSPHRASE|promptPassphrase|sessionStorage/i);
assert.match(sync, /function ensureAutomatic/);
assert.match(sync, /resolveDeletionDecision/);
assert.match(sync, /deletion-confirmation-required/);
assert.match(sync, /mergePacketPreservingRemote/);
assert.doesNotMatch(sync, /ENABLE_KEY|setEnabled|getSetting|setSetting/);

assert.match(db, /luckybean\.cloud\.dirty\.v3/);
assert.match(db, /markSyncDirty\(name, 'put'/);
assert.match(db, /luckybean:data-changed/);
assert.match(bootstrap, /requestIdleCallback/);
assert.match(bootstrap, /reconcile/);
assert.match(panel, /登录服务器同步/);
assert.match(panel, /自动同步始终启用/);
assert.match(appearance, /splash-art-red\.webp/);
assert.match(appearance, /splash-art-light\.webp/);
assert.match(appearance, /LuckyBeanAppearanceController/);
assert.doesNotMatch(appearance, /new MutationObserver\([^\n]*document\.documentElement/);
assert.match(fab, /LuckyBeanFabController/);

assert.match(analysis, /brew-analysis\/2\.0/);
assert.match(analysis, /brew-spatial\/1\.1/);
assert.match(analysis, /clientAdjusted:\s*false/);
assert.match(history, /commitCompletedBrew/);
assert.match(history, /inventoryEventId/);
assert.doesNotMatch(history, /status:\s*['"](?:planned|completed|terminated)/);
assert.match(spatial, /class BrewSpatialView/);
assert.match(spatial, /pointerdown/);
assert.match(spatial, /pinchDistance/);

assert.match(runtimeFeatures, /RUNTIME_FEATURES/);
assert.match(runtimeFeatures, /for \(const feature of RUNTIME_FEATURES\)/);
assert.match(runtimeFeatures, /try\s*\{[\s\S]*await import\(feature\.path\)/);
assert.match(runtimeFeatures, /LuckyBeanRuntimeFeatures/);
assert.doesNotMatch(runtimeFeatures, /v109-history-management\.js|v099-trajectory-signal-bridge\.js|v099i-trajectory-space\.js/);
assert.doesNotMatch(runtimeFeatures, /v095-ui\.js|theme-bridge\.js/);

assert.match(sw, /CACHE_PREFIX = 'luckybean-main-v123-'/);
assert.match(sw, /CACHE_NAME = `\$\{CACHE_PREFIX\}1\.2\.3-main-test`/);
assert.match(sw, /LEGACY_CACHE_PREFIXES = \['luckybean-v120-test-', 'luckybean-v121-account-test-', 'luckybean-v122-cloud-safety-test-'\]/);
assert.match(sw, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);
assert.match(sw, /LEGACY_CACHE_PREFIXES\.some/);
assert.doesNotMatch(sw, /keys\.filter\(key => key !== CACHE_NAME\)/);
assert.match(sw, /src\/app\.js/);
assert.match(sw, /src\/core\/bootstrap\.js/);
assert.match(sw, /src\/services\/cloud-sync-safety\.js/);
assert.match(sw, /src\/ui\/appearance-controller\.js/);
assert.match(sw, /src\/features\/runtime-features\.js/);
assert.match(sw, /src\/renderers\/brew-spatial-view\.js/);
assert.match(sw, /src\/domain\/history\/history-service\.js/);
assert.doesNotMatch(sw, /v109-history-management\.js|v099-trajectory-signal-bridge\.js|v099i-trajectory-space\.js/);
assert.doesNotMatch(sw, /v095-ui\.js|theme-bridge\.js|splash-red\.jpg|settings-mascot\.png/);
assert.equal(manifest.version, '1.2.3-main-test');

for (const path of [
  'src/v109-supabase-auth-gate.js',
  'src/v099f-cloud-sync.js',
  'src/v099j-runtime-stability.js',
  'src/v099o-dom-stability.js',
  'src/v099h-splash-assets.js',
  'src/v099d-radar-scroll.js',
  'src/v097-fab-gesture.js',
  'src/v099d-supabase-auth.js',
  'src/v099e-account-bridge.js',
  'src/v099e-cloud-sync.js',
  'src/v099f-runtime-hotfix.js',
  'src/v108-local-first-history.js',
  'src/v095-ui.js',
  'src/theme-bridge.js'
]) assert.equal(exists(path), false, `${path} should have been removed`);

console.log('v1.2.2 single account, recoverable panel and protected cloud deletion checks passed');
