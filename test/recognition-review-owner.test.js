import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');

test('unresolved recognition rows remain canonical review UI when no codebook candidate exists', () => {
  const runtime = read('src/features/runtime-features.js');
  const owner = read('src/ui/recognition-review-owner-controller.js');
  const index = read('index.html');

  assert.match(runtime, /feature\('recognition-review-owner', '\.\.\/ui\/recognition-review-owner-controller\.js'\)/);
  assert.match(owner, /\[data-recognition-review="pending"\] \.text-evidence/);
  assert.match(owner, /\.evidence-row\[data-evidence-field\]/);
  assert.match(owner, /container\.dataset\.integrityEvidence = '1'/);
  assert.match(owner, /no reliable\s+standard candidate/);
  assert.match(index, /runtime-features\.js\?v=1\.24B-main\.18-review-owner/);
});
