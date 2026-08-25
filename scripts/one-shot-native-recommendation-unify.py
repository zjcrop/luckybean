from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one occurrence, found {count}')
    return text.replace(old, new, 1)


app_path = Path('src/app.js')
app = app_path.read_text(encoding='utf-8')

app = replace_once(
    app,
    "recommendationTimer: null, recommendationRun: false, recommendationExpandedAll: false, recommendationPromptMemory: {},",
    "recommendationTimer: null, recommendationRun: false, recommendationPromptMemory: {},",
    'remove obsolete recommendationExpandedAll state'
)

reset_line = "  state.recommendationExpandedAll = false;\n"
reset_count = app.count(reset_line)
if reset_count != 3:
    raise SystemExit(f'recommendationExpandedAll resets: expected 3 occurrences, found {reset_count}')
app = app.replace(reset_line, '')

app = replace_once(
    app,
    "  const changed = hasActiveBeanGroup() || state.recommendationExpandedAll;",
    "  const changed = hasActiveBeanGroup();",
    'canonical close changed predicate'
)

all_groups_start = "  if (state.recommendationExpandedAll) {\n"
all_groups_end = "  if (!state.activeGroupKey) {\n"
start = app.find(all_groups_start)
end = app.find(all_groups_end, start + 1)
if start < 0 or end < 0:
    raise SystemExit('obsolete all-groups render branch not found')
obsolete_block = app[start:end]
for marker in ('recommendation-all-groups', 'data-all-groups', 'recommendation-group'):
    if marker not in obsolete_block:
        raise SystemExit(f'obsolete all-groups block missing marker: {marker}')
app = app[:start] + app[end:]

app = replace_once(
    app,
    "  state.recommendationExpandedAll = beans.length > 6;\n  state.activeGroupKey = null;\n  state.groupAnimationMode = 'auto';\n  renderBeans();\n  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));\n  let selected;",
    "  state.groupAnimationMode = 'auto';\n  let selected;",
    'recommendation pre-expansion removal'
)

app = replace_once(
    app,
    "  const visible = filteredBeans();\n  state.recommendationExpandedAll = visible.length > 6;\n  state.activeGroupKey = null;\n  state.recommendedBeanId = bean.id;\n  renderBeans();",
    "  const visible = filteredBeans();\n  state.recommendedBeanId = bean.id;\n  if (visible.length > 6) {\n    setBeanGroupMode('native');\n    openBeanGroupState(groupKey(bean, state.settings.groupMethod || 'country'));\n  } else {\n    closeBeanGroupState();\n  }\n  renderBeans();",
    'native recommendation single-group focus'
)

app = replace_once(
    app,
    "['price', '价冠', '#c9a45f', false], ['remaining', '拾余', '#f1f1ed', false]",
    "['price', '价冠', '#000000', false], ['remaining', '拾余', '#808080', false]",
    'recommendation dot colors'
)

for forbidden in ('recommendationExpandedAll', 'recommendation-all-groups', 'data-all-groups'):
    if forbidden in app:
        raise SystemExit(f'obsolete native recommendation state remains: {forbidden}')
required = (
    "openBeanGroupState(groupKey(bean, state.settings.groupMethod || 'country'))",
    "['price', '价冠', '#000000', false]",
    "['remaining', '拾余', '#808080', false]",
)
for marker in required:
    if marker not in app:
        raise SystemExit(f'new native recommendation contract missing: {marker}')
app_path.write_text(app, encoding='utf-8')

workflow_path = Path('.github/workflows/build-main.yml')
workflow = workflow_path.read_text(encoding='utf-8')
old_source_gate = """          grep -Fq 'async function closeActiveGroup' src/bean-groups-controller.js
          ! grep -Fq 'data-v099t-group-back' src/bean-groups-controller.js
          grep -Fq 'api.closeActiveGroup' src/features/release-1.24b-group-navigation.js
          ! grep -Fq 'data-v099t-group-back' src/features/release-1.24b-group-navigation.js
"""
new_source_gate = """          grep -Fq \"beanGroupState, setBeanGroupMode, openBeanGroupState, closeBeanGroupState\" src/bean-groups-controller.js
          ! grep -Fq 'let activeGroup' src/bean-groups-controller.js
          grep -Fq 'LuckyBeanBeanGroupState' src/features/release-1.24b-group-navigation.js
          ! grep -Fq 'dispatchEvent(new MouseEvent' src/features/release-1.24b-group-navigation.js
          grep -Fq 'data-close-bean-group' src/app.js
          ! grep -Fq 'recommendationExpandedAll' src/app.js
          ! grep -Fq 'recommendation-all-groups' src/app.js
"""
workflow = replace_once(workflow, old_source_gate, new_source_gate, 'release source canonical group gate')

old_apk_gate = """          unzip -p \"$apk\" assets/web-cache/src/bean-groups-controller.js | grep -Fq 'async function closeActiveGroup'
          ! unzip -p \"$apk\" assets/web-cache/src/bean-groups-controller.js | grep -Fq 'data-v099t-group-back'
          unzip -p \"$apk\" assets/web-cache/src/features/release-1.24b-group-navigation.js | grep -Fq 'api.closeActiveGroup'
          ! unzip -p \"$apk\" assets/web-cache/src/features/release-1.24b-group-navigation.js | grep -Fq 'data-v099t-group-back'
"""
new_apk_gate = """          unzip -p \"$apk\" assets/web-cache/src/bean-groups-controller.js | grep -Fq \"beanGroupState, setBeanGroupMode, openBeanGroupState, closeBeanGroupState\"
          ! unzip -p \"$apk\" assets/web-cache/src/bean-groups-controller.js | grep -Fq 'let activeGroup'
          unzip -p \"$apk\" assets/web-cache/src/features/release-1.24b-group-navigation.js | grep -Fq 'LuckyBeanBeanGroupState'
          ! unzip -p \"$apk\" assets/web-cache/src/features/release-1.24b-group-navigation.js | grep -Fq 'dispatchEvent(new MouseEvent'
          unzip -p \"$apk\" assets/web-cache/src/app.js | grep -Fq 'data-close-bean-group'
          ! unzip -p \"$apk\" assets/web-cache/src/app.js | grep -Fq 'recommendationExpandedAll'
          ! unzip -p \"$apk\" assets/web-cache/src/app.js | grep -Fq 'recommendation-all-groups'
"""
workflow = replace_once(workflow, old_apk_gate, new_apk_gate, 'release APK canonical group gate')
workflow_path.write_text(workflow, encoding='utf-8')

print('native recommendation grouping unified; dot colors and signed-release canonical gates updated')
