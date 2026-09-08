import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBeanCardProjection, buildBeanDetailProjection, compactHarvestSeasonLabel, compactVarietyLabel } from '../src/domain/beans/bean-display-projection.js';

test('JARC and Ethiopian landrace shortening are display-only projections', () => {
  assert.equal(compactVarietyLabel('JARC 74158'), '74158');
  assert.equal(compactVarietyLabel('埃塞原生种'), '原生种');
});
test('compact card follows country/origin/variety and roast/process/remaining structure', () => {
  const view = buildBeanCardProjection({ remainingWeight:90 }, { country:'埃塞', region:'古吉', variety:'JARC 74158', roast:'浅烘', process:'日晒' });
  assert.deepEqual(view.left, ['埃塞','古吉','74158']);
  assert.deepEqual(view.right, ['浅烘','日晒','90g']);
});
test('harvest season is compacted for display without changing stored data', () => {
  assert.equal(compactHarvestSeasonLabel('2026'), '26产季');
  assert.equal(compactHarvestSeasonLabel('2025/26'), '25/26产季');
  assert.equal(compactHarvestSeasonLabel('25-26产季'), '25/26产季');
});
test('detail projection exposes exactly origin/process/season and roast date/level/color rows', () => {
  const bean = {
    roastDate:'2026-05-16', roastColor:96, harvestSeason:'2026', processingStation:'Elton Bona', notes:'TOH冠军'
  };
  const view = buildBeanDetailProjection(bean, {
    country:'埃塞俄比亚', region:'西达摩', variety:'JARC 74158', process:'水洗', roast:'极浅烘'
  });
  assert.deepEqual(view.primary, ['埃塞俄比亚','74158']);
  assert.deepEqual(view.origin, ['西达摩','Elton Bona处理站','水洗','26产季']);
  assert.deepEqual(view.roast, ['2026-5-16','极浅烘','96']);
  assert.equal('notes' in view, false, 'notes/legacy metadata must not be injected into the compact fact sheet');
});
test('detail projection omits absent values instead of inventing placeholders', () => {
  const view = buildBeanDetailProjection({ roastDate:'2026-09-01' }, { country:'埃塞', variety:'原生种', process:'日晒' });
  assert.deepEqual(view.primary, ['埃塞','原生种']);
  assert.equal(view.secondary.length, 0);
  assert.deepEqual(view.origin, ['日晒']);
  assert.deepEqual(view.roast, ['2026-9-1']);
});
