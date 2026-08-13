import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = file => fs.readFileSync(file, 'utf8');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes:true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const index = read('index.html');
const sw = read('sw.js');
const layout = read('src/ui/app-layout.css');
const components = read('src/ui/app-components.css');
const sensoryCss = read('src/ui/professional-sensory.css');
const sensory = read('src/sensory-professional-controller.js');
const integration = read('src/features/full-integration-controller-v3.js');
const freshness = read('src/features/freshness-timeline-controller.js');
const gear = read('src/ui/gear-controller.js');
const account = read('src/ui/account-sync-panel.js');
const appearance = read('src/ui/appearance-controller.js');
const voice = read('src/ui/voice-settings-controller.js');
const viewport = read('src/ui/viewport-controller.js');
const fab = read('src/ui/fab-controller.js');
const beanCards = read('src/ui/bean-card-controller.js');
const lifecycle = read('src/domain/beans/bean-lifecycle-service.js');
const onboarding = read('src/ui/onboarding-controller.js');
const auth = read('src/services/cloud-auth-service.js');
const guide = read('src/ui/flavor-guide-controller.js');
const spatialCss = read('src/renderers/brew-spatial-view.css');
const historyCss = read('src/ui/history/history-screen.css');
const codebookCss = read('src/ui/codebook-reconciliation-screen.css');
const runtimeFeatures = read('src/features/runtime-features.js');
const qrUi = read('src/qr-ui-controller.js');

assert.match(index, /1\.23E-main-sync\.3/);
for (const active of [
  'app-layout.css','app-components.css','bean-card.css','professional-sensory.css','viewport-controller.js','gear-controller.js',
  'brew-cooling-controller.js','flavor-guide-controller.js','onboarding-controller.js','bean-card-controller.js','bean-enrichment-service.js'
]) assert.ok(index.includes(active), `index missing ${active}`);
for (const obsolete of [
  'layout-guard.css','full-integration.css','interaction-repair.css','gear-regression-fix-controller.js','legacy-timer-guard.js',
  'gear-matching-controller.js','experience-fixes-controller.js','interaction-repair-controller.js'
]) {
  assert.ok(!index.includes(obsolete), `obsolete index reference ${obsolete}`);
  assert.ok(!sw.includes(obsolete), `obsolete service-worker reference ${obsolete}`);
}
for (const deleted of [
  'src/ui/layout-guard.css','src/ui/full-integration.css','src/ui/interaction-repair.css',
  'src/features/gear-regression-fix-controller.js','src/features/legacy-timer-guard.js',
  'src/features/gear-matching-controller.js','src/features/experience-fixes-controller.js','src/features/interaction-repair-controller.js'
]) assert.equal(fs.existsSync(deleted), false, `${deleted} must stay deleted`);

assert.match(layout, /--viewport-height:\s*100dvh/);
assert.match(layout, /\.overlay\s*\{[\s\S]*overflow:\s*hidden/);
assert.match(layout, /\.overlay\.full\s*>\s*\.dialog[\s\S]*overflow-y:\s*auto/);
assert.match(layout, /\.v095-radar-stage svg,[\s\S]*\.v098-radar-return svg\s*\{\s*touch-action:\s*pan-y/);
assert.match(layout, /\.v120-radar-node,[\s\S]*\.v098-radar-handle\s*\{\s*touch-action:\s*none/);
assert.match(layout, /prefers-reduced-motion/);
assert.doesNotMatch(historyCss, /100vh/);
assert.doesNotMatch(codebookCss, /100vh/);

assert.match(sensory, /LONG_PRESS_MS = 480/);
assert.match(sensory, /DRAG_CANCEL_DISTANCE = 8/);
assert.match(sensory, /data-v120-drag-handle/);
assert.match(sensory, /handle\.addEventListener\('pointerdown'/);
assert.doesNotMatch(sensory, /chip\.addEventListener\('pointerdown'/);
assert.doesNotMatch(sensory, /rgba\(190,151,80/);
assert.match(sensoryCss, /--cup-tag-selected-bg:\s*#050505/);
assert.match(sensoryCss, /--cup-tag-selected-bg:\s*#e7d2a7/);
assert.match(sensoryCss, /--cup-defect-selected-bg/);
assert.match(sensoryCss, /--cup-radar-fill/);

assert.doesNotMatch(integration, /injectGear|matchingSettings|data-lb-batch-open|remove\('beans'|luckybean\.onboarding\.v1/);
assert.doesNotMatch(integration, /setTimeout\(tick|performance\.now\(\).*timerClock|timerNextBtn.*click/);
assert.match(integration, /beanObserver\.observe\(root/);
assert.doesNotMatch(integration, /observe\(document\.body/);
assert.doesNotMatch(freshness, /document\.head\.append|observe\(document\.body/);
assert.doesNotMatch(gear, /MutationObserver/);
assert.doesNotMatch(account, /MutationObserver|setInterval/);
assert.doesNotMatch(appearance, /MutationObserver|1\.23D-main-sync/);
assert.doesNotMatch(voice, /MutationObserver/);
assert.match(runtimeFeatures, /RELEASE_REVISION/);
assert.doesNotMatch(runtimeFeatures, /1\.23D-main-sync/);
assert.match(qrUi, /overlayObserver\.observe\(root/);
assert.doesNotMatch(qrUi, /observe\(document\.body/);

assert.match(viewport, /visualViewport/);
assert.match(viewport, /--viewport-height/);
assert.match(fab, /visualViewport/);
assert.match(fab, /bottomNav/);
assert.match(fab, /rx:/);
assert.match(fab, /ry:/);

assert.match(beanCards, /LONG_PRESS_MS = 500/);
assert.match(beanCards, /CANCEL_DISTANCE = 8/);
assert.match(beanCards, /moveBeansToRecycle/);
assert.match(beanCards, /archiveBeans/);
assert.match(beanCards, /stopImmediatePropagation/);
assert.match(lifecycle, /RECYCLE_RETENTION_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
assert.match(lifecycle, /entity: 'beans'/);
assert.match(lifecycle, /syncIntentionalDeletion/);

for (const stage of ['new','account-pending','account-pending-verification','account-completed','guide-completed']) assert.ok(onboarding.includes(stage));
assert.match(auth, /luckybean:cloud-register-success/);
assert.match(auth, /luckybean:cloud-registration-pending/);
assert.match(onboarding, /luckybean:cloud-register-success/);
assert.match(onboarding, /luckybean:cloud-sync-state/);
assert.match(guide, /dataset\.settingsKey = 'about'/);
assert.match(components, /\.lb-open-guide/);
assert.match(components, /#b9975a/i);
assert.match(components, /#e8d7b5/i);

assert.match(spatialCss, /--spatial-shell/);
assert.match(spatialCss, /html\[data-theme="light"\]/);
assert.match(spatialCss, /--spatial-canvas-filter/);
assert.match(spatialCss, /var\(--viewport-height,100dvh\)/);

assert.match(sw, /CACHE_NAME = `\$\{CACHE_PREFIX\}main-sync-3`/);
assert.match(sw, /bean-lifecycle-service\.js/);
assert.match(sw, /professional-sensory\.css/);
assert.match(sw, /onboarding-controller\.js/);

const sourceFiles = walk('src').filter(file => /\.(?:js|mjs|css)$/.test(file));
const staleRevisionFiles = sourceFiles.filter(file => read(file).includes('1.23D-main-sync.4'));
assert.deepEqual(staleRevisionFiles, [], `stale release cache keys remain: ${staleRevisionFiles.join(', ')}`);
const uiControllerFiles = sourceFiles.filter(file => /(?:controller|ui|features)/i.test(file));
const bodyObserverFiles = uiControllerFiles.filter(file => {
  const source = read(file);
  return /MutationObserver/.test(source) && /\.observe\(document\.body\s*,/.test(source);
});
assert.deepEqual(bodyObserverFiles, [], `global body MutationObservers remain: ${bodyObserverFiles.join(', ')}`);

console.log('LuckyBean 1.23E canonical UI stability regression checks passed');
