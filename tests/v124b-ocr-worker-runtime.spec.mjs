import { test, expect } from '@playwright/test';

test.setTimeout(120_000);

async function loadOcrRuntimeOnDemand(page) {
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanRuntimeFeatures?.load), null, { timeout: 20_000 });
  await page.evaluate(() => globalThis.LuckyBeanRuntimeFeatures.load('recognition-paddle-ocr'));
  await page.waitForFunction(() => globalThis.LuckyBeanPaddleOCR?.browserSafe === true, null, { timeout: 20_000 });
}

test('PP-OCR runtime stays lazy on app startup and exposes browser-safe on-demand mode', async ({ page }) => {
  const pageErrors = [];
  const heavyOcrRequests = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
  page.on('request', request => {
    const url = request.url();
    if (/public\/vendor\/paddleocr\/(?:sdk\.mjs|worker\.js|models\/|ort\/)/i.test(url)) heavyOcrRequests.push(url);
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanRuntimeFeatures?.load), null, { timeout: 20_000 });
  const beforeDemand = await page.evaluate(() => ({
    providerPresent: Boolean(globalThis.LuckyBeanPaddleOCR),
    lazyDeclared: globalThis.LuckyBeanRuntimeFeatures?.lazy?.includes('recognition-paddle-ocr') === true
  }));
  expect(beforeDemand.providerPresent, 'PP-OCR provider must not be imported during ordinary app startup').toBe(false);
  expect(beforeDemand.lazyDeclared).toBe(true);
  expect(heavyOcrRequests, 'app startup must not fetch PP-OCR SDK, models, worker or ORT before recognition is requested').toEqual([]);

  await loadOcrRuntimeOnDemand(page);
  const initial = await page.evaluate(() => ({
    workerOnly: globalThis.LuckyBeanPaddleOCR?.workerOnly,
    browserSafe: globalThis.LuckyBeanPaddleOCR?.browserSafe,
    autoPreload: globalThis.LuckyBeanPaddleOCR?.autoPreload,
    primaryIsolation: globalThis.LuckyBeanPaddleOCR?.primaryIsolation || '',
    roiWorkerOnly: globalThis.LuckyBeanPaddleOCR?.roiWorkerOnly === true,
    regionRecognition: globalThis.LuckyBeanPaddleOCR?.regionRecognition || '',
    runtimeOrigin: globalThis.LuckyBeanPaddleOCR?.runtimeOrigin || '',
    webOcr: document.documentElement.dataset.webOcr || ''
  }));

  expect(initial.workerOnly).toBe(false);
  expect(initial.browserSafe).toBe(true);
  expect(initial.autoPreload).toBe(false);
  expect(initial.primaryIsolation).toBe('module-worker');
  expect(initial.roiWorkerOnly).toBe(true);
  expect(initial.regionRecognition).toBe('recognition-roi/1.0');
  expect(initial.runtimeOrigin).toBe('same-origin-vendored');
  expect(initial.webOcr).toContain('self-hosted-lazy-memory-bounded');
  expect(heavyOcrRequests, 'importing the provider metadata must still not allocate the SDK/model/worker runtime').toEqual([]);
  expect(pageErrors.filter(message => /worker|paddle|onnx|ocr/i.test(message))).toEqual([]);
});

test('real ROI worker crops a camera-like JPEG off-main-thread using normalized coordinates', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await loadOcrRuntimeOnDemand(page);
  await page.waitForFunction(() => globalThis.LuckyBeanPaddleOCR?.roiWorkerOnly === true, null, { timeout: 20_000 });

  const result = await page.evaluate(async () => {
    // Direct-camera-controller emits image/jpeg. Build the regression fixture in the same format so
    // the Worker test reflects the production capture path rather than relying on WebP decoder
    // behavior that varies across headless Chromium revisions.
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 640;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f4f0e8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#181818';
    context.font = '48px sans-serif';
    context.fillText('ETHIOPIA GESHA 2026', 120, 210);
    context.fillText('WASHED 1950M', 170, 330);
    const source = await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('JPEG fixture creation failed')),
      'image/jpeg', 0.92
    ));

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
  expect(result.sourceWidth).toBe(960);
  expect(result.sourceHeight).toBe(640);
  expect(result.cropWidth).toBeGreaterThan(0);
  expect(result.cropHeight).toBeGreaterThan(0);
  expect(result.outputWidth).toBeGreaterThan(0);
  expect(result.outputHeight).toBeGreaterThan(0);
  expect(result.ticks, 'browser heartbeat stopped while ROI worker decoded/cropped the JPEG').toBeGreaterThan(0);
  expect(pageErrors.filter(message => /roi|worker|canvas|bitmap/i.test(message))).toEqual([]);
});