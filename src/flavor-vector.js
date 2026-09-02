/**
 * Unified flavor vector layer.
 *
 * Provides a shared superset data contract for recommendation, brew calculation,
 * 3D visualization, history comparison and sensory feedback modules.
 */
export const FLAVOR_VECTOR_VERSION = '1.1.0';

const FIELDS = [
  'acidity',
  'sweetness',
  'bitterness',
  'aroma',
  'body',
  'clarity',
  'fermentation',
  'aftertaste',
  'floral',
  'fruity',
  'astringency'
];

function sourceValue(input, field) {
  if (field === 'clarity' && input?.clarity == null && input?.clean != null) return input.clean;
  return input?.[field];
}

function normalize(value, fallback = 50) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function createFlavorVector(input = {}) {
  return Object.fromEntries(FIELDS.map(field => [field, normalize(sourceValue(input, field), 50)]));
}

/**
 * Contract-safe normalization: missing dimensions remain null instead of being
 * silently converted to a neutral score. This prevents missing model evidence
 * from being mistaken for a measured/predicted 50/100 value.
 */
export function normalizeFlavorVector(input = {}) {
  return Object.fromEntries(FIELDS.map(field => [field, normalize(sourceValue(input, field), null)]));
}

export function mergeFlavorVector(base = {}, patch = {}) {
  const merged = { ...base, ...patch };
  if (patch.clean !== undefined && patch.clarity === undefined) merged.clarity = patch.clean;
  return createFlavorVector(merged);
}

export function applySensoryFeedback(vector = {}, feedback = {}) {
  const result = { ...vector };
  for (const field of FIELDS) {
    const delta = sourceValue(feedback, field);
    if (delta !== undefined && delta !== null) {
      result[field] = normalize(Number(result[field] ?? 50) + Number(delta));
    }
  }
  return result;
}

export function getFlavorVectorFields() {
  return [...FIELDS];
}
