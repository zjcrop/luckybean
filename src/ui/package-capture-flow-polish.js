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

let galleryWrapInstalled = false;
let autoRecognitionTimer = 0;

function queueAutomaticRecognition() {
  if (typeof document === 'undefined') return;
  globalThis.clearTimeout(autoRecognitionTimer);
  const startedAt = Date.now();
  const poll = () => {
    if (document.querySelector('.lb-img-pre')) {
      autoRecognitionTimer = globalThis.setTimeout(poll, 120);
      return;
    }
    const button = document.querySelector('#bagRecognizeBtn');
    if (button && !button.disabled && /开始识别/.test(button.textContent || '')) {
      button.click();
      return;
    }
    if (Date.now() - startedAt < 30000) autoRecognitionTimer = globalThis.setTimeout(poll, 120);
  };
  autoRecognitionTimer = globalThis.setTimeout(poll, 0);
}

function installGalleryAutoRecognition() {
  if (galleryWrapInstalled) return true;
  const api = globalThis.LuckyBeanGalleryImagePreprocess;
  if (!api || typeof api.preprocessFiles !== 'function') return false;
  const originalPreprocessFiles = api.preprocessFiles.bind(api);
  const wrappedPreprocessFiles = async files => {
    const processed = await originalPreprocessFiles(files);
    if (Array.isArray(processed) && processed.length) queueAutomaticRecognition();
    return processed;
  };
  globalThis.LuckyBeanGalleryImagePreprocess = Object.freeze({ ...api, preprocessFiles:wrappedPreprocessFiles });
  galleryWrapInstalled = true;
  return true;
}

function installWhenReady() {
  if (installGalleryAutoRecognition()) return;
  let attempts = 0;
  const timer = globalThis.setInterval(() => {
    attempts += 1;
    if (installGalleryAutoRecognition() || attempts >= 200) globalThis.clearInterval(timer);
  }, 100);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      installJarcDisplayNormalizer();
      installWhenReady();
    }, { once:true });
  } else {
    installJarcDisplayNormalizer();
    installWhenReady();
  }
}

export { normalizeJarcDisplayText, queueAutomaticRecognition };
