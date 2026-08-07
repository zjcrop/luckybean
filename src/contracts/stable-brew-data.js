/**
 * Stable cross-project business data.
 *
 * Application, engine and provider versions belong to the transport envelope,
 * not to this object. The boundary adapter may add the provider's transport
 * metadata when calling a legacy or versioned endpoint.
 */
const TRANSPORT_METADATA = new Set(['schemaVersion', 'contract', 'version', 'appVersion', 'engineVersion', 'profileVersion']);

function clone(value) {
  return structuredClone(value || {});
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export const STABLE_BREW_DATA_FORMAT = 'luckybean-brew-data';
export const STABLE_TARGET_IDS = Object.freeze(['acidity', 'floral', 'fruity', 'sweetness', 'bitterness', 'astringency']);

/**
 * Removes application/provider metadata and normalizes the fields shared by
 * LuckyBean, BrewProfiles and future clients. Unknown additive fields remain
 * available so a new producer does not erase data owned by another project.
 */
export function toStableBrewData(input = {}) {
  const data = clone(input);
  for (const key of TRANSPORT_METADATA) delete data[key];
  data.bean ||= {};
  data.brew ||= {};
  data.water ||= {};
  data.environment ||= {};
  data.targets ||= {};

  data.brew.profileId = data.brew.profileId || data.brew.brewStyle || data.brew.style || 'recommended';
  data.brew.doseG = finite(data.brew.doseG, 15);
  data.brew.ratio = finite(data.brew.ratio, 15.5);
  data.water.recipeVolumeL = finite(data.water.recipeVolumeL, 5);
  data.environment.ambientTemperatureC = finite(data.environment.ambientTemperatureC, 25);
  data.environment.initialBedTemperatureC = finite(data.environment.initialBedTemperatureC, 25);
  if (data.environment.relativeHumidityPct !== null && data.environment.relativeHumidityPct !== undefined) {
    data.environment.relativeHumidityPct = finite(data.environment.relativeHumidityPct, null);
  }
  for (const id of ['floral', 'acidity', 'sweetness', 'body', 'bitterness']) {
    if (data.targets[id] !== undefined) data.targets[id] = finite(data.targets[id], 0);
  }
  return data;
}

/**
 * Adds only the metadata required by the current BrewProfiles HTTP boundary.
 * This keeps the shared business object version-independent while allowing a
 * versioned endpoint to remain backward compatible during migration.
 */
export function toBrewProfilesTransport(input = {}) {
  return { schemaVersion: 2, ...toStableBrewData(input) };
}

export function isStableBrewData(value) {
  if (!value || typeof value !== 'object') return false;
  if (TRANSPORT_METADATA.has('schemaVersion') && Object.hasOwn(value, 'schemaVersion')) return false;
  return ['bean', 'brew', 'water', 'environment', 'targets'].every(key => value[key] && typeof value[key] === 'object');
}

