import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const app = read('src/app.js');
const codebook = read('src/codebook.js');
const index = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));
const sw = read('sw.js');
const androidBuild = read('android/app/build.gradle');
const androidActivity = read('android/app/src/main/java/com/luckybean/app/MainActivity.java');
const androidBridge = read('android/native-bridge.js');
const recognitionBridge = read('src/recognition-bridge.js');
const packageCapture = read('src/package-capture-controller.js');
const brewAnalysis = read('src/services/brew-analysis-service.js');
const matchVector = read('src/domain/matching/flavor-vector.js');
const deployWorkflow = read('.github/workflows/deploy-main.yml');
const buildWorkflow = read('.github/workflows/build-main.yml');

assert.match(read('src/utils.js'), /APP_VERSION = '1\.23E'/);
assert.match(read('src/utils.js'), /SCHEMA_VERSION = 8/);
assert.equal(manifest.version, '1.23E');
assert.match(index, /application-version" content="1\.23E"/);
assert.match(index, /release-revision" content="1\.23E-main-sync\.1"/);
assert.match(index, /accept="\.luckybean,application\/vnd\.luckybean\.archive\+json,application\/json"/);

assert.match(app, /createPortableArchive/);
assert.match(app, /inspectPortableArchive/);
assert.match(app, /restorePortableArchive/);
assert.match(app, /classifyRecognitionDates/);
assert.match(app, /resolveDateReviewSelections/);
assert.doesNotMatch(app, /merged\.roastDate \|\|= todayISO\(\)/);
assert.match(app, /source\.type === 'manual' \? todayISO\(\) : ''/);
assert.match(codebook, /const roastDateInput = labeled\.roastDate \|\| ''/);
assert.doesNotMatch(codebook, /labeled\.roastDate \|\| labeled\.productionDate/);

assert.match(sw, /recognition-test\.html/);
assert.match(sw, /CACHE_PREFIX = 'luckybean-main-v123e-'/);
assert.match(sw, /CACHE_NAME = `\$\{CACHE_PREFIX\}main-sync-1`/);
assert.match(sw, /luckybean-main-v123d-/);
assert.match(sw, /gear-regression-fix-controller\.js/);
assert.match(sw, /domain\/beans\/bean-consumption-summary\.js/);
assert.match(sw, /luckybean-archive-v1\.schema\.json/);
assert.match(sw, /cache\.put\(request, response\.clone\(\)\)/);
assert.match(sw, /caches\.match\(request\).*caches\.match\('\.\/index\.html'\)/s);

assert.match(androidBuild, /versionCode 102305/);
assert.match(androidBuild, /versionName '1\.23E'/);
assert.match(androidBuild, /include 'index\.html', 'recognition-test\.html'/);
assert.match(androidActivity, /addJavascriptInterface\(new NativeFileBridge\(\), "LuckyBeanNative"\)/);
assert.match(androidActivity, /Intent\.ACTION_CREATE_DOCUMENT/);
assert.match(androidActivity, /openOutputStream/);
assert.match(androidBuild, /com\.google\.mlkit:text-recognition:16\.0\.1/);
assert.match(androidBuild, /com\.google\.mlkit:text-recognition-chinese:16\.0\.1/);
assert.match(androidActivity, /ChineseTextRecognizerOptions/);
assert.match(androidActivity, /recognizeImage\(String requestId/);
assert.match(androidActivity, /bindImageSource\(String imageId, boolean includePreview\)/);
assert.match(androidActivity, /ImageDecoder\.createSource/);
assert.match(androidActivity, /InputImage\.fromFilePath\(MainActivity\.this, sourceUri\)/);
assert.match(androidActivity, /LuckyBeanAndroid\/1\.23E/);
assert.match(androidBridge, /LuckyBeanRecognitionBridge/);
assert.match(androidBridge, /android-mlkit-bundled-16\.0\.1/);
assert.doesNotMatch(androidBridge, /cdn\.jsdelivr\.net|dynamic.*import/i);
assert.match(recognitionBridge, /dataUrl: nativeSource \? '' : await blobToDataUrl\(image\.blob\)/);
assert.match(packageCapture, /bindAndroidImageSource\(id, nativeSource\)/);
assert.match(packageCapture, /原生缩略预览/);
assert.match(read('src/utils.js'), /LuckyBeanNative\?\.saveFile/);

assert.match(brewAnalysis, /BREW_ANALYSIS_CONTRACT = 'brew-analysis\/2\.1'/);
assert.match(brewAnalysis, /BREW_SPATIAL_CONTRACT = 'brew-spatial\/1\.3'/);
assert.match(brewAnalysis, /BREW_FLAVOR_STATE_CONTRACT = 'brew-flavor-state\/1\.0'/);
assert.match(matchVector, /MATCH_CONTRACT = 'luckybean-match\/1\.1'/);
assert.doesNotMatch(matchVector, /LMS1-FC1-D\$\{/);

assert.match(deployWorkflow, /recognition-test\.html/);
assert.match(deployWorkflow, /contracts\/luckybean-archive-v1\.schema\.json/);
assert.match(deployWorkflow, /LuckyBean-1\.23E-web\.zip/);
assert.match(buildWorkflow, /LuckyBean-1\.23E-debug\.apk/);
assert.match(buildWorkflow, /version_code=102305/);
assert.match(buildWorkflow, /analysis_contract=brew-analysis\/2\.1/);

console.log('LuckyBean 1.23E deployment, Android image URI, BrewProfiles compatibility and archive contracts passed');
