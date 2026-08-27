const REVIEW_OWNER_REVISION = '1.24B-review-owner.1';
const REVIEW_CONTAINER_SELECTOR = '[data-recognition-review="pending"] .text-evidence';
const REVIEW_ROW_SELECTOR = '.evidence-row[data-evidence-field]';

function claimReviewContainer(container) {
  if (!(container instanceof Element)) return false;
  if (!container.closest('[data-recognition-review="pending"]')) return false;
  if (!container.querySelector(REVIEW_ROW_SELECTOR)) return false;

  // The canonical recognition pipeline already filtered this panel to unresolved
  // reviewFields. Legacy integrity enhancement must not discard a row merely
  // because the current form value is empty and the codebook has no reliable
  // standard candidate: that is exactly the case that requires manual review.
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
