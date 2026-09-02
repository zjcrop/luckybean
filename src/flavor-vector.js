/**
 * Unified flavor vector layer.
 *
 * Provides a shared data contract for recommendation, brew calculation,
 * 3D visualization and sensory feedback modules.
 */
export const FLAVOR_VECTOR_VERSION = '1.0.0';

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
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function createFlavorVector(input = {}) {
  return {
    acidity: normalize(input.acidity),
    sweetness: normalize(input.sweetness),
    bitterness: normalize(input.bitterness),
    aroma: normalize(input.aroma),
    body: normalize(input.body),
    clarity: normalize(input.clarity),
    fermentation: normalize(input.fermentation)
  };
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
