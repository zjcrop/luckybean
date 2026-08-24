import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const index = read('index.html');
const navigation = read('src/ui/navigation-controller.js');
const components = read('src/ui/app-components.css');
const activity = read('android/app/src/main/java/com/luckybean/app/MainActivity.java');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const build = read('android/app/build.gradle');
const sw = read('sw.js');

const revision = index.match(/release-revision" content="([^"]+)"/)?.[1];
assert.equal(revision, '1.24B-main.3');
assert.ok(index.includes(`src/ui/navigation-controller.js?v=${revision}`));
assert.ok(sw.includes('ui/navigation-controller.js'));
assert.match(navigation, /globalThis\.LuckyBeanNavigation/);
assert.match(navigation, /history\.pushState/);
assert.match(navigation, /history\.back\(\)/);
assert.match(navigation, /popstate/);
assert.match(navigation, /#overlayRoot/);
assert.match(navigation, /data-page-target/);
assert.match(navigation, /MutationObserver/);
assert.doesNotMatch(navigation, /observe\(document\.body/);

assert.match(components, /\.lb-bean-line[^}]*gap:\s*1em/);
assert.match(components, /\.lb-bean-primary[^}]*flex:\s*0 1 auto/);
assert.match(components, /\.lb-bean-secondary[^}]*flex:\s*0 1 auto/);
assert.doesNotMatch(components, /\.lb-bean-secondary[^}]*max-width:\s*4[02]%/);

assert.match(activity, /LuckyBeanNavigation/);
assert.match(activity, /evaluateJavascript/);
assert.match(activity, /handleSystemBack/);
assert.match(activity, /getOnBackInvokedDispatcher/);
assert.match(activity, /PRIORITY_DEFAULT/);
assert.match(activity, /public void onBackPressed\(\)\s*\{\s*handleSystemBack\(\);\s*\}/s);
assert.match(manifest, /android:enableOnBackInvokedCallback="true"/);
const versionCode = Number(build.match(/versionCode\s+(\d+)/)?.[1] || 0);
assert.ok(versionCode > 102315, `upgrade versionCode must exceed previous signed build: ${versionCode}`);

console.log('LuckyBean canonical page stack, overlay back, Android gesture back and compact bean metadata contracts passed');
