import { test, expect } from '@playwright/test';

for (const provider of ['recognition-paddle-ocr-fast.js', 'recognition-paddle-ocr.js']) {
  test(`${provider} recognizes using JSON models without archive downloads`, async ({ page }) => {
    test.setTimeout(180000);
    const models = [], archives = [], downloads = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/paddleocr/models/')) models.push(url);
      if (/\.tar(?:[?#]|$)/i.test(url)) archives.push(url);
    });
    page.on('download', download => downloads.push(download.suggestedFilename()));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async provider => {
      await import(`./src/${provider}`);
      const canvas = document.createElement('canvas');
      canvas.width = 1000; canvas.height = 500;
      const context = canvas.getContext('2d');
      context.fillStyle = 'white'; context.fillRect(0, 0, 1000, 500);
      context.fillStyle = 'black'; context.font = '64px sans-serif';
      context.fillText('ETHIOPIA WASHED', 70, 150);
      context.fillText('COFFEE 1950M', 70, 280);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      const result = await globalThis.LuckyBeanPaddleOCR.recognize(blob);
      await globalThis.LuckyBeanPaddleOCR.dispose();
      return result;
    }, provider);
    expect(result.blocks.map(block => block.text).join(' ')).toContain('ETHIOPIA');
    expect(models).toHaveLength(2);
    expect(models.every(url => url.endsWith('.json'))).toBe(true);
    expect(archives).toEqual([]);
    expect(downloads).toEqual([]);
  });
}
