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

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installJarcDisplayNormalizer, { once:true });
  else installJarcDisplayNormalizer();
}

export { normalizeJarcDisplayText };
