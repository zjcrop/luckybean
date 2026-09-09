import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repairRecognitionSemanticText } from '../src/domain/recognition/recognition-semantic-repair.js';
import { parseNaturalLanguage } from '../src/codebook.js';

const book = JSON.parse(readFileSync(new URL('../public/fallback-codebook.json', import.meta.url), 'utf8'));
const sample = `风味: 哥伦比亚、慧兰、小农粉红波旁
烘焙日期: 七月十五日
风味: 牛奶草莓、樱
桃、甘蔗
烘焙商: 双重发酵水洗浅烘45G
冲煮建议:
92度
仓
豆
50~120~180~225`;

test('bad layout labels cannot override stronger coffee-domain field semantics', () => {
  const repaired = repairRecognitionSemanticText(sample, book);
  assert.match(repaired, /^国家: 哥伦比亚$/m);
  assert.match(repaired, /^产区: 慧兰$/m);
  assert.match(repaired, /^豆种: 粉波旁$/m);
  assert.match(repaired, /^烘焙日期: 20\d{2}年7月15日$/m);
  assert.match(repaired, /^风味: 牛奶草莓、樱桃、甘蔗$/m);
  assert.match(repaired, /^处理法: 双重发酵水洗$/m);
  assert.match(repaired, /^烘焙度: 浅烘$/m);
  assert.match(repaired, /^净重: 45G$/m);
  assert.doesNotMatch(repaired, /^烘焙商:/m);
  assert.doesNotMatch(repaired, /冲煮建议|92度|50~120~180~225|^仓$|^豆$/m);
});

test('repaired sample reaches canonical country region variety process roast date and weight fields', () => {
  const repaired = repairRecognitionSemanticText(sample, book);
  const parsed = parseNaturalLanguage(repaired, book);
  assert.equal(parsed.countryCode, 'CO-CO');
  assert.equal(parsed.regionCode, 'RG-CO-HUI');
  assert.equal(parsed.varietyCode, 'VA-PB');
  assert.equal(parsed.processCode, 'PR-DF');
  assert.equal(parsed.roastCode, 'RL-L1');
  assert.equal(parsed.initialWeight, 45);
  assert.match(String(parsed.roastDate || ''), /^20\d{2}-07-15$/);
  assert.equal(parsed.roasterName, undefined);
});
