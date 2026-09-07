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
  RECOGNITION_RECORD_CANDIDATE_SCHEMA,
  groupRecognitionRecordCandidates
} from './domain/recognition/recognition-record-segmenter.js';

export {
  RECOGNITION_RECORD_HYPOTHESIS_SCHEMA,
  buildRecognitionRecordHypothesis
} from './domain/recognition/recognition-record-hypothesis.js';

export {
  MULTI_ENTRY_SCHEMA,
  splitRecognitionEntries
} from './domain/recognition/recognition-entry-splitter.js';

export {
  RECOGNITION_STRUCTURE_RECOVERY_SCHEMA,
  AI_STRUCTURE_RESULT_SCHEMA,
  normalizeAiStructureProposal,
  recoverRecognitionStructureLocal,
  recoverRecognitionStructure
} from './domain/recognition/recognition-structure-recovery.js';

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
