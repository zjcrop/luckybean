// Stable recognition-core entry for downstream applications such as AromaSense.
// This file intentionally re-exports LuckyBean's production recognition modules;
// downstream apps must consume these implementations rather than reimplementing them.

export { preparePackageImage } from './image-quality.js';
export {
  recognizeCoffeeBag,
  recognizeImageRegion,
  normalizeRecognitionRegion,
  getRecognitionCapabilities,
  getRecognitionBatchSnapshot,
  clearRecognitionBatchSnapshot,
  RecognitionUnavailableError
} from './recognition-bridge.js';

export {
  RECOGNITION_DOCUMENT_SCHEMA,
  RECOGNITION_FIELD_ALIASES,
  RECOGNITION_FIELD_LABELS,
  createRecognitionDocument,
  recognitionDocumentFromText
} from './domain/recognition/recognition-document.js';

export {
  RECOGNITION_PIPELINE_VERSION,
  analyzeRecognitionDocument,
  recognitionResultField
} from './domain/recognition/recognition-pipeline.js';

export {
  resolveRecognitionRelations,
  resolverPriorityDescription
} from './domain/recognition/recognition-field-resolver-1.24b.js';

export {
  codebookCandidates,
  scalarCandidates,
  fieldCandidates,
  reliableCandidates,
  normalizeEvidenceValue
} from './recognition-candidates.js';
