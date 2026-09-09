import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compactVarietyLabel } from '../src/domain/beans/bean-display-projection.js';

const captureSource = await readFile(new URL('../src/package-capture-controller.js', import.meta.url), 'utf8');
const quickActionsSource = await readFile(new URL('../src/ui/bean-card-controller.js', import.meta.url), 'utf8');

test('gallery preprocessing automatically queues OCR after a new processed image is added', () => {
  assert.match(captureSource, /const imageCountBefore = captureState\.images\.length;/);
  assert.match(captureSource, /await addFiles\(processed\);\s*if \(captureState\.images\.length > imageCountBefore\) queueRecognition\(\);/s);
  assert.match(captureSource, /function queueRecognition\(\)[\s\S]*recognitionQueued = true;[\s\S]*await runRecognition\(\);[\s\S]*recognitionQueued = false;/);
});

test('numeric JARC cultivar labels stay display-only and compact', () => {
  assert.equal(compactVarietyLabel('JARC 74110'), '74110');
  assert.equal(compactVarietyLabel('Jarc 74158'), '74158');
  assert.equal(compactVarietyLabel('JARC Bourbon'), 'JARC Bourbon');
});

test('bean quick actions reuse the canonical display projection instead of mutating stored variety data', () => {
  assert.match(quickActionsSource, /import \{ compactVarietyLabel \} from '\.\.\/domain\/beans\/bean-display-projection\.js';/);
  assert.match(quickActionsSource, /return compactVarietyLabel\(value\);/);
});
