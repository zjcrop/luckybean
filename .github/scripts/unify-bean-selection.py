from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)


def regex_once(text, pattern, repl, label, flags=0):
    out, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 regex match, got {count}')
    return out

app_path = Path('src/app.js')
app = app_path.read_text(encoding='utf-8')

if 'recommendationExpandedAll' in app or 'recommendation-all-groups' in app:
    raise SystemExit('obsolete all-groups recommendation path still present')

pattern = (
    r"(async function focusRecommendedBean\(bean, \{ automatic = true, settle = true, openDetail = false, duration = 800 \} = \{\}\) \{\n"
    r"  if \(!bean\) return;\n)"
    r".*?"
    r"(  await new Promise\(resolve => requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)\);)"
)
replacement = (
    r"\1"
    "  state.groupAnimationMode = automatic ? 'auto' : 'manual';\n"
    "  state.recommendedBeanId = bean.id;\n"
    "  openBeanGroup(groupKey(bean, state.settings.groupMethod || 'country'), { animation: state.groupAnimationMode });\n"
    r"\2"
)
app = regex_once(app, pattern, replacement, 'canonical single-group recommendation focus', flags=re.S)

app = re.sub(r"\['price', '价冠', '#[0-9A-Fa-f]{6}', false\]", "['price', '价冠', '#000000', false]", app, count=1)
app = re.sub(r"\['remaining', '拾余', '#[0-9A-Fa-f]{6}', false\]", "['remaining', '拾余', '#808080', false]", app, count=1)
app = app.replace("codeName('processes', bean.processCode, '未记录工法')", "codeName('processes', bean.processCode, '未记录处理法')")

required = [
    "openBeanGroup(groupKey(bean, state.settings.groupMethod || 'country'), { animation: state.groupAnimationMode });",
    "['price', '价冠', '#000000', false]",
    "['remaining', '拾余', '#808080', false]"
]
for marker in required:
    if marker not in app:
        raise SystemExit(f'missing canonical marker: {marker}')
focus = app[app.index('async function focusRecommendedBean'):app.index('async function focusRecommendedBean') + 1400]
if 'const visible = filteredBeans();' in focus or 'visible.length' in focus:
    raise SystemExit('bean-count recommendation branch still present')
app_path.write_text(app, encoding='utf-8')

policy_path = Path('src/features/release-1.24b-ui-policy.js')
policy = policy_path.read_text(encoding='utf-8')
policy = replace_once(
    policy,
    "      /* 豆藏 keeps the compact personal leaderboard immediately after the digest. */\n      .preference-board-strip {\n        display: flex;\n      }",
    "      /* Retired preference leaderboard must never re-enter the bean page. */\n      .preference-board-strip {\n        display: none !important;\n      }",
    'retire stale leaderboard policy'
)
policy = replace_once(
    policy,
    "      /* Expanded bean groups end with card content. Folder closing is state-driven, not a hidden button. */\n      #beanGroups .active-group-panel {\n        min-height: 0 !important;\n        padding-bottom: 0 !important;\n      }",
    "      /* Every group renderer ends with the same normal-flow blank close surface. */\n      #beanGroups .active-group-panel { min-height: 0 !important; padding-bottom: 0 !important; }\n      #beanGroups .bean-group-dismiss-surface {\n        display: block !important; width: 100% !important; min-height: clamp(100px, 16vh, 160px) !important;\n        padding: 0 !important; border: 0 !important; background: transparent !important; box-shadow: none !important;\n      }",
    'canonical blank close surface policy'
)
policy = replace_once(
    policy,
    "          font-size: clamp(1.22rem, 5.2vw, 1.55rem) !important;\n          line-height: 1.25 !important;\n          font-weight: 700 !important;",
    "          font-size: .94rem !important;\n          line-height: 1.38 !important;\n          font-weight: 600 !important;",
    'mobile stock summary size'
)
policy_path.write_text(policy, encoding='utf-8')

release_path = Path('.github/workflows/build-main.yml')
release = release_path.read_text(encoding='utf-8')
release = release.replace(
    "          grep -Fq 'api.closeActiveGroup' src/features/release-1.24b-group-navigation.js",
    "          grep -Fq 'LuckyBeanBeanGroupState' src/features/release-1.24b-group-navigation.js"
)
release = release.replace(
    "          unzip -p \"$apk\" assets/web-cache/src/features/release-1.24b-group-navigation.js | grep -Fq 'api.closeActiveGroup'",
    "          unzip -p \"$apk\" assets/web-cache/src/features/release-1.24b-group-navigation.js | grep -Fq 'LuckyBeanBeanGroupState'"
)
if 'api.closeActiveGroup' in release:
    raise SystemExit('stale release group-navigation contract still present')
release_path.write_text(release, encoding='utf-8')

print('Single-group recommendation behavior, selection colors, UI policy and signed-release contract are canonical.')
