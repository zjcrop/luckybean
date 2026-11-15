import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attachInputAssessments } from '../src/domain/brew/input-assessments.js';

test('Cloud diagnostics add actual measurements without replacing the authoritative plan or fingerprints', () => {
  const plan = { stages: [{ temperatureC: 93, durationSec: 30 }], totals: { doseG: 99 }, analysisFingerprint: 'authoritative', executionSource: 'brew-profiles-authoritative', clientAdjusted: false };
  const before = structuredClone(plan);
  const result = attachInputAssessments(plan, { brew: { doseG: 15 }, water: { tdsMgL: null, concentrationBasis: 'pre-heating-calculated', ionsMgL: { Ca: 20, Mg: 5 } }, measurements: { beverageTdsPct: 1.35, beverageMassG: 210 } });
  assert.deepEqual(plan, before);
  for (const key of ['stages', 'totals', 'analysisFingerprint', 'executionSource', 'clientAdjusted']) assert.deepEqual(result[key], before[key]);
  assert.equal(result.waterAnalysis.tdsMgL, null);
  assert.equal(result.waterAnalysis.postHeatIonsMgL, null);
  assert.equal(result.waterAnalysis.automaticBrewAdjustment, false);
  assert.equal(result.extractionAssessment.doseG, 15, 'server recommended dose is never substituted for the actual input');
  assert.ok(Math.abs(result.extractionAssessment.extractionYieldPct - 18.9) < 1e-9);
});

test('Cloud preserves assessments already supplied by the authoritative backend', () => {
  const waterAnalysis = { tdsMgL: 85, provider: 'server' }, extractionAssessment = { extractionYieldPct: null, provider: 'server' };
  const result = attachInputAssessments({ waterAnalysis, extractionAssessment }, {});
  assert.equal(result.waterAnalysis, waterAnalysis);
  assert.equal(result.extractionAssessment, extractionAssessment);
});

test('Cloud request entry still requires the authoritative gateway and never calls the local optimizer', () => {
  const source = fs.readFileSync(new URL('../src/brew-engine.js', import.meta.url), 'utf8');
  const entry = source.slice(source.indexOf('export async function requestPrivatePlan('));
  assert.match(entry, /await requestAuthoritativePlan\(normalized/);
  assert.match(entry, /attachInputAssessments\(plan, normalized\)/);
  assert.doesNotMatch(entry, /computeOptimizedPlan|computeFallbackPlan|IS_LUCKYBEAN_DS/);
});
