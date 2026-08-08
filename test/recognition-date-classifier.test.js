import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalLanguage } from '../src/codebook.js';
import { createRecognitionDocument, recognitionDocumentFromText } from '../src/domain/recognition/recognition-document.js';
import { classifyRecognitionDates } from '../src/domain/recognition/recognition-date-classifier.js';

const emptyBook = { countries: [], regions: [], entities: [], varieties: [], processes: [], roasts: [], flavors: [] };

test('production date never falls back to roast date', () => {
  const parsed = parseNaturalLanguage('生产日期：2026-07-21', emptyBook);
  assert.equal(parsed.roastDate, undefined);
  assert.equal(parsed.parseMetadata.productionDate.normalizedValue, '2026-07-21');
});

test('best before and expiry dates are excluded from roast date', () => {
  for (const text of ['BEST BEFORE 2026/10/28', 'EXP: 2027-01-05', '包装日期 2026.07.20']) {
    const decision = classifyRecognitionDates(text);
    assert.equal(decision.roastDate, '');
    assert.equal(decision.candidates[0].decision, 'exclude');
  }
});

test('explicit roast date is auto-filled while other dates remain excluded', () => {
  const decision = classifyRecognitionDates('ROASTED ON 2026.07.28\nBEST BEFORE 2026.10.28\nCrop 2025/26');
  assert.equal(decision.roastDate, '2026-07-28');
  assert.equal(decision.candidates.filter(item => item.decision === 'auto-fill').length, 1);
  assert.equal(decision.candidates.filter(item => item.decision === 'exclude').length, 1);
});

test('unlabelled date requires confirmation and is never silently filled', () => {
  const decision = classifyRecognitionDates(recognitionDocumentFromText('埃塞俄比亚 古吉\n2026-07-28'));
  assert.equal(decision.roastDate, '');
  assert.equal(decision.reviewRequired, true);
  assert.equal(decision.candidates[0].fieldType, 'unknown');
});

test('date photo role increases provenance but does not bypass confirmation', () => {
  const document = createRecognitionDocument({
    images: [{ id: 'img-date', role: 'date', roleLabel: '日期标签' }],
    blocks: [{ imageId: 'img-date', text: '20260728', confidence: 0.99, polygon: [[10, 20], [120, 20], [120, 50], [10, 50]] }],
    engine: 'test-ocr'
  });
  const decision = classifyRecognitionDates(document);
  assert.equal(decision.roastDate, '');
  assert.equal(decision.candidates[0].imageRole, 'date');
  assert.equal(decision.candidates[0].decision, 'review');
});

test('invalid calendar dates are rejected', () => {
  const decision = classifyRecognitionDates('ROAST DATE 2026-02-30');
  assert.equal(decision.roastDate, '');
  assert.equal(decision.candidates.length, 0);
});
