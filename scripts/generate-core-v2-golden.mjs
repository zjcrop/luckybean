import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { computeFallbackPlan } from '../src/brew-engine.js';
import { computeInventory } from '../src/core-v2/domain/inventory.js';
import { canonicalJson } from '../src/core-v2/contracts.js';
import { sha256Hex } from '../src/core-v2/backup/backup-core.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const root = path.resolve(import.meta.dirname, '..');
const inputPath = path.join(root, 'tests/fixtures/core-v2-golden-inputs.json');
const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'artifacts/core-v2-golden-candidate.json');
const inputs = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const round = (value, digits = 4) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

function summarizeStage(stage, index) {
  return {
    index: Number(stage.index || index + 1),
    name: String(stage.name || ''),
    startSec: round(stage.startSec, 2),
    durationSec: round(stage.durationSec, 2),
    stageWaterG: round(stage.stageWaterG, 2),
    cumulativeWaterG: round(stage.cumulativeWaterG, 2),
    temperatureC: round(stage.temperatureC, 2),
    flowGPerSec: round(stage.flowGPerSec, 3),
    method: String(stage.method || ''),
    notice: String(stage.notice || '')
  };
}

function summarizeTrajectory(plan) {
  const source = plan.trajectory || plan.extractionTrajectory || plan.curve || null;
  if (!source) return null;
  const points = Array.isArray(source)
    ? source
    : Array.isArray(source.points)
      ? source.points
      : Array.isArray(source.samples)
        ? source.samples
        : [];
  return {
    modelVersion: String(source.modelVersion || source.version || plan.trajectoryModelVersion || ''),
    pointCount: points.length,
    first: points.length ? points[0] : null,
    middle: points.length ? points[Math.floor(points.length / 2)] : null,
    last: points.length ? points.at(-1) : null
  };
}

function summarizePlan(plan) {
  const stages = Array.isArray(plan.stages) ? plan.stages.map(summarizeStage) : [];
  return {
    engineVersion: String(plan.engineVersion || plan.modelVersion || ''),
    optimizerVersion: String(plan.optimizerVersion || ''),
    trajectoryModelVersion: String(plan.trajectoryModelVersion || ''),
    profile: {
      id: String(plan.profile?.id || plan.profileId || plan.recommendation?.selected?.profile?.id || ''),
      label: String(plan.profile?.label || plan.profileLabel || plan.recommendation?.selected?.profile?.label || '')
    },
    totals: {
      doseG: round(plan.totals?.doseG),
      waterG: round(plan.totals?.waterG ?? stages.at(-1)?.cumulativeWaterG),
      durationSec: round(plan.totals?.durationSec),
      stageCount: stages.length
    },
    stages,
    trajectory: summarizeTrajectory(plan),
    warnings: Array.isArray(plan.warnings) ? plan.warnings.map(String) : [],
    explanationCodes: Array.isArray(plan.explanationCodes) ? plan.explanationCodes.map(String) : []
  };
}

const brewCases = [];
for (const testCase of inputs.brewCases) {
  const plan = await computeFallbackPlan(testCase.input);
  const summary = summarizePlan(plan);
  brewCases.push({
    id: testCase.id,
    inputHash: await sha256Hex(canonicalJson(testCase.input)),
    outputHash: await sha256Hex(canonicalJson(summary)),
    summary
  });
}

const inventory = computeInventory(inputs.inventoryCase.events, {
  beanId: inputs.inventoryCase.beanId,
  floorAtZero: true
});
const qrPayload = canonicalJson(inputs.qrCase);
const output = {
  format: 'luckybean-core-v2-golden-candidate-v1',
  generatedAt: '2026-08-04T00:00:00.000Z',
  inputVersion: inputs.version,
  brewCases,
  inventory: {
    inputHash: await sha256Hex(canonicalJson(inputs.inventoryCase)),
    outputHash: await sha256Hex(canonicalJson(inventory)),
    summary: inventory
  },
  qr: {
    payload: qrPayload,
    payloadBytes: Buffer.byteLength(qrPayload, 'utf8'),
    outputHash: await sha256Hex(qrPayload)
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  outputPath,
  brewHashes: brewCases.map(item => ({ id: item.id, outputHash: item.outputHash })),
  inventoryHash: output.inventory.outputHash,
  qrHash: output.qr.outputHash
}, null, 2));
