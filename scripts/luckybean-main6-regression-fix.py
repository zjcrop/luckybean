from pathlib import Path

# A) The four-quadrant controller must still obey the canonical page-level hidden state.
css = Path('src/release-1.24b.css')
text = css.read_text(encoding='utf-8')
hidden_rule = "#fabWrap.action-grid.hidden { display: none !important; }\n"
marker = "html[data-theme=\"dark\"] #fabWrap.action-grid .fab { color: #fff !important; }\n"
if hidden_rule not in text:
    if marker not in text:
        raise SystemExit('main.6 FAB theme marker missing')
    text = text.replace(marker, hidden_rule + marker, 1)
css.write_text(text, encoding='utf-8')

# B) Manual OCR entry lives inside <details>; focusing a collapsed textarea is not enough.
package_capture = Path('src/package-capture-controller.js')
text = package_capture.read_text(encoding='utf-8')
old = """  const target = document.querySelector('#bagOcrText');
  if (target) {
    target.value = existing.trim();
    target.placeholder = message;
    target.focus();
"""
new = """  const target = document.querySelector('#bagOcrText');
  if (target) {
    const details = target.closest('details');
    if (details) details.open = true;
    target.value = existing.trim();
    target.placeholder = message;
    target.focus();
"""
if old not in text:
    raise SystemExit('manual OCR entry source changed unexpectedly')
package_capture.write_text(text.replace(old, new, 1), encoding='utf-8')

# C) The canonical roast wording is 浅烘, not the obsolete one-character 浅 expectation.
legacy_test = Path('tests/v127-user-regressions-ui.spec.mjs')
text = legacy_test.read_text(encoding='utf-8')
old_expect = "  await expect(card.locator('.lb-bean-secondary')).toContainText('/浅/水洗/85g');"
new_expect = "  await expect(card.locator('.lb-bean-secondary')).toContainText('/浅烘/水洗/85g');"
if old_expect not in text:
    raise SystemExit('legacy roast wording expectation changed unexpectedly')
legacy_test.write_text(text.replace(old_expect, new_expect, 1), encoding='utf-8')

# Extend the main.6 source regression so these browser findings cannot regress silently.
regression = Path('test/v124b-main6-ui-regression.test.js')
text = regression.read_text(encoding='utf-8')
extra = r'''

test('main.6 preserves FAB visibility ownership and opens manual OCR editor explicitly', () => {
  const css = read('src/release-1.24b.css');
  const capture = read('src/package-capture-controller.js');
  const legacyUi = read('tests/v127-user-regressions-ui.spec.mjs');
  assert.match(css, /#fabWrap\.action-grid\.hidden \{ display: none !important; \}/);
  assert.match(capture, /const details = target\.closest\('details'\);[\s\S]*details\.open = true/);
  assert.match(legacyUi, /toContainText\('\/浅烘\/水洗\/85g'\)/);
});
'''
if "main.6 preserves FAB visibility ownership" not in text:
    regression.write_text(text.rstrip() + extra + '\n', encoding='utf-8')

# D) Keep the generated release stylesheet diff-clean: one final newline, no blank line at EOF.
css_text = css.read_text(encoding='utf-8')
css.write_text(css_text.rstrip() + '\n', encoding='utf-8')

# This script is one-shot staging machinery and must not enter the product commit.
Path('scripts/luckybean-main6-regression-fix.py').unlink(missing_ok=True)
