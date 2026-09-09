const JARC_NUMERIC_PREFIX = /\bJARC\s*[-–—:：]?\s*(?=\d{4,6}\b)/gi;
const DISPLAY_ROOT_SELECTORS = ['#beanGroups', '#brewHeadingBean', '#brewContent', '#sensoryContent', '#overlayRoot'];
const SKIP_TEXT_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

function normalizeJarcDisplayText(value) {
  return String(value || '').replace(JARC_NUMERIC_PREFIX, '');
}

function normalizeTextNode(node) {
  const parent = node?.parentElement;
  if (!parent || SKIP_TEXT_PARENTS.has(parent.tagName)) return;
  const current = String(node.nodeValue || '');
  if (!/\bJARC\s*[-–—:：]?\s*\d{4,6}\b/i.test(current)) return;
  const next = normalizeJarcDisplayText(current);
  if (next !== current) node.nodeValue = next;
}

function normalizeElementAttributes(element) {
  if (!(element instanceof Element)) return;
  for (const name of ['title', 'aria-label']) {
    if (!element.hasAttribute(name)) continue;
    const current = element.getAttribute(name) || '';
    if (!/\bJARC\s*[-–—:：]?\s*\d{4,6}\b/i.test(current)) continue;
    element.setAttribute(name, normalizeJarcDisplayText(current));
  }
}

function normalizeDisplayTree(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    normalizeTextNode(root);
    return;
  }
  if (!(root instanceof Element || root instanceof DocumentFragment || root instanceof Document)) return;
  if (root instanceof Element) normalizeElementAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) normalizeTextNode(node);
    else normalizeElementAttributes(node);
    node = walker.nextNode();
  }
}

function installJarcDisplayNormalizer() {
  for (const selector of DISPLAY_ROOT_SELECTORS) normalizeDisplayTree(document.querySelector(selector));
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') {
        normalizeTextNode(record.target);
        continue;
      }
      for (const node of record.addedNodes) {
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (!element) continue;
        if (!DISPLAY_ROOT_SELECTORS.some(selector => element.closest?.(selector) || element.matches?.(selector))) continue;
        normalizeDisplayTree(node);
      }
    }
  });
  observer.observe(document.documentElement, { subtree:true, childList:true, characterData:true });
}

let autoRecognitionTimer = 0;
let lastTriggeredImageSignature = '';

function currentImageSignature() {
  if (typeof document === 'undefined') return '';
  return [...document.querySelectorAll('[data-bag-image-id]')]
    .map(node => String(node.getAttribute('data-bag-image-id') || ''))
    .filter(Boolean)
    .join('|');
}

function hideRecognitionButton() {
  if (typeof document === 'undefined') return null;
  const button = document.querySelector('#bagRecognizeBtn');
  if (!button) return null;
  button.hidden = true;
  button.tabIndex = -1;
  button.setAttribute('aria-hidden', 'true');
  return button;
}

function updateAutomaticRecognitionCopy() {
  if (typeof document === 'undefined') return;
  const status = document.querySelector('.bag-capture-status span');
  if (!status) return;
  if (/可以开始识别/.test(status.textContent || '')) {
    status.textContent = String(status.textContent || '').replace('可以开始识别', '系统会自动识别');
  }
}

function queueAutomaticRecognition(signature = currentImageSignature()) {
  if (typeof document === 'undefined' || !signature) return;
  globalThis.clearTimeout(autoRecognitionTimer);
  lastTriggeredImageSignature = signature;
  const startedAt = Date.now();
  const poll = () => {
    const overlay = document.querySelector('[data-overlay="bag-capture"]');
    if (!overlay) return;
    if (currentImageSignature() !== signature) return;
    const button = hideRecognitionButton();
    updateAutomaticRecognitionCopy();
    if (document.querySelector('.lb-img-pre')) {
      autoRecognitionTimer = globalThis.setTimeout(poll, 80);
      return;
    }
    if (button && !button.disabled && /开始识别/.test(button.textContent || '')) {
      button.click();
      return;
    }
    if (Date.now() - startedAt < 30000) autoRecognitionTimer = globalThis.setTimeout(poll, 80);
  };
  autoRecognitionTimer = globalThis.setTimeout(poll, 0);
}

function syncPackageCaptureAutoRecognition() {
  if (typeof document === 'undefined') return;
  const overlay = document.querySelector('[data-overlay="bag-capture"]');
  if (!overlay) {
    globalThis.clearTimeout(autoRecognitionTimer);
    lastTriggeredImageSignature = '';
    return;
  }
  hideRecognitionButton();
  updateAutomaticRecognitionCopy();
  const signature = currentImageSignature();
  if (signature && signature !== lastTriggeredImageSignature) queueAutomaticRecognition(signature);
}

function installPackageCaptureAutoRecognition() {
  syncPackageCaptureAutoRecognition();
  const observer = new MutationObserver(() => syncPackageCaptureAutoRecognition());
  observer.observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:['disabled'] });
}

if (typeof document !== 'undefined') {
  const install = () => {
    installJarcDisplayNormalizer();
    installPackageCaptureAutoRecognition();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
}

export { normalizeJarcDisplayText, queueAutomaticRecognition, currentImageSignature };
