import { analyzeSourceWater } from '../water/water-analysis.js';
import { assessExtractionMeasurements } from './extraction-assessment.js';

// Add input diagnostics while preserving the authoritative executable recipe,
// provenance, fingerprints and any assessments supplied by the server itself.
export function attachInputAssessments(plan, input = {}) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new TypeError('冲煮结果须为对象');
  return {
    ...plan,
    waterAnalysis: plan.waterAnalysis ?? {
      ...analyzeSourceWater({ water: input.water === undefined ? {} : input.water, referenceProfile: plan.water?.profile || input.water?.customProfile || {} }),
      diagnosticsSource: 'client-input-diagnostics'
    },
    extractionAssessment: plan.extractionAssessment ?? {
      ...assessExtractionMeasurements({ measurements: input.measurements === undefined ? {} : input.measurements, brew: input.brew || {} }),
      diagnosticsSource: 'client-measurement-arithmetic'
    }
  };
}
