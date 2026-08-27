import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('src/app.js','utf8');
const guard=fs.readFileSync('src/features/release-1.24b-group-navigation.js','utf8');

const legacyCatalog=[
  "favorite: '喜好（咖啡得分）'",
  "stale: '赏味期（剩余越少越靠前）'",
  "price: '价格（越高越推荐）'",
  "lowWeight: '余粮（剩余越少越推荐）'",
  "randomDate: '点兵点将'"
];
for(const source of legacyCatalog) assert.ok(app.includes(source),`legacy reminder lost: ${source}`);
const triggerAdapter=[
  "leaderboard: 'favorite'",
  "freshness: 'stale'",
  "price: 'price'",
  "remaining: 'lowWeight'",
  "random: 'randomDate'"
];
for(const source of triggerAdapter) assert.ok(app.includes(source),`current-to-legacy trigger lost: ${source}`);
for(const forbidden of ['直取榜首，不问其余。','此只风味精绝，君既选中，甚是妥当。','此只价冠诸豆，足见君之慧眼独钟。','余粒无多，宜趁兴饮尽，为此豆作结。','闭目拈签，任其自然。']) assert.ok(!app.includes(forbidden),`incorrect long prompt remains: ${forbidden}`);

assert.match(app,/function normalizeRecommendationMode\(mode\)/);
assert.match(app,/function recommendationPrompt\(mode, bean\)/);
assert.match(app,/const prompt = recommendationPrompt\(mode, selected\)/);
assert.ok(
  app.indexOf('const prompt = recommendationPrompt(mode, selected);') < app.indexOf("if (mode !== 'random') await focusRecommendedBean(selected"),
  'legacy reminder must fire as soon as the selection result is known, before non-random focus animation can delay it'
);
assert.match(app,/mode = normalizeRecommendationMode\(mode\)/);
assert.match(app,/toast\(prompt, 'recommendation'\)/);
assert.match(app,/luckybean:recommendation-prompt/);
assert.match(app,/popup\.addEventListener\('click', event => \{/);
assert.match(app,/void recommendBean\(button\.dataset\.recommendMode\)/);
assert.doesNotMatch(app,/const recommend=event\.target\.closest\('\[data-recommend-mode\]'\)/);
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

console.log('LuckyBean legacy reminder contract passed: current modes map to the recovered short reminder semantics; grouping and selection algorithms remain isolated');
