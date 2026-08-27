import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

const app = read('src/app.js');
const index = read('index.html');
const sw = read('sw.js');
const runtime = read('src/features/runtime-features.js');
const release = read('src/release-1.24b.js');
const integration = read('src/features/release-1.24b-integration.js');
const finalize = read('src/features/release-1.24b-finalize.js');
const transit = read('src/features/release-1.24b-transit-controller.js');
const beanGroupState = read('src/domain/beans/bean-group-state.js');
const beanGroups = read('src/bean-groups-controller.js');
const groupNavigation = read('src/features/release-1.24b-group-navigation.js');
const sharedSort = read('src/ui/sortable-controller.js');
const sensorySort = read('src/features/sensory-tag-sort-controller.js');
const about = read('src/features/release-1.24b-about-controller.js');
const polish = read('src/features/release-1.24b-polish.js');
const uiPolicy = read('src/features/release-1.24b-ui-policy.js');
const freshnessDetail = read('src/features/release-1.24b-freshness-detail.js');
const batchProgress = read('src/features/recognition-batch-progress-controller.js');
const resolver = read('src/domain/recognition/recognition-field-resolver-1.24b.js');
const css = read('src/release-1.24b.css');
const recognition = read('src/recognition-bridge.js');
const onboarding = read('src/ui/onboarding-controller.js');
const build = read('.github/workflows/build-main.yml');
const deploy = read('.github/workflows/deploy-main.yml');
const gradle = read('android/app/build.gradle');

assert.match(index, /application-version" content="1\.24B"/);
assert.match(index, /release-revision" content="1\.24B-main\.6"/);
for (const file of ['release-1.24b-integration.js','release-1.24b-finalize.js','release-1.24b-transit-controller.js','release-1.24b-group-navigation.js','release-1.24b-about-controller.js','release-1.24b-polish.js']) assert.ok(index.includes(file), `index must load ${file}`);
for (const file of ['release-1.24b-ui-policy.js','release-1.24b-brew-mode-controller.js','release-1.24b-freshness-detail.js','recognition-batch-progress-controller.js','sortable-controller.js','sensory-tag-sort-controller.js']) assert.ok(runtime.includes(file), `runtime graph must load ${file}`);
assert.match(runtime, /shared-sortable/);
assert.match(sw, /REVISION = '1\.24B-main\.6'/);
assert.match(sw, /CACHE_NAME = `\$\{CACHE_PREFIX\}main-6-ui2`/);
for (const file of ['release-1.24b-integration.js','release-1.24b-finalize.js','release-1.24b-transit-controller.js','release-1.24b-group-navigation.js','release-1.24b-about-controller.js','release-1.24b-polish.js','release-1.24b-ui-policy.js','release-1.24b-freshness-detail.js','recognition-batch-progress-controller.js','sortable-controller.js','sensory-tag-sort-controller.js','recognition-field-resolver-1.24b.js','local-brew-recipes-1.24b.js','grind-psd-reference-service.js','order-recognition-1.24b.js']) assert.ok(sw.includes(file), `service worker must cache ${file}`);

assert.match(release, /BeanOwnershipStatus/);
assert.match(release, /ORDERED:'ordered'/);
assert.match(release, /StorageMode/);
assert.match(release, /FROZEN:'frozen'/);
assert.match(release, /storage:\{[\s\S]*history:/);
assert.match(release, /freezeCycles/);
assert.match(release, /computeEffectiveAgeDays/);
assert.match(release, /markBeanInTransit/);
assert.match(release, /markBeanDelivered/);
assert.match(finalize, /订单录入/);
assert.match(finalize, /parseCoffeeOrderText/);
assert.match(finalize, /orderIdHash/);
assert.match(finalize, /privacyRedactions/);
assert.match(finalize, /data-lb-transit-section/);
assert.match(transit, /markBeanDelivered/);
assert.match(transit, /到货重量/);
assert.match(transit, /烘焙日期/);
assert.match(transit, /入库储存/);
assert.match(transit, /data-lb-deliver/);
assert.match(transit, /在途 \$\{beans\.length\} 支/);
assert.match(transit, /已购 \$\{Math\.round\(weight\)\} g/);
assert.match(css, /data-tone="muted"/);
assert.match(css, /\.lb-transit-summary/);

assert.match(release, /createRecognitionBatch/);
assert.match(release, /runRecognitionBatchSerial/);
assert.match(recognition, /queueConcurrency:1/);
assert.match(recognition, /for \(let index=0; index<images\.length; index\+=1\)/);
assert.match(recognition, /BATCH_STATE_KEY/);
assert.match(recognition, /luckybean:recognition-batch-progress/);
assert.match(batchProgress, /正在识别/);
assert.match(resolver, /explicit-label > confidence > multi-image-consensus > weak-inference/);
assert.match(resolver, /conflicting-high-confidence-candidates/);

assert.match(integration, /fullBeanInfo/);
for (const field of ['子产区','庄园','生产者','处理站','批次','豆种','处理细节','购买价格']) assert.ok(integration.includes(field), `bean detail missing ${field}`);
assert.match(integration, /correctWeightBtn[^\n]*remove/);
assert.match(integration, /lb-bean-actions/);
assert.match(integration, /lb-freshness-row/);
assert.match(integration, /lb-record-links/);
assert.match(freshnessDetail, /完整赏味期曲线/);
assert.match(freshnessDetail, /实际豆龄/);
assert.match(freshnessDetail, /有效豆龄/);
assert.match(css, /grid-template-columns:minmax\(88px,.38fr\)/);
assert.match(css, /\.lb-bean-detail .*white-space:normal/);
assert.match(css, /\.lb-bean-actions\{display:grid/);

// Group interaction is now source-driven: one shared group key, native dismiss surface,
// bottom Beans fallback, and Back all delegate to the canonical state API.
assert.match(beanGroupState, /export const beanGroupState/);
assert.match(beanGroupState, /closeBeanGroupState/);
assert.match(app, /function openBeanGroup/);
assert.match(app, /function closeBeanGroup/);
assert.match(app, /\['process', '按处理法'\]/);
assert.match(app, /data-close-bean-group/);
assert.match(beanGroups, /async function closeActiveGroup/);
assert.match(beanGroups, /beanGroupState\.groupKey/);
assert.match(beanGroups, /activeGroup: \(\) => beanGroupState\.groupKey/);
assert.doesNotMatch(beanGroups, /let activeGroup|data-v099t-group-back|>收</);
assert.match(groupNavigation, /LuckyBeanBeanGroupState/);
assert.match(groupNavigation, /luckybean:navigation-back/);
assert.doesNotMatch(groupNavigation, /LuckyBeanV099tBeanGroups|api\.closeActiveGroup|dispatchEvent\(new MouseEvent|nativePanel|dx<=-72/);

assert.match(uiPolicy, /lb-stock-total/);
assert.match(uiPolicy, /lb-today-consumption/);
assert.match(uiPolicy, /非罗布斯塔/);
assert.match(uiPolicy, /#brewContent button:not\(\.lb-brew-switch\)/);
assert.match(uiPolicy, /observe\('brewContent'\)/);

assert.match(sharedSort, /LuckyBeanSortable/);
assert.match(sharedSort, /lb-sort-ghost/);
assert.match(sharedSort, /lb-sort-placeholder/);
assert.match(sharedSort, /onPreview/);
assert.match(sharedSort, /onCommit/);
assert.match(sharedSort, /setPointerCapture/);
assert.match(sharedSort, /DOUBLE_CLICK_MS/);
assert.match(sensorySort, /LuckyBeanSortable/);
assert.match(sensorySort, /data-v120-selected-tag/);
assert.match(sensorySort, /professional-sensory-complete/);
assert.match(sensorySort, /professionalData\?\.selections/);
assert.match(sensorySort, /orders\.set/);
assert.match(sensorySort, /长按任一已选标签/);
assert.match(sensorySort, /双击移除/);
assert.match(sensorySort, /实时预览松手后的顺序/);
assert.doesNotMatch(sensorySort, /elementFromPoint|setPointerCapture|LONG_PRESS_MS\s*=/);

assert.match(about, /data-settings-key="about"/);
assert.match(about, /zj_crop/);
assert.match(about, /端茶倒水的秦始皇🐻/);
assert.match(about, /lb-about-contact/);

assert.match(css, /\.lb-pending-field/);
assert.match(integration, /灰色框选为自动计算选项/);
assert.match(css, /\.lb-auto-field\{font-weight:700/);
assert.match(polish, /grinderReference/);
assert.match(polish, /mapCustomGrinderRange/);
assert.match(polish, /较细、中间、较粗/);
assert.match(polish, /首段降温/);
assert.match(polish, /尾段降温/);
assert.match(polish, /openCenteredHelp/);

assert.match(finalize, /注册信息已提交/);
assert.match(finalize, /请查收邮件并点击链接激活账户/);
assert.match(onboarding, /account-pending-verification/);
assert.doesNotMatch(onboarding, /location\.reload\(|history\.go\(0\)/);

// Pages exposes a fast push deployment for direct user testing, while the verifiable
// release receipt remains downstream of a successful immutable same-SHA main-test run.
assert.match(deploy, /workflow_run:/);
assert.match(deploy, /workflows: \["LuckyBean main tests"\]/);
assert.match(deploy, /github\.event\.workflow_run\.conclusion == 'success'/);
assert.match(deploy, /push:\n\s+branches: \[main\]/);
assert.match(deploy, /luckybean-pages-main-\$\{\{ github\.event_name == 'push' && 'test' \|\| 'gated' \}\}/);
assert.match(deploy, /head_sha=\$SOURCE_SHA/);
assert.match(deploy, /test_conclusion/);
assert.match(deploy, /current_main/);
assert.match(deploy, /Live Pages five-mode legacy reminder browser smoke/);
assert.match(deploy, /PROMPT_RUNTIME_REVISION: 1\.24B-main\.14-legacy-reminders/);
assert.match(deploy, /appModuleRevision/);
assert.match(deploy, /stylesRevision/);
assert.match(deploy, /browser_smoke/);
assert.match(deploy, /deploy-pages@v5\.0\.0/);
assert.match(deploy, /version\.json/);
assert.match(deploy, /pages-status/);
assert.match(deploy, /1\.24B-main\.6/);
assert.match(deploy, /shared-live-preview-ghost-placeholder/);
assert.match(deploy, /text-interactions/);

// Formal Android publication remains downstream of a successful Pages run and proves
// Pages receipt + main test + source + certificate before publication.
assert.match(build, /workflow_run:/);
assert.match(build, /workflows: \["LuckyBean main web deploy"\]/);
assert.match(build, /github\.event\.workflow_run\.conclusion == 'success'/);
assert.match(build, /github\.event\.workflow_run\.head_branch == 'main'/);
assert.match(build, /SOURCE_SHA: \$\{\{ github\.event_name == 'workflow_run' && github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/);
assert.match(build, /contents\/status\/1\.24B\.json\?ref=pages-status/);
assert.match(build, /\.source_sha/);
assert.match(build, /\.verified/);
assert.match(build, /actions\/workflows\/test-main\.yml\/runs\?branch=main&head_sha=\$SOURCE_SHA/);
assert.match(build, /test_conclusion/);
assert.match(build, /current_main/);
assert.match(build, /release_target_verified/);
assert.match(build, /web_gate_verified/);
assert.match(build, /main_test_verified/);
assert.match(build, /git tag -f "\$RELEASE_TAG" "\$SOURCE_SHA"/);
assert.match(build, /test "\$tag_sha" = "\$SOURCE_SHA"/);
assert.match(build, /Restore official release keystore/);
assert.match(build, /assembleRelease/);
assert.match(build, /apksigner/);
assert.match(build, /CERT_SHA256\.txt/);
assert.match(build, /LuckyBeanAndroid\/1\.24B/);
assert.match(build, /release-1\.24b-freshness-detail\.js/);
assert.match(build, /recognition-batch-progress-controller\.js/);
assert.match(build, /recognition-field-resolver-1\.24b\.js/);
assert.match(build, /shared-live-preview-ghost-placeholder/);
assert.match(build, /brew_ui=text-interactions/);
assert.match(gradle, /versionCode 102402/);
assert.match(gradle, /versionName '1\.24B'/);

console.log('LuckyBean 1.24B main.4 final release contract with test+gated web deployment, exact native prompt runtime, canonical bean group state, shared sorting and text brew UI passed');
