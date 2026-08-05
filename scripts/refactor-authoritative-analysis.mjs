import { readFile, writeFile } from 'node:fs/promises';

async function migrateAuthoritativeEngine() {
  const path = 'src/brew-engine.js';
  let source = await readFile(path, 'utf8');
  const importMarker = "import * as core from './brew-engine-core.js';\n";
  const serviceImport = "import { requestAuthoritativePlan } from './services/brew-analysis-service.js';\n";
  if (!source.includes(serviceImport)) {
    if (!source.includes(importMarker)) throw new Error('brew-engine import marker not found');
    source = source.replace(importMarker, importMarker + serviceImport);
  }
  const legacy = `export async function requestPrivatePlan(endpoint, input, timeoutMs = 9000) {
  const selected = explicitProfileId(input);
  if (selected && CORE_PROFILE_ALIAS[selected]) return computeOptimizedPlan(input, { forceProfile: selected });
  const normalized = normalizeExplicitInput(input);
  const privatePlan = await core.requestPrivatePlan(endpoint, normalized, timeoutMs);
  const semanticPlan = normalizeStageSemantics(privatePlan, selected);
  let optimized = optimizeBrewPlan(normalized, semanticPlan);
  optimized = normalizeStageSemantics(optimized, selected);
  assertProfileIntegrity(normalized, optimized);
  return attachLegacyTrajectory(optimized);
}`;
  const replacement = `export async function requestPrivatePlan(endpoint, input, timeoutMs = 9000) {
  const normalized = normalizeExplicitInput(input);
  const plan = await requestAuthoritativePlan(normalized, {
    endpoint: endpoint || undefined,
    timeoutMs: Math.min(Math.max(Number(timeoutMs) || 6500, 2500), 12000)
  });
  const requested = explicitProfileId(normalized);
  const resolved = String(plan.profile?.id || String(plan.profileVersion || '').split('@')[0] || '');
  const expectedStages = EXPECTED_STAGE_COUNTS[requested];
  const actualStages = Array.isArray(plan.stages) ? plan.stages.length : 0;
  plan.profileIntegrity = {
    requestedProfileId: requested || 'recommended', resolvedProfileId: resolved,
    expectedStageCount: expectedStages || null, actualStageCount: actualStages,
    preserved: !requested || !resolved || requested === resolved,
    stageCountValid: !expectedStages || expectedStages === actualStages,
    countIncludesBloom: true
  };
  if (!plan.profileIntegrity.preserved) throw new Error(\`专业引擎方案不一致：请求 \${requested}，返回 \${resolved || '未知方案'}\`);
  if (!plan.profileIntegrity.stageCountValid) throw new Error(\`专业引擎分段不一致：\${requested} 应为 \${expectedStages} 段，返回 \${actualStages} 段\`);
  plan.clientAdjusted = false;
  plan.executionSource = 'brew-profiles-authoritative';
  return plan;
}`;
  if (source.includes(legacy)) source = source.replace(legacy, replacement);
  else if (!source.includes("executionSource = 'brew-profiles-authoritative'")) throw new Error('legacy requestPrivatePlan block not found');
  if (/requestPrivatePlan[\s\S]*optimizeBrewPlan\(normalized, semanticPlan\)/.test(source)) throw new Error('authoritative request path still invokes client optimizer');
  await writeFile(path, source);
}

async function migrateHistoryStores() {
  const path = 'src/db-storage-core.js';
  let source = await readFile(path, 'utf8');
  const oldStores = "const STORES = ['beans', 'brewSessions', 'sensoryRecords', 'inventoryEvents', 'settings', 'customCodes', 'codebookCache', 'syncMetadata', 'shareDrafts'];";
  const newStores = "const STORES = ['beans', 'brewSessions', 'sensoryRecords', 'inventoryEvents', 'settings', 'customCodes', 'codebookCache', 'syncMetadata', 'shareDrafts', 'historyRevisions', 'recycleBin', 'syncOutbox'];";
  if (source.includes(oldStores)) source = source.replace(oldStores, newStores);
  else if (!source.includes("'historyRevisions'")) throw new Error('IndexedDB store declaration not found');
  await writeFile(path, source);
}

async function migrateAppFlow() {
  const path = 'src/app.js';
  let source = await readFile(path, 'utf8');
  const importMarker = "import { computeAutomaticScore, sensoryPreferenceTags, buildPreferenceModel, recommendedBeanIds } from './preference-model.js';\n";
  const formalImports = "import { commitCompletedBrew } from './domain/history/history-service.js';\nimport { createLocalReferenceAnalysis } from './services/local-reference-analysis.js';\n";
  if (!source.includes("./domain/history/history-service.js")) {
    if (!source.includes(importMarker)) throw new Error('app import marker not found');
    source = source.replace(importMarker, importMarker + formalImports);
  }

  source = source.replace(
    "timer: { interval: null, paused: false, stageIndex: 0, remaining: 0 },",
    "timer: { interval: null, paused: false, stageIndex: 0, remaining: 0 }, currentExecution: null,"
  );

  const oldPlanSave = `plan.beanId = bean.id; plan.id = uid('brew'); plan.createdAt = new Date().toISOString(); plan.status = 'planned'; plan.input = input;
    if (apiError) plan.warnings = [...(plan.warnings || []), '私有冲煮服务未接通，当前使用浏览器兼容模型；私有仓库代码未暴露到网页。'];
    validatePlan(plan); state.currentPlan = plan;
    await put('brewSessions', plan); await refreshData();`;
  const newPlanSave = `plan.beanId = bean.id; plan.generatedAt = new Date().toISOString(); plan.input = input;
    if (apiError) {
      plan.warnings = [...(plan.warnings || []), '专业冲煮服务暂不可用，当前使用本地参考模型。'];
      plan.analysisSnapshot = await createLocalReferenceAnalysis(input, plan, apiError);
      plan.visualization3d = plan.analysisSnapshot.trajectory;
      plan.trajectory = plan.analysisSnapshot.trajectory;
      plan.analysisFingerprint = plan.analysisSnapshot.analysisFingerprint;
      plan.executionSource = 'local-reference';
    }
    validatePlan(plan); state.currentPlan = plan;
    document.dispatchEvent(new CustomEvent('luckybean:plan-ready', { detail: { plan, input, source: plan.executionSource || 'brew-profiles-authoritative' } }));`;
  if (source.includes(oldPlanSave)) source = source.replace(oldPlanSave, newPlanSave);
  else if (source.includes("plan.status = 'planned'")) throw new Error('planned history save block changed unexpectedly');

  const oldStartTimer = `function startTimer() {
  if (!state.currentPlan) return;
  const first = state.currentPlan.stages[0];
  state.timer.stageIndex = 0; state.timer.remaining = Number(first.durationSec); state.timer.paused = false;
  renderTimerDialog(); startTimerInterval();
  speak(\`第一段，\${first.name}，注水\${Math.round(first.stageWaterG)}克，水温\${Math.round(first.temperatureC)}度，\${first.method}。\${first.notice || ''}\`);
}`;
  const newStartTimer = `function startTimer() {
  if (!state.currentPlan) return;
  const first = state.currentPlan.stages[0];
  state.currentExecution = {
    id: \`execution-\${crypto.randomUUID()}\`,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    stageExecutions: [],
    deviations: [],
    notes: []
  };
  state.timer.stageIndex = 0; state.timer.remaining = Number(first.durationSec); state.timer.paused = false;
  renderTimerDialog(); startTimerInterval();
  speak(\`第一段，\${first.name}，注水\${Math.round(first.stageWaterG)}克，水温\${Math.round(first.temperatureC)}度，\${first.method}。\${first.notice || ''}\`);
}`;
  if (source.includes(oldStartTimer)) source = source.replace(oldStartTimer, newStartTimer);
  else if (!source.includes('execution-${crypto.randomUUID()}')) throw new Error('timer start block not found');

  const oldEnd = "$('#timerEndBtn').addEventListener('click', () => { clearInterval(state.timer.interval); stopSpeech(); state.timer.paused = true; state.timer.stageIndex = state.currentPlan.stages.length - 1; state.timer.remaining = 0; renderTimerValues(); promptRecordConsumption('terminated'); });";
  const newEnd = "$('#timerEndBtn').addEventListener('click', () => { clearInterval(state.timer.interval); stopSpeech(); state.timer.paused = true; state.currentExecution = null; closeOverlay(); switchPage('brew'); toast('本次冲煮已中止，不扣豆、不保存记录'); });";
  if (source.includes(oldEnd)) source = source.replace(oldEnd, newEnd);
  else if (source.includes("promptRecordConsumption('terminated')")) throw new Error('timer termination block changed unexpectedly');

  const promptMarker = `function promptRecordConsumption(reason) {
  clearInterval(state.timer.interval); stopSpeech(); state.timer.paused = true;`;
  const promptReplacement = `function promptRecordConsumption(reason) {
  clearInterval(state.timer.interval); stopSpeech(); state.timer.paused = true;
  if (reason !== 'complete') { state.currentExecution = null; closeOverlay(); switchPage('brew'); return; }
  const finishedAt = new Date().toISOString();
  if (!state.currentExecution) state.currentExecution = { id: \`execution-\${crypto.randomUUID()}\`, startedAt: finishedAt, stageExecutions: [], deviations: [], notes: [] };
  state.currentExecution.finishedAt = finishedAt;`;
  if (source.includes(promptMarker)) source = source.replace(promptMarker, promptReplacement);
  else if (!source.includes("if (reason !== 'complete')")) throw new Error('consumption prompt marker not found');

  source = source.replace(
    '<div class="consume-dose">${dose.toFixed(1)}g</div>',
    '<label class="field consume-dose-field"><span>本次实际使用豆量</span><input id="actualDoseInput" class="control consume-dose" type="number" min="0.1" step="0.1" value="${dose.toFixed(1)}"></label>'
  );

  const oldConfirm = `$('#recordConsumptionBtn').addEventListener('click', async () => {
    const consumed = await consumeBean(bean, dose, state.currentPlan?.id, reason);
    if (state.currentPlan?.id) { const session = state.brewSessions.find(item => item.id === state.currentPlan.id); if (session) { session.status = reason === 'terminated' ? 'terminated' : 'completed'; session.completedAt = new Date().toISOString(); await put('brewSessions', session); await refreshData(); } }
    closeOverlay(); startEvaluation(bean.id, { brewSessionId: state.currentPlan?.id || '' }); switchPage('sensory', { preserveOverlay: true }); renderSensory();
    toast(consumed.filter ? \`已扣除 \${consumed.grams.toFixed(1)}g 咖啡豆与滤纸1张\` : \`已扣除 \${consumed.grams.toFixed(1)}g 咖啡豆；未设置滤纸库存\`, consumed.filter ? 'status-good' : 'status-warn');
  });`;
  const newConfirm = `$('#recordConsumptionBtn').addEventListener('click', async () => {
    const actualDose = parseNumber($('#actualDoseInput')?.value, dose);
    const button = $('#recordConsumptionBtn');
    button.disabled = true; button.textContent = '正在保存…';
    try {
      const execution = {
        ...state.currentExecution,
        actualTotalTimeSec: Math.max(0, Math.round((Date.parse(state.currentExecution.finishedAt) - Date.parse(state.currentExecution.startedAt)) / 1000)),
        environment: {
          ambientTemperatureC: Number(state.currentBrewInput?.environment?.ambientTemperatureC ?? 25),
          relativeHumidityPct: state.currentBrewInput?.environment?.relativeHumidityPct ?? null,
          initialBedTemperatureC: Number(state.currentBrewInput?.environment?.initialBedTemperatureC ?? state.currentBrewInput?.environment?.ambientTemperatureC ?? 25)
        }
      };
      const analysisSnapshot = state.currentPlan.analysisSnapshot || await createLocalReferenceAnalysis(state.currentBrewInput, state.currentPlan, '专业分析快照缺失');
      const saved = await commitCompletedBrew({
        beanId: bean.id,
        deductedWeightG: actualDose,
        rawInput: state.currentBrewInput,
        normalizedInput: analysisSnapshot.input || state.currentBrewInput,
        analysisSnapshot,
        execution,
        providerVersions: analysisSnapshot.integrations?.sourceVersions || {},
        idempotencyKey: state.currentExecution.id
      });
      const activeFilter = state.settings.gear.filters.find(item => item.id === filterId);
      if (activeFilter) { activeFilter.quantity = Math.max(0, Number(activeFilter.quantity || 0) - 1); await saveSettings(); }
      state.currentPlan = { ...state.currentPlan, id: saved.record.id, historyRecordId: saved.record.id };
      state.currentExecution = null;
      await refreshData();
      closeOverlay(); startEvaluation(bean.id, { brewSessionId: saved.record.id }); switchPage('sensory', { preserveOverlay: true }); renderSensory();
      toast(activeFilter ? \`已扣除 \${actualDose.toFixed(1)}g 咖啡豆与滤纸1张\` : \`已扣除 \${actualDose.toFixed(1)}g 咖啡豆；未设置滤纸库存\`, activeFilter ? 'status-good' : 'status-warn');
    } catch (error) {
      button.disabled = false; button.textContent = '扣除咖啡豆与滤纸，进入品鉴';
      toast(error.message || '保存冲煮记录失败', 'status-bad');
    }
  });`;
  if (source.includes(oldConfirm)) source = source.replace(oldConfirm, newConfirm);
  else if (source.includes("session.status = reason === 'terminated'")) throw new Error('legacy completion save block changed unexpectedly');

  source = source.replace(
    "$('#skipConsumptionBtn').addEventListener('click', () => { closeOverlay(); switchPage('brew'); });",
    "$('#skipConsumptionBtn').addEventListener('click', () => { state.currentExecution = null; closeOverlay(); switchPage('brew'); toast('本次冲煮未扣豆，未保存记录'); });"
  );

  if (source.includes("plan.status = 'planned'") || source.includes("session.status = reason === 'terminated'")) throw new Error('legacy history status persistence remains in app');
  await writeFile(path, source);
}

await migrateAuthoritativeEngine();
await migrateHistoryStores();
await migrateAppFlow();
console.log('Authoritative analysis, completion gate and transactional history migrated.');
