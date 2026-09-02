import { test, expect } from '@playwright/test';

test.setTimeout(120_000);

test('real PP-OCR worker initializes from same-origin assets without blocking the browser main thread', async ({ page }) => {
  const pageErrors = [];
  const blockedRequests = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

  await page.context().route(/https:\/\/(?:cdn\.jsdelivr\.net|paddle-model-ecology\.bj\.bcebos\.com)\/.*/, route => {
    blockedRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.LuckyBeanPaddleOCR?.workerOnly === true, null, { timeout: 20_000 });

  const result = await page.evaluate(async () => {
    let ticks = 0;
    const heartbeat = setInterval(() => { ticks += 1; }, 25);
    const started = performance.now();
    try {
      const engine = await globalThis.LuckyBeanPaddleOCR.preload();
      return {
        ready: Boolean(engine),
        workerOnly: globalThis.LuckyBeanPaddleOCR?.workerOnly === true,
        runtimeOrigin: globalThis.LuckyBeanPaddleOCR?.runtimeOrigin || '',
        elapsedMs: performance.now() - started,
        ticks,
        webOcr: document.documentElement.dataset.webOcr || ''
      };
    } finally {
      clearInterval(heartbeat);
    }
  });

  expect(result.workerOnly).toBe(true);
  expect(result.runtimeOrigin).toBe('same-origin-vendored');
  expect(result.webOcr).toContain('self-hosted-worker-only');
  expect(result.ready, `PP-OCR same-origin worker/model preload failed; page errors: ${pageErrors.join(' | ')}; blocked external requests: ${blockedRequests.join(' | ')}`).toBe(true);
  if (result.elapsedMs >= 250) {
    expect(result.ticks, 'browser heartbeat stopped while PP-OCR initialized').toBeGreaterThanOrEqual(2);
  }
  expect(blockedRequests, 'OCR attempted to access an external CDN/model host at runtime').toEqual([]);
  expect(pageErrors.filter(message => /worker|paddle|onnx|ocr/i.test(message))).toEqual([]);
});
