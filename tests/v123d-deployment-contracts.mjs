import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const app = read('src/app.js');
const codebook = read('src/codebook.js');
const index = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));
const sw = read('sw.js');
const utils = read('src/utils.js');
const androidBuild = read('android/app/build.gradle');
const androidActivity = read('android/app/src/main/java/com/luckybean/app/MainActivity.java');
const androidApplication = read('android/app/src/main/java/com/luckybean/app/LuckyBeanApplication.java');
const androidBridge = read('android/native-bridge.js');
const recognitionBridge = read('src/recognition-bridge.js');
const packageCapture = read('src/package-capture-controller.js');
const brewAnalysis = read('src/services/brew-analysis-service.js');
const brewCore = read('src/brew-engine-core.js');
const matchVector = read('src/domain/matching/flavor-vector.js');
const freshnessTimeline = read('src/features/freshness-timeline-controller.js');
const releaseCore = read('src/release-1.24b.js');
const releaseIntegration = read('src/features/release-1.24b-finalize.js');
const orderParser = read('src/domain/recognition/order-recognition-1.24b.js');
const deployWorkflow = read('.github/workflows/deploy-main.yml');
const buildWorkflow = read('.github/workflows/build-main.yml');

const revisionMatch = index.match(/release-revision" content="([^"]+)"/);
assert.ok(revisionMatch, 'release revision missing from index');
const releaseRevision = revisionMatch[1];
assert.equal(releaseRevision, '1.24B-main.1');
assert.ok(index.includes(`data-release-revision="${releaseRevision}"`));

const versionCodeMatch = androidBuild.match(/versionCode\s+(\d+)/);
assert.ok(versionCodeMatch);
assert.equal(Number(versionCodeMatch[1]), 102402);
assert.match(androidBuild, /versionName '1\.24B'/);
assert.match(utils, /APP_VERSION = '1\.24B'/);
assert.match(utils, /SCHEMA_VERSION = 9/);
assert.equal(manifest.version, '1.24B');
assert.match(index, /application-version" content="1\.24B"/);
assert.match(index, /release-1\.24b\.css/);
assert.match(index, /release-1\.24b-integration\.js/);
assert.match(index, /release-1\.24b-finalize\.js/);

for (const canonical of ['app-layout.css','app-components.css','professional-sensory.css','flavor-guide-controller.js','gear-controller.js','bean-card-controller.js','onboarding-controller.js']) assert.ok(index.includes(canonical), `missing canonical entry ${canonical}`);
for (const obsolete of ['interaction-repair-controller.js','experience-fixes-controller.js','gear-matching-controller.js','gear-regression-fix-controller.js','legacy-timer-guard.js']) {
  assert.ok(!index.includes(obsolete));
  assert.equal(fs.existsSync(`src/features/${obsolete}`), false);
}

assert.match(app, /createPortableArchive/);
assert.match(app, /processRecognitionDocument/);
assert.match(codebook, /const roastDateInput = labeled\.roastDate \|\| ''/);
assert.doesNotMatch(codebook, /labeled\.roastDate \|\| labeled\.productionDate/);

assert.match(sw, /REVISION = '1\.24B-main\.1'/);
assert.match(sw, /CACHE_PREFIX = 'luckybean-main-v124b-'/);
assert.match(sw, /luckybean-main-v123e-/);
assert.match(sw, /release-1\.24b\.js/);
assert.match(sw, /release-1\.24b-integration\.js/);
assert.match(sw, /cache\.put\(request, response\.clone\(\)\)/);

assert.match(androidActivity, /addJavascriptInterface\(new NativeFileBridge\(\), "LuckyBeanNative"\)/);
assert.match(androidActivity, /Intent\.ACTION_CREATE_DOCUMENT/);
assert.match(androidBuild, /com\.google\.mlkit:text-recognition:16\.0\.1/);
assert.match(androidBuild, /com\.google\.mlkit:text-recognition-chinese:16\.0\.1/);
assert.match(androidApplication, /ChineseTextRecognizerOptions/);
assert.match(androidActivity, /InputImage\.fromFilePath\(MainActivity\.this, sourceUri\)/);
assert.match(androidBridge, /LuckyBeanRecognitionBridge/);
assert.match(androidBridge, /for \(const image of images\)/);
assert.match(recognitionBridge, /queueConcurrency:1/);
assert.match(recognitionBridge, /IMG-\$\{String\(order\)\.padStart\(3,'0'\)\}/);
assert.match(packageCapture, /bindAndroidImageSource\(id, nativeSource\)/);

assert.match(releaseCore, /BeanOwnershipStatus/);
assert.match(releaseCore, /StorageMode/);
assert.match(releaseCore, /storage\.history/);
assert.match(releaseCore, /freezeCycles/);
assert.match(releaseCore, /markBeanInTransit/);
assert.match(releaseCore, /remainingWeight:0/);
assert.match(releaseCore, /DEFAULT_AGING_FACTORS/);
assert.match(releaseIntegration, /订单录入/);
assert.match(releaseIntegration, /data-lb-transit-section/);
assert.match(releaseIntegration, /灰色|data-tone=\\"muted\\"/);
assert.match(releaseIntegration, /LOCAL_BREW_RECIPES_124B/);
assert.match(releaseIntegration, /fineAnchor/);
assert.match(orderParser, /privacyRedactions/);
assert.match(orderParser, /paidPrice/);

assert.match(brewAnalysis, /BREW_ANALYSIS_CONTRACT = 'brew-analysis\/2\.1'/);
assert.match(brewAnalysis, /BREW_SPATIAL_CONTRACT = 'brew-spatial\/1\.3'/);
assert.match(brewCore, /'brew-analysis\/2\.0', 'brew-analysis\/2\.1'/);
assert.match(matchVector, /MATCH_CONTRACT = 'luckybean-match\/1\.1'/);
assert.match(freshnessTimeline, /freshnessProfile\(bean\)\.progress/);

assert.match(deployWorkflow, /LuckyBean-1\.24B-web\.zip/);
assert.match(deployWorkflow, /"version":"1\.24B"/);
assert.match(deployWorkflow, /recognitionQueue/);
assert.match(buildWorkflow, /LuckyBean-1\.24B-release\.apk/);
assert.match(buildWorkflow, /version_code=102402/);
assert.match(buildWorkflow, /revision=1\.24B-main\.1/);
assert.match(buildWorkflow, /LUCKYBEAN_KEYSTORE_B64/);
assert.match(buildWorkflow, /CERT_SHA256\.txt/);
assert.match(androidBuild, /LUCKYBEAN_KEYSTORE_FILE/);

console.log(`LuckyBean 1.24B ${releaseRevision} deployment, Android, serial OCR, bean lifecycle, frozen freshness and BrewProfiles contracts passed`);
