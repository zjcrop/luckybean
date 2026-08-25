from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


# Complete the shared state with mode ownership so native and special renderers can close
# through the same state without drawing each other's views during Back navigation.
state_path = ROOT / "src/domain/beans/bean-group-state.js"
state_path.write_text("""export const beanGroupState = { mode: 'native', groupKey: '' };

export function setBeanGroupMode(mode) {
  const next = String(mode || 'native');
  if (beanGroupState.mode !== next) beanGroupState.groupKey = '';
  beanGroupState.mode = next;
  return beanGroupState.mode;
}

export function hasActiveBeanGroup() {
  return Boolean(beanGroupState.groupKey);
}

export function openBeanGroupState(groupKey) {
  beanGroupState.groupKey = String(groupKey || '');
  return beanGroupState.groupKey;
}

export function closeBeanGroupState() {
  const changed = Boolean(beanGroupState.groupKey);
  beanGroupState.groupKey = '';
  return changed;
}
""", encoding="utf-8")

app_path = ROOT / "src/app.js"
app = app_path.read_text(encoding="utf-8")
app = replace_once(
    app,
    "import { beanGroupState, openBeanGroupState, closeBeanGroupState, hasActiveBeanGroup } from './domain/beans/bean-group-state.js';",
    "import { beanGroupState, setBeanGroupMode, openBeanGroupState, closeBeanGroupState, hasActiveBeanGroup } from './domain/beans/bean-group-state.js';",
    "app mode import",
)
app = replace_once(
    app,
    "  state.groupAnimationMode = animation;\n  state.recommendationExpandedAll = false;\n  openBeanGroupState(key);",
    "  state.groupAnimationMode = animation;\n  state.recommendationExpandedAll = false;\n  setBeanGroupMode('native');\n  openBeanGroupState(key);",
    "native mode open",
)
app = replace_once(
    app,
    "  closeBeanGroupState();\n  if (render) renderBeans();\n  document.dispatchEvent(new CustomEvent('luckybean:bean-group-closed'));",
    "  const mode = beanGroupState.mode;\n  closeBeanGroupState();\n  if (render && mode === 'native') renderBeans();\n  document.dispatchEvent(new CustomEvent('luckybean:bean-group-closed', { detail: { mode, source: 'canonical' } }));",
    "mode-aware canonical close",
)
app_path.write_text(app, encoding="utf-8")

controller_path = ROOT / "src/bean-groups-controller.js"
controller = controller_path.read_text(encoding="utf-8")
controller = replace_once(
    controller,
    "import { beanGroupState } from './domain/beans/bean-group-state.js';",
    "import { beanGroupState, setBeanGroupMode, openBeanGroupState, closeBeanGroupState } from './domain/beans/bean-group-state.js';",
    "controller mode import",
)
controller = replace_once(
    controller,
    "    return currentMode;\n  }\n\n  async function saveMode(mode) {",
    "    setBeanGroupMode(currentMode);\n    return currentMode;\n  }\n\n  async function saveMode(mode) {",
    "initial mode sync",
)
controller = replace_once(
    controller,
    "  async function saveMode(mode) {\n    currentMode = mode;\n    beanGroupState.groupKey = '';",
    "  async function saveMode(mode) {\n    currentMode = mode;\n    setBeanGroupMode(mode);",
    "save mode sync",
)
controller = controller.replace("if (beanGroupState.groupKey && !groups.some(group => group.key === beanGroupState.groupKey)) beanGroupState.groupKey = '';", "if (beanGroupState.groupKey && !groups.some(group => group.key === beanGroupState.groupKey)) closeBeanGroupState();")
controller = replace_once(
    controller,
    "    beanGroupState.groupKey = '';\n    const container = $('#beanGroups');",
    "    closeBeanGroupState();\n    const container = $('#beanGroups');",
    "special close state",
)
controller = replace_once(
    controller,
    "    beanGroupState.groupKey = mode === MODE_FRESHNESS ? freshnessStage(bean) : String(Math.floor(Math.max(0, Number(bean.remainingWeight || 0)) / 50) * 50);",
    "    openBeanGroupState(mode === MODE_FRESHNESS ? freshnessStage(bean) : String(Math.floor(Math.max(0, Number(bean.remainingWeight || 0)) / 50) * 50));",
    "recommendation special open",
)
controller = replace_once(
    controller,
    "      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); beanGroupState.groupKey = group.dataset.v099tOpenGroup;",
    "      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); openBeanGroupState(group.dataset.v099tOpenGroup);",
    "special card open",
)
controller = replace_once(
    controller,
    "    document.dispatchEvent(new CustomEvent('luckybean:bean-group-closed'));\n    return true;",
    "    document.dispatchEvent(new CustomEvent('luckybean:bean-group-closed', { detail: { mode: currentMode || MODE_NATIVE, source: 'special' } }));\n    return true;",
    "special close event",
)
anchor = "  const prewarm = () => loadData().catch(() => {});"
listener = """  document.addEventListener('luckybean:bean-group-closed', event => {
    if (event.detail?.source === 'special') return;
    const mode = currentMode || MODE_NATIVE;
    if (![MODE_FRESHNESS, MODE_REMAINING].includes(mode)) return;
    const container = $('#beanGroups');
    if (container) delete container.dataset.v099tGroupKey;
    render({ force: true, refreshData: true }).catch(error => console.warn('特殊分组关闭后重绘失败', error));
  });

  const prewarm = () => loadData().catch(() => {});"""
controller = replace_once(controller, anchor, listener, "special close rerender")
controller_path.write_text(controller, encoding="utf-8")

# Tighten static contracts: capture:true is still legitimate for unrelated change listeners;
# only the old DOM-inference/synthetic-close mechanisms are forbidden.
for filename in [
    "tests/v123d-deployment-contracts.mjs",
    "tests/v124b-final-release-contract.mjs",
    "tests/v124b-complete-plan-contract.mjs",
    "tests/v124b-ui-policy-regression.mjs",
]:
    path = ROOT / filename
    text = path.read_text(encoding="utf-8").replace("|capture:true", "")
    text = text.replace("export const beanGroupState = \\{ groupKey: '' \\}", "export const beanGroupState = \\{ mode: 'native', groupKey: '' \\}")
    if "assert.match(beanGroupState, /setBeanGroupMode/);" not in text and "assert.match(beanGroupState, /openBeanGroupState/);" in text:
        text = text.replace("assert.match(beanGroupState, /openBeanGroupState/);", "assert.match(beanGroupState, /setBeanGroupMode/);\nassert.match(beanGroupState, /openBeanGroupState/);")
    path.write_text(text, encoding="utf-8")

print("mode-aware canonical bean group state finalized")
