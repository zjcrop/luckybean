import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [app,assessment,engine,optimizer,controller,view,coordinator,history,build]=await Promise.all([
  read('src/app.js'),read('src/domain/sensory/brew-optimization-assessment.js'),read('src/brew-engine.js'),
  read('src/brew-optimizer-v097.js'),read('src/renderers/brew-spatial-controller.js'),read('src/renderers/brew-spatial-view.js'),
  read('src/services/brew-calculation-coordinator.js'),read('src/domain/history/history-sensory-service.js'),read('.github/workflows/build-main.yml')
]);

assert.match(assessment,/totalScoreUsedAsTrigger:false/);
assert.doesNotMatch(optimizer,/score\s*<\s*80/);
assert.match(engine,/previousPlan\?\.profile\?\.id/);
assert.match(app,/completeOptimizationValidation/);
assert.match(app,/data-load-optimization/);
assert.match(history,/optimization-validated/);
assert.match(coordinator,/latest:\s*revision\s*===\s*this\.revision/);
assert.match(controller,/retryLastRender/);
assert.match(controller,/lastRender/);
assert.doesNotMatch(controller,/fallback|替代表格|本地替代/i);
assert.match(view,/用于观察趋势及参数变化的相对影响/);
assert.match(view,/实际结果以冲煮与品鉴为准/);
assert.match(build,/apksigner/);
assert.match(build,/expected_cert/);
JSON.parse(await read('contracts/brew-optimization-v1.schema.json'));
JSON.parse(await read('contracts/brew-optimization-validation-v1.schema.json'));
const historySchema=JSON.parse(await read('schemas/brew-history.schema.json'));
assert.ok(historySchema.properties.nextPlanDraft);
assert.ok(historySchema.properties.optimizationValidation);
assert.ok(historySchema.properties.analysisSnapshot.properties.contract.enum.includes('brew-analysis/2.1'));
console.log('post-tasting optimization, deterministic spatial trend and release-signature guards passed');
