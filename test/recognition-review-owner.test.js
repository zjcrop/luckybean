import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');

test('isolated unresolved country review is preserved without stealing mixed candidate panels', () => {
  const release = JSON.parse(read('release.json'));
  const runtime = read('src/features/runtime-features.js');
  const owner = read('src/ui/recognition-review-owner-controller.js');
  const integrity = read('src/integrity-ui-controller.js');
  const index = read('index.html');

  assert.match(runtime, /feature\('recognition-review-owner', '\.\.\/ui\/recognition-review-owner-controller\.js'\)/);
  assert.match(owner, /\[data-recognition-review="pending"\] \.text-evidence/);
  assert.match(owner, /\.evidence-row\[data-evidence-field\]/);
  assert.match(owner, /DIRECT_MANUAL_REVIEW_FIELDS = new Set\(\['countryCode'\]\)/);
  assert.match(owner, /rows\.every\(row => DIRECT_MANUAL_REVIEW_FIELDS\.has\(row\.dataset\.evidenceField \|\| ''\)\)/);
  assert.match(owner, /container\.dataset\.integrityEvidence = '1'/);
  assert.match(integrity, /container\.dataset\.integrityEvidence === '1'/);
  assert.ok(index.includes(`runtime-features.js?v=${release.revision}`));
});
