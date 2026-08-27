import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('src/app.js','utf8');
const guard=fs.readFileSync('src/features/release-1.24b-group-navigation.js','utf8');

for(const mode of ['leaderboard','freshness','price','remaining','random']){
  assert.match(app,new RegExp(`${mode}: \\[`),`missing application recommendation prompt pool for ${mode}`);
}
for(const sentence of [
  '直取榜首，不问其余。',
  '此只风味精绝，君既选中，甚是妥当。',
  '此只价冠诸豆，足见君之慧眼独钟。',
  '余粒无多，宜趁兴饮尽，为此豆作结。',
  '闭目拈签，任其自然。'
]) assert.ok(app.includes(sentence),`application prompt library lost sentence: ${sentence}`);

assert.match(app,/function normalizeRecommendationMode\(mode\)/);
assert.match(app,/function recommendationPrompt\(mode\)/);
assert.match(app,/mode = normalizeRecommendationMode\(mode\)/);
assert.match(app,/toast\(prompt, 'recommendation'\)/);
assert.match(app,/luckybean:recommendation-prompt/);
assert.doesNotMatch(app,/toast\(prompt \|\| `已选：\$\{beanDisplayName\(selected\)\}`/);
assert.match(app,/if \(kind === 'recommendation'\)/);

assert.match(index,/release-1\.24b-group-navigation\.js\?v=1\.24B-main\.10-native-prompt/);
assert.doesNotMatch(index,/body\[data-recommendation-prompt-revision\] #toast\.toast\.recommendation/);
assert.doesNotMatch(index,/data-recommendation-prompt-revision=/);

assert.doesNotMatch(guard,/RECOMMENDATION_PROMPTS|lbRecommendationToast|showRecommendationPromptForMode|MutationObserver|directPromptLockUntil/,
  'group-navigation adapter must not own, mirror, hide, or duplicate recommendation prompts');
assert.match(guard,/\.recommend-menu \[data-recommend-mode="price"\] \.recommend-dot\{background:#fff!important;\}/);
assert.match(guard,/html\[data-theme="light"\] \.recommend-menu \[data-recommend-mode="price"\] \.recommend-dot\{background:#000!important;\}/);
assert.match(guard,/LuckyBeanBeanGroupState/);
assert.doesNotMatch(guard,/function recommendBean|filteredBeans\(|recommendationScore\(/,'group-navigation adapter must not alter selection algorithms');

console.log('LuckyBean recommendation prompt contract passed: app.js exclusively owns the original fun prompt library; duplicate prompt layer removed; grouping and theme adapters remain isolated');
