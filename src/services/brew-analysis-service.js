import { all, get, put, getSetting } from '../db.js';
import { sha256Hex } from '../utils.js';
import { loadCodebook, makeIndex, displayName } from '../codebook.js';
import { BREW_API_ENDPOINT, brewApiJson } from './brew-api-client.js';
import { buildMatchingEnvelope, MATCH_CONTRACT } from '../domain/matching/flavor-vector.js';

export const BREW_ANALYSIS_CONTRACT = 'brew-analysis/2.1';
export const BREW_SPATIAL_CONTRACT = 'brew-spatial/1.3';
export const BREW_FLAVOR_STATE_CONTRACT = 'brew-flavor-state/1.0';
export const BREW_ANALYSIS_ENDPOINT = BREW_API_ENDPOINT;
export const BREW_ANALYSIS_SERVICE_VERSION = 'luckybean-analysis-client/1.6.0';

const SUPPORTED_ANALYSIS_CONTRACTS = new Set(['brew-analysis/2.0', BREW_ANALYSIS_CONTRACT]);
const SUPPORTED_SPATIAL_CONTRACTS = new Set(['brew-spatial/1.2', BREW_SPATIAL_CONTRACT]);
const CACHE_PREFIX = 'brew.analysis.cache.v2.';
const DEFAULT_TIMEOUT_MS = 12000;
const REQUIRED_TARGET_IDS = Object.freeze(['acidity', 'floral', 'fruity', 'sweetness', 'bitterness', 'astringency']);

let codebookIndexPromise = null;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

async function inputFingerprint(input) {
  return `sha256:${await sha256Hex(JSON.stringify(canonical(input)))}`;
}

async function cacheKey(input) {
  return `${CACHE_PREFIX}${(await inputFingerprint(input)).slice(7)}`;
}

function assertFinite(value, field) {
  if (!Number.isFinite(Number(value))) throw new Error(`专业分析结果字段无效：${field}`);
  return Number(value);
}

function validateFlavorState(flavorState, { required = false } = {}) {
  if (!flavorState) {
    if (required) throw new Error(`专业分析缺少 ${BREW_FLAVOR_STATE_CONTRACT}`);
    return null;
  }
  if (flavorState.schemaVersion !== BREW_FLAVOR_STATE_CONTRACT) {
    throw new Error(`专业分析风味状态协议不兼容：${flavorState.schemaVersion || 'unknown'}`);
  }
  if (!Array.isArray(flavorState.brewEffectVector) || flavorState.brewEffectVector.length !== 8) {
    throw new Error('专业分析风味效果向量无效');
  }
  if (flavorState.vector && (!Array.isArray(flavorState.vector) || flavorState.vector.length !== 8)) {
    throw new Error('专业分析风味状态向量无效');
  }
  return flavorState;
}

function validateSpatial(spatial) {
  if (!spatial || !SUPPORTED_SPATIAL_CONTRACTS.has(spatial.schemaVersion)) {
    throw new Error(`专业分析缺少兼容三维轨迹：${[...SUPPORTED_SPATIAL_CONTRACTS].join(' / ')}`);
  }
  if (!spatial.planFingerprint) throw new Error('专业分析三维轨迹缺少方案指纹');
  if (!Array.isArray(spatial.path) || spatial.path.length < 2) throw new Error('专业分析三维轨迹点不足');
  let previousTime = -Infinity;
  let previousWater = -Infinity;
  for (const [index, point] of spatial.path.entries()) {
    if (!Array.isArray(point) || point.length < 3) throw new Error(`三维轨迹第 ${index + 1} 点格式无效`);
    const time = assertFinite(point[0], `trajectory.path[${index}].time`);
    assertFinite(point[1], `trajectory.path[${index}].temperature`);
    const water = assertFinite(point[2], `trajectory.path[${index}].water`);
    if (time < previousTime) throw new Error('三维轨迹时间必须单调递增');
    if (water < previousWater) throw new Error('三维轨迹累计注水必须单调递增');
    previousTime = time;
    previousWater = water;
  }
  if (!Array.isArray(spatial.targets)) throw new Error('专业分析缺少三维风味靶区');
  const targetIds = new Set(spatial.targets.map(target => String(target?.id || '')));
  const missing = REQUIRED_TARGET_IDS.filter(id => !targetIds.has(id));
  if (missing.length) throw new Error(`专业分析缺少靶区：${missing.join('、')}`);
  for (const target of spatial.targets) {
    if (!Array.isArray(target?.points) || target.points.length < 12) {
      throw new Error(`专业分析靶区几何无效：${target?.id || 'unknown'}`);
    }
  }
  validateFlavorState(spatial.flavorState, { required: spatial.schemaVersion === BREW_SPATIAL_CONTRACT });
  return spatial;
}

function validateAnalysis(analysis, { expectedInputFingerprint = '' } = {}) {
  if (!analysis || !SUPPORTED_ANALYSIS_CONTRACTS.has(analysis.contract)) {
    throw new Error(`专业分析接口契约不兼容：${analysis?.contract || 'unknown'}`);
  }
  if (!analysis.analysisFingerprint) throw new Error('专业分析缺少统一计算指纹');
  if (!analysis.plan || typeof analysis.plan !== 'object') throw new Error('专业分析缺少冲煮方案');
  validateSpatial(analysis.trajectory);
  const metadata = analysis.metadata || {};
  const planFingerprint = metadata.planFingerprint || analysis.plan.metadata?.fingerprint || '';
  if (planFingerprint && analysis.trajectory.planFingerprint !== planFingerprint) {
    throw new Error('冲煮方案与三维轨迹指纹不一致');
  }
  if (expectedInputFingerprint && metadata.inputFingerprint !== expectedInputFingerprint) {
    throw new Error('专业分析返回的输入指纹与本次请求不一致');
  }
  if (analysis.input?.matching && !['luckybean-match/1.0', 'luckybean-match/1.1'].includes(analysis.input.matching.contract)) {
    throw new Error('专业分析返回的匹配协议版本不兼容');
  }
  return analysis;
}

function warningText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return String(value.message || value.code || '模型提示');
  return String(value || '');
}

function mapStage(stage, index) {
  const start = Number(stage.start ?? stage.startSec ?? 0);
  const end = Number(stage.end ?? (start + Number(stage.durationSec ?? 0)));
  const pour = Number(stage.pour ?? stage.stageWaterG ?? 0);
  const cumulative = Number(stage.cumulative ?? stage.cumulativeWaterG ?? pour);
  const temperature = Number(stage.pourTemperature ?? stage.temperatureC ?? stage.temp ?? 90);
  const bedTemperature = Number(stage.bedTemperatureEnd ?? stage.estimatedBedTemperature ?? stage.coreTemperatureC ?? temperature);
  const flow = Number(stage.flow ?? stage.flowGPerSec ?? 0);
  return {
    ...stage,
    index: Number(stage.index ?? index + 1),
    start,
    end,
    pour,
    cumulative,
    temp: temperature,
    flow,
    startSec: start,
    durationSec: Math.max(0, end - start),
    stageWaterG: pour,
    cumulativeWaterG: cumulative,
    temperatureC: temperature,
    coreTemperatureC: bedTemperature,
    flowGPerSec: flow,
    method: String(stage.method || stage.transitionCondition || ''),
    notice: String(stage.notice || stage.source?.timing || '')
  };
}

export function adaptAuthoritativePlan(analysis) {
  validateAnalysis(analysis);
  const source = structuredClone(analysis.plan);
  const stages = (source.stages || []).map(mapStage);
  const summary = source.summary || {};
  const totalWater = Number(summary.totalWater ?? source.totals?.waterG ?? stages.at(-1)?.cumulative ?? 0);
  const dose = Number(summary.dose ?? source.totals?.doseG ?? analysis.input?.brew?.doseG ?? 0);
  const ratio = Number(summary.ratio ?? source.totals?.ratio ?? (dose > 0 ? totalWater / dose : 0));
  const totalTime = Number(summary.totalTime ?? source.totals?.targetTimeSec ?? stages.at(-1)?.end ?? 0);
  const profileId = String(source.profile?.id || source.metadata?.profileId || analysis.metadata?.resolvedProfileId || 'recommended');
  const profileVersion = String(source.profile?.version || source.metadata?.profileVersion || analysis.metadata?.resolvedProfileVersion || '');
  const warnings = [...(source.warnings || []), ...(analysis.warnings || [])].map(warningText).filter(Boolean);
  const flavorState = structuredClone(analysis.trajectory?.flavorState || analysis.flavorState || source.flavorState || null);
  const rawCandidates = analysis.matching?.candidates || source.matching?.candidates || source.recommendation?.candidates || [];
  const candidates = (Array.isArray(rawCandidates) ? rawCandidates : [])
    .map(item => {
      const id = String(item?.profile?.id || item?.profileId || item?.id || '').trim();
      const score = Number(item?.score ?? item?.matchingScore ?? item?.matchScore);
      if (!id || !Number.isFinite(score)) return null;
      return {
        ...structuredClone(item),
        id,
        score,
        reason: String(item?.reason || item?.summary || item?.explanation || ''),
        profile: { ...(item?.profile || {}), id, label: String(item?.profile?.label || item?.profileLabel || item?.label || id) }
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return {
    ...source,
    engineVersion: String(source.engineVersion || source.metadata?.engineVersion || analysis.metadata?.engineVersion || ''),
    profile: { ...(source.profile || {}), id: profileId, version: profileVersion, label: source.profile?.label || profileId },
    profileVersion: profileVersion ? `${profileId}@${profileVersion}` : profileId,
    recommendation: { ...(source.recommendation || {}), selectedBy: analysis.matching?.selectedBy || source.matching?.selectedBy || source.recommendation?.selectedBy || 'private-service', candidates },
    stages,
    totals: { ...(source.totals || {}), doseG: dose, waterG: totalWater, ratio, targetTimeSec: totalTime },
    warnings: [...new Set(warnings)],
    trajectory: structuredClone(analysis.trajectory),
    visualization3d: structuredClone(analysis.trajectory),
    flavorState,
    prediction: structuredClone(analysis.prediction || analysis.trajectory.prediction || {}),
    matching: structuredClone(analysis.matching || source.matching || null),
    integrations: structuredClone(analysis.integrations || {}),
    analysisContract: analysis.contract,
    analysisFingerprint: analysis.analysisFingerprint,
    analysisRequestId: analysis.requestId,
    analysisGeneratedAt: analysis.generatedAt,
    analysisSnapshot: structuredClone(analysis),
    executionSource: 'brew-profiles-authoritative',
    clientAdjusted: false
  };
}

function sameBeanRecord(record = {}, inputBean = {}) {
  const keys = ['countryCode', 'regionCode', 'entityCode', 'varietyCode', 'processCode', 'roastCode', 'roastDate'];
  const comparable = keys.filter(key => inputBean[key]);
  if (!comparable.length) return false;
  return comparable.every(key => String(record[key] || '') === String(inputBean[key] || ''));
}

function selectedBeanIdFromRuntime(input = {}) {
  const explicit = String(input?.bean?.id || input?.beanId || input?.brew?.beanId || '').trim();
  if (explicit) return explicit;
  try {
    return String(globalThis.document?.querySelector?.('#brewBean')?.value || '').trim();
  } catch {
    return '';
  }
}

async function matchingCodebookIndex() {
  if (!codebookIndexPromise) {
    codebookIndexPromise = loadCodebook()
      .then(loaded => makeIndex(loaded?.data || loaded))
      .catch(() => null);
  }
  return codebookIndexPromise;
}

function resolvedName(index, table, code) {
  if (!index || !code) return '';
  const name = String(displayName(index, table, code, '') || '').trim();
  return name === '—' ? '' : name;
}

async function enrichBeanForMatching(bean = {}) {
  const index = await matchingCodebookIndex();
  const flavorNames = [...new Set((bean.flavorCodes || [])
    .map(code => resolvedName(index, 'flavors', code))
    .filter(Boolean))];
  return {
    ...bean,
    countryName: bean.countryName || resolvedName(index, 'countries', bean.countryCode),
    regionName: bean.regionName || resolvedName(index, 'regions', bean.regionCode),
    entityName: bean.entityName || resolvedName(index, 'entities', bean.entityCode),
    varietyName: bean.varietyName || resolvedName(index, 'varieties', bean.varietyCode),
    processName: bean.processName || resolvedName(index, 'processes', bean.processCode),
    flavorText: [bean.flavorText, ...flavorNames].filter(Boolean).join(' ').trim()
  };
}

function findGearRow(rows, id, aliases = []) {
  if (!Array.isArray(rows)) return null;
  const values = new Set([id, ...aliases].filter(Boolean).map(String));
  return rows.find(row => values.has(String(row?.id || '')) || values.has(String(row?.name || '')) || values.has(String(row?.type || ''))) || null;
}

function gearSnapshot(settings = {}, input = {}) {
  const gear = settings?.gear || {};
  const matching = settings?.matchingGear || {};
  const brew = input?.brew || {};
  const dripper = findGearRow(gear.drippers, brew.dripperId, [brew.dripperCode]) || {};
  const paper = findGearRow(gear.filters, brew.filterPaperId, [brew.filterPaper]) || {};
  const dripperMatch = matching.drippers?.[dripper.id || brew.dripperId] || matching.defaultDripper || {};
  const paperMatch = matching.papers?.[paper.id || brew.filterPaperId] || matching.defaultPaper || {};
  return {
    dripper: {
      id: String(dripper.id || brew.dripperId || ''),
      name: String(dripper.name || ''),
      type: String(dripper.type || brew.dripperCode || ''),
      material: String(dripper.material || brew.dripperMaterial || 'plastic'),
      angleDeg: Number.isFinite(Number(dripperMatch.angleDeg ?? dripper.angleDeg)) ? Number(dripperMatch.angleDeg ?? dripper.angleDeg) : null,
      bypass: String(dripperMatch.bypass ?? dripper.bypass ?? 'medium')
    },
    paper: {
      id: String(paper.id || brew.filterPaperId || ''),
      brand: String(paper.brand || ''),
      type: String(paper.type || brew.filterPaper || ''),
      speed: String(paperMatch.speed ?? paper.speed ?? 'medium')
    }
  };
}

async function attachMatching(input) {
  const next = structuredClone(input || {});
  const [beans, settings] = await Promise.all([
    all('beans').catch(() => []),
    getSetting('app.settings', {}).catch(() => ({}))
  ]);
  const selectedBeanId = selectedBeanIdFromRuntime(next);
  const bean = beans.find(item => selectedBeanId && String(item?.id || '') === selectedBeanId)
    || beans.find(item => sameBeanRecord(item, next.bean || {}))
    || { ...(next.bean || {}) };
  const enrichedBean = await enrichBeanForMatching(bean);
  if (bean?.id) {
    next.bean = {
      ...(next.bean || {}),
      id: bean.id,
      flavorCodes: [...(bean.flavorCodes || next.bean?.flavorCodes || [])]
    };
  }

  const snapshots = gearSnapshot(settings, next);
  next.brew ||= {};
  next.brew.dripperSnapshot = snapshots.dripper;
  next.brew.filterPaperSnapshot = snapshots.paper;

  next.matching = buildMatchingEnvelope({
    bean: enrichedBean,
    settings,
    input: next,
    userCorrection: settings?.matching?.userCorrection || [],
    sessionCorrection: []
  });
  return next;
}

async function cached(input) {
  const id = await cacheKey(input);
  const expected = await inputFingerprint(input);
  const record = await get('syncMetadata', id).catch(() => null);
  if (!record?.analysis) return null;
  try {
    return { analysis: validateAnalysis(record.analysis, { expectedInputFingerprint: expected }), cacheId: id, cached: true };
  } catch {
    return null;
  }
}

async function persistCache(input, analysis) {
  const id = await cacheKey(input);
  await put('syncMetadata', {
    id,
    analysis: structuredClone(analysis),
    contract: analysis.contract,
    spatialContract: analysis.trajectory?.schemaVersion || '',
    flavorStateContract: analysis.trajectory?.flavorState?.schemaVersion || '',
    fingerprint: analysis.analysisFingerprint,
    inputFingerprint: await inputFingerprint(input),
    engineVersion: analysis.metadata?.engineVersion || '',
    profileId: analysis.metadata?.resolvedProfileId || '',
    profileVersion: analysis.metadata?.resolvedProfileVersion || '',
    createdAt: new Date().toISOString()
  });
  return id;
}

async function fetchAnalysis(input, { endpoint = BREW_ANALYSIS_ENDPOINT, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const expected = await inputFingerprint(input);
  const { payload } = await brewApiJson('', {
    method: 'POST',
    body: input,
    endpoint,
    timeoutMs: Math.min(Math.max(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 2500), 20000)
  });
  return validateAnalysis(payload, { expectedInputFingerprint: expected });
}

export async function requestBrewAnalysis(input, options = {}) {
  const preparedInput = await attachMatching(input);
  const cacheRecord = await cached(preparedInput);
  const online = globalThis.navigator?.onLine !== false;
  if (!online && cacheRecord) return { ...cacheRecord, plan: adaptAuthoritativePlan(cacheRecord.analysis), stale: true, offline: true };
  if (options.preferCache === true && cacheRecord) return { ...cacheRecord, plan: adaptAuthoritativePlan(cacheRecord.analysis) };
  try {
    const analysis = await fetchAnalysis(preparedInput, options);
    const cacheId = await persistCache(preparedInput, analysis);
    return { analysis, plan: adaptAuthoritativePlan(analysis), cacheId, cached: false };
  } catch (error) {
    if (cacheRecord) {
      return {
        ...cacheRecord,
        plan: adaptAuthoritativePlan(cacheRecord.analysis),
        stale: true,
        networkError: error.message,
        networkErrorCode: error.code || ''
      };
    }
    throw error;
  }
}

export async function requestAuthoritativePlan(input, options = {}) {
  return (await requestBrewAnalysis(input, options)).plan;
}
