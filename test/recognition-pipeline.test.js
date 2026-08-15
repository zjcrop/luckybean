import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRecognitionDocument } from '../src/domain/recognition/recognition-document.js';
import { analyzeRecognitionDocument } from '../src/domain/recognition/recognition-pipeline.js';

const book = JSON.parse(readFileSync(new URL('../public/fallback-codebook.json', import.meta.url), 'utf8'));
const box = (left, top, right, bottom) => [[left, top], [right, top], [right, bottom], [left, bottom]];

function pairedDocument(pairs) {
  const blocks = [];
  pairs.forEach(([label, value], index) => {
    const top = 20 + index * 42;
    blocks.push({ id: `label-${index}`, imageId: 'back', text: label, polygon: box(20, top, 150, top + 24), confidence: 0.94 });
    blocks.push({ id: `value-${index}`, imageId: 'back', text: value, polygon: box(180, top, 520, top + 24), confidence: 0.93 });
  });
  return createRecognitionDocument({
    images: [{ id: 'back', role: 'back' }],
    blocks,
    engine: 'native-golden',
    fullText: blocks.map(item => item.text).join('\n')
  });
}

test('English labels and coffee values become Chinese canonical bean fields', () => {
  const document = pairedDocument([
    ['COUNTRY', 'ETHIOPIA'],
    ['REGION', 'GUJI'],
    ['PROCESS', 'WASHED'],
    ['VARIETY', '74110'],
    ['ROAST LEVEL', 'L2'],
    ['TASTING NOTES', 'BLUEBERRY, JASMINE, HONEY']
  ]);
  const analysis = analyzeRecognitionDocument(document, book);
  assert.match(analysis.semanticText, /国家: ETHIOPIA/);
  assert.equal(analysis.parsed.countryCode, 'CO-EA');
  assert.equal(analysis.parsed.regionCode, 'RG-EA-GU');
  assert.equal(analysis.parsed.processCode, 'PR-WA');
  assert.equal(analysis.parsed.varietyCode, 'VA-JA10');
  assert.equal(analysis.parsed.roastCode, 'RL-L2');
  assert.equal(analysis.parsed.entityCode, undefined, 'region evidence must not also become a station');
  assert.equal(analysis.parsed.altitude, undefined, 'variety digits must not become altitude');
  assert.equal(analysis.parsed.initialWeight, undefined, 'variety digits must not become weight');
  assert.deepEqual(analysis.parsed.customFlavorNames, undefined, 'translated flavor words must not remain as custom residue');
  const translated = Object.fromEntries(analysis.fields.map(item => [item.field, item.standardValue]));
  assert.equal(translated.countryCode, '埃塞俄比亚');
  assert.equal(translated.regionCode, '古吉');
  assert.equal(translated.processCode, '水洗');
  assert.match(translated.flavorCodes, /蓝莓/);
  assert.match(translated.flavorCodes, /茉莉/);
});

test('unknown proper names are preserved and explicitly marked for review', () => {
  const document = pairedDocument([
    ['COUNTRY', 'BRAZIL'],
    ['FARM', 'Fazenda Esperanca Experimental Lot']
  ]);
  const analysis = analyzeRecognitionDocument(document, book);
  const farm = analysis.fields.find(item => item.field === 'entityCode');
  assert.equal(analysis.parsed.countryCode, 'CO-BR');
  assert.equal(analysis.parsed.entityCode, undefined);
  assert.equal(analysis.parsed.entityCustomName, 'Fazenda Esperanca Experimental Lot');
  assert.equal(farm?.status, 'review');
  assert.equal(farm?.rawValue, 'Fazenda Esperanca Experimental Lot');
});

test('explicit numeric fields are parsed while unrelated numbers stay isolated', () => {
  const document = pairedDocument([
    ['VARIETY', '74112'],
    ['ALTITUDE', '1950 MASL'],
    ['NET WEIGHT', '150 g'],
    ['ROASTED ON', '2026-08-12']
  ]);
  const analysis = analyzeRecognitionDocument(document, book);
  assert.equal(analysis.parsed.altitude, 1950);
  assert.equal(analysis.parsed.initialWeight, 150);
  assert.equal(analysis.parsed.roastDate, '2026-08-12');
  assert.notEqual(analysis.parsed.altitude, 7411);
  assert.notEqual(analysis.parsed.initialWeight, 7411);
});

test('Chinese, reverse-labelled and vertical fields share one canonical pipeline', () => {
  const blocks = [
    { id: 'country', imageId: 'front', text: '埃塞俄比亚：国家', polygon: box(20, 20, 250, 46), confidence: 0.95 },
    { id: 'process-value', imageId: 'front', text: '日晒', polygon: box(250, 70, 330, 96), confidence: 0.94 },
    { id: 'process-label', imageId: 'front', text: '处理法', polygon: box(255, 108, 330, 134), confidence: 0.95 }
  ];
  const document = createRecognitionDocument({ images: [{ id: 'front', role: 'front' }], blocks, fullText: blocks.map(item => item.text).join('\n') });
  const analysis = analyzeRecognitionDocument(document, book);
  assert.match(analysis.semanticText, /国家: 埃塞俄比亚/);
  assert.match(analysis.semanticText, /处理法: 日晒/);
  assert.equal(analysis.parsed.countryCode, 'CO-EA');
  assert.equal(analysis.parsed.processCode, 'PR-NA');
});
