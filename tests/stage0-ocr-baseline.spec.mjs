import { test, expect } from '@playwright/test';

test.setTimeout(360_000);

async function waitForRecognitionCore(page) {
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanRuntimeFeatures?.load), null, { timeout: 20_000 });
  // Follow production lazy loading exactly: the provider is a runtime feature, while
  // recognition-core.js is the stable downstream entry module (also used by AromaSense).
  await page.evaluate(async () => {
    await globalThis.LuckyBeanRuntimeFeatures.load('recognition-paddle-ocr');
    globalThis.LuckyBeanStage0RecognitionCore = await import('./src/recognition-core.js');
  });
  await page.waitForFunction(
    () => Boolean(globalThis.LuckyBeanStage0RecognitionCore?.preparePackageImage)
      && Boolean(globalThis.LuckyBeanStage0RecognitionCore?.recognizeCoffeeBag)
      && Boolean(globalThis.LuckyBeanPaddleOCR?.recognizeCoffeeBag),
    null,
    { timeout: 20_000 }
  );
}

async function runStage0Baseline(page) {
  return page.evaluate(async () => {
    const labels = [
      ['ETHIOPIA GUJI', 'JARC 74158', 'WASHED 1950M', 'ROAST 2026-08-28'],
      ['COLOMBIA HUILA', 'PINK BOURBON', 'HONEY 1800M', 'ROAST 2026-08-30'],
      ['PANAMA BOQUETE', 'GESHA', 'NATURAL 1700M', 'ROAST 2026-09-01'],
      ['KENYA NYERI', 'SL28 SL34', 'WASHED 1850M', 'ROAST 2026-09-02']
    ];

    async function cameraLikeFile(lines, index) {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = index % 2 ? '#e9e1d5' : '#f3eee5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(62 + index * 5, 70 + index * 3);
      ctx.rotate((index - 1.5) * 0.006);
      ctx.fillStyle = '#171717';
      ctx.font = '700 58px Arial, sans-serif';
      lines.forEach((line, lineIndex) => ctx.fillText(line, 70, 120 + lineIndex * 145));
      ctx.restore();
      // Stable low-amplitude texture prevents the fixture from being an unrealistically blank canvas
      // without adding random noise that would make the performance baseline non-repeatable.
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#51483f';
      for (let y = 18; y < canvas.height; y += 37) {
        for (let x = 11 + (y % 5); x < canvas.width; x += 53) ctx.fillRect(x, y, 1, 1);
      }
      ctx.globalAlpha = 1;
      const blob = await new Promise((resolve, reject) => canvas.toBlob(
        value => value ? resolve(value) : reject(new Error('JPEG fixture creation failed')),
        'image/jpeg',
        0.9
      ));
      return new File([blob], `stage0-coffee-label-${index + 1}.jpg`, { type: 'image/jpeg' });
    }

    const files = [];
    for (let i = 0; i < labels.length; i += 1) files.push(await cameraLikeFile(labels[i], i));

    const core = globalThis.LuckyBeanStage0RecognitionCore;
    const statuses = [];
    const diagnostics = [];
    globalThis.__LUCKYBEAN_RECOGNITION_DIAGNOSTICS__ = {
      record(entry) { diagnostics.push({ ...entry, durationMs:Number(Number(entry?.durationMs || 0).toFixed(3)) }); }
    };
    const progressHandler = event => statuses.push(String(event.detail?.status || ''));
    globalThis.addEventListener('luckybean:ocr-progress', progressHandler);

    async function prepare(file, id) {
      const start = performance.now();
      const prepared = await core.preparePackageImage(file);
      return {
        image: {
          id,
          role: 'front',
          roleLabel: 'Stage 0 benchmark',
          blob: prepared.blob,
          nativeSource: Boolean(prepared.nativeSource),
          fileName: file.name
        },
        ms: performance.now() - start
      };
    }

    async function recognize(images) {
      const start = performance.now();
      const result = await core.recognizeCoffeeBag(images, { locale: 'zh-CN' });
      return { result, ms: performance.now() - start };
    }

    function aggregateDiagnostics(entries) {
      const summary = {};
      for (const entry of entries) {
        const key = `${entry.scope}:${entry.phase}`;
        summary[key] ||= { count:0, totalMs:0, maxMs:0 };
        summary[key].count += 1;
        summary[key].totalMs += Number(entry.durationMs || 0);
        summary[key].maxMs = Math.max(summary[key].maxMs, Number(entry.durationMs || 0));
      }
      for (const value of Object.values(summary)) {
        value.totalMs = Number(value.totalMs.toFixed(3));
        value.maxMs = Number(value.maxMs.toFixed(3));
      }
      return summary;
    }

    try {
      const firstPrep = await prepare(files[0], 'single-cold');
      const firstOcr = await recognize([firstPrep.image]);

      // Stage 2 uses the same immutable RecognitionDocument -> analysis contract as production.
      // This adds timing visibility only; it does not change parser/canonical results.
      const book = await fetch('./public/fallback-codebook.json', { cache:'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Fallback codebook HTTP ${response.status}`);
        return response.json();
      });
      const firstDocument = core.createRecognitionDocument({
        images:[{ id:firstPrep.image.id, role:'front', roleLabel:'Stage 2 semantic timing' }],
        blocks:firstOcr.result?.blocks || [],
        engine:firstOcr.result?.engine || '',
        fullText:firstOcr.result?.fullText || ''
      });
      core.analyzeRecognitionDocument(firstDocument, book);

      const repeatPrep = await prepare(files[0], 'single-repeat');
      const repeatOcr = await recognize([repeatPrep.image]);

      const batchPrepared = [];
      let batchPrepMs = 0;
      for (let i = 0; i < files.length; i += 1) {
        const item = await prepare(files[i], `batch-${i + 1}`);
        batchPrepared.push(item.image);
        batchPrepMs += item.ms;
      }
      const batchOcr = await recognize(batchPrepared);

      const runtimeReadyEvents = statuses.filter(status => /(?:Worker 中文模型已就绪|兼容模式已就绪)/u.test(status)).length;
      return {
        fixtureKind: 'deterministic-camera-like-jpeg',
        engine: String(batchOcr.result?.engine || firstOcr.result?.engine || ''),
        provider: {
          version:String(globalThis.LuckyBeanPaddleOCR?.version || ''),
          workerOnly:Boolean(globalThis.LuckyBeanPaddleOCR?.workerOnly),
          browserSafe:Boolean(globalThis.LuckyBeanPaddleOCR?.browserSafe),
          primaryIsolation:String(globalThis.LuckyBeanPaddleOCR?.primaryIsolation || ''),
          workerBootstrap:String(globalThis.LuckyBeanPaddleOCR?.workerBootstrap || ''),
          autoPreload:Boolean(globalThis.LuckyBeanPaddleOCR?.autoPreload)
        },
        singleCold: {
          prepareMs: firstPrep.ms,
          ocrMs: firstOcr.ms,
          totalMs: firstPrep.ms + firstOcr.ms,
          blocks: Number(firstOcr.result?.blocks?.length || 0)
        },
        singleRepeat: {
          prepareMs: repeatPrep.ms,
          ocrMs: repeatOcr.ms,
          totalMs: repeatPrep.ms + repeatOcr.ms,
          blocks: Number(repeatOcr.result?.blocks?.length || 0)
        },
        fourImageWarmBatch: {
          prepareMs: batchPrepMs,
          ocrMs: batchOcr.ms,
          totalMs: batchPrepMs + batchOcr.ms,
          blocks: Number(batchOcr.result?.blocks?.length || 0)
        },
        runtimeReadyEvents,
        progressEventCount: statuses.length,
        stage2Diagnostics: diagnostics,
        stage2DiagnosticSummary: aggregateDiagnostics(diagnostics)
      };
    } finally {
      globalThis.removeEventListener('luckybean:ocr-progress', progressHandler);
      await globalThis.LuckyBeanPaddleOCR?.dispose?.();
      delete globalThis.__LUCKYBEAN_RECOGNITION_DIAGNOSTICS__;
      delete globalThis.LuckyBeanStage0RecognitionCore;
    }
  });
}

test('Stage 0 records repeatable PP-OCR single/repeat/four-image performance baseline', async ({ page }, testInfo) => {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await waitForRecognitionCore(page);
  const baseline = await runStage0Baseline(page);

  const baselineJson = `${JSON.stringify(baseline, null, 2)}\n`;
  console.log(`STAGE0_OCR_BASELINE ${JSON.stringify(baseline)}`);
  console.log(`STAGE2_LUCKYBEAN_RECOGNITION_DIAGNOSTICS ${JSON.stringify(baseline.stage2DiagnosticSummary)}`);
  await testInfo.attach('stage0-ocr-baseline.json', { body: Buffer.from(baselineJson), contentType: 'application/json' });

  expect(baseline.fixtureKind).toBe('deterministic-camera-like-jpeg');
  expect(baseline.singleCold.blocks).toBeGreaterThan(0);
  expect(baseline.singleRepeat.blocks).toBeGreaterThan(0);
  expect(baseline.fourImageWarmBatch.blocks).toBeGreaterThan(0);
  expect(baseline.runtimeReadyEvents, 'OCR engine should initialize once and be reused across immediate recognition calls').toBe(1);
  expect(baseline.singleCold.totalMs).toBeGreaterThan(0);
  expect(baseline.singleRepeat.totalMs).toBeGreaterThan(0);
  expect(baseline.fourImageWarmBatch.totalMs).toBeGreaterThan(0);
  expect(baseline.provider.workerOnly).toBe(false);
  expect(baseline.provider.browserSafe).toBe(true);
  expect(baseline.provider.primaryIsolation).toBe('module-worker');
  expect(baseline.provider.workerBootstrap).toBe('preloaded-blob-module');
  expect(baseline.provider.autoPreload).toBe(false);
  expect(baseline.stage2DiagnosticSummary['ocr:worker-bundle-fetch']?.count).toBe(1);
  expect(baseline.stage2DiagnosticSummary['ocr:worker-bootstrap']?.count).toBe(1);
  expect(baseline.stage2DiagnosticSummary['ocr:worker-bundle-fetch-failed']?.count || 0).toBeLessThanOrEqual(1);
  expect(baseline.stage2DiagnosticSummary['ocr:runtime-init']?.count).toBe(1);
  expect(baseline.stage2DiagnosticSummary['ocr:ocr-predict']?.count).toBeGreaterThanOrEqual(6);
  expect(baseline.stage2DiagnosticSummary['semantic:semantic-parse']?.count).toBe(1);
  expect(baseline.stage2DiagnosticSummary['semantic:canonical-field-arbitration']?.count).toBe(1);
  expect(baseline.stage2DiagnosticSummary['semantic:ai-advisory']?.count).toBe(1);
});
