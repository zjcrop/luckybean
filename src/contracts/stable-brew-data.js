/**
 * Stable cross-project business data.
 *
 * Application, engine and provider versions belong to the transport envelope,
 * not to this object. Boundary adapters must not insert release/version fields
 * into the shared business object.
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
const TARGET_DEFAULTS = Object.freeze({ acidity: 1.5, floral: 2, fruity: 2, sweetness: 2, bitterness: 2, astringency: 2 });

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
  data.brew.doseMode = data.brew.doseMode === 'manual' ? 'manual' : 'auto';
  data.brew.serveMode = data.brew.serveMode === 'cold' ? 'cold' : 'hot';
  data.brew.ratio = finite(data.brew.ratio, 15.5);
  data.brew.dripperMaterial = ['glass', 'ceramic', 'plastic', 'titanium'].includes(String(data.brew.dripperMaterial))
    ? String(data.brew.dripperMaterial)
    : 'plastic';
  data.water.recipeVolumeL = finite(data.water.recipeVolumeL, 5);
  data.environment.ambientTemperatureC = finite(data.environment.ambientTemperatureC, 25);
  data.environment.initialBedTemperatureC = finite(data.environment.initialBedTemperatureC, 25);
  if (data.environment.relativeHumidityPct !== null && data.environment.relativeHumidityPct !== undefined) {
    data.environment.relativeHumidityPct = finite(data.environment.relativeHumidityPct, null);
  }
  delete data.targets.body;
  for (const id of STABLE_TARGET_IDS) {
    data.targets[id] = finite(data.targets[id], TARGET_DEFAULTS[id]);
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
  return STABLE_TARGET_IDS.every(id => Number.isFinite(Number(value.targets[id])));
}

