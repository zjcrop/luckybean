import { normalizeFlavorVector, mergeFlavorVector } from './flavor-vector.js';

export const BREW_RESULT_VERSION = '1.0';

/**
 * Unified calculation output contract.
 * All renderers, feedback modules and recommendation layers should consume this object.
 */
export function buildBrewResult({ input = {}, physical = {}, flavor = {}, uncertainty = {} } = {}) {
  return {
    version: BREW_RESULT_VERSION,
    inputHash: input.hash || null,
    physical: {
      temperature: physical.temperature || null,
      trajectory: physical.trajectory || [],
      stages: physical.stages || [],
      extraction: physical.extraction || null
    },
    flavor: normalizeFlavorVector(flavor),
    uncertainty: {
      level: uncertainty.level || 'medium',
      range: uncertainty.range || null
    },
    createdAt: new Date().toISOString()
  };
}

export function applyFeedback(result, feedback = {}) {
  return {
    ...result,
    flavor: mergeFlavorVector(result.flavor, feedback)
  };
}
