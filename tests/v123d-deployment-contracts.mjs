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
const releaseTransit = read('src/features/release-1.24b-transit-controller.js');
const releaseGroup = read('src/features/release-1.24b-group-navigation.js');
const releaseAbout = read('src/features/release-1.24b-about-controller.js');
const releasePolish = read('src/features/release-1.24b-polish.js');
const releaseCss = read('src/release-1.24b.css');
const grindPsd = read('src/services/grind-psd-reference-service.js');
const orderParser = read('src/domain/recognition/order-recognition-1.24b.js');
const deployWorkflow = read('.github/workflows/deploy-main.yml');
const buildWorkflow = read('.github/workflows/build-main.yml');

const revisionMatch = index.match(/release-revision" content="([^"]+)"/);
assert.ok(revisionMatch, 'release revision missing from index');
const releaseRevision = revisionMatch[1];
assert.equal(releaseRevision, '1.24B-main.3');
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
for (const module of ['release-1.24b-integration.js','release-1.24b-finalize.js','release-1.24b-transit-controller.js','release-1.24b-group-navigation.js','release-1.24b-about-controller.js','release-1.24b-polish.js']) assert.ok(index.includes(module), `missing 1.24B module ${module}`);

for (const canonical of ['app-layout.css','app-components.css','professional-sensory.css','flavor-guide-controller.js','gear-controller.js','bean-card-controller.js','onboarding-controller.js']) assert.ok(index.includes(canonical), `missing canonical entry ${canonical}`);
for (const obsolete of ['interaction-repair-controller.js','experience-fixes-controller.js','gear-matching-controller.js','gear-regression-fix-controller.js','legacy-timer-guard.js']) {
  assert.ok(!index.includes(obsolete));
  assert.equal(fs.existsSync(`src/features/${obsolete}`), false);
}

assert.match(app, /createPortableArchive/);
assert.match(app, /processRecognitionDocument/);
assert.match(codebook, /const roastDateInput = labeled\.roastDate \|\| ''/);
assert.doesNotMatch(codebook, /labeled\.roastDate \|\| labeled\.productionDate/);

assert.match(sw, /REVISION = '1\.24B-main\.3'/);
assert.match(sw, /CACHE_PREFIX = 'luckybean-main-v124b-'/);
assert.match(sw, /luckybean-main-v123e-/);
for (const cached of ['release-1.24b.js','release-1.24b-integration.js','release-1.24b-finalize.js','release-1.24b-transit-controller.js','release-1.24b-group-navigation.js','release-1.24b-about-controller.js','release-1.24b-polish.js','release-1.24b-freshness-detail.js','recognition-batch-progress-controller.js','recognition-field-resolver-1.24b.js','local-brew-recipes-1.24b.js','grind-psd-reference-service.js','order-recognition-1.24b.js']) assert.ok(sw.includes(cached), `service worker missing ${cached}`);
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
assert.match(releaseCss, /data-tone="muted"/);
assert.match(releaseIntegration, /LOCAL_BREW_RECIPES_124B/);
assert.match(releaseIntegration, /fineAnchor/);
assert.match(releaseTransit, /markBeanDelivered/);
assert.match(releaseTransit, /在途 \$\{beans\.length\} 支/);
assert.match(releaseGroup, /dataset\.v099tGroupBack/);
assert.match(releaseAbout, /端茶倒水的秦始皇🐻/);
assert.match(releasePolish, /grinderReference/);
assert.match(releasePolish, /openCenteredHelp/);
assert.match(grindPsd, /Grind-PSD|grind-psd/i);
assert.match(orderParser, /privacyRedactions/);
assert.match(orderParser, /paidPrice/);

assert.match(brewAnalysis, /BREW_ANALYSIS_CONTRACT = 'brew-analysis\/2\.1'/);
assert.match(brewAnalysis, /BREW_SPATIAL_CONTRACT = 'brew-spatial\/1\.3'/);
assert.match(brewCore, /'brew-analysis\/2\.0', 'brew-analysis\/2\.1'/);
assert.match(matchVector, /MATCH_CONTRACT = 'luckybean-match\/1\.1'/);
assert.match(freshnessTimeline, /freshnessProfile\(bean\)\.progress/);

assert.match(deployWorkflow, /push:[\s\S]*branches: \[main\]/);
assert.match(deployWorkflow, /actions\/deploy-pages@v5\.0\.0/);
assert.match(deployWorkflow, /"version":"1\.24B"/);
assert.match(deployWorkflow, /1\.24B-main\.3/);
assert.match(deployWorkflow, /SOURCE_SHA/);
assert.match(deployWorkflow, /pages-status/);
assert.doesNotMatch(deployWorkflow, /workflow_run:/);
assert.match(buildWorkflow, /LuckyBean-1\.24B-release\.apk/);
assert.match(buildWorkflow, /LuckyBean-1\.24B-web\.zip/);
assert.match(buildWorkflow, /version_code=102402/);
assert.match(buildWorkflow, /revision=1\.24B-main\.3/);
assert.match(buildWorkflow, /LUCKYBEAN_KEYSTORE_B64/);
assert.match(buildWorkflow, /CERT_SHA256\.txt/);
assert.match(buildWorkflow, /release-status/);
assert.match(androidBuild, /LUCKYBEAN_KEYSTORE_FILE/);

console.log(`LuckyBean 1.24B ${releaseRevision} direct Pages, signed Android, serial OCR, lifecycle, frozen freshness and BrewProfiles contracts passed`);
