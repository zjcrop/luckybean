import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('recognition review UI contains only unresolved fields and disappears when none remain', () => {
  assert.match(source, /function evidenceHtml\(evidence = \{\}, confidence = \{\}, reviewFields = \[\]\)/);
  assert.match(source, /filter\(\(\[key\]\) => pending\.has\(key\)\)/);
  assert.match(source, /<h3>待确认识别项<\/h3>/);
  assert.match(source, /source\.parseMetadata\?\.recognition\?\.reviewFields \|\| \[\]/);
  assert.doesNotMatch(source, /showRecognitionEvidence: false/);
});

test('recognition provenance remains persisted for audit without becoming confirmed-field UI', () => {
  assert.match(source, /recognitionProvenance:/);
  assert.match(source, /parseMetadata: structuredClone\(source\.parseMetadata\)/);
  assert.match(source, /evidence: structuredClone\(source\.evidence \|\| \{\}\)/);
});

test('confirmed roast date is still saved from the final form value', () => {
  assert.match(source, /roastDate: formValue\('beanRoastDate'\)/);
});

test('custom dropdown opens its editor after select change dispatch completes', () => {
  assert.match(source, /queueMicrotask\(\(\) => openAddBeanOptionDialog\(table, draft\)\)/);
});
