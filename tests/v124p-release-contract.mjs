import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const release = JSON.parse(read('release.json'));
const index = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));
const sw = read('sw.js');
const utils = read('src/utils.js');
const startup = read('src/core/startup-controller.js');
const runtime = read('src/features/runtime-features.js');
const gradle = read('android/app/build.gradle');
const activity = read('android/app/src/main/java/com/luckybean/app/MainActivity.java');
const deploy = read('.github/workflows/deploy-main.yml');
const build = read('.github/workflows/build-main.yml');
const diagnose = read('.github/workflows/diagnose-main.yml');
const validator = read('scripts/validate-release-meta.mjs');
const brewResult = read('src/brew-result-schema.js');
const adapter = read('src/contracts/brew-contract-adapter.js');
const spatial = read('src/renderers/brew-spatial-controller.js');
const history = read('src/domain/history/history-comparison.js');
const sensoryHistory = read('src/domain/history/history-sensory-service.js');

assert.equal(release.displayVersion, '1.24P');
assert.equal(release.revision, '1.24P-main.2');
assert.equal(release.semver, '1.24.16');
assert.ok(Number.isInteger(release.androidVersionCode) && release.androidVersionCode >= 102418);
assert.equal(release.releaseTag, 'v1.24P-main.2');
assert.equal(release.cacheRevision, 'main-2-auth-ocr-ai');
assert.equal(release.brewResultVersion, '1.1');
assert.equal(release.brewPlanVersion, 'brew-plan/1.0');

assert.match(index, /application-version" content="1\.24P"/);
assert.match(index, /release-revision" content="1\.24P-main\.2"/);
assert.match(index, /data-release="1\.24P"/);
assert.equal(manifest.version, '1.24P');
assert.match(utils, /APP_VERSION = '1\.24P'/);
assert.match(sw, /REVISION = '1\.24P-main\.2'/);
assert.match(sw, /CACHE_PREFIX = 'luckybean-main-v124p-'/);
assert.match(sw, /main-2-auth-ocr-ai/);
assert.match(sw, /'\.\/release\.json'/);
assert.match(sw, /recognition-ai-service\.js/);
assert.match(sw, /NETWORK_TIMEOUT_MS = 3500/);
assert.match(sw, /async function cacheFirst\(request\)/);
assert.match(sw, /request\.mode === 'navigate'[\s\S]*networkFirst\(request, '\.\/index\.html'\)/);
assert.match(sw, /url\.origin === self\.location\.origin[\s\S]*cacheFirst\(request\)/);
assert.match(sw, /Promise\.allSettled\(optional\.map\(item => cache\.add\(item\)\)\)/);
assert.doesNotMatch(sw, /url\.origin === self\.location\.origin[\s\S]{0,500}fetch\(new Request\(request, \{ cache:'reload' \}\)/, 'cached static assets must not synchronously wait on a slow origin before cache fallback');
assert.match(startup, /APP_MODULE_REVISION = RELEASE_REVISION/);
assert.match(runtime, /BEAN_GROUP_RUNTIME_REVISION = RELEASE_REVISION/);

assert.match(gradle, /JsonSlurper/);
assert.match(gradle, /releaseMetaFile/);
assert.match(gradle, /versionCode \(releaseMeta\.androidVersionCode as int\)/);
assert.match(gradle, /versionName releaseMeta\.displayVersion as String/);
assert.match(activity, /LuckyBeanAndroid\/" \+ BuildConfig\.VERSION_NAME/);
assert.doesNotMatch(activity, /LuckyBeanAndroid\/1\.24B/);

assert.match(brewResult, /BREW_RESULT_VERSION = '1\.1'/);
assert.match(brewResult, /spatial: physical\.spatial/);
assert.match(adapter, /luckybean-brew-contract-adapter\/1\.24P\.2/);
assert.match(adapter, /analysisSnapshot[\s\S]*brewResult/);
assert.match(spatial, /contracts\?\.brewResult\?\.physical\?\.spatial/);
assert.match(history, /brewResult\?\.flavor/);
assert.match(sensoryHistory, /optimizationBaseline/);
assert.match(sensoryHistory, /modelFlavorUsedAsSensoryTruth:false/);

for (const workflow of [deploy, build, diagnose]) {
  assert.match(workflow, /release\.json/);
  assert.match(workflow, /DISPLAY_VERSION/);
  assert.match(workflow, /RELEASE_REVISION/);
}
assert.match(deploy, /workflows: \["LuckyBean main tests"\]/);
assert.doesNotMatch(deploy, /\n  push:\n/);
assert.match(deploy, /same-SHA test gate|same-SHA main tests|same_sha_main_tests/);
assert.match(deploy, /node scripts\/validate-release-meta\.mjs/);
assert.match(deploy, /browser_smoke:true/);
assert.match(deploy, /status\/\$\{DISPLAY_VERSION\}\.json/);
assert.match(build, /workflows: \["LuckyBean main web deploy"\]/);
assert.match(build, /androidVersionCode/);
assert.match(build, /versionCode='\$\{ANDROID_VERSION_CODE\}'/);
assert.match(build, /LuckyBean-\$\{DISPLAY_VERSION\}-release\.apk/);
assert.match(build, /CERT_SHA256\.txt/);
assert.match(build, /apksigner/);
assert.match(build, /release-status/);
assert.match(build, /status\/\$\{DISPLAY_VERSION\}\.json/);
assert.match(diagnose, /release_status/);
assert.match(diagnose, /status\/\$\{DISPLAY_VERSION\}\.json/);
assert.match(validator, /Android user agent must follow current release version/);

const publicIdentitySources = [index, JSON.stringify(manifest), sw, utils, gradle, activity, deploy, build, diagnose];
for (const source of publicIdentitySources) assert.doesNotMatch(source, /versionName '1\.24B'|APP_VERSION = '1\.24B'|application-version" content="1\.24B"|REVISION = '1\.24B-main\.6'|LuckyBeanAndroid\/1\.24B|status\/1\.24B\.json/);

console.log('LuckyBean 1.24P main.2 canonical release identity, resilient PWA loading, BrewResult consumers and same-SHA signed deployment contract passed');
