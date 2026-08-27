import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('src/app.js','utf8');
const groups=fs.readFileSync('src/bean-groups-controller.js','utf8');
const runtime=fs.readFileSync('src/features/runtime-features.js','utf8');
const guard=fs.readFileSync('src/features/release-1.24b-group-navigation.js','utf8');

const originalFunPrompts=[
  '直取榜首，不问其余。','依榜索魁，必得佳味。','榜单在前，今朝且试头筹。','榜魁已定，此只风味精绝，不负众望。','一举摘魁，恰逢此豆风味正酣。','众里寻它，终得榜首，宜细细品之。','照榜点将，专挑那个第一名！',
  '此只风味精绝，君既选中，甚是妥当。','正逢此只风味最盛，您这一选，再好不过。','此只正值风味精妙处，既已选定，便是良配。','此只正得意时，恰被君眼相中，眼光不差。',
  '此只价冠诸豆，足见君之慧眼独钟。','此只乃众豆之魁，承君青睐，身价自高。','此只位列首席，价亦昂，唯君堪配此味。','既择此只风骨，当知众豆之中，以此最为矜贵。',
  '余粒无多，宜趁兴饮尽，为此豆作结。','所剩几何，当及时啜饮，不负此豆风华。','残豆将尽，速饮之，好与此只从容作别。','此豆见底啦，趁风味未散，快快饮尽收场！',
  '闭目拈签，任其自然。','信手拈签，以定今日之选。','且凭一签，决此豆归谁。','一签落地，此只当归于君。','签指此只，风味正酣，君可安心享之。','得此签，恰逢余粒无几，缘分也。','伸手拈一签，看天意选哪只！'
];
for(const sentence of originalFunPrompts) assert.ok(groups.includes(sentence),`original fun prompt lost: ${sentence}`);
assert.match(groups,/const RECOMMENDATION_PROMPTS = Object\.freeze/);
assert.match(groups,/function recommendationPrompt\(mode\)/);
assert.match(groups,/const previous = recommendationPromptMemory\[mode\]/);
assert.match(groups,/const prompt = recommendationPrompt\(mode\)/);
assert.match(groups,/luckybean:recommendation-prompt/);
assert.match(groups,/toast\(prompt, 'recommendation'\)/);
assert.match(groups,/luckybean:user-notice/);
assert.ok(groups.includes("detail: { message: text, kind: kind || 'status-neutral' }"),'group controller must delegate toast rendering to the canonical app notice channel');
assert.ok(!groups.includes("setTimeout(() => { node.className = 'toast'; }, 2800)"),'group controller must not own a competing toast timer');
assert.doesNotMatch(groups,/toast\(`已选：/,'grouped selection owner must never overwrite the fun prompt with a bean-result toast');

for(const source of [
  "if (mode === 'leaderboard') return [...beans].sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0))[0];",
  "if (mode === 'freshness') return [...beans].sort((a, b) => Number(freshnessProfile(b).flavorScore || 0) - Number(freshnessProfile(a).flavorScore || 0))[0];",
  "if (mode === 'price') return [...beans].sort((a, b) => Number(b.price || 0) - Number(a.price || 0))[0];",
  "if (mode === 'remaining') return [...beans].sort((a, b) => Number(a.remainingWeight || 0) - Number(b.remainingWeight || 0))[0];",
  "const rounds = Math.floor(Math.random() * 5) + 4;",
  "await animateBean(selected, index, { persist: step === rounds - 1, duration: step === rounds - 1 ? 820 : 420 });",
  "await animateBean(selected, index, { persist: true, duration: 820 });",
  "runRecommendation(recommendation.dataset.recommendMode).catch(error => toast(error.message, 'status-bad'));"
]) assert.ok(groups.includes(source),`selection/group behavior changed unexpectedly: ${source}`);

assert.match(runtime,/BEAN_GROUP_RUNTIME_REVISION = '1\.24B-main\.17-single-toast-owner'/);
assert.match(runtime,/pinnedFeature\('bean-groups', '\.\.\/bean-groups-controller\.js', BEAN_GROUP_RUNTIME_REVISION\)/);
assert.match(index,/runtime-features\.js\?v=1\.24B-main\.17-single-toast-owner/);
assert.doesNotMatch(guard,/RECOMMENDATION_PROMPTS|lbRecommendationToast|showRecommendationPromptForMode|directPromptLockUntil/);
assert.doesNotMatch(app,/toast\(prompt \|\| `已选：\$\{beanDisplayName\(selected\)\}`/);
assert.match(app,/clearTimeout\(toastTimer\)/);
assert.match(app,/clearTimeout\(toastCleanupTimer\)/);
assert.match(app,/toastTimer = setTimeout\(\(\) => node\.classList\.remove\('show'\), 6000\)/);

console.log('LuckyBean fun recommendation prompt contract passed: original fun library restored in the real grouped-selection owner; five-mode selection/grouping mechanics unchanged; duplicate 已选 result toast removed; one canonical app toast owner controls all timers; corrected owner cache is pinned');
