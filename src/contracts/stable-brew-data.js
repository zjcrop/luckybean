/**
 * Stable cross-project business data.
 *
 * Application, engine and provider versions belong to the transport envelope,
 * not to this object. Boundary adapters must not insert release/version fields
 * into the shared business object.
 */
import { analyzeSourceWater, optionalMeasurement } from '../domain/water/water-analysis.js';
import { assessExtractionMeasurements } from '../domain/brew/extraction-assessment.js';

const TRANSPORT_METADATA = new Set(['schemaVersion', 'contract', 'version', 'appVersion', 'engineVersion', 'profileVersion']);

function clone(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('冲煮输入须为对象');
  return structuredClone(value);
}

function finite(value, fallback, name, { min = -Infinity, max = Infinity, positive = false } = {}) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (positive && value <= 0)) {
    throw new TypeError(`${name}须为有效数字；只有未提供时才使用默认值，空值不按零处理`);
  }
  return value;
}

function group(data, name) {
  if (data[name] === undefined) data[name] = {};
  else if (!data[name] || typeof data[name] !== 'object' || Array.isArray(data[name])) throw new TypeError(`${name}须为对象`);
}

export const STABLE_BREW_DATA_FORMAT = 'luckybean-brew-data';
export const STABLE_TARGET_IDS = Object.freeze(['acidity', 'floral', 'fruity', 'sweetness', 'bitterness', 'astringency']);
const TARGET_DEFAULTS = Object.freeze({ acidity: 1.5, floral: 2, fruity: 2, sweetness: 2, bitterness: 2, astringency: 2 });

/**
 * Removes application/provider metadata and normalizes the fields shared by
 * LuckyBean, BrewProfiles and future clients. Unknown additive fields remain
 * available so a new producer does not erase data owned by another project.
 */
export function toStableBrewData(input = {}) {
  const data = clone(input);
  for (const key of TRANSPORT_METADATA) delete data[key];
  for (const name of ['bean', 'brew', 'water', 'environment', 'targets']) group(data, name);

  data.brew.profileId = data.brew.profileId || data.brew.brewStyle || data.brew.style || 'recommended';
  data.brew.doseG = finite(data.brew.doseG, 15, '投粉g', { positive: true });
  data.brew.doseMode = data.brew.doseMode === 'manual' ? 'manual' : 'auto';
  data.brew.serveMode = data.brew.serveMode === 'cold' ? 'cold' : 'hot';
  data.brew.ratio = finite(data.brew.ratio, 15.5, '粉水比', { positive: true });
  data.brew.dripperMaterial = ['glass', 'ceramic', 'plastic', 'titanium'].includes(String(data.brew.dripperMaterial))
    ? String(data.brew.dripperMaterial)
    : 'plastic';
  data.water.recipeVolumeL = finite(data.water.recipeVolumeL, 5, '配制体积L', { positive: true });
  data.environment.ambientTemperatureC = finite(data.environment.ambientTemperatureC, 25, '环境温度°C');
  data.environment.initialBedTemperatureC = finite(data.environment.initialBedTemperatureC, 25, '初始粉床温度°C');
  if (data.environment.relativeHumidityPct !== null && data.environment.relativeHumidityPct !== undefined) {
    data.environment.relativeHumidityPct = finite(data.environment.relativeHumidityPct, null, '相对湿度%', { min: 0, max: 100 });
  }
  delete data.targets.body;
  for (const id of STABLE_TARGET_IDS) {
    data.targets[id] = finite(data.targets[id], TARGET_DEFAULTS[id], `风味目标${id}`, { min: 0, max: 3 });
  }
  // Validate optional measurement values without replacing their nulls, adding
  // fictitious measurements, or using profile references as actual water data.
  analyzeSourceWater({ water: data.water });
  if (data.water.customProfile !== undefined) {
    group(data.water, 'customProfile');
    optionalMeasurement(data.water.customProfile.tds, '自定义参考TDS mg/L');
  }
  if (data.measurements !== undefined) {
    group(data, 'measurements');
    assessExtractionMeasurements({ measurements: data.measurements, brew: data.brew });
  }
  return data;
}

/**
 * Produces the exact version-independent business object accepted by the
 * BrewProfiles gateway. HTTP protocol metadata belongs in headers/responses.
 */
export function toBrewProfilesTransport(input = {}) {
  return toStableBrewData(input);
}

export function isStableBrewData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if ([...TRANSPORT_METADATA].some(key => Object.hasOwn(value, key))) return false;
  if (!['bean', 'brew', 'water', 'environment', 'targets'].every(key => value[key] && typeof value[key] === 'object' && !Array.isArray(value[key]))) return false;
  if (Object.hasOwn(value.targets, 'body')) return false;
  if (typeof value.brew.profileId !== 'string' || !value.brew.profileId.trim()) return false;
  if (!['doseG', 'ratio'].every(key => typeof value.brew[key] === 'number' && Number.isFinite(value.brew[key]) && value.brew[key] > 0)) return false;
  if (!STABLE_TARGET_IDS.every(id => typeof value.targets[id] === 'number' && Number.isFinite(value.targets[id]) && value.targets[id] >= 0 && value.targets[id] <= 3)) return false;
  try { toStableBrewData(value); return true; } catch { return false; }
}

