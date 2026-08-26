import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('src/app.js','utf8');
const guard=fs.readFileSync('src/features/release-1.24b-group-navigation.js','utf8');

for(const mode of ['leaderboard','freshness','price','remaining','random']){
  assert.match(app,new RegExp(`${mode}: \\[`),`missing application recommendation prompt pool for ${mode}`);
  assert.match(guard,new RegExp(`${mode}:\\[`),`missing immediate recommendation prompt pool for ${mode}`);
}
for(const sentence of [
  '直取榜首，不问其余。',
  '此只风味精绝，君既选中，甚是妥当。',
  '此只价冠诸豆，足见君之慧眼独钟。',
  '余粒无多，宜趁兴饮尽，为此豆作结。',
  '闭目拈签，任其自然。'
]){
  assert.ok(app.includes(sentence),`application prompt library lost sentence: ${sentence}`);
  assert.ok(guard.includes(sentence),`immediate prompt library lost sentence: ${sentence}`);
}
assert.match(app,/function recommendationPrompt\(mode\)/);
assert.match(app,/toast\(prompt \|\| `已选：\$\{beanDisplayName\(selected\)\}`, 'recommendation'\)/);

assert.match(guard,/lbRecommendationToast/);
assert.match(guard,/function showRecommendationPromptForMode\(mode\)/);
assert.match(guard,/closest\?\.\('\[data-recommend-mode\]'\)/);
assert.match(guard,/showRecommendationPromptForMode\(trigger\.dataset\.recommendMode\)/);
assert.match(guard,/recommendationHideTimer=setTimeout\(\(\)=>node\.classList\.remove\('show'\),6000\)/);
assert.match(guard,/z-index:10060!important/);
assert.match(guard,/background:#e8d7ad!important/);
assert.match(guard,/font-family:FangSong/);
assert.match(guard,/MutationObserver\(mirrorRecommendationPrompt\)/);
assert.match(guard,/directPromptLockUntil/);
assert.doesNotMatch(guard,/function recommendBean|filteredBeans\(|recommendationScore\(/,'prompt UI must not own or alter selection algorithms');

console.log('LuckyBean recommendation prompt contract passed: original five prompt libraries are immediate, visible, isolated, and selection algorithms remain untouched');
