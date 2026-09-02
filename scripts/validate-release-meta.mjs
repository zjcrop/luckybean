import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const release = JSON.parse(read('release.json'));
const manifest = JSON.parse(read('manifest.webmanifest'));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const index = read('index.html');
const utils = read('src/utils.js');
const sw = read('sw.js');
const startup = read('src/core/startup-controller.js');
const runtime = read('src/features/runtime-features.js');
const gradle = read('android/app/build.gradle');
const activity = read('android/app/src/main/java/com/luckybean/app/MainActivity.java');
const brewResult = read('src/brew-result-schema.js');
const adapter = read('src/contracts/brew-contract-adapter.js');

assert.equal(release.product, 'LuckyBean');
assert.match(release.displayVersion, /^1\.24[A-Z]$/);
assert.match(release.semver, /^\d+\.\d+\.\d+$/);
assert.ok(Number.isInteger(release.androidVersionCode) && release.androidVersionCode > 102402, 'Android versionCode must increase beyond 1.24B');
assert.equal(release.androidUserAgent, `LuckyBeanAndroid/${release.displayVersion}`);
assert.equal(release.releaseTag, `v${release.revision}`);
assert.ok(release.revision.startsWith(`${release.displayVersion}-main.`));
assert.ok(release.cachePrefix.includes(release.displayVersion.toLowerCase().replace('.', '')));

assert.equal(manifest.version, release.displayVersion);
assert.ok(manifest.name.includes(release.displayVersion));
assert.equal(pkg.version, release.semver);
assert.equal(lock.version, release.semver);
assert.equal(lock.packages?.['']?.version, release.semver);

assert.ok(index.includes(`application-version\" content=\"${release.displayVersion}\"`));
assert.ok(index.includes(`release-revision\" content=\"${release.revision}\"`));
assert.ok(index.includes(`data-release=\"${release.displayVersion}\"`));
assert.ok(index.includes(`data-release-revision=\"${release.revision}\"`));
assert.ok(index.includes(`startup-controller.js?v=${release.revision}`));

assert.ok(utils.includes(`APP_VERSION = '${release.displayVersion}'`));
assert.ok(sw.includes(`REVISION = '${release.revision}'`));
assert.ok(sw.includes(`CACHE_PREFIX = '${release.cachePrefix}'`));
assert.ok(sw.includes(`CACHE_NAME = \`${'${CACHE_PREFIX}'}${release.cacheRevision}\``));
assert.ok(sw.includes("'./release.json'"), 'release.json must be available offline');
assert.ok(startup.includes("const APP_MODULE_REVISION = RELEASE_REVISION"));
assert.ok(runtime.includes("const BEAN_GROUP_RUNTIME_REVISION = RELEASE_REVISION"));

assert.match(gradle, /JsonSlurper/);
assert.match(gradle, /releaseMetaFile/);
assert.match(gradle, /versionCode \(releaseMeta\.androidVersionCode as int\)/);
assert.match(gradle, /versionName releaseMeta\.displayVersion as String/);
assert.match(gradle, /include 'index\.html', 'recognition-test\.html', 'release\.json'/);

const uaDynamic = /LuckyBeanAndroid\/" \+ BuildConfig\.VERSION_NAME/.test(activity);
const uaExact = activity.includes(`LuckyBeanAndroid/${release.displayVersion}`);
assert.ok(uaDynamic || uaExact, 'Android user agent must follow current release version');
assert.ok(!activity.includes('LuckyBeanAndroid/1.24B'), 'Android source must not advertise previous release UA');

assert.ok(brewResult.includes(`BREW_RESULT_VERSION = '${release.brewResultVersion}'`));
assert.ok(adapter.includes(`BREW_PLAN_SCHEMA_VERSION = '${release.brewPlanVersion}'`));
assert.ok(adapter.includes(`luckybean-brew-contract-adapter/${release.displayVersion}.2`));

console.log(`Release metadata validated: ${release.displayVersion} ${release.revision} / Android ${release.androidVersionCode} / BrewResult ${release.brewResultVersion}`);
