import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [policy, groupNavigation, runtime, polish, index, serviceWorker, androidGradle] = await Promise.all([
  readFile('src/features/release-1.24b-ui-policy.js', 'utf8'),
  readFile('src/features/release-1.24b-group-navigation.js', 'utf8'),
  readFile('src/features/runtime-features.js', 'utf8'),
  readFile('src/features/release-1.24b-polish.js', 'utf8'),
  readFile('index.html', 'utf8'),
  readFile('sw.js', 'utf8'),
  readFile('android/app/build.gradle', 'utf8')
]);

assert.match(policy, /UI_POLICY_REVISION = '1\.24B-main\.4'/);
assert.match(policy, /button\.textContent = '合并云端'/);
assert.match(policy, /aspect-ratio:\s*2\s*\/\s*1/);
assert.match(policy, /\.preference-board-strip/);
assert.match(policy, /\.bean-consumption-summary > small/);
assert.match(policy, /数藏分析/);
assert.match(policy, /从豆卡、冲煮与品鉴记录生成个人咖啡图谱/);
assert.match(policy, /lb-stock-total/);
assert.match(policy, /lb-today-consumption/);
assert.match(policy, /现有咖啡豆共计/);
assert.match(policy, /还可饮用/);
assert.match(policy, /非罗布斯塔/);
assert.match(policy, /@media \(max-width: 720px\)/);
assert.match(policy, /min-height:\s*0\s*!important/);
assert.match(policy, /group-collapse-zone/);
// Group open/close state has one owner; UI policy must not duplicate page click navigation.
assert.doesNotMatch(policy, /page\.addEventListener\('click'/);
assert.doesNotMatch(policy, /data-active-group-panel/);
assert.match(groupNavigation, /button\[data-v099t-group-back\]/);
assert.match(groupNavigation, /folder-style group navigation active/);
assert.match(groupNavigation, /\[data-page-target\]/);
assert.match(groupNavigation, /capture:true/);
assert.match(groupNavigation, /luckybean:navigation-back/);

assert.match(runtime, /release-1\.24b-ui-policy\.js/);
assert.match(runtime, /1\.24B-main\.4/);
assert.match(polish, /import '\.\/release-1\.24b-ui-policy\.js';/);
assert.match(index, /release-revision" content="1\.24B-main\.4"/);
assert.match(index, /release-1\.24b-polish\.js\?v=1\.24B-main\.4/);
assert.match(serviceWorker, /REVISION = '1\.24B-main\.4'/);
assert.match(serviceWorker, /CACHE_NAME = `\$\{CACHE_PREFIX\}main-4-folder2`/);
assert.match(serviceWorker, /release-1\.24b-ui-policy\.js/);
assert.match(serviceWorker, /release-1\.24b-group-navigation\.js/);

assert.match(androidGradle, /include 'src\/\*\*'/);
assert.match(androidGradle, /versionName '1\.24B'/);
assert.match(androidGradle, /versionCode 102402/);

console.log('LuckyBean 1.24B main.4 UI policy + folder navigation ownership regression contract passed');
