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
const compatibility = read('src/features/compatibility-bundle.js');
const analysis = read('src/services/brew-analysis-service.js');
const history = read('src/domain/history/history-service.js');
const spatial = read('src/renderers/brew-spatial-view.js');
const sw = read('sw.js');
const manifest = JSON.parse(read('manifest.webmanifest'));

assert.match(index, /1\.1\.0-test/);
assert.match(index, /src\/core\/startup-controller\.js/);
assert.match(index, /src\/core\/bootstrap\.js/);
assert.match(index, /src\/services\/cloud-auth-service\.js/);
assert.match(index, /src\/services\/cloud-sync-service\.js/);
assert.match(index, /src\/ui\/appearance-controller\.js/);
assert.match(index, /src\/ui\/fab-controller\.js/);
assert.match(index, /src\/features\/compatibility-bundle\.js/);
assert.doesNotMatch(index, /<script[^>]+src="\.\/src\/app\.js/);
assert.doesNotMatch(index, /<script[^>]+src="\.\/src\/v/);
assert.doesNotMatch(index, /v109-supabase-auth-gate\.js/);
assert.doesNotMatch(index, /v099f-cloud-sync\.js/);
assert.doesNotMatch(index, /v099j-runtime-stability\.js|v099o-dom-stability\.js|v099h-splash-assets\.js|v099d-radar-scroll\.js|v097-fab-gesture\.js/);

assert.match(startup, /ensureLocalIdentity/);
assert.match(startup, /LB-LOCAL-/);
assert.match(startup, /luckybean:local-app-ready/);
assert.match(startup, /点击进入/);
assert.match(startup, /await ensureLocalIdentity\(\)[\s\S]*await import\('\.\.\/app\.js\?v=1\.1\.0-test'\)/);
assert.doesNotMatch(startup, /fetch\s*\(/);

assert.match(auth, /REMEMBER_MS\s*=\s*7\s*\*\s*24/);
assert.match(auth, /grant_type=refresh_token/);
assert.match(auth, /warmSession/);
assert.doesNotMatch(auth, /localStorage\.setItem\([^\n]*password/i);

assert.match(sync, /DEBOUNCE_MS\s*=\s*8000/);
assert.match(sync, /changedRows/);
assert.match(sync, /body:\s*changedRows/);
assert.match(sync, /luckybean:data-changed/);
assert.match(sync, /cipher:\s*'none'/);
assert.match(sync, /remoteChangedElsewhere/);
assert.doesNotMatch(sync, /setInterval\s*\(/);
assert.doesNotMatch(sync, /PASSPHRASE|promptPassphrase|sessionStorage/i);

assert.match(db, /luckybean\.cloud\.dirty\.v3/);
assert.match(db, /markSyncDirty\(name, 'put'/);
assert.match(db, /luckybean:data-changed/);
assert.match(bootstrap, /requestIdleCallback/);
assert.match(bootstrap, /reconcile/);
assert.match(panel, /启动和使用不等待服务器/);
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

assert.match(compatibility, /COMPATIBILITY_MODULES/);
assert.match(compatibility, /for \(const path of COMPATIBILITY_MODULES\)/);
assert.match(compatibility, /try\s*\{[\s\S]*await import\(path\)/);
assert.match(compatibility, /LuckyBeanCompatibilityLayer/);
assert.doesNotMatch(compatibility, /v109-history-management\.js|v099-trajectory-signal-bridge\.js|v099i-trajectory-space\.js/);
assert.doesNotMatch(compatibility, /v095-ui\.js|theme-bridge\.js/);

assert.match(sw, /luckybean-1\.1\.0-test/);
assert.match(sw, /src\/app\.js/);
assert.match(sw, /src\/core\/bootstrap\.js/);
assert.match(sw, /src\/ui\/appearance-controller\.js/);
assert.match(sw, /src\/features\/compatibility-bundle\.js/);
assert.match(sw, /src\/renderers\/brew-spatial-view\.js/);
assert.match(sw, /src\/domain\/history\/history-service\.js/);
assert.doesNotMatch(sw, /v109-history-management\.js|v099-trajectory-signal-bridge\.js|v099i-trajectory-space\.js/);
assert.doesNotMatch(sw, /v095-ui\.js|theme-bridge\.js|splash-red\.jpg|settings-mascot\.png/);
assert.equal(manifest.version, '1.1.0-test');

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

console.log('v1.1.0 local-first, authoritative analysis, spatial renderer and formal history checks passed');
