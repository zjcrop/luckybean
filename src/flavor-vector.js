/**
 * Unified flavor vector layer.
 *
 * Provides a shared data contract for recommendation, brew calculation,
 * 3D visualization and sensory feedback modules.
 */
export const FLAVOR_VECTOR_VERSION = '1.0.1';

const FIELDS = [
  'acidity',
  'sweetness',
  'bitterness',
  'aroma',
  'body',
  'clarity',
  'fermentation'
];

function normalize(value, fallback = 50) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function createFlavorVector(input = {}) {
  return Object.fromEntries(FIELDS.map(field => [field, normalize(input[field], 50)]));
}

/**
 * Contract-safe normalization: missing dimensions remain null instead of being
 * silently converted to a neutral score. This prevents missing model evidence
 * from being mistaken for a measured/predicted 50/100 value.
 */
export function normalizeFlavorVector(input = {}) {
  return Object.fromEntries(FIELDS.map(field => [field, normalize(input[field], null)]));
}

export function mergeFlavorVector(base = {}, patch = {}) {
  return createFlavorVector({ ...base, ...patch });
}

export function applySensoryFeedback(vector = {}, feedback = {}) {
  const result = { ...vector };
  for (const field of FIELDS) {
    if (feedback[field] !== undefined) {
      result[field] = normalize(Number(result[field]) + Number(feedback[field]));
    }
  }
  return result;
}

export function getFlavorVectorFields() {
  return [...FIELDS];
}
