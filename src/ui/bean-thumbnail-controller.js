import { getBeanThumbnail } from '../domain/beans/bean-thumbnail-storage.js';

const pending = new WeakSet();

function hydrate(root = document) {
  const images = [];
  if (root.matches?.('img[data-bean-thumbnail]')) images.push(root);
  images.push(...(root.querySelectorAll?.('img[data-bean-thumbnail]') || []));
  images.forEach(image => {
    const beanId = String(image.dataset.beanThumbnail || '');
    if (!beanId || image.dataset.beanThumbnailLoaded === beanId || pending.has(image)) return;
    pending.add(image);
    getBeanThumbnail(beanId).then(dataUrl => {
      if (!image.isConnected || image.dataset.beanThumbnail !== beanId) return;
      image.dataset.beanThumbnailLoaded = beanId;
      const shell = image.closest('.bean-thumbnail-shell');
      const fallback = shell?.querySelector('.bean-thumbnail-fallback');
      if (!dataUrl) {
        image.hidden = true;
        if (fallback) fallback.hidden = false;
        return;
      }
      image.onerror = () => {
        image.hidden = true;
        if (fallback) fallback.hidden = false;
      };
      image.onload = () => { image.hidden = false; if (fallback) fallback.hidden = true; };
      image.src = dataUrl;
    }).catch(() => {
      const fallback = image.closest('.bean-thumbnail-shell')?.querySelector('.bean-thumbnail-fallback');
      image.hidden = true;
      if (fallback) fallback.hidden = false;
    }).finally(() => pending.delete(image));
  });
}

if (document.body) {
  const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === 1) hydrate(node); })));
  observer.observe(document.body, { childList:true, subtree:true });
  hydrate();
}
document.addEventListener('luckybean:request-app-refresh', () => hydrate());
globalThis.LuckyBeanBeanThumbnails = Object.freeze({ refresh:hydrate });
