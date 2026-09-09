const JARC_NUMERIC = /\bJARC\s*[-–—:]?\s*(\d{3,6})\b/giu;
const SKIP_SELECTOR = 'script,style,textarea,input,pre,code,.bag-raw-evidence,.bag-recognition-result,[data-preserve-source-text],[contenteditable="true"]';

export function compactJarcCultivarText(value) {
  return String(value ?? '').replace(JARC_NUMERIC, '$1');
}

function shouldSkipTextNode(node) {
  const parent = node?.parentElement;
  return !parent || Boolean(parent.closest(SKIP_SELECTOR));
}

function compactTextNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE || shouldSkipTextNode(node)) return;
  const source = String(node.nodeValue || '');
  const compact = compactJarcCultivarText(source);
  if (compact !== source) node.nodeValue = compact;
}

function compactSubtree(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    compactTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE && root.matches?.(SKIP_SELECTOR)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    compactTextNode(node);
    node = walker.nextNode();
  }
}

export function installCultivarDisplayObserver() {
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return null;
  if (globalThis.__LUCKYBEAN_CULTIVAR_DISPLAY_OBSERVER__) return globalThis.__LUCKYBEAN_CULTIVAR_DISPLAY_OBSERVER__;
  compactSubtree(document.body || document.documentElement);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') compactTextNode(record.target);
      else for (const node of record.addedNodes || []) compactSubtree(node);
    }
  });
  observer.observe(document.body || document.documentElement, { subtree:true, childList:true, characterData:true });
  globalThis.__LUCKYBEAN_CULTIVAR_DISPLAY_OBSERVER__ = observer;
  return observer;
}

if (typeof document !== 'undefined') installCultivarDisplayObserver();
