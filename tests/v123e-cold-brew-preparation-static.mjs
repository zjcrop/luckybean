import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/app.js','utf8');
const catalog = fs.readFileSync('src/services/brew-profile-catalog-service.js','utf8');
const analysis = fs.readFileSync('src/services/brew-analysis-service.js','utf8');
const integration = fs.readFileSync('src/features/full-integration-controller-v3.js','utf8');
const service = fs.readFileSync('android/app/src/main/java/com/luckybean/app/BrewTimerService.java','utf8');
const activity = fs.readFileSync('android/app/src/main/java/com/luckybean/app/MainActivity.java','utf8');

for (const token of ['serveMode', 'doseMode', 'brewServeMode', 'openDoseModeDialog', '❄', '♨']) assert.match(app, new RegExp(token));
assert.match(app, /准备阶段不计入冲煮时间/);
assert.match(app, /第一段是/);
assert.match(app, /confirmBrewPreparedBtn/);
assert.match(app, /executionActions/);
assert.match(app, /phase==='timed'/);
for (const token of ['referenceDoseG','referenceBrewWaterG','referenceIceG','referenceTotalWaterG']) assert.match(catalog, new RegExp(token));
for (const token of ['brewWaterG','iceG','bypassWaterG','extractionRatio','totalRatio']) assert.match(analysis, new RegExp(token));
assert.match(integration, /announceBrewPreparation/);
assert.match(integration, /准备：/);
assert.match(service, /ACTION_ANNOUNCE/);
assert.match(service, /speakStandalone/);
assert.match(activity, /announceBrewPreparation/);
assert.doesNotMatch(app, /max="97"/);
console.log('cold/hot mode, automatic dose, preparation voice and 100C execution UI contracts passed');
