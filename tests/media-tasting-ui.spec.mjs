import { test, expect } from '@playwright/test';

test('media tasting controller loads, exposes five templates and enhances sensory records', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanMediaTasting), null, { timeout: 30000 });

  const metadata = await page.evaluate(() => ({
    templates: globalThis.LuckyBeanMediaTasting?.builtInTemplates || [],
    storagePolicy: globalThis.LuckyBeanMediaTasting?.storagePolicy || ''
  }));
  expect(metadata.templates).toHaveLength(5);
  expect(metadata.templates.map(item => item.name)).toEqual([
    '极简豆卡', '社交媒体短文', '专业杯测', '冲煮日志', '图片配文'
  ]);
  expect(metadata.storagePolicy).toContain('generated-copy-ephemeral');

  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'media-tasting-test-host';
    host.innerHTML = '<button class="record-item sensory-record-button" type="button" data-sensory-record="sensory-test-1">模拟品鉴记录</button>';
    document.body.append(host);
  });

  const action = page.locator('[data-media-tasting-record="sensory-test-1"]');
  await expect(action).toBeVisible();
  await expect(action).toHaveText('生成媒体品鉴');
});
