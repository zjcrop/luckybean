const REVIEW_OWNER_REVISION = '1.24B-review-owner.1';
const REVIEW_CONTAINER_SELECTOR = '[data-recognition-review="pending"] .text-evidence';
const REVIEW_ROW_SELECTOR = '.evidence-row[data-evidence-field]';
const DIRECT_MANUAL_REVIEW_FIELDS = new Set(['countryCode']);

function claimReviewContainer(container) {
  if (!(container instanceof Element)) return false;
  if (!container.closest('[data-recognition-review="pending"]')) return false;
  const rows = [...container.querySelectorAll(REVIEW_ROW_SELECTOR)];
  if (!rows.length) return false;

  // Scope this compatibility guard narrowly. A lone unresolved country value such
  // as "ATLANTIS" must survive until explicit confirmation, but mixed review
  // panels still belong to the integrity enhancer so multi-candidate fields such
  // as 74110 / 74112 keep their normal candidate buttons and legacy empty-field
  // filtering remains unchanged.
  if (!rows.every(row => DIRECT_MANUAL_REVIEW_FIELDS.has(row.dataset.evidenceField || ''))) return false;

  container.dataset.integrityEvidence = '1';
  container.dataset.recognitionReviewOwner = REVIEW_OWNER_REVISION;
  return true;
}

function protectRecognitionReview(root = document) {
  if (root?.matches?.(REVIEW_CONTAINER_SELECTOR)) claimReviewContainer(root);
  root?.querySelectorAll?.(REVIEW_CONTAINER_SELECTOR).forEach(claimReviewContainer);
}

function observeReviewOwnership() {
  const root = document.querySelector('#overlayRoot') || document.documentElement;
  protectRecognitionReview(root);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) protectRecognitionReview(node);
      }
    }
    protectRecognitionReview(root);
  });
  observer.observe(root, { childList: true, subtree: true });
  return observer;
}

const observer = observeReviewOwnership();
for (const eventName of ['luckybean:recognition-handoff-complete', 'luckybean:app-refreshed', 'luckybean:local-app-ready']) {
  document.addEventListener(eventName, () => protectRecognitionReview(document));
}

globalThis.LuckyBeanRecognitionReviewOwner = {
  revision: REVIEW_OWNER_REVISION,
  protect: protectRecognitionReview,
  disconnect: () => observer.disconnect()
};

export { REVIEW_OWNER_REVISION, protectRecognitionReview };
