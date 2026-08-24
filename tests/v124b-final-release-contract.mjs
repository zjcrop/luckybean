import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

const index = read('index.html');
const sw = read('sw.js');
const release = read('src/release-1.24b.js');
const integration = read('src/features/release-1.24b-integration.js');
const finalize = read('src/features/release-1.24b-finalize.js');
const polish = read('src/features/release-1.24b-polish.js');
const css = read('src/release-1.24b.css');
const recognition = read('src/recognition-bridge.js');
const onboarding = read('src/ui/onboarding-controller.js');
const build = read('.github/workflows/build-main.yml');
const deploy = read('.github/workflows/deploy-main.yml');
const gradle = read('android/app/build.gradle');

assert.match(index, /application-version" content="1\.24B"/);
assert.match(index, /release-revision" content="1\.24B-main\.2"/);
for (const file of ['release-1.24b-integration.js','release-1.24b-finalize.js','release-1.24b-polish.js']) assert.ok(index.includes(file), `index must load ${file}`);
assert.match(sw, /REVISION = '1\.24B-main\.2'/);
for (const file of ['release-1.24b-integration.js','release-1.24b-finalize.js','release-1.24b-polish.js','local-brew-recipes-1.24b.js','grind-psd-reference-service.js','order-recognition-1.24b.js']) assert.ok(sw.includes(file), `service worker must cache ${file}`);

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
assert.match(css, /data-tone="muted"/);

assert.match(release, /createRecognitionBatch/);
assert.match(release, /runRecognitionBatchSerial/);
assert.match(recognition, /queueConcurrency:1/);
assert.match(recognition, /for \(let index=0; index<images\.length; index\+=1\)/);

assert.match(integration, /fullBeanInfo/);
for (const field of ['子产区','庄园','生产者','处理站','批次','豆种','处理细节','购买价格']) assert.ok(integration.includes(field), `bean detail missing ${field}`);
assert.match(integration, /correctWeightBtn[^\n]*remove/);
assert.match(integration, /lb-bean-actions/);
assert.match(integration, /lb-freshness-row/);
assert.match(integration, /lb-record-links/);
assert.match(css, /grid-template-columns:minmax\(88px,.38fr\)/);
assert.match(css, /\.lb-bean-detail .*white-space:normal/);
assert.match(css, /\.lb-bean-actions\{display:grid/);

assert.match(css, /\.lb-pending-field/);
assert.match(integration, /灰色框选为自动计算选项/);
assert.match(css, /\.lb-auto-field\{font-weight:700/);
assert.match(finalize, /data-lb-extraction/);
assert.match(finalize, /data-lb-beverage/);
assert.match(finalize, /本地制作流程仅显示步骤与细节，不启动倒计时/);
assert.match(finalize, /lb-disabled-for-method/);

assert.match(polish, /grinderReference/);
assert.match(polish, /mapCustomGrinderRange/);
assert.match(polish, /较细、中间、较粗/);
assert.match(polish, /首段降温/);
assert.match(polish, /尾段降温/);
assert.match(polish, /openCenteredHelp/);
assert.match(finalize, /fineAnchor/);
assert.match(finalize, /midAnchor/);
assert.match(finalize, /coarseAnchor/);
assert.match(finalize, /较细刻度/);
assert.match(finalize, /中间刻度/);
assert.match(finalize, /较粗刻度/);

assert.match(finalize, /注册信息已提交/);
assert.match(finalize, /请查收邮件并点击链接激活账户/);
assert.match(onboarding, /account-pending-verification/);
assert.doesNotMatch(onboarding, /location\.reload\(|history\.go\(0\)/);

assert.match(deploy, /on:\n\s+push:\n\s+branches: \[main\]/);
assert.doesNotMatch(deploy, /workflow_run:/);
assert.match(deploy, /npm run test:static/);
assert.match(deploy, /deploy-pages@v5\.0\.0/);
assert.match(deploy, /version\.json/);
assert.match(build, /on:\n\s+push:\n\s+branches: \[main\]/);
assert.match(build, /Restore official release keystore/);
assert.match(build, /assembleRelease/);
assert.match(build, /apksigner/);
assert.match(build, /CERT_SHA256\.txt/);
assert.match(build, /LuckyBeanAndroid\/1\.24B/);
assert.match(gradle, /versionCode 102402/);
assert.match(gradle, /versionName '1\.24B'/);

console.log('LuckyBean 1.24B final release contract passed');
