import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const release = JSON.parse(read('release.json'));
const index = read('index.html');
const navigation = read('src/ui/navigation-controller.js');
const components = read('src/ui/app-components.css');
const styles = read('styles.css');
const activity = read('android/app/src/main/java/com/luckybean/app/MainActivity.java');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const build = read('android/app/build.gradle');
const sw = read('sw.js');

const revision = index.match(/release-revision" content="([^"]+)"/)?.[1];
assert.equal(revision, release.revision);
assert.ok(index.includes(`src/ui/navigation-controller.js?v=${revision}`));
assert.ok(sw.includes('ui/navigation-controller.js'));
assert.match(navigation, /globalThis\.LuckyBeanNavigation/);
assert.match(navigation, /globalThis\.OverlayManager/);
assert.match(navigation, /globalThis\.NavigationManager/);
assert.match(navigation, /globalThis\.FlowNavigation/);
assert.match(navigation, /globalThis\.BackGestureAdapter/);
assert.match(navigation, /globalThis\.RootExitGuard/);
assert.doesNotMatch(navigation, /history\.(?:pushState|replaceState|back|go)/);
assert.doesNotMatch(navigation, /popstate/);
assert.match(navigation, /#overlayRoot/);
assert.match(navigation, /data-page-target/);
assert.match(navigation, /MutationObserver/);
assert.match(navigation, /observe\(overlayRoot/);
assert.doesNotMatch(navigation, /observe\(document\.body/);
assert.match(navigation, /manage:\s*\(element, kind\)/);
assert.match(navigation, /dismissKeyboard\(\).*OverlayManager\.dismiss\(\['picker', 'popover'\].*OverlayManager\.dismiss\('dialog'.*OverlayManager\.dismiss\('modal'.*FlowNavigation\.previous\(\).*NavigationManager\.backFromChild\(\).*NavigationManager\.backToAppRoot\(\).*NavigationManager\.isAtAppRoot\(\).*RootExitGuard\.request/s);
assert.match(navigation, /APP_ROOT_PAGE\s*=\s*'beans'/);
assert.match(navigation, /ROOT_EXIT_WINDOW_MS/);
assert.match(navigation, /dataset\.rootExitConfirm/);
assert.match(navigation, /interactionConfirm/);
assert.match(navigation, /LuckyBeanNative/);
assert.match(styles, /--app-interaction-scrim:\s*rgba\(0,0,0,\.68\)/);
assert.match(styles, /\.app-interaction-scrim/);
assert.match(styles, /\[data-overlay-backdrop="true"\][^{]*\{[^}]*background:\s*transparent/s);

assert.match(components, /\.lb-bean-line[^}]*gap:\s*1em/);
assert.match(components, /\.lb-bean-primary[^}]*flex:\s*0 1 auto/);
assert.match(components, /\.lb-bean-secondary[^}]*flex:\s*0 1 auto/);
assert.doesNotMatch(components, /\.lb-bean-secondary[^}]*max-width:\s*4[02]%/);

assert.match(activity, /BackGestureAdapter/);
assert.match(activity, /handleAndroidBack/);
assert.match(activity, /public void exitApp\(\)/);
assert.match(activity, /evaluateJavascript/);
assert.match(activity, /handleSystemBack/);
assert.match(activity, /getOnBackInvokedDispatcher/);
assert.match(activity, /PRIORITY_DEFAULT/);
assert.match(activity, /public void onBackPressed\(\)\s*\{\s*handleSystemBack\(\);\s*\}/s);
assert.doesNotMatch(activity, /else finish\(\);/);
assert.match(manifest, /android:enableOnBackInvokedCallback="true"/);
assert.ok(Number(release.androidVersionCode) > 102315, `upgrade versionCode must exceed previous signed build: ${release.androidVersionCode}`);
assert.match(build, /versionCode \(releaseMeta\.androidVersionCode as int\)/);
assert.match(build, /versionName releaseMeta\.displayVersion as String/);

const uiSources = fs.readdirSync('src', { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(?:css|js|html)$/.test(entry.name))
  .map(entry => read(`${entry.parentPath}/${entry.name}`))
  .join('\n');
assert.doesNotMatch(`${styles}\n${uiSources}`, /(?:-webkit-)?backdrop-filter\s*:/);

console.log(`LuckyBean ${release.displayVersion} global overlay, flow navigation, Android back and explicit root-exit contracts passed`);
