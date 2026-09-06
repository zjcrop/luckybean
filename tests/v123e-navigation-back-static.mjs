import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const release = JSON.parse(read('release.json'));
const index = read('index.html');
const navigation = read('src/ui/navigation-controller.js');
const foundation = read('src/ui/interaction-foundation.js');
const interactionCss = read('src/ui/interaction-foundation.css');
const components = read('src/ui/app-components.css');
const activity = read('android/app/src/main/java/com/luckybean/app/MainActivity.java');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const build = read('android/app/build.gradle');
const sw = read('sw.js');

const revision = index.match(/release-revision" content="([^"]+)"/)?.[1];
assert.equal(revision, release.revision);
assert.ok(index.includes(`src/ui/navigation-controller.js?v=${revision}`));
assert.ok(index.includes(`src/ui/interaction-foundation.css?v=${revision}`));
assert.ok(sw.includes('ui/navigation-controller.js'));
assert.ok(sw.includes('ui/interaction-foundation.js'));
assert.ok(sw.includes('ui/interaction-foundation.css'));

assert.match(navigation, /globalThis\.LuckyBeanNavigation/);
assert.match(navigation, /OverlayManager/);
assert.match(navigation, /NavigationManager/);
assert.match(navigation, /FlowNavigation/);
assert.match(navigation, /BackGestureAdapter/);
assert.match(navigation, /RootExitGuard/);
assert.match(navigation, /DraftGuard/);
assert.match(navigation, /data-page-target/);
assert.match(navigation, /MutationObserver/);
assert.match(navigation, /LuckyBeanNative\?\.exitApp/);
assert.doesNotMatch(navigation, /history\.pushState/);
assert.doesNotMatch(navigation, /history\.back\(\)/);
assert.doesNotMatch(navigation, /popstate/);

assert.match(foundation, /class OverlayManager/);
assert.match(foundation, /class NavigationManager/);
assert.match(foundation, /class FlowNavigation/);
assert.match(foundation, /class BackGestureAdapter/);
assert.match(foundation, /class RootExitGuard/);
assert.match(foundation, /class DraftGuard/);
assert.match(foundation, /beforeunload/);
assert.match(foundation, /再按一次返回以打开退出确认/);
assert.match(foundation, /OVERLAY_KINDS\.TRANSIENT/);
assert.match(foundation, /OVERLAY_KINDS\.DIALOG/);
assert.match(foundation, /OVERLAY_KINDS\.MODAL/);
assert.match(interactionCss, /--interaction-scrim:\s*rgba\(/);
assert.match(interactionCss, /backdrop-filter:\s*none\s*!important/);
assert.match(interactionCss, /\.interaction-scrim/);

assert.match(components, /\.lb-bean-line[^}]*gap:\s*1em/);
assert.match(components, /\.lb-bean-primary[^}]*flex:\s*0 1 auto/);
assert.match(components, /\.lb-bean-secondary[^}]*flex:\s*0 1 auto/);
assert.doesNotMatch(components, /\.lb-bean-secondary[^}]*max-width:\s*4[02]%/);

assert.match(activity, /LuckyBeanNavigation/);
assert.match(activity, /evaluateJavascript/);
assert.match(activity, /handleSystemBack/);
assert.match(activity, /getOnBackInvokedDispatcher/);
assert.match(activity, /PRIORITY_DEFAULT/);
assert.match(activity, /@JavascriptInterface\s*public void exitApp\(\)\s*\{\s*runOnUiThread\(MainActivity\.this::finish\);\s*\}/s);
assert.match(activity, /public void onBackPressed\(\)\s*\{\s*handleSystemBack\(\);\s*\}/s);
assert.match(manifest, /android:enableOnBackInvokedCallback="true"/);
assert.ok(Number(release.androidVersionCode) > 102315, `upgrade versionCode must exceed previous signed build: ${release.androidVersionCode}`);
assert.match(build, /versionCode \(releaseMeta\.androidVersionCode as int\)/);
assert.match(build, /versionName releaseMeta\.displayVersion as String/);

console.log(`LuckyBean ${release.displayVersion} Stage 1 semantic navigation, single scrim, draft guard and Android gesture contracts passed`);
