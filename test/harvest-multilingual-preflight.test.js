import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LABEL_LEXICON, parseHarvestSeasonValue, parseNaturalLanguage } from '../src/codebook.js';
import { RECOGNITION_FIELD_ALIASES, recognitionDocumentFromText } from '../src/domain/recognition/recognition-document.js';

const emptyBook = { countries: [], regions: [], entities: [], varieties: [], processes: [], flavors: [] };

test('harvest aliases cover five languages', () => {
  for (const token of ['产季','產季','crop year','クロップ年度','収穫年','수확년도','크롭 연도']) {
    assert.ok(DEFAULT_LABEL_LEXICON.harvest.includes(token), token);
    assert.ok(RECOGNITION_FIELD_ALIASES.harvest.includes(token), token);
  }
});

test('harvest parser normalizes multilingual seasons', () => {
  assert.equal(parseHarvestSeasonValue('產季：2025/26').normalizedValue, '2025/2026');
  assert.equal(parseHarvestSeasonValue('25/26クロップ').normalizedValue, '2025/2026');
  assert.equal(parseHarvestSeasonValue('수확년도 2026').normalizedValue, '2026');
});

test('labelled harvest data cannot leak into roast altitude or weight', () => {
  const result = parseNaturalLanguage('產季：2025/26\n品種：ゲイシャ', emptyBook);
  assert.equal(result.harvestSeason, '2025/2026');
  assert.equal(result.roastCode, undefined);
  assert.equal(result.altitude, undefined);
  assert.equal(result.initialWeight, undefined);
});

test('layout parser recognizes reversed Japanese and Korean harvest labels', () => {
  assert.equal(recognitionDocumentFromText('2025/26：クロップ年度').relations[0]?.field, 'harvest');
  assert.equal(recognitionDocumentFromText('2026：수확년도').relations[0]?.field, 'harvest');
});
