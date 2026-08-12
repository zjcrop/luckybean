import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePlan } from '../src/brew-engine.js';

function authoritativePlan(contract) {
  return {
    analysisContract: contract,
    analysisFingerprint: `sha256:${'a'.repeat(64)}`,
    engineVersion: 'brew-plan-v23',
    profileVersion: 'three-pulse@test',
    profile: { id: 'three-pulse' },
    stages: [
      { index: 1, durationSec: 35, stageWaterG: 45, cumulativeWaterG: 45, temperatureC: 88 },
      { index: 2, durationSec: 30, stageWaterG: 100, cumulativeWaterG: 145, temperatureC: 92 },
      { index: 3, durationSec: 40, stageWaterG: 80, cumulativeWaterG: 225, temperatureC: 86 }
    ],
    totals: { waterG: 225 }
  };
}

for (const contract of ['brew-analysis/2.0', 'brew-analysis/2.1']) {
  assert.doesNotThrow(() => validatePlan(authoritativePlan(contract)), `${contract} must pass final LuckyBean plan validation`);
}

assert.throws(
  () => validatePlan(authoritativePlan('brew-analysis/9.9')),
  /方案分析契约不兼容/,
  'unknown authoritative contracts must still be rejected'
);

const history = fs.readFileSync(new URL('../src/domain/history/history-service.js', import.meta.url), 'utf8');
assert.match(history, /SUPPORTED_ANALYSIS_CONTRACTS = new Set\(\['brew-analysis\/2\.0', CURRENT_ANALYSIS_CONTRACT\]\)/);
assert.match(history, /CURRENT_ANALYSIS_CONTRACT = 'brew-analysis\/2\.1'/);
assert.match(history, /CURRENT_SPATIAL_CONTRACT = 'brew-spatial\/1\.3'/);
assert.match(history, /SUPPORTED_SPATIAL_CONTRACTS = new Set\(\['brew-spatial\/1\.1', 'brew-spatial\/1\.2', CURRENT_SPATIAL_CONTRACT\]\)/);
assert.match(history, /SUPPORTED_ANALYSIS_CONTRACTS\.has\(snapshot\.contract\)/);
assert.match(history, /SUPPORTED_SPATIAL_CONTRACTS\.has\(snapshot\.trajectory\?\.schemaVersion\)/);

console.log('Verified LuckyBean plan and brew-history validators accept BrewProfiles 2.0/2.1 and spatial 1.1/1.2/1.3 while rejecting unknown plan contracts.');
