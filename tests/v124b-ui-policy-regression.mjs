import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [policy, app, beanGroups, groupNavigation, sharedSort, sensorySort, runtime, polish, index, serviceWorker, androidGradle] = await Promise.all([
  readFile('src/features/release-1.24b-ui-policy.js', 'utf8'),
  readFile('src/app.js', 'utf8'),
  readFile('src/bean-groups-controller.js', 'utf8'),
  readFile('src/features/release-1.24b-group-navigation.js', 'utf8'),
  readFile('src/ui/sortable-controller.js', 'utf8'),
  readFile('src/features/sensory-tag-sort-controller.js', 'utf8'),
  readFile('src/features/runtime-features.js', 'utf8'),
  readFile('src/features/release-1.24b-polish.js', 'utf8'),
  readFile('index.html', 'utf8'),
  readFile('sw.js', 'utf8'),
  readFile('android/app/build.gradle', 'utf8')
]);

assert.match(policy, /UI_POLICY_REVISION = '1\.24B-main\.4'/);
assert.match(policy, /button\.textContent = '合并云端'/);
assert.match(policy, /aspect-ratio:\s*2\s*\/\s*1/);
// The bean renderer owns leaderboard creation; UI policy explicitly preserves it as visible.
assert.match(app, /preference-board-strip/);
assert.match(policy, /\.preference-board-strip\s*\{[^}]*display:\s*flex\s*;/s);
assert.doesNotMatch(policy, /\.preference-board-strip\s*\{[^}]*display:\s*none/i);
assert.match(policy, /\.bean-consumption-summary > small/);
assert.match(policy, /数藏分析/);
assert.match(policy, /从豆卡、冲煮与品鉴记录生成个人咖啡图谱/);
assert.match(policy, /lb-stock-total/);
assert.match(policy, /lb-today-consumption/);
assert.match(policy, /现有咖啡豆共计/);
assert.match(policy, /还可饮用/);
assert.match(policy, /非罗布斯塔/);
assert.match(policy, /@media \(max-width: 720px\)/);
assert.match(policy, /#brewContent button:not\(\.lb-brew-switch\)/);
assert.match(policy, /background:\s*transparent\s*!important/);
assert.match(policy, /border:\s*0\s*!important/);
assert.match(policy, /observe\('brewContent'\)/);
assert.match(policy, /\.lb-other-brew-panel/);
// Group state has one owner; UI policy contains only visual policy and never owns close navigation.
assert.doesNotMatch(policy, /page\.addEventListener\('click'/);
assert.doesNotMatch(policy, /data-active-group-panel|group-collapse-zone/);

assert.match(beanGroups, /async function closeActiveGroup/);
assert.match(beanGroups, /hasActiveGroup: \(\) => Boolean\(activeGroup\)/);
assert.match(beanGroups, /activeGroup: \(\) => activeGroup/);
assert.doesNotMatch(beanGroups, /data-v099t-group-back|>收</);
assert.match(groupNavigation, /LuckyBeanV099tBeanGroups/);
assert.match(groupNavigation, /api\.closeActiveGroup/);
assert.match(groupNavigation, /canonical folder-state navigation active/);
assert.match(groupNavigation, /\[data-page-target\]/);
assert.match(groupNavigation, /capture:true/);
assert.match(groupNavigation, /luckybean:navigation-back/);
assert.doesNotMatch(groupNavigation, /data-v099t-group-back|back\.click|\.bean-grid/);

// All user-orderable scenes share one live-preview engine.
assert.match(sharedSort, /globalThis\.LuckyBeanSortable = \{ register \}/);
assert.match(sharedSort, /lb-sort-ghost/);
assert.match(sharedSort, /lb-sort-placeholder/);
assert.match(sharedSort, /onPreview/);
assert.match(sharedSort, /onCommit/);
assert.match(sharedSort, /setPointerCapture/);
assert.match(sharedSort, /navigator\.vibrate/);
assert.match(sharedSort, /EDGE_SCROLL_PX/);
assert.match(sharedSort, /DOUBLE_CLICK_MS/);
assert.match(sharedSort, /previewOrder/);
assert.match(sensorySort, /LuckyBeanSortable/);
assert.match(sensorySort, /双击移除/);
assert.match(sensorySort, /实时预览松手后的顺序/);
assert.match(sensorySort, /professional-sensory-complete/);
assert.match(sensorySort, /professionalData\?\.selections/);
assert.doesNotMatch(sensorySort, /setPointerCapture|elementFromPoint|LONG_PRESS_MS\s*=/);

assert.match(runtime, /shared-sortable/);
assert.ok(runtime.indexOf("feature('shared-sortable'") < runtime.indexOf("feature('sensory-tag-sort'"), 'shared sorter must load before sensory adapter');
assert.match(runtime, /release-1\.24b-ui-policy\.js/);
assert.match(runtime, /sensory-tag-sort-controller\.js/);
assert.match(runtime, /1\.24B-main\.4/);
assert.match(polish, /import '\.\/release-1\.24b-ui-policy\.js';/);
assert.match(index, /release-revision" content="1\.24B-main\.4"/);
assert.match(index, /release-1\.24b-polish\.js\?v=1\.24B-main\.4/);
assert.match(serviceWorker, /REVISION = '1\.24B-main\.4'/);
assert.match(serviceWorker, /CACHE_NAME = `\$\{CACHE_PREFIX\}main-4-interaction3`/);
assert.match(serviceWorker, /release-1\.24b-ui-policy\.js/);
assert.match(serviceWorker, /release-1\.24b-group-navigation\.js/);
assert.match(serviceWorker, /src\/ui\/sortable-controller\.js/);
assert.match(serviceWorker, /sensory-tag-sort-controller\.js/);

assert.match(androidGradle, /include 'src\/\*\*'/);
assert.match(androidGradle, /versionName '1\.24B'/);
assert.match(androidGradle, /versionCode 102402/);

console.log('LuckyBean 1.24B canonical folder state, visible preference leaderboard, shared live-preview sorting, text brew UI and Web/Android parity contracts passed');
