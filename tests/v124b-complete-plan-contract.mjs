import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const index=read('index.html');
const sw=read('sw.js');
const core=read('src/release-1.24b.js');
const integration=read('src/features/release-1.24b-integration.js');
const finalize=read('src/features/release-1.24b-finalize.js');
const transit=read('src/features/release-1.24b-transit-controller.js');
const groupNav=read('src/features/release-1.24b-group-navigation.js');
const about=read('src/features/release-1.24b-about-controller.js');
const polish=read('src/features/release-1.24b-polish.js');
const freshnessDetail=read('src/features/release-1.24b-freshness-detail.js');
const recognition=read('src/recognition-bridge.js');
const progressUi=read('src/features/recognition-batch-progress-controller.js');
const pipeline=read('src/domain/recognition/recognition-pipeline.js');
const resolver=read('src/domain/recognition/recognition-field-resolver-1.24b.js');
const order=read('src/domain/recognition/order-recognition-1.24b.js');
const recipes=read('src/data/local-brew-recipes-1.24b.js');
const grind=read('src/services/grind-psd-reference-service.js');
const onboarding=read('src/ui/onboarding-controller.js');
const css=read('src/release-1.24b.css');
const timer=read('android/app/src/main/java/com/luckybean/app/BrewTimerService.java');
const activity=read('android/app/src/main/java/com/luckybean/app/MainActivity.java');
const gradle=read('android/app/build.gradle');
const deploy=read('.github/workflows/deploy-main.yml');
const build=read('.github/workflows/build-main.yml');

assert.match(index,/application-version" content="1\.24B"/);
assert.match(index,/release-revision" content="1\.24B-main\.3"/);
assert.match(sw,/REVISION = '1\.24B-main\.3'/);
assert.match(sw,/CACHE_NAME = `\$\{CACHE_PREFIX\}main-3`/);
assert.match(gradle,/versionCode 102402/);
assert.match(gradle,/versionName '1\.24B'/);
assert.match(activity,/LuckyBeanAndroid\/1\.24B/);

for(const token of ['BeanOwnershipStatus','ORDERED:\'ordered\'','StorageMode','FROZEN:\'frozen\'','markBeanInTransit','markBeanDelivered','transitionStorage','computeEffectiveAgeDays','freezeCycles','DEFAULT_AGING_FACTORS']) assert.ok(core.includes(token),`missing lifecycle ${token}`);
assert.match(transit,/在途 \$\{beans\.length\} 支/);
assert.match(transit,/已购 \$\{Math\.round\(weight\)\} g/);
assert.match(transit,/已支付/);
assert.match(transit,/到货重量 g/);
assert.match(transit,/入库储存/);
assert.match(finalize,/订单录入/);
assert.match(order,/paidPrice/);
assert.match(order,/shippingFee/);
assert.match(order,/discount/);
assert.match(order,/privacyRedactions/);
assert.match(css,/data-tone="muted"/);

for(const label of ['国家','产区','子产区','庄园','生产者','处理站','批次','豆种','处理细节','购买价格']) assert.ok(integration.includes(label),`bean detail missing ${label}`);
assert.match(integration,/correctWeightBtn[^\n]*remove/);
assert.match(integration,/lb-bean-actions/);
assert.match(integration,/lb-freshness-row/);
assert.match(integration,/lb-record-links/);
assert.match(integration,/openStorageMenu/);
assert.match(freshnessDetail,/完整赏味期曲线/);
assert.match(freshnessDetail,/实际豆龄/);
assert.match(freshnessDetail,/有效豆龄/);
assert.match(freshnessDetail,/storageRows/);
assert.match(freshnessDetail,/lb-freshness-detail-overlay/);

assert.match(groupNav,/function closeActiveGroup/);
assert.match(groupNav,/dx<=-72/);
assert.match(groupNav,/luckybean:navigation-back/);
assert.doesNotMatch(groupNav,/>收</);

assert.match(recognition,/for \(let index=0; index<images\.length; index\+=1\)/);
assert.match(recognition,/queueConcurrency:1/);
assert.match(recognition,/BATCH_STATE_KEY/);
assert.match(recognition,/safeStoreBatch\(batch\)/);
assert.match(recognition,/task\.status='completed'/);
assert.match(recognition,/batch\.status='paused'/);
assert.match(recognition,/luckybean:recognition-batch-progress/);
assert.match(progressUi,/getRecognitionBatchSnapshot/);
assert.match(progressUi,/正在识别/);
assert.match(progressUi,/task\.taskId/);
assert.match(progressUi,/识别中/);

assert.match(resolver,/explicit-label > confidence > multi-image-consensus > weak-inference/);
assert.match(resolver,/conflicting-high-confidence-candidates/);
assert.match(pipeline,/resolveRecognitionRelations/);
assert.match(pipeline,/arbitrationPriority/);
assert.match(pipeline,/status: requiresReview \? 'review'/);

assert.match(css,/\.lb-pending-field/);
assert.match(css,/\.lb-auto-field\{font-weight:700/);
assert.match(integration,/灰色框选为自动计算选项/);
assert.match(core,/setFieldSource/);
assert.match(core,/source==='auto'/);

assert.match(integration,/研磨度/);
assert.match(finalize,/data-lb-extraction/);
assert.match(finalize,/data-lb-beverage/);
assert.match(finalize,/本地制作流程仅显示步骤与细节，不启动倒计时/);
assert.match(css,/\.lb-disabled-for-method\{opacity:.35!important;pointer-events:none!important/);
for(const method of ['espresso','aeropress','moka','french_press','cold_brew','cold_drip','siphon','cezve','phin','south_indian_filter']) assert.ok(core.includes(method),`missing method ${method}`);
assert.match(recipes,/Americano|美式/);
assert.match(recipes,/Latte|拿铁/);
assert.match(grind,/Grind-PSD|grind-psd/i);
assert.match(polish,/较细、中间、较粗/);
assert.match(polish,/openCenteredHelp/);
assert.match(polish,/首段降温/);
assert.match(polish,/尾段降温/);

assert.match(finalize,/注册信息已提交/);
assert.match(finalize,/请查收邮件并点击链接激活账户/);
assert.match(onboarding,/account-pending-verification/);
assert.doesNotMatch(onboarding,/location\.reload\(|history\.go\(0\)/);

assert.match(about,/zj_crop/);
assert.match(about,/端茶倒水的秦始皇🐻/);

assert.match(timer,/SystemClock\.elapsedRealtime\(\)/);
assert.match(timer,/PARTIAL_WAKE_LOCK/);
assert.match(timer,/TextToSpeech/);
assert.match(timer,/ExoPlayer/);
assert.match(activity,/prepareBrewExecution/);
assert.match(activity,/startBrewExecution/);
assert.match(activity,/cancelBrewExecution/);

for(const file of ['release-1.24b-freshness-detail.js','recognition-batch-progress-controller.js','recognition-field-resolver-1.24b.js','release-1.24b-transit-controller.js','release-1.24b-group-navigation.js','release-1.24b-about-controller.js','grind-psd-reference-service.js','order-recognition-1.24b.js']) assert.ok(sw.includes(file),`service worker missing ${file}`);
assert.match(deploy,/push:[\s\S]*branches: \[main\]/);
assert.match(deploy,/deploy-pages@v5\.0\.0/);
assert.match(deploy,/pages-status/);
assert.doesNotMatch(deploy,/workflow_run:/);
assert.match(build,/Restore official release keystore/);
assert.match(build,/assembleRelease/);
assert.match(build,/apksigner/);
assert.match(build,/CERT_SHA256\.txt/);
assert.match(build,/release-status/);

console.log('LuckyBean 1.24B complete modification-plan contract passed');
