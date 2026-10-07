import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const cards = fs.readFileSync(new URL('../src/features/full-integration-controller-v3.js', import.meta.url), 'utf8');
const detail = fs.readFileSync(new URL('../src/ui/bean-detail-presentation-controller.js', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../src/features/runtime-features.js', import.meta.url), 'utf8');
const storage = fs.readFileSync(new URL('../src/db-storage-core.js', import.meta.url), 'utf8');

test('bean card presentation reads lightweight beanSummaries rather than full histories', () => {
  assert.match(cards, /all\('beanSummaries'\)/);
  assert.match(cards, /bean\.roasterName/);
  assert.match(cards, /bean\.productName/);
  assert.doesNotMatch(cards, /all\('brewSessions'\)|all\('sensoryRecords'\)|all\('inventoryEvents'\)/);
});
test('detail projection loads only the selected full bean and preserves existing action nodes', () => {
  assert.match(detail, /get\('beans', lastBeanId\)/);
  assert.match(detail, /management\.replaceChildren\(edit, storage, archive, remove\)/);
  assert.match(detail, /secondary\.append\(correct\)/);
});
test('detail fact sheet is content-only, slash-delimited and strips duplicate legacy labels', () => {
  assert.ok(detail.includes("clean.join('\\u00a0/\\u00a0')"), 'slash separators must remain attached during wrapping');
  assert.match(detail, /dataset\.beanDetailFacts = 'content-only'/);
  assert.match(detail, /DUPLICATE_DETAIL_LABELS/);
  assert.match(detail, /stripDuplicateLegacyFacts\(overlay\)/);
  assert.doesNotMatch(detail, /view\.notes/);
  assert.match(detail, /textContent \|\| ''\)\.trim\(\) === '风味'/);
});
test('presentation controllers are core runtime features', () => {
  assert.ok(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').includes('full-integration-controller-v3.js'));
  assert.doesNotMatch(runtime, /bean-card-presentation-controller/);
  assert.match(runtime, /feature\('bean-detail-presentation'/);
  assert.match(runtime, /feature\('bean-thumbnail'/);
});

test('bean directory summaries retain the roaster and product brand without storing thumbnails', () => {
  assert.match(storage, /roasterName: bean\.roasterName/);
  assert.match(storage, /productName: bean\.productName/);
  assert.doesNotMatch(storage, /beanThumbnail|thumbnailData/);
});
