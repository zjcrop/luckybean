import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recognitionDocumentFromText } from '../src/domain/recognition/recognition-document.js';
import { analyzeRecognitionDocument } from '../src/domain/recognition/recognition-pipeline.js';
const book=JSON.parse(readFileSync(new URL('../public/fallback-codebook.json',import.meta.url),'utf8'));

test('OCR variant of explicit net-weight label reaches bean quantity while raw evidence is retained',()=>{
  for(const label of ['净重','淨重','凈重','凈含量']) {
    const text='COUNTRY: Panama\nPROCESS: Washed\n'+label+'：15g';
    const document=recognitionDocumentFromText(text);
    const analysis=analyzeRecognitionDocument(document,book);
    assert.equal(analysis.parsed.initialWeight,15,label);
    assert.ok(document.rawFullText.includes(label), 'raw OCR evidence must retain '+label);
    assert.match(document.fullText,/净重:\s*15g/);
  }
});
