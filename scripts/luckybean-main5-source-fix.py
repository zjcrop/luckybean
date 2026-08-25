from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"missing expected source for {label}: {path}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


app = Path("src/app.js")
text = app.read_text(encoding="utf-8")
old_note = """function noteNodeHtml(evaluation) {
  return `<div class="question-group centered-question"><h4>自然文字记录</h4><textarea id="sensoryNaturalNote" class="control natural-note" maxlength="1200" placeholder="描述本次冲煮的香气、酸甜、口感、问题及下一次调整方向……">${esc(evaluation.naturalNote || '')}</textarea><div class="row menu-row sensory-note-actions"><button id="sensoryVoiceNoteBtn" class="button" type="button">语记</button><span class="muted small">文字将写入品鉴记录和对应冲煮记录。</span></div></div>`;
}"""
new_note = """function noteNodeHtml(evaluation) {
  return `<div class="question-group centered-question"><h4>自然文字记录</h4><textarea id="sensoryNaturalNote" class="control natural-note" maxlength="1200" placeholder="描述本次冲煮的香气、酸甜、口感、问题及下一次调整方向……">${esc(evaluation.naturalNote || '')}</textarea></div>`;
}"""
if old_note not in text:
    raise SystemExit("noteNodeHtml source changed unexpectedly")
text = text.replace(old_note, new_note, 1)
voice_binding = "  $('#sensoryVoiceNoteBtn')?.addEventListener('click', () => startSpeechRecognition('sensoryNaturalNote'));\n"
if voice_binding not in text:
    raise SystemExit("sensory voice binding source changed unexpectedly")
text = text.replace(voice_binding, "", 1)

marker = "document.addEventListener('luckybean:user-notice', event => toast(event.detail?.message || '', event.detail?.kind || 'status-good'));\n"
listener = """document.addEventListener('luckybean:recognition-field-confirmed', event => {
  const source = state.beanFormSource;
  const field = String(event.detail?.field || '');
  const recognition = source?.parseMetadata?.recognition;
  if (!field || !recognition) return;
  const reviewFields = Array.isArray(recognition.reviewFields) ? recognition.reviewFields : [];
  recognition.reviewFields = reviewFields.filter(key => String(key) !== field);
  source.evidence ||= {};
  if (event.detail?.value != null) source.evidence[field] = event.detail.value;
});
"""
if listener not in text:
    if marker not in text:
        raise SystemExit("user notice marker changed unexpectedly")
    text = text.replace(marker, marker + listener, 1)
app.write_text(text, encoding="utf-8")

css = Path("src/ui/professional-sensory.css")
text = css.read_text(encoding="utf-8")
radar_marker = ".v095-radar-stage svg { width: 100%; height: auto; color: var(--text); }\n"
radar_rule = radar_marker + ".v095-radar-stage svg text { fill: var(--text, #f5f3ed); }\n"
if ".v095-radar-stage svg text { fill:" not in text:
    if radar_marker not in text:
        raise SystemExit("radar SVG marker changed unexpectedly")
    text = text.replace(radar_marker, radar_rule, 1)
old_actions = """.v095-wizard-actions {
  position: sticky;
  bottom: calc(-1 * max(0px, var(--safe-bottom)));
  z-index: 4;
  display: grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 8px;
  margin-top: 22px;
  padding: 12px 0 calc(8px + var(--safe-bottom));
  background: color-mix(in srgb, var(--surface-raised, #111313) 94%, transparent);
  backdrop-filter: blur(8px);
}"""
new_actions = """.v095-professional-dialog { padding-bottom: calc(72px + var(--safe-bottom, 0px)); }
.v095-wizard-actions {
  position: fixed;
  left: 50%;
  right: auto;
  bottom: 0;
  transform: translateX(-50%);
  z-index: 96;
  display: grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 8px;
  width: min(880px, 100%);
  margin: 0;
  padding: 8px 18px calc(8px + var(--safe-bottom, 0px));
  background: var(--bg, #050505);
  backdrop-filter: blur(8px);
}"""
if old_actions in text:
    text = text.replace(old_actions, new_actions, 1)
elif "position: fixed;" not in text:
    raise SystemExit("wizard action source changed unexpectedly")
css.write_text(text, encoding="utf-8")

integration = Path("src/features/release-1.24b-integration.js")
text = integration.read_text(encoding="utf-8")
helper_marker = """function esc(v='') { return String(v).replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch])); }\n"""
helper = """const ROAST_LABELS_124B = Object.freeze({
  'RL-L0':'极浅烘', 'RL-L1':'浅烘', 'RL-L2':'浅中烘', 'RL-L3':'中烘',
  'RL-L4':'中深烘', 'RL-L5':'深烘', 'RL-L6':'极深烘'
});
function roastDisplayName(bean = {}) {
  const code = String(bean.roastCode || '').normalize('NFKC').trim().toUpperCase().replace(/[‐‑‒–—―−﹣－]/g, '-').replace(/\\s+/g, '');
  return bean.roastName || ROAST_LABELS_124B[code] || bean.roastCode || '';
}
"""
if "function roastDisplayName(bean = {})" not in text:
    if helper_marker not in text:
        raise SystemExit("integration esc marker changed unexpectedly")
    text = text.replace(helper_marker, helper_marker + helper, 1)
raw_roast = "    valueLine('烘焙度', bean.roastName || bean.roastCode),"
semantic_roast = "    valueLine('烘焙度', roastDisplayName(bean)),"
if raw_roast in text:
    text = text.replace(raw_roast, semantic_roast, 1)
elif semantic_roast not in text:
    raise SystemExit("bean detail roast renderer changed unexpectedly")
integration.write_text(text, encoding="utf-8")

package_capture = Path("src/package-capture-controller.js")
text = package_capture.read_text(encoding="utf-8")
old_manual = """function openManualEntry(message = '可粘贴包装上的文字，后续仍由同一套编码表解析。') {
  const existing = document.querySelector('#bagOcrText')?.value || captureState.ocrText;
  captureState.ocrText = existing || ' ';
  render();
  const target = document.querySelector('#bagOcrText');
  if (target) {
    target.value = existing.trim();
    target.placeholder = message;
    target.focus();
    const button = document.querySelector('#bagHandoffBtn');
    if (button) button.disabled = !target.value.trim();
  }
}"""
new_manual = """function openManualEntry(message = '可粘贴包装上的文字，后续仍由同一套编码表解析。') {
  const existing = document.querySelector('#bagOcrText')?.value || captureState.ocrText;
  captureState.ocrText = existing || ' ';
  render();
  const target = document.querySelector('#bagOcrText');
  if (target) {
    const details = target.closest('details');
    if (details) details.open = true;
    target.value = existing.trim();
    target.placeholder = message;
    target.focus();
    const button = document.querySelector('#bagHandoffBtn');
    if (button) button.disabled = !target.value.trim();
  }
}"""
if old_manual not in text:
    raise SystemExit("package manual-entry source changed unexpectedly")
package_capture.write_text(text.replace(old_manual, new_manual, 1), encoding="utf-8")

legacy_ui_test = Path("tests/v127-user-regressions-ui.spec.mjs")
text = legacy_ui_test.read_text(encoding="utf-8")
old_roast_expect = "  await expect(card.locator('.lb-bean-secondary')).toContainText('/浅/水洗/85g');"
new_roast_expect = "  await expect(card.locator('.lb-bean-secondary')).toContainText('/浅烘/水洗/85g');"
if old_roast_expect not in text:
    raise SystemExit("legacy compact roast expectation changed unexpectedly")
legacy_ui_test.write_text(text.replace(old_roast_expect, new_roast_expect, 1), encoding="utf-8")

obsolete = "专业标签、雷达图和评分会另行结构化保存"
for p in [*Path("src").rglob("*.js"), *Path("src").rglob("*.html")]:
    t = p.read_text(encoding="utf-8")
    if obsolete in t:
        t = t.replace(obsolete + "。", "").replace(obsolete, "")
        p.write_text(t, encoding="utf-8")

index = Path("index.html")
t = index.read_text(encoding="utf-8")
if "1.24B-main.4" not in t:
    raise SystemExit("index release revision is not main.4")
index.write_text(t.replace("1.24B-main.4", "1.24B-main.5"), encoding="utf-8")

policy = Path("src/features/release-1.24b-ui-policy.js")
t = policy.read_text(encoding="utf-8")
t = t.replace("const UI_POLICY_REVISION = '1.24B-main.4';", "const UI_POLICY_REVISION = '1.24B-main.5';", 1)
policy.write_text(t, encoding="utf-8")

test = Path("test/v124b-main5-regression.test.js")
test.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');

test('1.24B main.5 sensory and recognition source regressions stay fixed', () => {
  const app = read('src/app.js');
  const css = read('src/ui/professional-sensory.css');
  const integration = read('src/features/release-1.24b-integration.js');
  const packageCapture = read('src/package-capture-controller.js');
  const legacyUiTest = read('tests/v127-user-regressions-ui.spec.mjs');
  const index = read('index.html');
  assert.equal(app.includes('id=\"sensoryVoiceNoteBtn\"'), false);
  assert.equal(app.includes('文字将写入品鉴记录和对应冲煮记录'), false);
  assert.equal(app.includes('专业标签、雷达图和评分会另行结构化保存'), false);
  assert.match(app, /luckybean:recognition-field-confirmed/);
  assert.match(app, /recognition\\.reviewFields = reviewFields\\.filter/);
  assert.equal(app.includes('source.confidence[field] = 1'), false);
  assert.match(css, /\\.v095-radar-stage svg text \\{ fill: var\\(--text/);
  assert.match(css, /\\.v095-wizard-actions \\{[\\s\\S]*position: fixed;[\\s\\S]*bottom: 0;/);
  assert.match(integration, /valueLine\\('烘焙度', roastDisplayName\\(bean\\)\\)/);
  assert.equal(integration.includes(\"valueLine('烘焙度', bean.roastName || bean.roastCode)\"), false);
  assert.match(packageCapture, /const details = target\\.closest\\('details'\\);[\\s\\S]*details\\.open = true/);
  assert.match(legacyUiTest, /toContainText\\('\/浅烘\/水洗\/85g'\\)/);
  assert.match(index, /1\\.24B-main\\.5/);
});
""", encoding="utf-8")

Path(".github/workflows/luckybean-124b-main5-source-fix.yml").unlink(missing_ok=True)
Path("scripts/luckybean-main5-source-fix.py").unlink(missing_ok=True)
