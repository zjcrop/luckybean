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
const deployWorkflow = read('.github/workflows/deploy-main.yml');
const buildWorkflow = read('.github/workflows/build-main.yml');

assert.match(read('src/utils.js'), /APP_VERSION = '1\.23D'/);
assert.match(read('src/utils.js'), /SCHEMA_VERSION = 8/);
assert.equal(manifest.version, '1.23D');
assert.match(index, /application-version" content="1\.23D"/);
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
assert.match(sw, /luckybean-archive-v1\.schema\.json/);
assert.match(sw, /cache\.put\(request, response\.clone\(\)\)/);
assert.match(sw, /caches\.match\(request\).*caches\.match\('\.\/index\.html'\)/s);
assert.match(androidBuild, /versionCode 102304/);
assert.match(androidBuild, /versionName '1\.23D'/);
assert.match(androidBuild, /include 'index\.html', 'recognition-test\.html'/);
assert.match(androidActivity, /addJavascriptInterface\(new NativeFileBridge\(\), "LuckyBeanNative"\)/);
assert.match(androidActivity, /Intent\.ACTION_CREATE_DOCUMENT/);
assert.match(androidActivity, /openOutputStream/);
assert.match(read('src/utils.js'), /LuckyBeanNative\?\.saveFile/);

assert.match(deployWorkflow, /recognition-test\.html/);
assert.match(deployWorkflow, /contracts\/luckybean-archive-v1\.schema\.json/);
assert.match(buildWorkflow, /LuckyBean-1\.23D-debug\.apk/);
assert.match(buildWorkflow, /version_code=102304/);

console.log('LuckyBean 1.23D deployment, recognition, archive and Android SAF contracts passed');
