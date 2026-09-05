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
        roiWorkerOnly: globalThis.LuckyBeanPaddleOCR?.roiWorkerOnly === true,
        regionRecognition: globalThis.LuckyBeanPaddleOCR?.regionRecognition || '',
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
  expect(result.roiWorkerOnly).toBe(true);
  expect(result.regionRecognition).toBe('recognition-roi/1.0');
  expect(result.runtimeOrigin).toBe('same-origin-vendored');
  expect(result.webOcr).toContain('self-hosted-worker-only');
  expect(result.ready, `PP-OCR same-origin worker/model preload failed; page errors: ${pageErrors.join(' | ')}; blocked external requests: ${blockedRequests.join(' | ')}`).toBe(true);
  if (result.elapsedMs >= 250) {
    expect(result.ticks, 'browser heartbeat stopped while PP-OCR initialized').toBeGreaterThanOrEqual(2);
  }
  expect(blockedRequests, 'OCR attempted to access an external CDN/model host at runtime').toEqual([]);
  expect(pageErrors.filter(message => /worker|paddle|onnx|ocr/i.test(message))).toEqual([]);
});

test('real ROI worker crops a source image off-main-thread using normalized coordinates', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.LuckyBeanPaddleOCR?.roiWorkerOnly === true, null, { timeout: 20_000 });

  const result = await page.evaluate(async () => {
    const source = await fetch('./public/app-logo.webp').then(response => {
      if (!response.ok) throw new Error(`fixture HTTP ${response.status}`);
      return response.blob();
    });
    const workerUrl = new URL('roi-worker.js', globalThis.LuckyBeanPaddleOCR.runtimeBase()).href;
    const worker = new Worker(workerUrl, { type: 'classic', name: 'roi-runtime-test' });
    let ticks = 0;
    const heartbeat = setInterval(() => { ticks += 1; }, 10);
    try {
      const payload = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('ROI runtime worker timeout')), 20_000);
        worker.onmessage = event => {
          if (event.data?.requestId !== 'runtime-test') return;
          clearTimeout(timeout);
          if (event.data?.ok !== true) reject(new Error(event.data?.error || 'ROI runtime worker failed'));
          else resolve(event.data);
        };
        worker.onerror = event => {
          clearTimeout(timeout);
          reject(new Error(event.message || 'ROI worker error'));
        };
        worker.postMessage({
          requestId: 'runtime-test',
          blob: source,
          region: { left: 0.2, top: 0.2, right: 0.8, bottom: 0.8 },
          maxEdge: 900
        });
      });
      return {
        ok: payload.ok,
        blobBytes: payload.blob?.size || 0,
        region: payload.region,
        sourceWidth: payload.sourceWidth,
        sourceHeight: payload.sourceHeight,
        cropWidth: payload.cropWidth,
        cropHeight: payload.cropHeight,
        outputWidth: payload.outputWidth,
        outputHeight: payload.outputHeight,
        ticks
      };
    } finally {
      clearInterval(heartbeat);
      worker.terminate();
    }
  });

  expect(result.ok).toBe(true);
  expect(result.blobBytes).toBeGreaterThan(100);
  expect(result.region).toEqual({ left: 0.2, top: 0.2, right: 0.8, bottom: 0.8 });
  expect(result.sourceWidth).toBeGreaterThan(0);
  expect(result.sourceHeight).toBeGreaterThan(0);
  expect(result.cropWidth).toBeGreaterThan(0);
  expect(result.cropHeight).toBeGreaterThan(0);
  expect(result.outputWidth).toBeGreaterThan(0);
  expect(result.outputHeight).toBeGreaterThan(0);
  expect(result.ticks, 'browser heartbeat stopped while ROI worker decoded/cropped the image').toBeGreaterThan(0);
  expect(pageErrors.filter(message => /roi|worker|canvas|bitmap/i.test(message))).toEqual([]);
});
