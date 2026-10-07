import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const app = read('src/app.js');
const native = read('src/ui/brew-native-execution-controller.js');
const timer = read('src/domain/brew/timer-state-machine.js');
const androidWorkflows = [
  '.github/workflows/test-main.yml',
  '.github/workflows/full-integration-pr.yml',
  '.github/workflows/build-main.yml',
  '.github/workflows/verified-release-main.yml'
].map(read);

assert.match(app, /customDoseInput', overlay\)\?\.addEventListener\('input'/);
assert.match(app, /choice = 'manual'/);
assert.match(app, /doseMode:leftoverDose \? \(leftoverDose\.mode === 'manual' \? 'manual' : 'auto'\)/);
assert.match(app, /if \(sessionOnlyDose\) \{[\s\S]*state\.settings\.brew\.doseMode = persistentDoseMode[\s\S]*state\.settings\.brew\.doseG = persistentDoseG/);
assert.match(app, /planRemainingBeanDoses\(selected\.remainingWeight\)/);
assert.match(app, /transitionTimer\('drain'\)/);
assert.match(app, /等待滤杯滴滤完成/);
assert.match(app, /滴滤完成，记录本次用量/);
assert.match(app, /本段动作/);
assert.match(app, /本段时长/);
assert.match(native, /dataset\?\.timerAction === 'resume'/);
for (const state of ['READY', 'PREPARING', 'STEP_ACTIVE', 'STEP_WAITING', 'DRAINING', 'FINISHED']) {
  assert.ok(timer.includes(state));
}

for (const workflow of androidWorkflows) {
  assert.match(workflow, /packages:\s*'platform-tools'/);
  assert.doesNotMatch(workflow, /packages:\s*['"]tools(?:\s+platform-tools)?['"]/);
}

const signedReleaseWorkflow = androidWorkflows[3];
for (const allowedDeltaPath of [
  '.github/workflows/build-main.yml',
  '.github/workflows/verified-release-main.yml',
  'tests/v127-dose-inventory-timer-regression.mjs'
]) {
  assert.ok(signedReleaseWorkflow.includes(allowedDeltaPath), `release SDK fix allowlist missing ${allowedDeltaPath}`);
}

console.log('Dose allocation, custom dose, brew timer, and supported Android SDK package contracts passed');
