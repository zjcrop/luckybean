import test from 'node:test';
import assert from 'node:assert/strict';
import { toStableBrewData, toBrewProfilesTransport, isStableBrewData } from '../src/contracts/stable-brew-data.js';
import { attachBrewContracts, toCanonicalBrewPlan } from '../src/contracts/brew-contract-adapter.js';

test('only omitted planning numbers receive documented defaults; explicit null and coercible values are rejected', () => {
  const omitted = toStableBrewData({});
  assert.equal(omitted.brew.doseG, 15);
  assert.equal(omitted.brew.ratio, 15.5);
  assert.equal(omitted.water.recipeVolumeL, 5);
  assert.equal(omitted.environment.ambientTemperatureC, 25);
  for (const value of [null, '', '15', true, false, NaN, Infinity, -1, 0]) {
    assert.throws(() => toStableBrewData({ brew: { doseG: value } }));
    assert.throws(() => toStableBrewData({ brew: { ratio: value } }));
    assert.throws(() => toStableBrewData({ water: { recipeVolumeL: value } }));
  }
  for (const value of [null, '', true, '25', NaN, Infinity]) assert.throws(() => toStableBrewData({ environment: { ambientTemperatureC: value } }));
  for (const value of [null, '', true, '2', -1, 4, NaN, Infinity]) assert.throws(() => toStableBrewData({ targets: { floral: value } }));
  assert.equal(toStableBrewData({ targets: { floral: 0 } }).targets.floral, 0);
});

test('nullable water and beverage measurements preserve null and real zero through stable transport', () => {
  const input = {
    brew: { doseG: 15 },
    water: { tdsMgL: null, ionsMgL: { Ca: null, Mg: 0 }, alkalinityMgLAsCaCO3: null, customProfile: { tds: null } },
    measurements: { doseG: null, beverageTdsPct: 0, beverageMassG: null },
    environment: { relativeHumidityPct: null }
  };
  const before = structuredClone(input), stable = toStableBrewData(input);
  assert.deepEqual(input, before);
  assert.equal(stable.water.tdsMgL, null);
  assert.deepEqual(stable.water.ionsMgL, { Ca: null, Mg: 0 });
  assert.equal(stable.water.alkalinityMgLAsCaCO3, null);
  assert.equal(stable.water.customProfile.tds, null);
  assert.deepEqual(stable.measurements, input.measurements);
  assert.equal(stable.environment.relativeHumidityPct, null);
  assert.deepEqual(toBrewProfilesTransport(stable), stable);
});

test('stable predicate rejects unnormalized and out-of-range measurements instead of accepting Number coercion', () => {
  const valid = toStableBrewData({});
  assert.equal(isStableBrewData(valid), true);
  for (const value of [null, '', '15', true, 0, -1, NaN, Infinity]) {
    const invalid = structuredClone(valid); invalid.brew.doseG = value;
    assert.equal(isStableBrewData(invalid), false);
  }
  for (const value of [null, '', '2', true, 4, -1]) {
    const invalid = structuredClone(valid); invalid.targets.floral = value;
    assert.equal(isStableBrewData(invalid), false);
  }
  const invalid = structuredClone(valid); invalid.water.tdsMgL = '85';
  assert.equal(isStableBrewData(invalid), false);
});

test('canonical unknown stage numbers remain absent and invalid provided data does not become zero', () => {
  const stage = toCanonicalBrewPlan({ stages: [{ stageWaterG: null, temperatureC: null, durationSec: null }] }).stages[0];
  for (const key of ['waterG', 'temperatureC', 'durationSec']) assert.equal(Object.hasOwn(stage, key), false);
  assert.equal(toCanonicalBrewPlan({ stages: [{ stageWaterG: 0, temperatureC: 0, durationSec: 0 }] }).stages[0].temperatureC, 0);
  for (const value of ['', '93', false, NaN, Infinity]) assert.throws(() => toCanonicalBrewPlan({ stages: [{ temperatureC: value }] }));
});

test('BrewResult preserves additive assessments and legacy extractionModel in the same persisted snapshot', () => {
  const waterAnalysis = { tdsMgL: null, ionsMgL: { Ca: 0, Mg: null }, concentrationBasis: 'pre-heating-calculated' };
  const extractionAssessment = { status: 'insufficient-measurements', extractionYieldPct: null, beverageTdsPct: 0 };
  const source = { analysisFingerprint: 'server-fingerprint', executionSource: 'brew-profiles-authoritative', stages: [], extractionModel: { predictedTds: null, targetEY: 19 }, waterAnalysis, extractionAssessment, analysisSnapshot: { metadata: { inputFingerprint: 'request-fingerprint' } } };
  const before = structuredClone(source), result = attachBrewContracts(source);
  assert.deepEqual(source, before);
  assert.deepEqual(result.contracts.brewResult.physical.extraction, source.extractionModel);
  assert.deepEqual(result.contracts.brewResult.physical.waterAnalysis, waterAnalysis);
  assert.deepEqual(result.contracts.brewResult.physical.extractionAssessment, extractionAssessment);
  assert.deepEqual(result.analysisSnapshot.brewResult.physical, result.contracts.brewResult.physical);
  assert.equal(result.analysisFingerprint, 'server-fingerprint');
});
