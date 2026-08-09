import { get, put } from '../db.js';
import { sha256Hex } from '../utils.js';
import { BREW_API_ENDPOINT, brewApiJson } from './brew-api-client.js';

export const BREW_ANALYSIS_CONTRACT = 'brew-analysis/2.0';
export const BREW_SPATIAL_CONTRACT = 'brew-spatial/1.2';
export const BREW_ANALYSIS_ENDPOINT = BREW_API_ENDPOINT;
export const BREW_ANALYSIS_SERVICE_VERSION = 'luckybean-analysis-client/1.3.0';

const CACHE_PREFIX = 'brew.analysis.cache.v2.';
const DEFAULT_TIMEOUT_MS = 12000;
const REQUIRED_TARGET_IDS = Object.freeze(['acidity', 'floral', 'fruity', 'sweetness', 'bitterness', 'astringency']);

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

function validateSpatial(spatial) {
  if (!spatial || spatial.schemaVersion !== BREW_SPATIAL_CONTRACT) {
    throw new Error(`专业分析缺少 ${BREW_SPATIAL_CONTRACT} 三维轨迹`);
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
  return spatial;
}

function validateAnalysis(analysis, { expectedInputFingerprint = '' } = {}) {
  if (!analysis || analysis.contract !== BREW_ANALYSIS_CONTRACT) {
    throw new Error(`专业分析接口契约不匹配，应为 ${BREW_ANALYSIS_CONTRACT}`);
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

/**
 * Adds display aliases only. No stage value, recommendation, risk, profile
 * definition or target geometry is recalculated in LuckyBean.
 */
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
  return {
    ...source,
    engineVersion: String(source.engineVersion || source.metadata?.engineVersion || analysis.metadata?.engineVersion || ''),
    profile: {
      ...(source.profile || {}),
      id: profileId,
      version: profileVersion,
      label: source.profile?.label || profileId
    },
    profileVersion: profileVersion ? `${profileId}@${profileVersion}` : profileId,
    stages,
    totals: {
      ...(source.totals || {}),
      doseG: dose,
      waterG: totalWater,
      ratio,
      targetTimeSec: totalTime
    },
    warnings: [...new Set(warnings)],
    trajectory: structuredClone(analysis.trajectory),
    visualization3d: structuredClone(analysis.trajectory),
    prediction: structuredClone(analysis.prediction || analysis.trajectory.prediction || {}),
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
    contract: BREW_ANALYSIS_CONTRACT,
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
  const cacheRecord = await cached(input);
  const online = globalThis.navigator?.onLine !== false;
  if (!online && cacheRecord) return { ...cacheRecord, plan: adaptAuthoritativePlan(cacheRecord.analysis), stale: true, offline: true };
  if (options.preferCache === true && cacheRecord) return { ...cacheRecord, plan: adaptAuthoritativePlan(cacheRecord.analysis) };
  try {
    const analysis = await fetchAnalysis(input, options);
    const cacheId = await persistCache(input, analysis);
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
