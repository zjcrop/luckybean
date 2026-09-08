import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRecognitionDocument } from '../src/domain/recognition/recognition-document.js';
import { analyzeRecognitionDocument } from '../src/domain/recognition/recognition-pipeline.js';
import { preNormalizeRecognitionSemanticText } from '../src/domain/recognition/recognition-pre-semantic-normalizer.js';

const book = JSON.parse(readFileSync(new URL('../public/fallback-codebook.json', import.meta.url), 'utf8'));

function textDocument(fullText) {
  return createRecognitionDocument({
    images: [{ id:'pre-semantic', role:'front' }],
    blocks: [],
    engine: 'pre-semantic-regression',
    fullText
  });
}

test('raw OCR remains authoritative while Traditional Chinese and coffee terminology are normalized before field recognition', () => {
  const raw = [
    '哥倫比亞',
    '中焙',
    '展望莊園',
    '水洗',
    '榛果I陳皮|紅糖',
    '酸度1',
    '薇拉省'
  ].join('\n');
  const result = preNormalizeRecognitionSemanticText(raw, book);

  assert.equal(result.rawText, raw, 'raw OCR evidence must be preserved');
  assert.equal(result.mayOverwriteRawEvidence, false);
  assert.match(result.normalizedText, /国家: 哥伦比亚/u);
  assert.match(result.normalizedText, /烘焙度: 中烘/u);
  assert.match(result.normalizedText, /庄园: 展望庄园/u);
  assert.match(result.normalizedText, /处理法: 水洗/u);
  assert.match(result.normalizedText, /风味: 榛果、陈皮、红糖/u);
  assert.match(result.normalizedText, /产区: 薇拉省/u);
  assert.match(result.normalizedText, /(?:^|\n)酸度1(?:\n|$)/u);
  const regionAudit = result.audit.find(item => item.rawText === '薇拉省');
  assert.ok(regionAudit?.candidates.some(candidate => candidate.rule.includes('transliteration') && candidate.aliases.includes('Huila')));
});

test('bare coffee-origin transliterations provide field hints before canonical field parsing', () => {
  const result = preNormalizeRecognitionSemanticText('薇拉\n耶加雪啡\n西達摩', book);
  assert.match(result.normalizedText, /^产区: Huila/u);
  assert.match(result.normalizedText, /产区: Yirgacheffe/u);
  assert.match(result.normalizedText, /产区: Sidama/u);
  const fields = result.lines.flatMap(line => line.candidates.map(candidate => candidate.field));
  assert.deepEqual(fields, ['region','region','region']);
});

test('Japanese and Korean coffee process/roast terminology is normalized locally without AI', () => {
  const result = preNormalizeRecognitionSemanticText('ウォッシュド\n中煎り\n내추럴\n중배전', book);
  assert.equal(result.normalizedText, [
    '处理法: 水洗 / Washed',
    '烘焙度: 中烘',
    '处理法: 日晒 / Natural',
    '烘焙度: 中烘'
  ].join('\n'));
  assert.ok(result.audit.every(item => item.candidates.every(candidate => candidate.authority === 'normalization-shadow')));
});

test('context-sensitive separator repair does not corrupt legitimate Latin variety names', () => {
  const result = preNormalizeRecognitionSemanticText('IHCAFE 90\nSL14\n榛果I陳皮|紅糖', book);
  assert.match(result.normalizedText, /^IHCAFE 90\nSL14\n风味: 榛果、陈皮、红糖$/u);
});

test('pipeline persists pre-semantic audit and still resolves the user-reported sample with zero review', () => {
  const raw = [
    '哥倫比亞',
    '中焙',
    '展望莊園',
    '水洗',
    '榛果I陳皮|紅糖',
    '酸度1',
    '薇拉省'
  ].join('\n');
  const analysis = analyzeRecognitionDocument(textDocument(raw), book);
  const pre = analysis.parsed.parseMetadata.preSemanticNormalization;

  assert.equal(analysis.pipelineVersion, '1.24P-recognition-pipeline.7');
  assert.equal(analysis.reviewCount, 0);
  assert.equal(pre.mayOverwriteRawEvidence, false);
  assert.ok(Array.isArray(pre.audit) && pre.audit.length >= 5);
  assert.equal(analysis.parsed.parseMetadata.recognition.rawSemanticText, raw);
  assert.equal(analysis.parsed.countryCode, 'CO-CO');
  assert.equal(analysis.parsed.processCode, 'PR-WA');
  assert.equal(analysis.parsed.roastCode, 'RL-L3');
  assert.equal(analysis.parsed.entityCustomName, '展望庄园');
  assert.equal(analysis.parsed.regionCustomName, '薇拉省');
});
