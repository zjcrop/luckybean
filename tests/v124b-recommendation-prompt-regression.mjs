import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('src/app.js','utf8');
const guard=fs.readFileSync('src/features/release-1.24b-group-navigation.js','utf8');

for(const mode of ['leaderboard','freshness','price','remaining','random']){
  assert.match(app,new RegExp(`${mode}: \\[`),`missing recommendation prompt pool for ${mode}`);
}
assert.match(app,/function recommendationPrompt\(mode\)/);
assert.match(app,/toast\(prompt \|\| `已选：\$\{beanDisplayName\(selected\)\}`, 'recommendation'\)/);

assert.match(guard,/lbRecommendationToast/);
assert.match(guard,/MutationObserver\(mirrorRecommendationPrompt\)/);
assert.match(guard,/classList\.contains\('recommendation'\)/);
assert.match(guard,/recommendationHideTimer=setTimeout\(\(\)=>node\.classList\.remove\('show'\),6000\)/);
assert.match(guard,/recommendationCleanupTimer=setTimeout/);
assert.match(guard,/dataset\.lbPrompt/);
assert.doesNotMatch(guard,/function recommendBean|filteredBeans\(|recommendationScore\(/,'prompt guard must not own or alter selection algorithms');

console.log('LuckyBean recommendation prompt guard passed: five prompt libraries preserved and UI isolation does not alter selection logic');