// P3 capture policy: the photo flow has exactly four primary actions.
// OCR failure must leave the user in the photo flow so they can retake/re-upload/retry;
// it must not expose the legacy manual-paste fallback.
function enforceCapturePolicy() {
  const overlay = document.querySelector('[data-overlay="bag-capture"]');
  if (!overlay) return;
  overlay.querySelector('#bagManualBtn')?.remove();

  const raw = overlay.querySelector('#bagOcrText');
  const handoff = overlay.querySelector('#bagHandoffBtn');
  if (raw && !String(raw.value || '').trim() && handoff?.disabled) {
    raw.closest('.bag-recognition-result')?.remove();
  }
}

new MutationObserver(enforceCapturePolicy).observe(document.documentElement, {
  childList: true,
  subtree: true
});
document.addEventListener('luckybean:recognition-batch-progress', () => queueMicrotask(enforceCapturePolicy));
queueMicrotask(enforceCapturePolicy);

console.info('[LuckyBean] P3 four-action capture policy active');
