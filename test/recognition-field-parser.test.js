import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fieldCandidates } from '../src/recognition-candidates.js';
import { bestCandidateDecision, extractRecognitionEvidence, localRoastCandidate } from '../src/ui-layout-controller.js';
import { parseNaturalLanguage } from '../src/codebook.js';

const book = JSON.parse(await readFile(new URL('../public/fallback-codebook.json', import.meta.url), 'utf8'));

test('numeric Ethiopian variety codes are split into independent exact candidates', () => {
  const candidates = fieldCandidates('varietyCode', '74110 74112', book, {}, 8);
  assert.equal(candidates.find(item => item.code === 'VA-JA10')?.score, 1);
  assert.equal(candidates.find(item => item.code === 'VA-JA12')?.score, 1);
});

test('multiple labeled varieties stay unresolved instead of silently choosing the first code', () => {
  const parsed = parseNaturalLanguage('VARIETY: 74110 / 74112', book);
  assert.equal(parsed.varietyCode, undefined);
  assert.equal(parsed.evidence.varietyCode, '74110 / 74112');
});

test('spaced alphanumeric variety codes survive OCR tokenization', () => {
  const candidates = fieldCandidates('varietyCode', 'VARIETY: SL 28', book, {}, 8);
  assert.equal(candidates[0]?.code, 'VA-SL28');
  assert.ok(candidates[0].score >= 0.98);
});

test('explicit numeric roast levels map only within the labeled 0-6 scale', () => {
  assert.equal(localRoastCandidate('L2', true)?.code, 'RL-L2');
  assert.equal(localRoastCandidate('2', true)?.code, 'RL-L2');
  assert.equal(localRoastCandidate('85', true), null);
  assert.equal(localRoastCandidate('2', false), null);
});

test('mixed label layouts preserve separate variety and roast evidence', () => {
  const parsed = extractRecognitionEvidence('VARIETAL 74110 / 74112\nROAST LEVEL L1');
  assert.deepEqual(parsed.fields.varietyCode, ['74110 / 74112']);
  assert.deepEqual(parsed.fields.roastCode, ['L1']);
});

test('equally exact codebook candidates remain a manual choice', () => {
  const candidates = fieldCandidates('varietyCode', '74110 / 74112', book, {}, 8);
  assert.equal(candidates[0].score, candidates[1].score);
  assert.notEqual(candidates[0].code, candidates[1].code);
  assert.equal(bestCandidateDecision(candidates, { minimum: 0.8, margin: 0.055 }), null);
});
