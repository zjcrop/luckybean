import { test, expect } from '@playwright/test';

test.setTimeout(120_000);

test('real PP-OCR worker initializes without blocking the browser main thread', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

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
        elapsedMs: performance.now() - started,
        ticks,
        webOcr: document.documentElement.dataset.webOcr || ''
      };
    } finally {
      clearInterval(heartbeat);
    }
  });

  expect(result.workerOnly).toBe(true);
  expect(result.webOcr).toContain('worker-only');
  expect(result.ready, `PP-OCR worker/model preload failed; page errors: ${pageErrors.join(' | ')}`).toBe(true);
  if (result.elapsedMs >= 250) {
    expect(result.ticks, 'browser heartbeat stopped while PP-OCR initialized').toBeGreaterThanOrEqual(2);
  }
  expect(pageErrors.filter(message => /worker|paddle|onnx|ocr/i.test(message))).toEqual([]);
});
