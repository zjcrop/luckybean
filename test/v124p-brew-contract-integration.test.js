import test from 'node:test';
import assert from 'node:assert/strict';
import { attachBrewContracts, toCanonicalBrewPlan } from '../src/contracts/brew-contract-adapter.js';
import { BrewCalculationCoordinator } from '../src/services/brew-calculation-coordinator.js';

const legacyPlan = {
  executionSource: 'brew-profiles-authoritative',
  profile: { id: 'switch-hybrid-50-50' },
  stages: [
    { name: '第一段·开放渗滤', stageWaterG: 120, temperatureC: 92, durationSec: 45, method: '圆周注水' },
    { name: '第二段·关闭浸泡后释放', stageWaterG: 120, temperatureC: 90, durationSec: 135, method: '关阀加入后半水量浸泡，随后开阀完成下滤' }
  ],
  trajectory: [{ t: 0, waterG: 0 }, { t: 180, waterG: 240 }]
};

test('canonical brew plan preserves immersion semantics without replacing legacy plan', () => {
  const canonical = toCanonicalBrewPlan(legacyPlan, { brew: { serveMode: 'hot' } });
  assert.equal(canonical.schemaVersion, 'brew-plan/1.0');
  assert.equal(canonical.brewType, 'IMMERSION_RELEASE');
  assert.equal(canonical.stages.length, 2);
  assert.equal(canonical.stages[0].motion, 'CIRCLE');
  assert.equal(canonical.stages[1].valveState, 'CLOSED');
  assert.equal(legacyPlan.contracts, undefined);
});

test('attached BrewResult keeps unknown flavor dimensions null', () => {
  const wrapped = attachBrewContracts(legacyPlan, { brew: { serveMode: 'hot' } });
  assert.equal(wrapped.profile.id, 'switch-hybrid-50-50');
  assert.equal(wrapped.contracts.brewPlan.schemaVersion, 'brew-plan/1.0');
  assert.equal(wrapped.contracts.brewResult.version, '1.0');
  assert.equal(wrapped.contracts.brewResult.flavor.acidity, null);
  assert.equal(wrapped.contracts.brewResult.uncertainty.level, 'medium');
});

test('calculation coordinator attaches contracts on the authoritative runtime path', async () => {
  const coordinator = new BrewCalculationCoordinator(async () => structuredClone(legacyPlan));
  const result = await coordinator.calculate({
    input: { brew: { profileId: 'recommended', serveMode: 'hot' } },
    beanId: 'bean-1'
  });
  assert.equal(result.contract, 'brew-calculation-coordinator/1.1');
  assert.equal(result.plan.contracts.brewPlan.brewType, 'IMMERSION_RELEASE');
  assert.equal(result.plan.contracts.brewResult.physical.stages.length, 2);
  assert.equal(result.latest, true);
});
