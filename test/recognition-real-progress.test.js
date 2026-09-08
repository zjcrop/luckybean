import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/features/recognition-batch-progress-controller.js', import.meta.url), 'utf8');

test('recognition progress consumes provider events instead of a synthetic interval', () => {
  assert.match(source, /addEventListener\('luckybean:ocr-progress'/);
  assert.match(source, /detail\?\.progress/);
  assert.doesNotMatch(source, /setInterval\(/,
    'a time-based progress ticker can visually run forever while OCR is stalled');
  assert.doesNotMatch(source, /Math\.min\(92/,
    'the former fake 92% ceiling must not return');
});

test('interrupted processing snapshots are cleared on a full reload', () => {
  assert.match(source, /stale\.status==='processing'/);
  assert.match(source, /clearRecognitionBatchSnapshot\(\)/);
});
