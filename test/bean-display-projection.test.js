import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBeanCardProjection, buildBeanDetailProjection, compactVarietyLabel } from '../src/domain/beans/bean-display-projection.js';

test('JARC and Ethiopian landrace shortening are display-only projections', () => {
  assert.equal(compactVarietyLabel('JARC 74158'), '74158');
  assert.equal(compactVarietyLabel('埃塞原生种'), '原生种');
});
test('compact card follows country/origin/variety and roast/process/remaining structure', () => {
  const view = buildBeanCardProjection({ remainingWeight:90 }, { country:'埃塞', region:'古吉', variety:'JARC 74158', roast:'浅烘', process:'日晒' });
  assert.deepEqual(view.left, ['埃塞','古吉','74158']);
  assert.deepEqual(view.right, ['浅烘','日晒','90g']);
});
test('detail projection omits absent values instead of inventing placeholders', () => {
  const view = buildBeanDetailProjection({ roastDate:'2026-09-01', notes:'TOH冠军' }, { country:'埃塞', variety:'原生种', process:'日晒' });
  assert.deepEqual(view.primary, ['埃塞','原生种']);
  assert.equal(view.secondary.length, 0);
  assert.ok(view.origin.includes('日晒'));
  assert.equal(view.notes, 'TOH冠军');
});
