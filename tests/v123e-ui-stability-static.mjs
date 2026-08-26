import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = file => fs.readFileSync(file, 'utf8');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{const full=path.join(dir,entry.name);return entry.isDirectory()?walk(full):[full];});}

const index=read('index.html');
const sw=read('sw.js');
const layout=read('src/ui/app-layout.css');
const components=read('src/ui/app-components.css');
const sensoryCss=read('src/ui/professional-sensory.css');
const sensory=read('src/sensory-professional-controller.js');
const sharedSort=read('src/ui/sortable-controller.js');
const sensorySort=read('src/features/sensory-tag-sort-controller.js');
const beanGroupState=read('src/domain/beans/bean-group-state.js');
const beanGroups=read('src/bean-groups-controller.js');
const integration=read('src/features/full-integration-controller-v3.js');
const releaseIntegration=read('src/features/release-1.24b-finalize.js');
const releasePolish=read('src/features/release-1.24b-polish.js');
const groupNavigation=read('src/features/release-1.24b-group-navigation.js');
const uiPolicy=read('src/features/release-1.24b-ui-policy.js');
const releaseCss=read('src/release-1.24b.css');
const freshness=read('src/features/freshness-timeline-controller.js');
const gear=read('src/ui/gear-controller.js');
const account=read('src/ui/account-sync-panel.js');
const voice=read('src/ui/voice-settings-controller.js');
const viewport=read('src/ui/viewport-controller.js');
const fab=read('src/ui/fab-controller.js');
const beanCards=read('src/ui/bean-card-controller.js');
const lifecycle=read('src/domain/beans/bean-lifecycle-service.js');
const onboarding=read('src/ui/onboarding-controller.js');
const auth=read('src/services/cloud-auth-service.js');
const guide=read('src/ui/flavor-guide-controller.js');
const runtimeFeatures=read('src/features/runtime-features.js');
const qrUi=read('src/qr-ui-controller.js');

const revisionMatch=index.match(/release-revision" content="([^"]+)"/);
assert.ok(revisionMatch);
const releaseRevision=revisionMatch[1];
assert.equal(releaseRevision,'1.24B-main.6');
assert.ok(sw.includes(`REVISION = '${releaseRevision}'`));
assert.match(sw,/CACHE_PREFIX = 'luckybean-main-v124b-'/);
assert.match(sw,/CACHE_NAME = `\$\{CACHE_PREFIX\}main-6-ui2`/);

for(const active of ['app-layout.css','app-components.css','bean-card.css','professional-sensory.css','viewport-controller.js','gear-controller.js','brew-cooling-controller.js','flavor-guide-controller.js','onboarding-controller.js','bean-card-controller.js','bean-enrichment-service.js','release-1.24b-integration.js','release-1.24b-finalize.js','release-1.24b-polish.js','release-1.24b-group-navigation.js'])assert.ok(index.includes(active),`index missing ${active}`);
for(const runtimeActive of ['release-1.24b-ui-policy.js','release-1.24b-brew-mode-controller.js','release-1.24b-freshness-detail.js','recognition-batch-progress-controller.js','sortable-controller.js','sensory-tag-sort-controller.js'])assert.ok(runtimeFeatures.includes(runtimeActive),`runtime graph missing ${runtimeActive}`);
for(const cached of ['release-1.24b-finalize.js','release-1.24b-polish.js','release-1.24b-group-navigation.js','release-1.24b-ui-policy.js','release-1.24b-freshness-detail.js','recognition-batch-progress-controller.js','sortable-controller.js','sensory-tag-sort-controller.js','recognition-field-resolver-1.24b.js','local-brew-recipes-1.24b.js','grind-psd-reference-service.js','order-recognition-1.24b.js'])assert.ok(sw.includes(cached),`service worker missing ${cached}`);
for(const obsolete of ['layout-guard.css','full-integration.css','interaction-repair.css','gear-regression-fix-controller.js','legacy-timer-guard.js','gear-matching-controller.js','experience-fixes-controller.js','interaction-repair-controller.js'])assert.ok(!index.includes(obsolete),`obsolete index reference ${obsolete}`);

assert.match(layout,/--viewport-height:\s*100dvh/);
assert.match(layout,/\.overlay\s*\{[\s\S]*overflow:\s*hidden/);
assert.match(layout,/prefers-reduced-motion/);
assert.match(sensory,/data-v120-selected-tag/);
assert.match(sensory,/luckybean:professional-sensory-complete/);
assert.match(sharedSort,/DOUBLE_CLICK_MS = 250/);
assert.match(sharedSort,/MOVE_CANCEL_DISTANCE = 14/);
assert.match(sharedSort,/setPointerCapture/);
assert.match(sharedSort,/event\.stopImmediatePropagation\(\)/);
assert.match(sharedSort,/lb-sort-ghost/);
assert.match(sharedSort,/lb-sort-placeholder/);
assert.match(sharedSort,/onPreview/);
assert.match(sharedSort,/onCommit/);
assert.match(sensorySort,/LuckyBeanSortable/);
assert.match(sensorySort,/professional-sensory-complete/);
assert.doesNotMatch(sensorySort,/elementFromPoint|setPointerCapture|LONG_PRESS_MS\s*=/);
assert.match(sensoryCss,/--cup-tag-selected-bg:\s*#050505/);
assert.match(sensoryCss,/--cup-defect-selected-bg/);
assert.match(sensoryCss,/\.lb-sort-placeholder/);
assert.match(sensoryCss,/\.lb-sort-ghost/);

assert.doesNotMatch(integration,/injectGear|matchingSettings|data-lb-batch-open|remove\('beans'|luckybean\.onboarding\.v1/);
assert.match(integration,/beanObserver\.observe\(root/);
assert.doesNotMatch(integration,/observe\(document\.body/);
assert.doesNotMatch(freshness,/document\.head\.append|observe\(document\.body/);
assert.doesNotMatch(gear,/MutationObserver/);
assert.doesNotMatch(account,/MutationObserver|setInterval/);
assert.doesNotMatch(voice,/MutationObserver/);
assert.match(runtimeFeatures,/RELEASE_REVISION/);
assert.match(runtimeFeatures,/1\.24B-main\.6/);
assert.match(runtimeFeatures,/shared-sortable/);
assert.match(qrUi,/overlayObserver\.observe\(root/);
assert.doesNotMatch(qrUi,/observe\(document\.body/);

assert.match(viewport,/visualViewport/);
assert.match(fab,/visualViewport/);
assert.match(beanCards,/LONG_PRESS_MS = 500/);
assert.match(beanCards,/CANCEL_DISTANCE = 8/);
assert.match(beanCards,/moveBeansToRecycle/);
assert.match(lifecycle,/RECYCLE_RETENTION_MS = 7 \* 24 \* 60 \* 60 \* 1000/);

// One canonical group state owns native + freshness + remaining grouping.
assert.match(beanGroupState,/export const beanGroupState = \{ mode: 'native', groupKey: '' \}/);
assert.match(beanGroupState,/setBeanGroupMode/);
assert.match(beanGroupState,/openBeanGroupState/);
assert.match(beanGroupState,/closeBeanGroupState/);
assert.match(beanGroups,/async function closeActiveGroup/);
assert.match(beanGroups,/hasActiveGroup: \(\) => Boolean\(beanGroupState\.groupKey\)/);
assert.match(beanGroups,/activeGroup: \(\) => beanGroupState\.groupKey/);
assert.doesNotMatch(beanGroups,/let activeGroup|data-v099t-group-back|>收</);
assert.match(groupNavigation,/RECOMMENDATION_PROMPT_REVISION='1\.24B-main\.9-immediate'/);
assert.match(groupNavigation,/immediate fun recommendation prompt active/);
assert.match(groupNavigation,/LuckyBeanBeanGroupState/);
assert.match(groupNavigation,/luckybean:navigation-back/);
assert.doesNotMatch(groupNavigation,/LuckyBeanV099tBeanGroups|api\.closeActiveGroup|dispatchEvent\(new MouseEvent|nativePanel|nativeCollapse|dx<=-72|page\?\.contains\(event\.target\)/);
assert.doesNotMatch(uiPolicy,/\[data-active-group-panel\]|group-collapse-zone/);

assert.match(uiPolicy,/lb-stock-total/);
assert.match(uiPolicy,/lb-today-consumption/);
assert.match(uiPolicy,/现有咖啡豆共计/);
assert.match(uiPolicy,/还可饮用/);
assert.match(uiPolicy,/非罗布斯塔/);
assert.match(uiPolicy,/参考上限已超过约/);
assert.match(uiPolicy,/@media \(max-width: 720px\)/);
assert.match(uiPolicy,/#brewContent button:not\(\.lb-brew-switch\)/);
assert.match(uiPolicy,/observe\('brewContent'\)/);

for(const stage of ['new','account-pending','account-pending-verification','account-completed','guide-completed'])assert.ok(onboarding.includes(stage));
assert.match(auth,/luckybean:cloud-register-success/);
assert.match(auth,/luckybean:cloud-registration-pending/);
assert.match(guide,/dataset\.settingsKey = 'about'/);
assert.match(components,/\.lb-open-guide/);

assert.match(releaseCss,/\.lb-auto-field\{font-weight:700/);
assert.match(releaseCss,/\.lb-pending-field/);
assert.match(releaseCss,/\.lb-bean-actions/);
assert.match(releaseCss,/\.lb-freshness-row/);
assert.match(releaseCss,/\.lb-record-links/);
assert.match(releaseCss,/\.lb-centered-help-layer/);
assert.match(releaseCss,/\.lb-freshness-detail-layer/);
assert.match(releaseIntegration,/data-lb-transit-section/);
assert.match(releaseIntegration,/data-lb-local-method-row/);
assert.match(releaseIntegration,/注册信息已提交/);
assert.ok(releaseIntegration.includes('data-tone="muted"'));
assert.match(releaseIntegration,/fineAnchor/);
assert.match(releasePolish,/grinderReference/);
assert.match(releasePolish,/openCenteredHelp/);

const sourceFiles=walk('src').filter(file=>/\.(?:js|mjs|css)$/.test(file));
const bodyObserverFiles=sourceFiles.filter(file=>{const source=read(file);return /MutationObserver/.test(source)&&/\.observe\(document\.body\s*,/.test(source);});
assert.deepEqual(bodyObserverFiles,[],`global body MutationObservers remain: ${bodyObserverFiles.join(', ')}`);

console.log(`LuckyBean 1.24B ${releaseRevision} canonical UI stability, shared bean-group state, shared sorting and text brew UI regression checks passed`);
