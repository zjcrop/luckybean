import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSourceWater } from '../src/domain/water/water-analysis.js';
import { assessExtractionMeasurements } from '../src/domain/brew/extraction-assessment.js';
import { calculateWaterRecipe } from '../src/water-profiles.js';
import { buildWaterExtractionModel } from '../src/brew-optimizer-v097.js';
import { professionalTemperatureModel, targetExtractionModel } from '../src/brew-model-v09.js';

const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test('actual water TDS remains independent of a named profile reference, with zero preserved', () => {
  const referenceProfile = calculateWaterRecipe('washed').profile;
  for (const tdsMgL of [null, 0, 20, 250]) {
    const analysis = analyzeSourceWater({ water: { tdsMgL }, referenceProfile });
    assert.equal(analysis.tdsMgL, tdsMgL);
    assert.equal(analysis.referenceTdsMgL, 107.5);
    assert.equal(analysis.ionsMgL.Ca, null);
    assert.equal(analysis.ionsMgL.Mg, null);
    assert.equal(analysis.ionsMgL.HCO3, null);
    assert.equal(analysis.automaticBrewAdjustment, false);
    assert.equal(analysis.ionInferenceApplied, false);
  }
});

test('plain water and explicitly unknown custom references do not turn into 85 mg/L or zero', () => {
  const plain = calculateWaterRecipe('custom', { customProfile: { name: '纯水，成分未测' } });
  assert.equal(plain.profile.tdsMid, null);
  assert.equal(plain.targetTdsRange, null);
  assert.equal(plain.operationalTdsRange, null);
  const analysis = analyzeSourceWater({ water: { tdsMgL: null }, referenceProfile: plain.profile });
  assert.equal(analysis.tdsMgL, null);
  assert.equal(analysis.referenceTdsMgL, null);
  const zero = calculateWaterRecipe('custom', { customProfile: { tds: 0 } });
  assert.equal(zero.profile.tdsMid, 0);
});

test('one millimole each of Ca and Mg independently yields two millimoles CaCO3 hardness', () => {
  const analysis = analyzeSourceWater({ water: { ionsMgL: { Ca: 40.078, Mg: 24.305, HCO3: 61.017, CO3: 60.008 }, alkalinityMgLAsCaCO3: 17 } });
  near(analysis.generalHardnessMgLAsCaCO3, 200.1738);
  near(analysis.carbonateAlkalinityMgLAsCaCO3, 150.13035);
  assert.equal(analysis.alkalinityMgLAsCaCO3, 17, 'reported total alkalinity is not overwritten by carbonate contribution');
});

test('partial ion inputs preserve known values and leave unavailable paired diagnostics unknown', () => {
  const analysis = analyzeSourceWater({ water: { tdsMgL: 100, ionsMgL: { Ca: 10, HCO3: 30 } } });
  assert.equal(analysis.ionsMgL.Ca, 10);
  assert.equal(analysis.ionsMgL.Mg, null);
  assert.equal(analysis.generalHardnessMgLAsCaCO3, null);
  assert.equal(analysis.carbonateAlkalinityMgLAsCaCO3, null);
  const zeros = analyzeSourceWater({ water: { ionsMgL: { Ca: 0, Mg: 0, HCO3: 0, CO3: 0 } } });
  assert.equal(zeros.generalHardnessMgLAsCaCO3, 0);
  assert.equal(zeros.carbonateAlkalinityMgLAsCaCO3, 0);
});

test('pre-heating recipe ions never become measured heated concentrations', () => {
  const result = analyzeSourceWater({ water: { concentrationBasis: 'pre-heating-calculated', ionsMgL: { Ca: 20, Mg: 8 } } });
  assert.equal(result.concentrationBasis, 'pre-heating-calculated');
  assert.equal(result.postHeatIonsMgL, null);
});

test('water boundaries reject coercion, impossible values, and unrecognized ions', () => {
  for (const value of ['', '85', true, false, NaN, Infinity, -1]) {
    assert.throws(() => analyzeSourceWater({ water: { tdsMgL: value } }));
    assert.throws(() => analyzeSourceWater({ water: { ionsMgL: { Ca: value } } }));
    assert.throws(() => analyzeSourceWater({ water: { alkalinityMgLAsCaCO3: value } }));
  }
  assert.throws(() => analyzeSourceWater({ water: { ionsMgL: { citrate: 20 } } }));
  for (const volumeL of [null, 0, '', true, -1]) assert.throws(() => calculateWaterRecipe('washed', { volumeL }));
});

test('water model exposes supplied ions without response multipliers or inferred ion ratios', () => {
  const model = buildWaterExtractionModel({ water: { tdsMgL: 0, ionsMgL: { Ca: 10, Mg: 2 } } });
  assert.equal(model.tds, 0);
  assert.equal(model.ca, 10);
  assert.equal(model.mg, 2);
  assert.equal(model.hco3, null);
  for (const key of ['extractionPower', 'aromaSupport', 'bodySupport', 'acidBuffer']) assert.equal(Object.hasOwn(model, key), false);
});

test('water type and TDS cannot silently alter the empirical temperature starting point', () => {
  const bean = { roastCode: 'RL-L2', varietyCode: 'GE' }, targets = { floral: 2 };
  const washed = professionalTemperatureModel(bean, calculateWaterRecipe('washed').profile, targets);
  const dark = professionalTemperatureModel(bean, calculateWaterRecipe('dark').profile, targets);
  assert.equal(washed.mainC, dark.mainC);
  assert.equal(washed.firstC, dark.firstC);
  assert.equal(washed.tailC, dark.tailC);
});

test('1.35 percent TDS in 210g beverage from 15g coffee yields 2.835g solids and 18.9 percent apparent recovery', () => {
  const result = assessExtractionMeasurements({ measurements: { beverageTdsPct: 1.35, beverageMassG: 210, doseG: 15 }, brew: { doseG: 99 } });
  near(result.dissolvedSolidsMassG, 2.835);
  near(result.extractionYieldPct, 18.9);
  assert.equal(result.doseG, 15);
  assert.equal(result.status, 'measured-mass-balance');
  assert.equal(result.interpretation, 'apparent-beverage-solids-yield');
  assert.equal(result.waterBlankCorrectionApplied, false);
  assert.equal(result.sourceWaterTdsSubtracted, false);
});

test('water input mass and total recipe mass never substitute for missing beverage output', () => {
  const result = assessExtractionMeasurements({ measurements: { beverageTdsPct: 1.35 }, brew: { doseG: 15, waterG: 250, totalWaterG: 300, ratio: 16 } });
  assert.equal(result.extractionYieldPct, null);
  assert.equal(result.dissolvedSolidsMassG, null);
  assert.deepEqual(result.missingInputs, ['beverageMassG']);
  assert.equal(result.status, 'insufficient-measurements');
  assert.equal(targetExtractionModel({ doseG: 15, waterG: 250 }).predictedTds, null);
});

test('unknown measurement dose stays unknown; absent or undefined dose may use the explicit brew input', () => {
  const measurements = { beverageTdsPct: 1.5, beverageMassG: 200, doseG: null }, brew = { doseG: 15 };
  const unknown = assessExtractionMeasurements({ measurements, brew });
  assert.equal(unknown.doseG, null);
  assert.equal(unknown.extractionYieldPct, null);
  for (const dose of [{}, { doseG: undefined }]) {
    const result = assessExtractionMeasurements({ measurements: { ...measurements, ...dose, doseG: dose.doseG }, brew });
    assert.equal(result.doseG, 15);
    assert.equal(result.doseSource, 'brew-input');
    near(result.extractionYieldPct, 20);
  }
});

test('dilution uses paired final TDS and mass; source-water ppm is never blindly subtracted', () => {
  const first = assessExtractionMeasurements({ measurements: { beverageTdsPct: 1.5, beverageMassG: 200 }, brew: { doseG: 15 } });
  const diluted = assessExtractionMeasurements({ measurements: { beverageTdsPct: 1, beverageMassG: 300 }, brew: { doseG: 15 } });
  near(first.extractionYieldPct, diluted.extractionYieldPct);
  assert.equal(first.sourceWaterTdsSubtracted, false);
});

test('zero beverage TDS is measured zero; invalid measurement types and masses do not coerce or clamp', () => {
  const valid = { beverageTdsPct: 0, beverageMassG: 200, doseG: 15 };
  assert.equal(assessExtractionMeasurements({ measurements: valid }).extractionYieldPct, 0);
  for (const value of ['', '1.35', true, false, NaN, Infinity, -1, 101]) assert.throws(() => assessExtractionMeasurements({ measurements: { ...valid, beverageTdsPct: value } }));
  for (const key of ['doseG', 'beverageMassG']) for (const value of [0, '', true, -1, NaN, Infinity]) assert.throws(() => assessExtractionMeasurements({ measurements: { ...valid, [key]: value } }));
});

const brewInput = () => ({
  bean: { roastCode: 'RL-L2', processCode: 'WA', varietyCode: 'VA-GE' },
  brew: { profileId: 'three-pulse', doseG: 15, ratio: 16, ratioMode: 'manual', dripperCode: 'V60' },
  water: { profileId: 'washed', tdsMgL: 20 },
  measurements: { beverageTdsPct: 1.35, beverageMassG: 210, doseG: 15 },
  environment: { ambientTemperatureC: 25 },
  targets: { floral: 2, acidity: 1.5, fruity: 2, sweetness: 2, bitterness: 2, astringency: 2 }
});

async function localEngine() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unit test: network disabled'); };
  try { return await import('../src/brew-engine.js'); }
  finally { globalThis.fetch = originalFetch; }
}

test('real local engine preserves entered TDS and actual extraction measurements without TDS-driven recipe changes', async () => {
  const { computeFallbackPlan } = await localEngine();
  const first = await computeFallbackPlan(brewInput());
  const input = brewInput();
  input.water = { profileId: 'dark', tdsMgL: 250, ionsMgL: { Ca: 80, Mg: 30, HCO3: 200, CO3: 0 } };
  const second = await computeFallbackPlan(input);
  assert.equal(first.waterAnalysis.tdsMgL, 20);
  assert.equal(second.waterAnalysis.tdsMgL, 250);
  assert.equal(first.waterAnalysis.ionsMgL.Ca, null);
  assert.equal(second.waterAnalysis.ionsMgL.Ca, 80);
  assert.deepEqual(first.stages, second.stages);
  assert.deepEqual(first.totals, second.totals);
  assert.deepEqual(first.extractionModel, second.extractionModel);
  near(second.extractionAssessment.extractionYieldPct, 18.9);
  assert.equal(second.extractionModel.predictedTds, null);
  assert.equal(second.extractionModel.basis, 'uncalibrated-empirical-reference');
});

test('final published plan, timeline and reference EY use the same executable stages', async () => {
  const { computeFallbackPlan } = await localEngine();
  for (const [profileId, count, times] of [
    ['one-pour', 1, [105]], ['three-pulse', 3],
    ['hoffmann-one-cup', 5, [45, 25, 20, 20, 70]],
    ['matt-winton-five', 5, [35, 30, 30, 30, 80]], ['switch-hybrid-50-50', 2, [45, 135]]
  ]) {
    const input = brewInput(); input.brew.profileId = profileId;
    const plan = await computeFallbackPlan(input);
    assert.equal(plan.stages.length, count, profileId);
    if (times) assert.deepEqual(plan.stages.map(stage => stage.durationSec), times, profileId);
    const totalTime = plan.stages.reduce((sum, stage) => sum + stage.durationSec, 0);
    assert.equal(plan.totals.targetTimeSec, totalTime, profileId);
    assert.equal(plan.trajectoryModel.axes.timeSec, totalTime, profileId);
    assert.equal(plan.trajectoryModel.points.at(-1).second, totalTime, profileId);
    assert.equal(plan.stages.reduce((sum, stage) => sum + stage.stageWaterG, 0), plan.totals.waterG, profileId);
    assert.equal(plan.extractionModel.predictedEY, plan.trajectoryModel.predictedEY, profileId);
    assert.deepEqual(plan.professional.extractionModel, plan.extractionModel, profileId);
    assert.ok(plan.stages.every(stage => Number.isFinite(stage.temperatureC) && stage.temperatureC > 0));
  }
});
