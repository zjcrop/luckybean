import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const batch = fs.readFileSync(new URL('../src/ui/bean-batch-manager-controller.js', import.meta.url), 'utf8');
const groups = fs.readFileSync(new URL('../src/ui/bean-group-actions-controller.js', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../src/features/runtime-features.js', import.meta.url), 'utf8');

test('P2 batch manager owns all requested filters and delegates lifecycle changes', () => {
  for (const token of ['filter-added-from','filter-added-to','filter-roast-from','filter-roast-to','filter-remaining-min','filter-remaining-max','filter-country','filter-origin','filter-freshness']) assert.match(batch, new RegExp(token));
  assert.match(batch, /moveBeansToRecycle/);
  assert.match(batch, /restoreBeansFromRecycle/);
  assert.doesNotMatch(batch, /remove\(['"]beans['"]/);
});

test('group long press deletes a resolved group in one lifecycle batch', () => {
  assert.match(groups, /LONG_PRESS_MS/);
  assert.match(groups, /data-delete-bean-group/);
  assert.match(groups, /moveBeansToRecycle\(group\.ids\)/);
  assert.doesNotMatch(groups, /remove\(['"]beans['"]/);
});

test('inventory controllers are startup core features, not parallel app-level state machines', () => {
  assert.match(runtime, /feature\('bean-batch-manager'/);
  assert.match(runtime, /feature\('bean-group-actions'/);
});
