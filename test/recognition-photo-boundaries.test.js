import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseNaturalLanguage } from '../src/codebook.js';
import { repairRecognitionSemanticText } from '../src/domain/recognition/recognition-semantic-repair.js';
import { analyzeRecognitionDocument } from '../src/domain/recognition/recognition-pipeline.js';
import { recognitionDocumentFromText } from '../src/domain/recognition/recognition-document.js';
const book=JSON.parse(fs.readFileSync(new URL('../public/fallback-codebook.json',import.meta.url)));
test('altitude ranges preserve both endpoints and require review instead of silently choosing minimum',()=>{
  for(const separator of ['-','–','—','至','~']) {
    const raw='海拔:1500'+separator+'1700M';const parsed=parseNaturalLanguage(raw,book);
    assert.equal(parsed.altitude,undefined);assert.equal(parsed.parseMetadata.altitude.minimum,1500);assert.equal(parsed.parseMetadata.altitude.maximum,1700);
    const analysis=analyzeRecognitionDocument(recognitionDocumentFromText(raw),book);
    assert.equal(analysis.fields.find(row=>row.field==='altitude')?.status,'review');assert.match(analysis.fields.find(row=>row.field==='altitude')?.rawValue,/1500/);
  }
  assert.equal(parseNaturalLanguage('海拔:1500M',book).altitude,1500);
});
test('leading explicit crop season is parsed without consuming bag identity or creating a harvest date',()=>{
  const raw='26产季 巴拿马 波奎特 精品级\n烘焙时间:26.9.20\n净重:15g';
  const repaired=repairRecognitionSemanticText(raw,book);assert.match(repaired,/产季: 26/);assert.match(repaired,/巴拿马 波奎特 精品级/);
  const document=recognitionDocumentFromText(raw);
  const before=structuredClone(document);
  const analysis=analyzeRecognitionDocument(document,book);
  assert.equal(analysis.parsed.harvestYear,2026);assert.equal(analysis.parsed.initialWeight,15);assert.equal(analysis.parsed.roastDate,'2026-09-20');
  assert.deepEqual(document,before);
  assert.equal(document.rawFullText,raw);
});
