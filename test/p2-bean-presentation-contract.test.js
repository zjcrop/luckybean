import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const cards = fs.readFileSync(new URL('../src/ui/bean-card-presentation-controller.js', import.meta.url), 'utf8');
const detail = fs.readFileSync(new URL('../src/ui/bean-detail-presentation-controller.js', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../src/features/runtime-features.js', import.meta.url), 'utf8');

test('bean card presentation reads lightweight beanSummaries rather than full histories', () => {
  assert.match(cards, /all\('beanSummaries'\)/);
  assert.doesNotMatch(cards, /all\('brewSessions'\)|all\('sensoryRecords'\)|all\('inventoryEvents'\)/);
});
test('detail projection loads only the selected full bean and preserves existing action nodes', () => {
  assert.match(detail, /get\('beans', lastBeanId\)/);
  assert.match(detail, /management\.replaceChildren\(edit, storage, archive, remove\)/);
  assert.match(detail, /secondary\.append\(correct\)/);
});
test('presentation controllers are core runtime features', () => {
  assert.match(runtime, /feature\('bean-card-presentation'/);
  assert.match(runtime, /feature\('bean-detail-presentation'/);
});
