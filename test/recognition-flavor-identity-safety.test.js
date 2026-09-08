import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repairRecognitionSemanticText } from '../src/domain/recognition/recognition-semantic-repair.js';

const book = JSON.parse(readFileSync(new URL('../public/fallback-codebook.json', import.meta.url), 'utf8'));

test('unlabeled country and region fragments are never promoted to flavor', () => {
  const identity = repairRecognitionSemanticText('哥倫比亞、薇拉', book);
  assert.equal(identity, '哥倫比亞、薇拉');
  assert.doesNotMatch(identity, /^风味:/m);

  const mixed = repairRecognitionSemanticText('哥倫比亞、红糖', book);
  assert.equal(mixed, '哥倫比亞、红糖');
  assert.doesNotMatch(mixed, /^风味:/m);
});

test('unlabeled coffee flavor list still requires and accepts flavor lexicon evidence', () => {
  const flavor = repairRecognitionSemanticText('榛果、陳皮、紅糖', book);
  assert.equal(flavor, '风味: 榛果、陈皮、红糖');
});
