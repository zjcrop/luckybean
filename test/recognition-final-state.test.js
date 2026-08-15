import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('confirmed recognition does not render evidence panel in normal bean form', () => {
  assert.match(source, /source\.showRecognitionEvidence === true && source\.evidence/);
  assert.match(source, /showRecognitionEvidence: false/);
});

test('recognition provenance remains persisted for audit without becoming review UI', () => {
  assert.match(source, /recognitionProvenance:/);
  assert.match(source, /parseMetadata: structuredClone\(source\.parseMetadata\)/);
  assert.match(source, /evidence: structuredClone\(source\.evidence \|\| \{\}\)/);
});

test('confirmed roast date is still saved from the form value', () => {
  assert.match(source, /roastDate: formValue\('beanRoastDate'\)/);
});
