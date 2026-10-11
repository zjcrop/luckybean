import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fieldCandidates, reliableCandidates } from '../src/recognition-candidates.js';
import { bestCandidateDecision, extractRecognitionEvidence, localRoastCandidate } from '../src/ui-layout-controller.js';
import { parseNaturalLanguage } from '../src/codebook.js';
import { analyzeRecognitionDocument } from '../src/domain/recognition/recognition-pipeline.js';
import { recognitionDocumentFromText } from '../src/domain/recognition/recognition-document.js';

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

test('unsupported region evidence has no reliable candidates', () => {
  const candidates = fieldCandidates('regionCode', 'XQZ UNKNOWN REGION', book, { countryCode: 'CO-EA' }, 5);
  assert.ok(candidates.length > 0, 'the fuzzy matcher should expose its raw low-score results for diagnostics');
  assert.deepEqual(reliableCandidates('regionCode', candidates), []);
});


test('dictionary aliases are matched when the OCR wraps a labeled estate name across lines', () => {
  const wrappedBook = structuredClone(book);
  wrappedBook.entities.push(['ST-TEST-SARDO', 'CO-CR', 'estate_or_farm', '莎朵庄园', 'Sardo Estate', '莎朵', 'active']);
  const parsed = parseNaturalLanguage('庄园：莎朵庄\n园\n豆种：74110', wrappedBook);
  assert.equal(parsed.entityCode, 'ST-TEST-SARDO');
  assert.equal(parsed.varietyCode, 'VA-JA10');
});

test('unlabeled dictionary aliases match across OCR line endings', () => {
  const parsed = parseNaturalLanguage('蓝火山\n庄园', book);
  assert.equal(parsed.entityCode, 'ST-CR-VOL2');
});


test('near-match estate candidates remain available for explicit review', () => {
  const candidates = fieldCandidates('entityCode', '蓝火汕庄园', book, { countryCode:'CO-CR' }, 8);
  const reliable = reliableCandidates('entityCode', candidates);
  assert.ok(reliable.some(item => item.code === 'ST-CR-VOL2'));
  assert.ok(reliable.find(item => item.code === 'ST-CR-VOL2').score < 1, 'near matches are surfaced as candidates, not exact matches');
});


test('one-character estate OCR variant suggests a row for review without assigning a canonical code', () => {
  const parsed = parseNaturalLanguage('庄园：蓝火汕庄园', book);
  assert.equal(parsed.entityCode, undefined);
  assert.equal(parsed.entityCustomName, '蓝火汕庄园');
  assert.equal(parsed.parseMetadata.dictionaryMatchReview.entityCode.candidateCode, 'ST-CR-VOL2');
  assert.equal(parsed.parseMetadata.dictionaryMatchReview.entityCode.requiresUserConfirmation, true);
});

test('reported Volcan Azul label separates identity, award category, process suggestion and continuous flavors', () => {
  const raw = '样匀面条尝\n月季花蔓越莓杏桃车厘子蜂蜜\n哥斯达黎加·蓝色火山庄园·OT-036批次\n#2026.COE蜜处理与日晒第四名\n瑰夏庆氧日晒1650-1700m45s8.31';
  const analysis = analyzeRecognitionDocument(recognitionDocumentFromText(raw), book);
  const parsed = analysis.parsed;
  assert.equal(parsed.countryCode, 'CO-CR');
  assert.equal(parsed.entityCode, 'ST-CR-VOL2');
  assert.equal(parsed.varietyCode, 'VA-GE');
  assert.equal(parsed.processCode, undefined, 'an OCR correction remains a candidate');
  assert.equal(parsed.parseMetadata.dictionaryMatchReview.processCode.candidateCode, 'PR-ANN');
  assert.equal(analysis.fields.find(item => item.field === 'processCode').standardValue, '厌氧日晒');
  assert.equal(analysis.fields.find(item => item.field === 'processCode').status, 'review');
  assert.deepEqual(parsed.customFlavorNames, ['月季花', '蔓越莓', '杏桃', '车厘子']);
  assert.ok(parsed.flavorCodes.includes('FV-093'));
  assert.equal(parsed.parseMetadata.altitude.minimum, 1650);
  assert.equal(parsed.parseMetadata.altitude.maximum, 1700);
  assert.equal(parsed.initialWeight, undefined);
  assert.equal(parsed.roastDate, undefined);
  assert.equal(analysis.document.rawFullText, raw);
});

test('Chinese inline labels and a wrapped estate name remain separate fields throughout the pipeline', () => {
  const raw = '国家：哥斯达黎加庄园：蓝色火山庄\n园豆种：瑰夏处理法：厌氧日晒';
  const parsed = analyzeRecognitionDocument(recognitionDocumentFromText(raw), book).parsed;
  assert.equal(parsed.countryCode, 'CO-CR');
  assert.equal(parsed.entityCode, 'ST-CR-VOL2');
  assert.equal(parsed.varietyCode, 'VA-GE');
  assert.equal(parsed.processCode, 'PR-ANN');
});
