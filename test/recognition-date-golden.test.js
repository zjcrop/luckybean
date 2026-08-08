import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRecognitionDates } from '../src/domain/recognition/recognition-date-classifier.js';

const CASES = [
  ['烘焙日期：2026-07-28', '2026-07-28', 'auto-fill'],
  ['ROAST DATE 2026/07/28', '2026-07-28', 'auto-fill'],
  ['ROASTED ON 2026.7.8', '2026-07-08', 'auto-fill'],
  ['焙炒日期 2026年7月28日', '2026-07-28', 'auto-fill'],
  ['RST DATE 20260728', '2026-07-28', 'auto-fill'],
  ['ROAST ON 28 JUL 2026', '2026-07-28', 'auto-fill'],
  ['ROAST DATE JUL 28 2026', '2026-07-28', 'auto-fill'],
  ['出炉日期 26年7月28日', '2026-07-28', 'auto-fill'],
  ['烘焙日 26-07-28', '2026-07-28', 'auto-fill'],
  ['烘烤日期 26.0728', '2026-07-28', 'auto-fill'],
  ['生产日期：2026-07-21', '', 'exclude'],
  ['MFG DATE 2026/07/21', '', 'exclude'],
  ['MFD 20260721', '', 'exclude'],
  ['包装日期 2026.07.22', '', 'exclude'],
  ['PACKED ON 2026-07-22', '', 'exclude'],
  ['PKD 20260722', '', 'exclude'],
  ['最佳赏味期 2026-10-28', '', 'exclude'],
  ['BEST BEFORE 2026/10/28', '', 'exclude'],
  ['BBE 28 OCT 2026', '', 'exclude'],
  ['有效期至 2027年1月5日', '', 'exclude'],
  ['EXP 2027-01-05', '', 'exclude'],
  ['USE BY JAN 5 2027', '', 'exclude'],
  ['埃塞俄比亚\n2026-07-28', '', 'review'],
  ['DATE 2026/07/28', '', 'review'],
  ['LOT 20260728', '', 'review'],
  ['2026年7月28日', '', 'review'],
  ['28/07/2026', '', 'review'],
  ['07/08/2026', '', 'review'],
  ['ROAST DATE 07/08/2026', '', 'review'],
  ['ROAST DATE 2026-07-28\nROAST DATE 2026-07-29', '', 'review']
];

test('30-case date ownership golden set has zero silent non-roast assignments', async t => {
  assert.equal(CASES.length, 30);
  for (const [source, expectedDate, expectedDecision] of CASES) {
    await t.test(source.replace(/\n/g, ' / '), () => {
      const result = classifyRecognitionDates(source);
      assert.equal(result.roastDate, expectedDate);
      if (expectedDecision === 'auto-fill') assert.ok(result.candidates.some(item => item.decision === 'auto-fill'));
      if (expectedDecision === 'exclude') assert.ok(result.candidates.some(item => item.decision === 'exclude'));
      if (expectedDecision === 'review') assert.equal(result.reviewRequired, true);
    });
  }
});
