from pathlib import Path

path = Path('.github/workflows/deploy-main.yml')
text = path.read_text()

text = text.replace(
    '  STYLES_RUNTIME_REVISION: 1.24B-main.13-local-menu-prompt\n',
    "  STYLES_RUNTIME_REVISION: 1.24B-main.13-local-menu-prompt\n  GROUP_PROMPT_RUNTIME_REVISION: 1.24B-main.16-fun-prompt-owner\n",
    1,
)
text = text.replace(
    '"recommendationPrompt":"legacy-short-reminder-current-mode-adapter"',
    '"recommendationPrompt":"original-fun-library-grouped-selection-owner"',
)
text = text.replace(
    '"appModuleRevision":"1.24B-main.15-reminder-trigger","stylesRevision"',
    '"appModuleRevision":"1.24B-main.15-reminder-trigger","groupPromptOwnerRevision":"1.24B-main.16-fun-prompt-owner","stylesRevision"',
)
text = text.replace(
    '"app_module_revision":"1.24B-main.15-reminder-trigger","styles_revision"',
    '"app_module_revision":"1.24B-main.15-reminder-trigger","group_prompt_owner_revision":"1.24B-main.16-fun-prompt-owner","styles_revision"',
)
text = text.replace(
    '"recommendation_prompt":"legacy-short-reminder-current-mode-adapter"',
    '"recommendation_prompt":"original-fun-library-grouped-selection-owner"',
)

source_marker = "          grep -Fq 'beanGroupState' src/bean-groups-controller.js\n"
source_checks = """          grep -Fq 'const RECOMMENDATION_PROMPTS = Object.freeze' src/bean-groups-controller.js
          grep -Fq '直取榜首，不问其余。' src/bean-groups-controller.js
          grep -Fq '此只风味精绝，君既选中，甚是妥当。' src/bean-groups-controller.js
          grep -Fq '此只价冠诸豆，足见君之慧眼独钟。' src/bean-groups-controller.js
          grep -Fq '余粒无多，宜趁兴饮尽，为此豆作结。' src/bean-groups-controller.js
          grep -Fq '闭目拈签，任其自然。' src/bean-groups-controller.js
          grep -Fq 'const prompt = recommendationPrompt(mode)' src/bean-groups-controller.js
          grep -Fq "toast(prompt, 'recommendation')" src/bean-groups-controller.js
          grep -Fq 'luckybean:recommendation-prompt' src/bean-groups-controller.js
          ! grep -Fq 'toast(`已选：' src/bean-groups-controller.js
          grep -Fq "BEAN_GROUP_RUNTIME_REVISION = '1.24B-main.16-fun-prompt-owner'" src/features/runtime-features.js
          grep -Fq "pinnedFeature('bean-groups', '../bean-groups-controller.js', BEAN_GROUP_RUNTIME_REVISION)" src/features/runtime-features.js
          grep -Fq 'runtime-features.js?v=1.24B-main.16-fun-prompt-owner' index.html
"""
if source_checks not in text:
    if source_marker not in text:
        raise SystemExit('source gate insertion marker not found')
    text = text.replace(source_marker, source_checks + source_marker, 1)

# Verify the published runtime-features loader and actual grouped selection owner, not only app.js.
curl_marker = '            curl -L -fsS "$base/src/bean-groups-controller.js?v=1.24B-main.6" -o /tmp/bean-groups.js || true\n'
new_curl = '            curl -L -fsS "$base/src/features/runtime-features.js?v=$GROUP_PROMPT_RUNTIME_REVISION" -o /tmp/runtime-features.js || true\n            curl -L -fsS "$base/src/bean-groups-controller.js?v=$GROUP_PROMPT_RUNTIME_REVISION" -o /tmp/bean-groups.js || true\n'
if curl_marker in text:
    text = text.replace(curl_marker, new_curl, 1)
elif new_curl not in text:
    raise SystemExit('published bean-group curl marker not found')

text = text.replace(
    '              && grep -Fq \'"recommendationPrompt":"legacy-short-reminder-current-mode-adapter"\' /tmp/version.json \\\n',
    '              && grep -Fq \'"recommendationPrompt":"original-fun-library-grouped-selection-owner"\' /tmp/version.json \\\n',
)

verify_marker = "              && grep -Fq 'LuckyBeanBeanGroupState' /tmp/group-navigation-runtime.js; then\n"
verify_checks = """              && grep -Fq "BEAN_GROUP_RUNTIME_REVISION = '1.24B-main.16-fun-prompt-owner'" /tmp/runtime-features.js \\
              && grep -Fq "pinnedFeature('bean-groups', '../bean-groups-controller.js', BEAN_GROUP_RUNTIME_REVISION)" /tmp/runtime-features.js \\
              && grep -Fq 'const RECOMMENDATION_PROMPTS = Object.freeze' /tmp/bean-groups.js \\
              && grep -Fq '直取榜首，不问其余。' /tmp/bean-groups.js \\
              && grep -Fq '此只风味精绝，君既选中，甚是妥当。' /tmp/bean-groups.js \\
              && grep -Fq '此只价冠诸豆，足见君之慧眼独钟。' /tmp/bean-groups.js \\
              && grep -Fq '余粒无多，宜趁兴饮尽，为此豆作结。' /tmp/bean-groups.js \\
              && grep -Fq '闭目拈签，任其自然。' /tmp/bean-groups.js \\
              && grep -Fq 'const prompt = recommendationPrompt(mode)' /tmp/bean-groups.js \\
              && grep -Fq "toast(prompt, 'recommendation')" /tmp/bean-groups.js \\
              && ! grep -Fq 'toast(`已选：' /tmp/bean-groups.js \\
"""
if verify_checks not in text:
    if verify_marker not in text:
        raise SystemExit('published runtime insertion marker not found')
    text = text.replace(verify_marker, verify_checks + verify_marker, 1)

old_expected = """          const expectedPrompts = {
            leaderboard: '喜好（咖啡得分）',
            freshness: '赏味期（剩余越少越靠前）',
            price: '价格（越高越推荐）',
            remaining: '余粮（剩余越少越推荐）'
          };
          const rejectedPrompts = [
            '直取榜首，不问其余。',
            '此只风味精绝，君既选中，甚是妥当。',
            '此只价冠诸豆，足见君之慧眼独钟。',
            '余粒无多，宜趁兴饮尽，为此豆作结。',
            '闭目拈签，任其自然。'
          ];
          const promptMatches = (mode, text) => mode === 'random' ? /^点兵点将→.+/.test(text) : text === expectedPrompts[mode];
"""
new_expected = """          const expectedPrompts = {
            leaderboard: ['直取榜首，不问其余。','依榜索魁，必得佳味。','榜单在前，今朝且试头筹。','榜魁已定，此只风味精绝，不负众望。','一举摘魁，恰逢此豆风味正酣。','众里寻它，终得榜首，宜细细品之。','照榜点将，专挑那个第一名！'],
            freshness: ['此只风味精绝，君既选中，甚是妥当。','正逢此只风味最盛，您这一选，再好不过。','此只正值风味精妙处，既已选定，便是良配。','此只正得意时，恰被君眼相中，眼光不差。'],
            price: ['此只价冠诸豆，足见君之慧眼独钟。','此只乃众豆之魁，承君青睐，身价自高。','此只位列首席，价亦昂，唯君堪配此味。','既择此只风骨，当知众豆之中，以此最为矜贵。'],
            remaining: ['余粒无多，宜趁兴饮尽，为此豆作结。','所剩几何，当及时啜饮，不负此豆风华。','残豆将尽，速饮之，好与此只从容作别。','此豆见底啦，趁风味未散，快快饮尽收场！'],
            random: ['闭目拈签，任其自然。','信手拈签，以定今日之选。','且凭一签，决此豆归谁。','一签落地，此只当归于君。','签指此只，风味正酣，君可安心享之。','得此签，恰逢余粒无几，缘分也。','伸手拈一签，看天意选哪只！']
          };
          const rejectedPrompts = ['喜好（咖啡得分）','赏味期（剩余越少越靠前）','价格（越高越推荐）','余粮（剩余越少越推荐）','点兵点将'];
          const promptMatches = (mode, text) => Array.isArray(expectedPrompts[mode]) && expectedPrompts[mode].includes(text);
"""
if old_expected in text:
    text = text.replace(old_expected, new_expected, 1)
elif new_expected not in text:
    raise SystemExit('live expected prompt block not found')

old_wait = """              const matches=mode==='random' ? /^点兵点将→.+/.test(text) : text===expected;
              return event?.mode===mode && event?.prompt===text && matches && node?.classList.contains('recommendation') && node?.classList.contains('show');
            }, {mode,expected:expectedPrompts[mode]||''}, { timeout:5000 });
"""
new_wait = """              const matches=Array.isArray(expected) && expected.includes(text);
              return event?.mode===mode && event?.prompt===text && matches && node?.classList.contains('recommendation') && node?.classList.contains('show');
            }, {mode,expected:expectedPrompts[mode]||[]}, { timeout:5000 });
"""
if old_wait in text:
    text = text.replace(old_wait, new_wait, 1)
elif new_wait not in text:
    raise SystemExit('live prompt wait block not found')

# The no-result contract remains explicit: any 已选：... appearance after a mode click fails verification.
if "const noBeanResult=recentTimeline.every(item => !/^已选[:：]/.test(item.text));" not in text:
    raise SystemExit('live duplicate result rejection disappeared')

path.write_text(text)
