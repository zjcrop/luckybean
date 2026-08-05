import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const json = path => JSON.parse(read(path));

const app = read('src/app.js');
const engine = read('src/brew-engine.js');
const analysis = read('src/services/brew-analysis-service.js');
const localAnalysis = read('src/services/local-reference-analysis.js');
const history = read('src/domain/history/history-service.js');
const historyMigration = read('src/domain/history/history-migration.js');
const historyUi = read('src/ui/history/history-screen.js');
const spatial = read('src/renderers/brew-spatial-view.js');
const spatialController = read('src/renderers/brew-spatial-controller.js');
const providers = read('src/services/provider-package-service.js');
const providerBootstrap = read('src/services/provider-bootstrap-controller.js');
const reconciliation = read('src/services/codebook-reconciliation-service.js');
const providerStatus = read('src/ui/provider-status-panel.js');
const water = read('src/water-profiles.js');
const model = read('src/brew-model-v09.js');
const dbCore = read('src/db-storage-core.js');
const compatibility = read('src/features/compatibility-bundle.js');
const historySchema = json('schemas/brew-history.schema.json');
const sw = read('sw.js');

// Authoritative engine and integrated spatial contract.
assert.match(analysis, /BREW_ANALYSIS_CONTRACT\s*=\s*'brew-analysis\/2\.0'/);
assert.match(analysis, /BREW_SPATIAL_CONTRACT\s*=\s*'brew-spatial\/1\.1'/);
assert.match(analysis, /authorization:\s*`Bearer \$\{token\}`/);
assert.match(analysis, /clientAdjusted:\s*false/);
assert.match(analysis, /analysisSnapshot:\s*structuredClone\(analysis\)/);
assert.doesNotMatch(engine, /optimizeBrewPlan\(normalized, semanticPlan\)/);
assert.match(engine, /executionSource\s*=\s*'brew-profiles-authoritative'/);

// Local fallback is explicit and cannot fake professional target clouds.
assert.match(localAnalysis, /engine:\s*\{ endpoint:\s*'local-reference'/);
assert.match(localAnalysis, /targets:\s*\[\]/);
assert.match(localAnalysis, /非专业引擎结果|本地参考计算/);

// History is created only by the confirmed completion transaction.
assert.match(app, /commitCompletedBrew\(/);
assert.match(app, /本次冲煮已中止，不扣豆、不保存记录/);
assert.match(app, /本次冲煮未扣豆，未保存记录/);
assert.doesNotMatch(app, /plan\.status\s*=\s*'planned'/);
assert.doesNotMatch(app, /session\.status\s*=\s*(?:reason|['"]completed|['"]terminated)/);
assert.doesNotMatch(app, /put\(['"]brewSessions['"],\s*plan\)/);
assert.match(history, /db\.transaction\(\['beans', 'inventoryEvents', 'brewSessions', 'historyRevisions', 'syncOutbox'\], 'readwrite'\)/);
assert.match(history, /idempotencyKey/);
assert.match(history, /inventoryEventId/);
assert.doesNotMatch(history, /\bstatus\s*:/);
assert.match(historyMigration, /缺少确认扣豆事件，不属于正式冲煮历史/);
assert.match(historyUi, /仅显示已完成并确认扣豆的正式记录/);
assert.match(historyUi, /moveBrewRecordsToRecycleBin/);
assert.match(historyUi, /permanentlyDeleteBrewRecords/);

assert.equal(historySchema.properties.schemaVersion.const, 'brew-history/1.0');
assert.ok(historySchema.required.includes('inventoryEventId'));
assert.ok(historySchema.required.includes('analysisSnapshot'));
assert.ok(historySchema.not.anyOf.some(item => item.required?.includes('status')));

// Formal 3D renderer consumes structured spatial data and owns gestures directly.
assert.match(spatial, /class BrewSpatialView/);
assert.match(spatial, /schemaVersion !== 'brew-spatial\/1\.1'/);
assert.match(spatial, /pointerdown/);
assert.match(spatial, /this\.pointers\.size === 2/);
assert.match(spatial, /this\.zoom/);
assert.match(spatial, /轻点路径或靶区查看三轴参数/);
assert.doesNotMatch(spatial, /MutationObserver/);
assert.match(spatialController, /luckybean:plan-ready/);
assert.match(spatialController, /luckybean:history-plan-loaded/);
assert.doesNotMatch(compatibility, /v099-trajectory-signal-bridge|v099i-trajectory-space|v109-history-management/);

// Providers are verified, atomically activated and reconciled without overwriting custom codes.
assert.match(providers, /artifact\.bytes/);
assert.match(providers, /sha256Hex/);
assert.match(providers, /CANDIDATE_PREFIX/);
assert.match(providers, /ACTIVE_PREFIX/);
assert.match(providerBootstrap, /requestIdleCallback/);
assert.match(providerBootstrap, /reconcileCustomCodes/);
assert.match(reconciliation, /custom_matched/);
assert.match(reconciliation, /custom_conflict/);
assert.match(reconciliation, /merged_to_official/);
assert.match(reconciliation, /unique-normalized-name-and-parent-match/);
assert.match(providerStatus, /BREW_ANALYSIS_CONTRACT/);
assert.match(providerStatus, /openCodebookReconciliationScreen/);

// LuckyBean water boundary: no salts or precise ions, optional environment defaults.
assert.match(water, /精确配方请在“萃离”中调整/);
assert.match(water, /customProfile/);
assert.doesNotMatch(water, /CaCl|MgSO|KHCO|NaHCO|targetIonsMgL|totalDoseG|\bdoses\b/);
assert.doesNotMatch(model, /waterProfile\.(?:ca|mg|hco3)/);
assert.match(app, /ambientTemperatureC:\s*25/);
assert.match(app, /relativeHumidityPct:\s*null/);
assert.match(app, /initialBedTemperatureC:\s*25/);
assert.match(app, /环境细节（默认25°C，可选）/);

// New transactional stores and offline assets are present.
for (const store of ['historyRevisions', 'recycleBin', 'syncOutbox']) assert.match(dbCore, new RegExp(`'${store}'`));
for (const asset of [
  'src/services/brew-analysis-service.js',
  'src/domain/history/history-service.js',
  'src/renderers/brew-spatial-view.js',
  'src/services/provider-package-service.js'
]) assert.match(sw, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

console.log('v1.2 core analysis, completed history, provider and spatial contracts passed');
