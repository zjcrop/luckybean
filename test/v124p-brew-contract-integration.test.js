import test from 'node:test';
import assert from 'node:assert/strict';
import { attachBrewContracts, toCanonicalBrewPlan } from '../src/contracts/brew-contract-adapter.js';
import { BrewCalculationCoordinator } from '../src/services/brew-calculation-coordinator.js';
import { compareAnalyses } from '../src/domain/history/history-comparison.js';
import { getFlavorVectorFields } from '../src/flavor-vector.js';

const spatial = {
  schemaVersion: 'brew-spatial/1.3',
  planFingerprint: 'plan-test',
  path: [[0,25,0],[180,82,240]],
  targets: [],
  summary: [
    { id:'floral', mean:.62, peak:.74 },
    { id:'fruity', mean:.70, peak:.82 },
    { id:'acidity', mean:.58, peak:.68 },
    { id:'sweetness', mean:.65, peak:.76 },
    { id:'bitterness', mean:.20, peak:.30 },
    { id:'astringency', mean:.14, peak:.22 }
  ]
};

const legacyPlan = {
  executionSource: 'brew-profiles-authoritative',
  analysisFingerprint: 'analysis-test',
  analysisSnapshot: {
    contract: 'brew-analysis/2.1',
    analysisFingerprint: 'analysis-test',
    metadata: { inputFingerprint: 'sha256:test' },
    plan: { profile: { id: 'switch-hybrid-50-50' } },
    trajectory: spatial
  },
  profile: { id: 'switch-hybrid-50-50' },
  stages: [
    { name: '第一段·开放渗滤', stageWaterG: 120, temperatureC: 92, durationSec: 45, method: '圆周注水' },
    { name: '第二段·关闭浸泡后释放', stageWaterG: 120, temperatureC: 90, durationSec: 135, method: '关阀加入后半水量浸泡，随后开阀完成下滤' }
  ],
  trajectory: spatial,
  visualization3d: spatial
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

test('BrewResult 1.1 carries spatial evidence and a superset flavor vector', () => {
  const wrapped = attachBrewContracts(legacyPlan, { brew: { serveMode: 'hot' } });
  assert.equal(wrapped.profile.id, 'switch-hybrid-50-50');
  assert.equal(wrapped.contracts.brewPlan.schemaVersion, 'brew-plan/1.0');
  assert.equal(wrapped.contracts.brewResult.version, '1.1');
  assert.equal(wrapped.contracts.brewResult.physical.spatial.schemaVersion, 'brew-spatial/1.3');
  assert.ok(wrapped.contracts.brewResult.flavor.floral > 60);
  assert.ok(wrapped.contracts.brewResult.flavor.fruity > 70);
  assert.ok(wrapped.contracts.brewResult.flavor.aroma > 65);
  assert.equal(wrapped.contracts.brewResult.uncertainty.level, 'medium');
  assert.ok(getFlavorVectorFields().includes('astringency'));
  assert.ok(getFlavorVectorFields().includes('aftertaste'));
  assert.equal(wrapped.analysisSnapshot.brewResult.version, '1.1');
  assert.equal(wrapped.analysisSnapshot.brewPlan.brewType, 'IMMERSION_RELEASE');
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
  assert.equal(result.plan.analysisSnapshot.brewResult.metadata.analysisFingerprint, 'analysis-test');
  assert.equal(result.latest, true);
});

test('history comparison prefers persisted BrewResult flavor over legacy trajectory summaries', () => {
  const previous = { analysisSnapshot: attachBrewContracts(legacyPlan, {}).analysisSnapshot };
  const changedPlan = structuredClone(legacyPlan);
  changedPlan.visualization3d.summary = changedPlan.visualization3d.summary.map(item => item.id === 'sweetness' ? { ...item, mean:.82, peak:.90 } : item);
  changedPlan.trajectory = changedPlan.visualization3d;
  changedPlan.analysisSnapshot.trajectory = changedPlan.visualization3d;
  const current = { analysisSnapshot: attachBrewContracts(changedPlan, {}).analysisSnapshot };
  current.analysisSnapshot.trajectory.summary = [];
  previous.analysisSnapshot.trajectory.summary = [];
  const comparison = compareAnalyses(previous, current);
  const sweetness = comparison.signals.find(item => item.id === 'sweetness');
  assert.equal(comparison.resultContract, 'BrewResult 1.1');
  assert.ok(sweetness.delta > .1);
  assert.equal(sweetness.direction.key, 'significant-up');
});
