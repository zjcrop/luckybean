const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function requireObject(value, label) {
  if (!isObject(value)) throw new TypeError(`${label}必须是对象`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label}必须是非空字符串`);
  return value;
}

function requireFinite(value, label, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new TypeError(`${label}超出有效范围`);
  return number;
}

export const BREW_ANALYSIS_CONTRACT = 'brew-analysis/2.0';
export const BREW_SPATIAL_CONTRACT = 'brew-spatial/1.1';
export const BREW_HISTORY_SCHEMA = 'luckybean-brew-history/1.0';

export function validateSpatialModel(value) {
  const spatial = requireObject(value, '三维轨迹');
  if (spatial.contract !== BREW_SPATIAL_CONTRACT) throw new Error(`不支持的三维协议：${spatial.contract || '缺失'}`);
  requireString(spatial.modelVersion, '三维模型版本');
  requireString(spatial.planFingerprint, '三维方案指纹');
  const coordinate = requireObject(spatial.coordinateSystem, '坐标系');
  if (coordinate.x !== 'time_s' || coordinate.y !== 'bed_temperature_c' || coordinate.z !== 'cumulative_water_g') {
    throw new Error('三维坐标系必须为时间、粉床温度和累计注水量');
  }
  const points = spatial.path?.points;
  if (!Array.isArray(points) || points.length < 2) throw new Error('三维轨迹至少需要两个采样点');
  let previousTime = -Infinity;
  let previousWater = -Infinity;
  for (const [index, point] of points.entries()) {
    requireObject(point, `轨迹点${index + 1}`);
    const time = requireFinite(point.timeS, `轨迹点${index + 1}.timeS`, { min: 0 });
    const water = requireFinite(point.cumulativeWaterG, `轨迹点${index + 1}.cumulativeWaterG`, { min: 0 });
    requireFinite(point.bedTemperatureC, `轨迹点${index + 1}.bedTemperatureC`, { min: -20, max: 120 });
    requireFinite(point.flowGPerSec, `轨迹点${index + 1}.flowGPerSec`, { min: 0, max: 30 });
    for (const key of ['extractionProgress', 'floral', 'acidity', 'sweetness', 'body', 'bitterRisk', 'astringencyRisk']) {
      requireFinite(point[key], `轨迹点${index + 1}.${key}`, { min: 0, max: 1 });
    }
    if (time < previousTime) throw new Error('三维轨迹时间必须单调递增');
    if (water < previousWater) throw new Error('三维轨迹累计注水量必须单调递增');
    previousTime = time;
    previousWater = water;
  }
  for (const zone of [...(spatial.positiveZones || []), ...(spatial.riskZones || [])]) {
    requireString(zone.id, '风味区域ID');
    requireString(zone.label, '风味区域名称');
    requireObject(zone.center, '风味区域中心');
    requireObject(zone.radius, '风味区域半径');
    requireFinite(zone.confidence, '风味区域置信度', { min: 0, max: 1 });
  }
  requireFinite(spatial.confidence?.overall, '三维模型总体置信度', { min: 0, max: 1 });
  return spatial;
}

export function validateBrewAnalysis(value) {
  const analysis = requireObject(value, '冲煮分析');
  if (analysis.contract !== BREW_ANALYSIS_CONTRACT) throw new Error(`不支持的分析协议：${analysis.contract || '缺失'}`);
  const metadata = requireObject(analysis.metadata, '分析元数据');
  requireString(metadata.requestId, '请求编号');
  requireString(metadata.engineVersion, '引擎版本');
  requireString(metadata.planFingerprint, '方案指纹');
  requireString(metadata.inputFingerprint, '输入指纹');
  requireObject(analysis.input, '标准化输入');
  requireObject(analysis.plan, '冲煮方案');
  requireObject(analysis.sensoryPrediction, '感官预测');
  requireObject(analysis.integrations, '数据源信息');
  if (!Array.isArray(analysis.warnings)) throw new TypeError('警告信息必须是数组');
  const spatial = validateSpatialModel(analysis.trajectory);
  if (spatial.planFingerprint !== metadata.planFingerprint) throw new Error('冲煮方案与三维轨迹指纹不一致');
  return analysis;
}

export function createBrewHistoryRecord({ id, beanId, createdAt, actualDoseG, inventoryEventId, analysis, execution, note = '' }) {
  validateBrewAnalysis(analysis);
  requireString(id, '历史记录ID');
  requireString(beanId, '豆卡ID');
  requireString(inventoryEventId, '库存事件ID');
  requireFinite(actualDoseG, '实际使用豆量', { min: 0.01, max: 500 });
  return Object.freeze({
    schema: BREW_HISTORY_SCHEMA,
    id,
    beanId,
    createdAt: createdAt || new Date().toISOString(),
    actualDoseG: Number(actualDoseG),
    inventoryEventId,
    analysis: structuredClone(analysis),
    execution: structuredClone(execution || {}),
    note: String(note || ''),
    revisions: [],
    archivedAt: null,
    deletedAt: null
  });
}
