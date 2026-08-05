import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeFallbackPlan } from '../src/brew-engine.js';
import { computeInventory } from '../src/core-v2/domain/inventory.js';

const root = path.resolve(import.meta.dirname, '..');
const fixture = JSON.parse(fs.readFileSync(
  path.join(root, 'tests/fixtures/core-v2-golden-inputs.json'),
  'utf8'
));

function planWater(plan) {
  const stages = Array.isArray(plan.stages) ? plan.stages : [];
  return Number(plan.totals?.waterG ?? stages.at(-1)?.cumulativeWaterG ?? 0);
}

function assertPlanIntegrity(testCase, plan) {
  const stages = Array.isArray(plan.stages) ? plan.stages : [];
  assert.ok(stages.length >= 2 && stages.length <= 8, `${testCase.id}: invalid stage count`);
  const expectedWater = testCase.input.brew.doseG * testCase.input.brew.ratio;
  assert.ok(Math.abs(planWater(plan) - expectedWater) <= 0.11, `${testCase.id}: total water drift`);

  let previousCumulative = 0;
  let sum = 0;
  for (const [index, stage] of stages.entries()) {
    const stageWater = Number(stage.stageWaterG);
    const cumulative = Number(stage.cumulativeWaterG);
    const temperature = Number(stage.temperatureC);
    const duration = Number(stage.durationSec);
    assert.ok(Number.isFinite(stageWater) && stageWater > 0, `${testCase.id}: stage ${index + 1} water`);
    assert.ok(Number.isFinite(cumulative) && cumulative > previousCumulative, `${testCase.id}: cumulative water`);
    assert.ok(Number.isFinite(temperature) && temperature >= 70 && temperature <= 100, `${testCase.id}: temperature`);
    assert.ok(Number.isFinite(duration) && duration > 0 && duration <= 240, `${testCase.id}: duration`);
    sum += stageWater;
    previousCumulative = cumulative;
  }
  assert.ok(Math.abs(sum - expectedWater) <= 0.11, `${testCase.id}: stage water sum drift`);
  assert.ok(Math.abs(previousCumulative - expectedWater) <= 0.11, `${testCase.id}: final cumulative drift`);

  const explicitSegments = Number(testCase.input.brew.segmentMode);
  if (Number.isInteger(explicitSegments) && explicitSegments >= 2) {
    assert.equal(stages.length, explicitSegments, `${testCase.id}: explicit segment count changed`);
  }
}

for (const testCase of fixture.brewCases) {
  test(`golden brew invariant: ${testCase.id}`, async () => {
    const plan = await computeFallbackPlan(testCase.input);
    assertPlanIntegrity(testCase, plan);
  });
}

test('golden inventory event sequence remains 168.2 g', () => {
  const result = computeInventory(fixture.inventoryCase.events, {
    beanId: fixture.inventoryCase.beanId,
    floorAtZero: true
  });
  assert.equal(result.remainingG, 168.2);
  assert.equal(result.eventCount, 4);
  assert.equal(result.consumedG, 30);
  assert.equal(result.adjustmentG, -1.8);
});

test('golden QR payload remains directly representable as Schema v3 bean JSON', () => {
  const value = fixture.qrCase;
  assert.equal(value.schemaVersion, 3);
  assert.equal(value.countryCode, 'PA');
  assert.equal(value.varietyCode, 'GEISHA');
  assert.equal(value.processCode, 'WASHED');
  assert.equal(value.remainingWeight, 85);
  const encoded = JSON.stringify(value);
  assert.ok(Buffer.byteLength(encoded, 'utf8') < 2950);
});
