import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compactJarcCultivarText } from '../src/ui/cultivar-display-controller.js';

const captureSource = await readFile(new URL('../src/package-capture-controller.js', import.meta.url), 'utf8');
const displaySource = await readFile(new URL('../src/ui/cultivar-display-controller.js', import.meta.url), 'utf8');

test('gallery preprocessing automatically queues OCR after a new processed image is added', () => {
  assert.match(captureSource, /const imageCountBefore = captureState\.images\.length;/);
  assert.match(captureSource, /await addFiles\(processed\);\s*if \(captureState\.images\.length > imageCountBefore\) queueRecognition\(\);/s);
  assert.match(captureSource, /function queueRecognition\(\)[\s\S]*recognitionQueued = true;[\s\S]*await runRecognition\(\);[\s\S]*recognitionQueued = false;/);
});

test('numeric JARC cultivar labels are compacted only for display text', () => {
  assert.equal(compactJarcCultivarText('JARC 74110'), '74110');
  assert.equal(compactJarcCultivarText('埃塞 · Jarc 74158'), '埃塞 · 74158');
  assert.equal(compactJarcCultivarText('JARC-74112 / 水洗'), '74112 / 水洗');
  assert.equal(compactJarcCultivarText('JARC Bourbon'), 'JARC Bourbon');
});

test('OCR evidence surfaces are excluded from UI text compaction', () => {
  assert.match(displaySource, /\.bag-raw-evidence/);
  assert.match(displaySource, /\.bag-recognition-result/);
  assert.match(displaySource, /data-preserve-source-text/);
});
