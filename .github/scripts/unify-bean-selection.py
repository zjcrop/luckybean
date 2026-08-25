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

# Remove the obsolete all-groups recommendation state completely.
app = replace_once(
    app,
    "groupAnimationMode: 'manual', recommendationTimer: null, recommendationRun: false, recommendationExpandedAll: false, recommendationPromptMemory:",
    "groupAnimationMode: 'manual', recommendationTimer: null, recommendationRun: false, recommendationPromptMemory:",
    'remove recommendationExpandedAll state'
)
app = app.replace("  state.recommendationExpandedAll = false;\n", '')
app = replace_once(
    app,
    "  const changed = hasActiveBeanGroup() || state.recommendationExpandedAll;",
    "  const changed = hasActiveBeanGroup();",
    'canonical close changed predicate'
)

app = regex_once(
    app,
    r"\n  if \(state\.recommendationExpandedAll\) \{.*?\n    return;\n  \}\n  if \(!state\.activeGroupKey\)",
    "\n  if (!state.activeGroupKey)",
    'remove all-groups renderer',
    flags=re.S
)

app = replace_once(
    app,
    "  state.recommendationRun = true;\n  state.recommendationExpandedAll = beans.length > 6;\n  state.activeGroupKey = null;\n  state.groupAnimationMode = 'auto';\n  renderBeans();\n  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));",
    "  state.recommendationRun = true;\n  state.groupAnimationMode = 'auto';",
    'remove recommendation all-group pre-render'
)

app = replace_once(
    app,
    "  state.groupAnimationMode = automatic ? 'auto' : 'manual';\n  const visible = filteredBeans();\n  state.recommendationExpandedAll = visible.length > 6;\n  state.activeGroupKey = null;\n  state.recommendedBeanId = bean.id;\n  renderBeans();",
    "  state.groupAnimationMode = automatic ? 'auto' : 'manual';\n  state.recommendedBeanId = bean.id;\n  openBeanGroup(groupKey(bean, state.settings.groupMethod || 'country'), { animation: state.groupAnimationMode });",
    'focus recommendation into one native group'
)

app = replace_once(
    app,
    "['price', '价冠', '#c9a45f', false], ['remaining', '拾余', '#f1f1ed', false]",
    "['price', '价冠', '#000000', false], ['remaining', '拾余', '#77736c', false]",
    'recommendation dot colors'
)
app = app.replace("codeName('processes', bean.processCode, '未记录工法')", "codeName('processes', bean.processCode, '未记录处理法')")

if 'recommendationExpandedAll' in app:
    raise SystemExit('obsolete recommendationExpandedAll still present in app.js')
if "openBeanGroup(groupKey(bean, state.settings.groupMethod || 'country')" not in app:
    raise SystemExit('canonical single-group recommendation target missing')
app_path.write_text(app, encoding='utf-8')

policy_path = Path('src/features/release-1.24b-ui-policy.js')
policy = policy_path.read_text(encoding='utf-8')
policy = replace_once(
    policy,
    "      /* 豆藏 keeps the compact personal leaderboard immediately after the digest. */\n      .preference-board-strip {\n        display: flex;\n      }",
    "      /* The retired personal leaderboard must not re-enter the bean page. */\n      .preference-board-strip {\n        display: none !important;\n      }",
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

print('Canonical bean selection grouping, UI colors/policy, and signed-release contract updated.')
