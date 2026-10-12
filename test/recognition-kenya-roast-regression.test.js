import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRecognitionDocument } from '../src/domain/recognition/recognition-document.js';
import { analyzeRecognitionDocument } from '../src/domain/recognition/recognition-pipeline.js';

const book = JSON.parse(readFileSync(new URL('../public/fallback-codebook.json', import.meta.url), 'utf8'));
const raw = `尼亚麒麟雅加AA基安盖处理站#2676
SL28&SL34&鲁伊鲁11水洗
风味: 梅子乌梅干黑糖红茶
养豆期:7-12天
共
烘焙度: 中深烘焙
生产日期: 2026.09.23
净重: 159，`;
const analyze = text => analyzeRecognitionDocument(createRecognitionDocument({ fullText:text }), book);

test('country omitted by OCR is recovered from the exact reviewed region, with raw evidence intact', () => {
  const result = analyze(raw);
  assert.equal(result.parsed.countryCode, 'CO-KE');
  assert.equal(result.parsed.regionCode, 'RG-KE-KIR');
  assert.equal(result.parsed.roastCode, 'RL-L4');
  assert.equal(result.parsed.processCode, 'PR-WA');
  assert.equal(result.parsed.parseMetadata.countryInference.source, 'exact-region-parent');
  assert.equal(result.parsed.parseMetadata.recognition.rawFullText, raw);
  assert.equal(result.parsed.roastDate, undefined);
  assert.equal(result.parsed.parseMetadata.productionDate.normalizedValue, '2026-09-23');
  // This fixture is text, so it cannot invent the photo's actual 15g.
  assert.equal(result.parsed.initialWeight, 159);
  assert.equal(result.fields.find(row => row.field === 'initialWeight').status, 'review');
});

test('truncated country alone and Kenyan varieties do not imply a country', () => {
  assert.equal(analyze('尼亚\nSL28&SL34&鲁伊鲁11 水洗').parsed.countryCode, undefined);
});

test('explicit contradictory country is preserved and multiple countries cannot imply one', () => {
  assert.equal(analyze('国家: 哥伦比亚\n麒麟雅加').parsed.countryCode, 'CO-CO');
  assert.equal(analyze('麒麟雅加\nGuji').parsed.countryCode, undefined);
});

test('Chinese roast degree survives spaces and line wrapping, including same-line production date', () => {
  for (const degree of ['中深烘焙','中 深 烘焙','中\n深 烘焙','中\n深\n烘\n焙']) {
    const result = analyze(`烘焙度: ${degree} 生产日期: 2026.09.23`);
    assert.equal(result.parsed.roastCode, 'RL-L4', degree);
    assert.equal(result.fields.find(row => row.field === 'roastCode')?.resolved, true);
    assert.equal(result.parsed.roastDate, undefined);
  }
});
