import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan } from '../src/brew-engine-core.js';
import { adaptAuthoritativePlan } from '../src/services/brew-analysis-service.js';

function authoritativePlan() {
  return {
    analysisContract: 'brew-analysis/2.0',
    analysisFingerprint: 'sha256:test-authoritative-plan',
    engineVersion: '2.3.1',
    profileVersion: 'four-six-v17@1.0.0',
    stages: [
      { index: 1, durationSec: 30, stageWaterG: 40, cumulativeWaterG: 40, temperatureC: 88 },
      { index: 2, durationSec: 30, stageWaterG: 60, cumulativeWaterG: 100, temperatureC: 92 }
    ],
    totals: { waterG: 100 }
  };
}

test('brew-analysis/2.0 authoritative plan does not require a legacy schemaVersion', () => {
  const plan = authoritativePlan();
  assert.equal(Object.hasOwn(plan, 'schemaVersion'), false);
  assert.equal(validatePlan(plan), plan);
});

test('production analysis envelope adapts into a plan accepted by the page validator', () => {
  const stages = authoritativePlan().stages;
  const analysis = {
    contract: 'brew-analysis/2.0',
    analysisFingerprint: 'sha256:test-authoritative-analysis',
    requestId: 'test-request',
    generatedAt: '2026-08-08T00:00:00.000Z',
    metadata: {
      engineVersion: '2.3.1',
      resolvedProfileId: 'four-six-v17',
      resolvedProfileVersion: '1.0.0',
      planFingerprint: 'sha256:test-plan'
    },
    plan: {
      metadata: { fingerprint: 'sha256:test-plan' },
      profile: { id: 'four-six-v17', version: '1.0.0' },
      stages,
      totals: { waterG: 100 }
    },
    trajectory: {
      schemaVersion: 'brew-spatial/1.1',
      planFingerprint: 'sha256:test-plan',
      path: [[0, 88, 0], [60, 92, 100]],
      targets: ['acidity', 'floral', 'fruity', 'sweetness', 'bitterness', 'astringency']
        .map(id => ({ id, points: Array.from({ length: 12 }, (_, index) => [index, index, index]) }))
    },
    prediction: {},
    warnings: []
  };
  const adapted = adaptAuthoritativePlan(analysis);
  assert.equal(adapted.engineVersion, '2.3.1');
  assert.equal(Object.hasOwn(adapted, 'schemaVersion'), false);
  assert.equal(validatePlan(adapted), adapted);
});

test('unknown analysis contracts and unversioned legacy plans remain rejected', () => {
  assert.throws(
    () => validatePlan({ ...authoritativePlan(), analysisContract: 'brew-analysis/3.0' }),
    /分析契约不兼容/
  );
  const legacy = authoritativePlan();
  delete legacy.analysisContract;
  delete legacy.analysisFingerprint;
  assert.throws(() => validatePlan(legacy), /Schema 版本不兼容/);
});
