from pathlib import Path

ROOT = Path('.')


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing expected source for {label}: {path}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# 1) Bean detail: never expose roast code/roast-level field in the detail info block.
#    Roast date is paired with processing method as requested: 日晒，烘焙日期2026-08-18.
integration = Path('src/features/release-1.24b-integration.js')
text = integration.read_text(encoding='utf-8')
old_head = """function fullBeanInfo(bean) {
  const n = normalizeBeanRecord(bean);
  const purchase = n.purchase || {};
  return ["""
new_head = """function fullBeanInfo(bean) {
  const n = normalizeBeanRecord(bean);
  const purchase = n.purchase || {};
  const processName = n.processing.process || bean.processName || '';
  const processAndRoastDate = [processName, bean.roastDate ? `烘焙日期${bean.roastDate}` : ''].filter(Boolean).join('，');
  return ["""
if old_head not in text:
    raise SystemExit('fullBeanInfo header changed unexpectedly')
text = text.replace(old_head, new_head, 1)
text = text.replace("    valueLine('处理法', n.processing.process || bean.processName),", "    valueLine('处理法', processAndRoastDate),", 1)
for obsolete in [
    "    valueLine('烘焙度', bean.roastName || bean.roastCode),\n",
    "    valueLine('烘焙日期', bean.roastDate),\n",
]:
    if obsolete not in text:
        raise SystemExit(f'bean detail field source changed unexpectedly: {obsolete.strip()}')
    text = text.replace(obsolete, '', 1)
integration.write_text(text, encoding='utf-8')

# 2) Theme/UI overrides live in the release stylesheet, which loads after legacy consolidated CSS.
css = Path('src/release-1.24b.css')
text = css.read_text(encoding='utf-8')
marker = '/* LuckyBean 1.24B main.6 detail/fab/sensory corrections */'
block = r'''

/* LuckyBean 1.24B main.6 detail/fab/sensory corrections */
/* Bean detail flavor line: keep location, increase readability, one-character spacing. */
[data-overlay="bean-detail"] .detail-tags {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: baseline !important;
  column-gap: 1em !important;
  row-gap: .45rem !important;
}
[data-overlay="bean-detail"] .detail-tags > * {
  font-size: 1rem !important;
  line-height: 1.45 !important;
}

/* Four-quadrant floating menu: four independent rounded rectangles + a small central drag dot. */
#fabWrap.action-grid,
#fabWrap.action-grid[style],
#fabWrap.action-grid:active,
#fabWrap.action-grid:focus {
  width: 118px !important;
  height: 118px !important;
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  grid-template-rows: repeat(2, minmax(0, 1fr)) !important;
  gap: 8px !important;
  padding: 0 !important;
  background: none !important;
  background-image: none !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
}
#fabWrap.action-grid .fab,
#fabWrap.action-grid .fab:focus,
#fabWrap.action-grid .fab:active {
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  padding: 0 3px !important;
  border: 1px solid rgba(214,173,99,.82) !important;
  border-radius: 14px !important;
  background: rgba(214,173,99,.075) !important;
  box-shadow: none !important;
  font-family: FangSong, STFangsong, serif !important;
  font-size: 15px !important;
  font-weight: 650 !important;
  letter-spacing: .06em !important;
  text-shadow: none !important;
}
html[data-theme="dark"] #fabWrap.action-grid .fab { color: #fff !important; }
html[data-theme="light"] #fabWrap.action-grid .fab { color: #111 !important; }
#fabWrap.action-grid .fab:active { background: rgba(214,173,99,.15) !important; }

/* Keep a large invisible drag target but render only a slightly enlarged center point. */
#fabWrap .v097-fab-drag-handle {
  width: 42px !important;
  height: 42px !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  border-radius: 50% !important;
}
#fabWrap .v097-fab-drag-handle::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(214,173,99,.9);
  border-radius: 50%;
  background: rgba(214,173,99,.22);
  pointer-events: none;
}

/* Radar labels are explicit SVG fill colors; normal text color does not reliably cascade into SVG. */
html[data-theme="dark"] .v095-radar-stage svg text { fill: #c9c7c2 !important; }
html[data-theme="light"] .v095-radar-stage svg text { fill: #111 !important; }

/* Professional sensory navigation is viewport-fixed, never content/sticky-positioned. */
.v095-professional-dialog {
  padding-bottom: calc(88px + var(--safe-bottom, 0px)) !important;
}
.v095-wizard-actions {
  position: fixed !important;
  left: 50% !important;
  right: auto !important;
  bottom: 0 !important;
  top: auto !important;
  transform: translateX(-50%) !important;
  width: min(880px, 100%) !important;
  z-index: 120 !important;
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 8px !important;
  margin: 0 !important;
  padding: 8px 18px calc(8px + var(--safe-bottom, 0px)) !important;
  background: var(--bg) !important;
  border-top: 1px solid color-mix(in srgb, var(--active) 24%, transparent) !important;
  backdrop-filter: blur(8px);
}
.v095-wizard-actions [data-v095-cancel] {
  grid-column: auto !important;
  order: initial !important;
}
'''
if marker not in text:
    css.write_text(text.rstrip() + block + '\n', encoding='utf-8')

# 3) Regression assertions for the exact user-visible contract.
test = Path('test/v124b-main6-ui-regression.test.js')
test.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');

test('main.6 bean detail does not expose roast code and pairs process with roast date', () => {
  const source = read('src/features/release-1.24b-integration.js');
  assert.match(source, /const processAndRoastDate = \[processName, bean\.roastDate \? `烘焙日期\$\{bean\.roastDate\}` : ''\]/);
  assert.match(source, /valueLine\('处理法', processAndRoastDate\)/);
  assert.equal(source.includes("valueLine('烘焙度'"), false);
  assert.equal(source.includes("valueLine('烘焙日期', bean.roastDate)"), false);
});

test('main.6 floating quadrant, radar labels and sensory footer obey theme/layout contract', () => {
  const css = read('src/release-1.24b.css');
  assert.match(css, /#fabWrap\.action-grid[\s\S]*background-image: none !important/);
  assert.match(css, /#fabWrap\.action-grid \.fab[\s\S]*border-radius: 14px !important[\s\S]*background: rgba\(214,173,99,\.075\)/);
  assert.match(css, /html\[data-theme="dark"\] #fabWrap\.action-grid \.fab \{ color: #fff !important; \}/);
  assert.match(css, /html\[data-theme="light"\] #fabWrap\.action-grid \.fab \{ color: #111 !important; \}/);
  assert.match(css, /\.v097-fab-drag-handle::after[\s\S]*width: 14px[\s\S]*background: rgba\(214,173,99,\.22\)/);
  assert.match(css, /html\[data-theme="dark"\] \.v095-radar-stage svg text \{ fill: #c9c7c2 !important; \}/);
  assert.match(css, /\.v095-wizard-actions \{[\s\S]*position: fixed !important[\s\S]*bottom: 0 !important[\s\S]*grid-template-columns: repeat\(3/);
  assert.match(css, /\[data-overlay="bean-detail"\] \.detail-tags[\s\S]*column-gap: 1em !important/);
});
''', encoding='utf-8')

# 4) Advance the complete asset/cache contract so Pages/WebView cannot keep main.4 resources.
TEXT_SUFFIXES = {'.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.md', '.yml', '.yaml', '.xml', '.gradle'}
for p in ROOT.rglob('*'):
    if not p.is_file() or p.suffix not in TEXT_SUFFIXES:
        continue
    if '.git' in p.parts or 'node_modules' in p.parts:
        continue
    try:
        body = p.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    updated = body.replace('1.24B-main.4', '1.24B-main.6')
    updated = updated.replace(r'1\.24B-main\.4', r'1\.24B-main\.6')
    updated = updated.replace('main-4-interaction3', 'main-6-ui2')
    if updated != body:
        p.write_text(updated, encoding='utf-8')

# Clean obsolete one-shot staging files from the previous incomplete main.5 attempt.
for obsolete_path in [
    '.github/workflows/luckybean-124b-main5-source-fix.yml',
    'scripts/luckybean-main5-source-fix.py',
    'scripts/luckybean-main5-revision-fix.py',
]:
    Path(obsolete_path).unlink(missing_ok=True)

# Validate cache/entry identities before tests.
index = Path('index.html').read_text(encoding='utf-8')
sw = Path('sw.js').read_text(encoding='utf-8')
if '1.24B-main.6' not in index or '1.24B-main.4' in index:
    raise SystemExit('index revision contract did not advance cleanly to main.6')
if "REVISION = '1.24B-main.6'" not in sw or 'main-6-ui2' not in sw:
    raise SystemExit('service-worker revision/cache contract did not advance to main.6')

# Remove this one-shot patch machinery from the final product commit.
Path('.github/workflows/luckybean-124b-main6-ui-fix.yml').unlink(missing_ok=True)
Path('scripts/luckybean-main6-ui-fix.py').unlink(missing_ok=True)
