from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


state_path = ROOT / "src/domain/beans/bean-group-state.js"
state_path.write_text(
    """export const beanGroupState = { groupKey: '' };

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
""",
    encoding="utf-8",
)

app_path = ROOT / "src/app.js"
app = app_path.read_text(encoding="utf-8")
app = replace_once(
    app,
    "import { buildBeanConsumptionSummary, DEFAULT_CAFFEINE_HEALTH_SETTINGS } from './domain/beans/bean-consumption-summary.js';",
    "import { buildBeanConsumptionSummary, DEFAULT_CAFFEINE_HEALTH_SETTINGS } from './domain/beans/bean-consumption-summary.js';\nimport { beanGroupState, openBeanGroupState, closeBeanGroupState, hasActiveBeanGroup } from './domain/beans/bean-group-state.js';",
    "app group-state import",
)
app = replace_once(
    app,
    "  activeGroupKey: null, groupAnimationMode: 'manual', recommendationTimer: null, recommendationRun: false, recommendationExpandedAll: false, recommendationPromptMemory: {}, preferenceBoardOpen: false, settingsFocusFilterId: '',",
    "  get activeGroupKey(){ return beanGroupState.groupKey; }, set activeGroupKey(value){ value ? openBeanGroupState(value) : closeBeanGroupState(); }, groupAnimationMode: 'manual', recommendationTimer: null, recommendationRun: false, recommendationExpandedAll: false, recommendationPromptMemory: {}, preferenceBoardOpen: false, settingsFocusFilterId: '',",
    "app state activeGroupKey proxy",
)
app = replace_once(
    app,
    "};\n\nlet toastTimer;",
    """};

function openBeanGroup(groupKey, { animation = 'manual' } = {}) {
  const key = String(groupKey || '').trim();
  if (!key) return false;
  state.groupAnimationMode = animation;
  state.recommendationExpandedAll = false;
  openBeanGroupState(key);
  renderBeans();
  document.dispatchEvent(new CustomEvent('luckybean:bean-group-opened', { detail: { groupKey: key, groupMethod: state.settings.groupMethod || 'country' } }));
  return true;
}

function closeBeanGroup({ render = true } = {}) {
  const changed = hasActiveBeanGroup() || state.recommendationExpandedAll;
  if (!changed) return false;
  state.groupAnimationMode = 'manual';
  state.recommendationExpandedAll = false;
  closeBeanGroupState();
  if (render) renderBeans();
  document.dispatchEvent(new CustomEvent('luckybean:bean-group-closed'));
  return true;
}

globalThis.LuckyBeanBeanGroupState = Object.freeze({
  hasActiveGroup: hasActiveBeanGroup,
  open: groupKey => openBeanGroup(groupKey),
  close: () => closeBeanGroup()
});

let toastTimer;""",
    "app canonical group helpers",
)
app = replace_once(
    app,
    "popup.innerHTML = [['country', '按国家'], ['variety', '按豆种'], ['roast', '按烘焙度'], ['process', '按处理工法']].map(([value, label]) => `<button type=\"button\" data-group-method=\"${value}\">${label}${state.settings.groupMethod === value ? ' ✓' : ''}</button>`).join('');",
    "popup.innerHTML = [['country', '按国家'], ['variety', '按豆种'], ['roast', '按烘焙度'], ['process', '按处理法']].map(([value, label]) => `<button type=\"button\" data-group-method=\"${value}\">${label}${state.settings.groupMethod === value ? ' ✓' : ''}</button>`).join('');",
    "canonical process label",
)
app = replace_once(
    app,
    "container.innerHTML = `${board}<section class=\"active-group-panel ${state.groupAnimationMode === 'auto' ? 'auto-motion' : 'manual-motion'}\" data-active-group-panel><div class=\"active-group-title\"><span>${esc(state.activeGroupKey)}</span><small>${items.length}只</small></div><div class=\"bean-grid compact-grid\">${items.map(beanCardHtml).join('')}</div><div class=\"group-collapse-zone\" data-collapse-group><button class=\"group-collapse\" type=\"button\">收</button></div></section>`;",
    "container.innerHTML = `${board}<section class=\"active-group-panel ${state.groupAnimationMode === 'auto' ? 'auto-motion' : 'manual-motion'}\" data-active-group-panel><div class=\"active-group-title\"><span>${esc(state.activeGroupKey)}</span><small>${items.length}只</small></div><div class=\"bean-grid compact-grid\">${items.map(beanCardHtml).join('')}</div><button class=\"bean-group-dismiss-surface\" type=\"button\" data-close-bean-group aria-label=\"返回分组列表\"></button></section>`;",
    "native group dismiss surface",
)
app = replace_once(
    app,
    "  $('#bottomNav').addEventListener('click',event=>{const button=event.target.closest('[data-page-target]');if(button)switchPage(button.dataset.pageTarget);});",
    "  $('#bottomNav').addEventListener('click',event=>{const button=event.target.closest('[data-page-target]');if(!button)return;const page=button.dataset.pageTarget;if(page==='beans'&&state.page==='beans'&&hasActiveBeanGroup()){closeBeanGroup();return;}switchPage(page);});",
    "bottom beans fallback close",
)
app = replace_once(
    app,
    "    if (group) { state.groupAnimationMode='manual'; state.recommendationExpandedAll=false; state.activeGroupKey = group.dataset.openGroup; renderBeans(); return; }",
    "    if (group) { openBeanGroup(group.dataset.openGroup); return; }",
    "canonical native group open",
)
app = replace_once(
    app,
    "    if (event.target.closest('[data-collapse-group]')) { state.groupAnimationMode='manual'; state.recommendationExpandedAll=false; state.activeGroupKey = null; renderBeans(); return; }",
    "    if (event.target.closest('[data-collapse-group],[data-close-bean-group]')) { closeBeanGroup(); return; }",
    "canonical native group close",
)
broad_close = "    const panel=event.target.closest('[data-active-group-panel]');\n    if(panel && !event.target.closest('[data-bean-id],[data-brew-bean],.active-group-title')){state.groupAnimationMode='manual';state.recommendationExpandedAll=false;state.activeGroupKey=null;renderBeans();}\n"
if app.count(broad_close) != 1:
    raise SystemExit(f"broad panel close: expected 1 occurrence, found {app.count(broad_close)}")
app = app.replace(broad_close, "", 1)
app_path.write_text(app, encoding="utf-8")

controller_path = ROOT / "src/bean-groups-controller.js"
controller = controller_path.read_text(encoding="utf-8")
controller = replace_once(
    controller,
    "import { normalizeRecommendationScore } from './preference-model.js';",
    "import { normalizeRecommendationScore } from './preference-model.js';\nimport { beanGroupState } from './domain/beans/bean-group-state.js';",
    "controller group-state import",
)
controller = replace_once(controller, "  let activeGroup = '';\n", "", "controller private activeGroup removal")
controller = re.sub(r"\bactiveGroup\b", "beanGroupState.groupKey", controller)
controller = replace_once(
    controller,
    "container.innerHTML = `${board}<section data-v099t-group-root class=\"active-group-panel auto-motion\"><div class=\"active-group-title\"><span>${esc(group?.label || beanGroupState.groupKey)}</span><small>${items.length}只 · ${mode === MODE_FRESHNESS ? '烘焙日期由新到旧' : '余量由少到多'}</small></div><div class=\"bean-grid compact-grid bean-grid-animated auto-motion\">${items.map(bean => beanCardHtml(bean, index, scoreMap)).join('') || '<p class=\"muted\">该分组没有豆卡</p>'}</div></section>`;",
    "container.innerHTML = `${board}<section data-v099t-group-root class=\"active-group-panel auto-motion\"><div class=\"active-group-title\"><span>${esc(group?.label || beanGroupState.groupKey)}</span><small>${items.length}只 · ${mode === MODE_FRESHNESS ? '烘焙日期由新到旧' : '余量由少到多'}</small></div><div class=\"bean-grid compact-grid bean-grid-animated auto-motion\">${items.map(bean => beanCardHtml(bean, index, scoreMap)).join('') || '<p class=\"muted\">该分组没有豆卡</p>'}</div><button class=\"bean-group-dismiss-surface\" type=\"button\" data-close-bean-group aria-label=\"返回分组列表\"></button></section>`;",
    "special group dismiss surface",
)
controller = replace_once(
    controller,
    "  async function handleClick(event) {\n    const mode = currentMode || MODE_NATIVE;\n",
    """  async function handleClick(event) {
    const mode = currentMode || MODE_NATIVE;
    const dismiss = event.target.closest?.('[data-close-bean-group]');
    if (dismiss && [MODE_FRESHNESS, MODE_REMAINING].includes(mode) && beanGroupState.groupKey) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      await closeActiveGroup({ refreshData: true });
      return;
    }
""",
    "special group canonical close target",
)
controller_path.write_text(controller, encoding="utf-8")

css_path = ROOT / "styles.css"
css = css_path.read_text(encoding="utf-8")
marker = "/* 1.24B canonical bean-group dismiss surface */"
if marker not in css:
    css += """

/* 1.24B canonical bean-group dismiss surface */
#beanGroups .bean-group-dismiss-surface {
  display: block;
  width: 100%;
  min-height: clamp(100px, 16vh, 160px);
  margin: 8px 0 0;
  padding: 0;
  border: 0;
  appearance: none;
  background: transparent;
  box-shadow: none;
  color: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
"""
css_path.write_text(css, encoding="utf-8")

release_path = ROOT / "src/features/release-1.24b-group-navigation.js"
release_path.write_text(
    """const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
let syncQueued=false;

function injectStyle(){
  if($('#lb124bInteractionFixStyle'))return;
  const style=document.createElement('style');
  style.id='lb124bInteractionFixStyle';
  style.textContent=`
    #beanGroups .preference-board-strip,#beanGroups [data-open-recommend-board]{display:none!important;}
    .bean-consumption-summary .lb-stock-total{font-size:.98rem!important;line-height:1.38!important;font-weight:600!important;letter-spacing:0!important;}
    :where(.popup-menu,.recommend-menu,.popup-menu button,.recommend-menu button,#brewContent button,#brewContent select,#brewContent option,#brewContent input,.dialog select,.dialog option){font-family:DengXian,"Microsoft YaHei UI","Noto Sans CJK SC","Noto Sans SC","PingFang SC",system-ui,sans-serif!important;font-synthesis:none;}
    .popup-menu,.recommend-menu{transform-origin:top center;animation:lbMenuEnter 145ms cubic-bezier(.2,.8,.2,1) both;}
    @keyframes lbMenuEnter{from{opacity:0;transform:translateY(-4px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
    #brewContent .lb-auto-note{display:none!important;}
    #brewContent :is(.lb-auto-field,.model-recommended){background:transparent!important;border:0!important;border-bottom:1px solid color-mix(in srgb,var(--active,currentColor) 58%,transparent)!important;border-radius:0!important;box-shadow:none!important;font-weight:inherit!important;text-decoration:none!important;}
    #brewContent .brew-row-primary :is(#brewDose,#brewRatio){width:100%!important;min-height:36px!important;padding:6px 0 5px!important;font-size:14px!important;font-weight:500!important;line-height:1.45!important;text-align:center!important;text-align-last:center!important;font-variant-numeric:tabular-nums;}
    #brewContent [data-brew-row="filter-gear-water"]{align-items:end!important;}
    #brewContent [data-brew-row="filter-gear-water"]>.field{min-width:0!important;text-align:center!important;}
    #brewContent [data-brew-row="filter-gear-water"]>.field>span,#brewContent [data-brew-row="filter-gear-water"] .custom-summary{width:100%!important;text-align:center!important;}
    #brewContent [data-brew-row="filter-gear-water"] :is(select,button,.control){width:100%!important;min-height:34px!important;padding:5px 0!important;font-size:13px!important;font-weight:450!important;line-height:1.45!important;text-align:center!important;text-align-last:center!important;}
    #brewContent :is(#brewProfile,.brew-profile-row .control,.brew-generate-row .button){font-size:13px!important;line-height:1.45!important;font-weight:450!important;}
    #brewContent #brewProfile{text-align:center!important;text-align-last:center!important;}
    #brewContent :is(#brewProfile,#brewDripper,#brewFilterPaper,#brewWaterProfile,#brewRatio) option{font-size:13px!important;font-weight:400!important;}
    @media (max-width:720px){.bean-consumption-summary .lb-stock-total{font-size:.94rem!important;}}
    @media (prefers-reduced-motion:reduce){.popup-menu,.recommend-menu{animation:none!important;}}
  `;
  document.head.append(style);
}
function removeLeaderboard(){document.querySelectorAll('#beanGroups .preference-board-strip,#beanGroups [data-open-recommend-board]').forEach(node=>node.remove());}
function normalizeBrewUi(){
  const root=$('#brewContent');if(!root)return;
  const ratioAuto=$('#brewRatio option[value="auto"]',root);if(ratioAuto){const text=(ratioAuto.textContent||'').replace(/^自动\s*[·・]?\s*/,'').trim()||'自动';if(ratioAuto.textContent!==text)ratioAuto.textContent=text;}
  const dripper=$('#brewDripper',root);const recommended=dripper?.querySelector('option[value="recommended"]');if(recommended){const text=(recommended.textContent||'').replace(/^方案推荐\s*[·・]?\s*/,'').trim()||'自动';if(recommended.textContent!==text)recommended.textContent=text;}
  const dose=$('#brewDose',root);if(dose&&/^自动\s*[·・]/.test(dose.textContent||''))dose.textContent=(dose.textContent||'').replace(/^自动\s*[·・]\s*/,'');
  [[dose,c=>c?.classList.contains('model-recommended')||c?.dataset.source==='auto'],[$('#brewRatio',root),c=>c?.value==='auto'],[dripper,c=>c?.value==='recommended'],[$('#brewProfile',root),c=>c?.value==='recommended'],[$('#brewWaterProfile',root),c=>c?.classList.contains('model-recommended')||c?.dataset.source==='auto']].forEach(([control,isAuto])=>{if(control)control.classList.toggle('lb-auto-field',Boolean(isAuto(control)));});
}
function syncUi(){syncQueued=false;injectStyle();removeLeaderboard();normalizeBrewUi();}
function queueSync(){if(syncQueued)return;syncQueued=true;requestAnimationFrame(syncUi);}
document.addEventListener('luckybean:navigation-back',event=>{const api=globalThis.LuckyBeanBeanGroupState;if(api?.hasActiveGroup?.()&&api.close?.())event.preventDefault?.();});
['luckybean:data-changed','luckybean:app-refreshed','luckybean:local-app-ready','luckybean:brew-profile-catalog-updated','luckybean:bean-group-opened','luckybean:bean-group-closed'].forEach(type=>document.addEventListener(type,queueSync));
document.addEventListener('change',event=>{if(event.target?.closest?.('#brewContent'))queueSync();},{capture:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queueSync,{once:true});else queueSync();
injectStyle();queueSync();
globalThis.LuckyBean124BGroupNavigation={close:()=>globalThis.LuckyBeanBeanGroupState?.close?.()||false,hasActiveGroup:()=>Boolean(globalThis.LuckyBeanBeanGroupState?.hasActiveGroup?.()),sync:queueSync};
console.info('[LuckyBean] 1.24B canonical bean-group state active; group UI adapter loaded');
""",
    encoding="utf-8",
)

test_path = ROOT / "tests/v124b-group-brew-regression.spec.mjs"
test = test_path.read_text(encoding="utf-8")
test = test.replace("await expect(page.locator('#beanGroups [data-lb-group-dismiss-zone]')).toHaveCount(1);", "await expect(page.locator('#beanGroups [data-close-bean-group]')).toHaveCount(1);")
test = test.replace("await page.locator('#beanGroups [data-lb-group-dismiss-zone]').click({position:{x:10,y:10}});", "await page.locator('#beanGroups [data-close-bean-group]').click({position:{x:10,y:10}});")
test_path.write_text(test, encoding="utf-8")

print("canonical bean group refactor applied")
