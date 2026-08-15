import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LABEL_LEXICON, parseHarvestSeasonValue, parseNaturalLanguage } from '../src/codebook.js';
import { RECOGNITION_FIELD_ALIASES, recognitionDocumentFromText } from '../src/domain/recognition/recognition-document.js';

const emptyBook = { countries: [], regions: [], entities: [], varieties: [], processes: [], flavors: [] };

test('harvest aliases cover simplified/traditional/English/Japanese/Korean', () => {
  for (const token of ['产季','產季','crop year','クロップ年度','収穫年','수확년도','크롭 연도']) {
    assert.ok(DEFAULT_LABEL_LEXICON.harvest.includes(token), token);
    assert.ok(RECOGNITION_FIELD_ALIASES.harvest.includes(token), token);
  }
});

test('harvest parser normalizes Chinese, Japanese and Korean seasons', () => {
  assert.equal(parseHarvestSeasonValue('產季：2025/26').normalizedValue, '2025/2026');
  assert.equal(parseHarvestSeasonValue('25/26クロップ').normalizedValue, '2025/2026');
  assert.equal(parseHarvestSeasonValue('수확년도 2026').normalizedValue, '2026');
  assert.equal(parseHarvestSeasonValue('2026年産').normalizedValue, '2026');
});

test('harvest line is consumed and cannot leak into roast altitude or weight', () => {
  const result = parseNaturalLanguage('產季：2025/26\n品種：ゲイシャ', emptyBook);
  assert.equal(result.harvestSeason, '2025/2026');
  assert.equal(result.roastCode, undefined);
  assert.equal(result.altitude, undefined);
  assert.equal(result.initialWeight, undefined);
});

test('layout parser recognizes reversed Japanese and Korean harvest labels', () => {
  const ja = recognitionDocumentFromText('2025/26：クロップ年度');
  const ko = recognitionDocumentFromText('2026：수확년도');
  assert.equal(ja.relations[0]?.field, 'harvest');
  assert.equal(ko.relations[0]?.field, 'harvest');
});


test('explicit labeled numeric roast level is normalized without scanning crop numbers', () => {
  const result = parseNaturalLanguage('CROP YEAR: 2025/26\nROAST LEVEL: L2', emptyBook);
  assert.equal(result.harvestSeason, '2025/2026');
  assert.equal(result.roastCode, 'RL-L2');
});
