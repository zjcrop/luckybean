import test from 'node:test';
import assert from 'node:assert/strict';
import { recognitionDocumentFromText, createRecognitionDocument } from '../src/domain/recognition/recognition-document.js';
import { splitRecognitionEntries } from '../src/domain/recognition/recognition-entry-splitter.js';

test('explicit bean headings split into independent recognition documents', () => {
  const document = recognitionDocumentFromText(`样品1：\n国家: ETHIOPIA\n产区: GUJI\n处理法: NATURAL\n豆种: 74110\n\n样品2：\n国家: KENYA\n产区: NYERI\n处理法: WASHED\n豆种: SL28`);
  const result = splitRecognitionEntries(document);
  assert.equal(result.split, true);
  assert.equal(result.documents.length, 2);
  assert.equal(result.method, 'entry-headings');
  assert.match(result.documents[0].rawFullText, /ETHIOPIA/);
  assert.match(result.documents[1].rawFullText, /KENYA/);
  assert.equal(result.documents[0].extensions.multiEntry.index, 1);
  assert.equal(result.documents[1].extensions.multiEntry.index, 2);
  assert.equal(result.documents[0].extensions.multiEntry.requiresUserConfirmation, true);
});

test('repeated strong country anchors split when each segment contains multiple coffee fields', () => {
  const document = recognitionDocumentFromText(`COUNTRY: ETHIOPIA\nREGION: GUJI\nPROCESS: NATURAL\nVARIETY: 74110\nCOUNTRY: COLOMBIA\nREGION: HUILA\nPROCESS: WASHED\nVARIETY: CASTILLO`);
  const result = splitRecognitionEntries(document);
  assert.equal(result.split, true);
  assert.equal(result.documents.length, 2);
  assert.equal(result.method, 'repeated-country-anchor');
});

test('multi-view photos of one bean are never split merely because images produce paragraphs', () => {
  const document = createRecognitionDocument({
    images:[{id:'front',role:'front'},{id:'back',role:'back'}],
    blocks:[
      {id:'f1',imageId:'front',text:'COUNTRY: ETHIOPIA',confidence:0.95},
      {id:'f2',imageId:'front',text:'REGION: GUJI',confidence:0.95},
      {id:'b1',imageId:'back',text:'PROCESS: NATURAL',confidence:0.95},
      {id:'b2',imageId:'back',text:'VARIETY: 74110',confidence:0.95}
    ],
    fullText:'COUNTRY: ETHIOPIA\nREGION: GUJI\n\nPROCESS: NATURAL\nVARIETY: 74110'
  });
  const result = splitRecognitionEntries(document);
  assert.equal(result.split, false);
  assert.equal(result.documents.length, 1);
});

test('weak prose is kept as one recognition document to prevent false bean creation', () => {
  const document = recognitionDocumentFromText('Ethiopia Guji natural coffee with jasmine and blueberry. Roast carefully.');
  const result = splitRecognitionEntries(document);
  assert.equal(result.split, false);
  assert.equal(result.documents.length, 1);
});
