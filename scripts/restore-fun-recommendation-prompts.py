from pathlib import Path
import re

controller_path = Path('src/bean-groups-controller.js')
controller = controller_path.read_text()

marker = "  const SELECTED_KEY = 'luckybean.selected.bean.v098';\n"
prompt_block = """  const RECOMMENDATION_PROMPTS = Object.freeze({
    leaderboard: [
      '直取榜首，不问其余。', '依榜索魁，必得佳味。', '榜单在前，今朝且试头筹。',
      '榜魁已定，此只风味精绝，不负众望。', '一举摘魁，恰逢此豆风味正酣。',
      '众里寻它，终得榜首，宜细细品之。', '照榜点将，专挑那个第一名！'
    ],
    freshness: [
      '此只风味精绝，君既选中，甚是妥当。', '正逢此只风味最盛，您这一选，再好不过。',
      '此只正值风味精妙处，既已选定，便是良配。', '此只正得意时，恰被君眼相中，眼光不差。'
    ],
    price: [
      '此只价冠诸豆，足见君之慧眼独钟。', '此只乃众豆之魁，承君青睐，身价自高。',
      '此只位列首席，价亦昂，唯君堪配此味。', '既择此只风骨，当知众豆之中，以此最为矜贵。'
    ],
    remaining: [
      '余粒无多，宜趁兴饮尽，为此豆作结。', '所剩几何，当及时啜饮，不负此豆风华。',
      '残豆将尽，速饮之，好与此只从容作别。', '此豆见底啦，趁风味未散，快快饮尽收场！'
    ],
    random: [
      '闭目拈签，任其自然。', '信手拈签，以定今日之选。', '且凭一签，决此豆归谁。',
      '一签落地，此只当归于君。', '签指此只，风味正酣，君可安心享之。',
      '得此签，恰逢余粒无几，缘分也。', '伸手拈一签，看天意选哪只！'
    ]
  });
  const recommendationPromptMemory = Object.create(null);

  function recommendationPrompt(mode) {
    const pool = RECOMMENDATION_PROMPTS[mode] || [];
    if (!pool.length) return '';
    const previous = recommendationPromptMemory[mode] || '';
    const choices = pool.filter(value => value !== previous);
    const selected = choices[Math.floor(Math.random() * choices.length)] || pool[0];
    recommendationPromptMemory[mode] = selected;
    return selected;
  }
"""

if 'const RECOMMENDATION_PROMPTS = Object.freeze({' not in controller:
    if controller.count(marker) != 1:
        raise SystemExit(f'expected one SELECTED_KEY marker, found {controller.count(marker)}')
    controller = controller.replace(marker, marker + prompt_block, 1)

old_result = "      toast(`已选：${labelFor(index, 'countries', selected.countryCode, '未定国家')} · ${labelFor(index, 'varieties', selected.varietyCode, '未定豆种')}`, 'recommendation');"
new_result = """      const prompt = recommendationPrompt(mode);
      document.dispatchEvent(new CustomEvent('luckybean:recommendation-prompt', { detail: { mode, prompt, beanId: selected?.id || '' } }));
      toast(prompt, 'recommendation');"""
if old_result in controller:
    controller = controller.replace(old_result, new_result, 1)
elif new_result not in controller:
    raise SystemExit('recommendation result toast owner block not found')

# Critical no-regression checks: current grouped selection mechanics stay byte-for-byte recognizable.
required_selection_contract = [
    "if (mode === 'leaderboard') return [...beans].sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0))[0];",
    "if (mode === 'freshness') return [...beans].sort((a, b) => Number(freshnessProfile(b).flavorScore || 0) - Number(freshnessProfile(a).flavorScore || 0))[0];",
    "if (mode === 'price') return [...beans].sort((a, b) => Number(b.price || 0) - Number(a.price || 0))[0];",
    "if (mode === 'remaining') return [...beans].sort((a, b) => Number(a.remainingWeight || 0) - Number(b.remainingWeight || 0))[0];",
    "const rounds = Math.floor(Math.random() * 5) + 4;",
    "await animateBean(selected, index, { persist: step === rounds - 1, duration: step === rounds - 1 ? 820 : 420 });",
    "await animateBean(selected, index, { persist: true, duration: 820 });",
    "event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();",
    "runRecommendation(recommendation.dataset.recommendMode).catch(error => toast(error.message, 'status-bad'));",
]
for source in required_selection_contract:
    if source not in controller:
        raise SystemExit(f'current selection/group contract unexpectedly changed: {source}')
if '已选：${labelFor' in controller:
    raise SystemExit('duplicate selection result toast still present')
controller_path.write_text(controller)

# Browser contract: restore exact original freshness fun pool, not the short semantic label.
spec_path = Path('tests/v124b-selection-mode-single-group.spec.mjs')
spec = spec_path.read_text()
spec = spec.replace(
    "const FRESHNESS_PROMPT='赏味期（剩余越少越靠前）';",
    """const FRESHNESS_PROMPTS=[
  '此只风味精绝，君既选中，甚是妥当。',
  '正逢此只风味最盛，您这一选，再好不过。',
  '此只正值风味精妙处，既已选定，便是良配。',
  '此只正得意时，恰被君眼相中，眼光不差。'
];"""
)
spec = spec.replace("expect(promptText).toBe(FRESHNESS_PROMPT);", "expect(FRESHNESS_PROMPTS).toContain(promptText);\n  expect(promptText).not.toMatch(/^已选[:：]/);")
spec_path.write_text(spec)

# Static prompt contract follows the actual runtime owner and protects all current selection mechanics.
regression_path = Path('tests/v124b-recommendation-prompt-regression.mjs')
regression_path.write_text("""import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('src/app.js','utf8');
const groups=fs.readFileSync('src/bean-groups-controller.js','utf8');
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
assert.doesNotMatch(groups,/toast\(`已选：/,'grouped selection owner must never overwrite the fun prompt with a bean-result toast');

// Existing five-mode algorithms and grouped animation remain untouched.
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
assert.match(groups,/const recommendation = event\.target\.closest\?\.\('\[data-recommend-mode\]'\)/);
assert.match(groups,/event\.preventDefault\(\); event\.stopPropagation\(\); event\.stopImmediatePropagation\(\);/);

// Prompt UI remains the single shared #toast; no mirror layer is reintroduced.
assert.doesNotMatch(guard,/RECOMMENDATION_PROMPTS|lbRecommendationToast|showRecommendationPromptForMode|directPromptLockUntil/);
assert.doesNotMatch(app,/toast\(prompt \|\| `已选：\$\{beanDisplayName\(selected\)\}`/);

console.log('LuckyBean fun recommendation prompt contract passed: original fun library restored in the real grouped-selection owner; five-mode selection/grouping mechanics unchanged; duplicate 已选 result toast removed');
""")
