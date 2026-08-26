import test from 'node:test';
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

test('main.6 preserves FAB visibility ownership and opens manual OCR editor explicitly', () => {
  const css = read('src/release-1.24b.css');
  const capture = read('src/package-capture-controller.js');
  const legacyUi = read('tests/v127-user-regressions-ui.spec.mjs');
  assert.match(css, /#fabWrap\.action-grid\.hidden \{ display: none !important; \}/);
  assert.match(capture, /const details = target\.closest\('details'\);[\s\S]*details\.open = true/);
  assert.match(legacyUi, /toContainText\('\/浅烘\/水洗\/85g'\)/);
});

test('main.6 package review waits for recognition handoff completion instead of racing the form renderer', () => {
  const capture = read('src/package-capture-controller.js');
  const followup = read('src/ui/release-1.24b-followup-controller.js');
  assert.match(capture, /await flow\.acceptDocument\(recognitionDocument, \{ overwrite: true \}\);[\s\S]*luckybean:recognition-handoff-complete/);
  assert.match(followup, /addEventListener\('luckybean:recognition-handoff-complete', onHandoffComplete\)/);
  assert.match(followup, /attempts >= 100/);
  assert.equal(followup.includes('form && attempts >= 10'), false);
});

test('main.6 unresolved semantic fields preserve raw evidence for explicit bean-form confirmation', () => {
  const pipeline = read('src/domain/recognition/recognition-pipeline.js');
  assert.match(pipeline, /for \(const item of reviewFields\)/);
  assert.match(pipeline, /if \(missingEvidence\) parsed\.evidence\[item\.field\] = rawValue/);
  assert.match(pipeline, /parsed\.confidence\[item\.field\] = Number\(item\.confidence \|\| 0\)/);
  assert.equal(pipeline.includes('parsed.confidence[item.field] = 1'), false);
});

