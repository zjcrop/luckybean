import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test('cupping actions stay one row in cancel-next-previous order with equal sizing', async ({ page }) => {
  await page.goto(`${BASE_URL}/?sensory-actions=1`, { waitUntil:'domcontentloaded' });
  await page.setViewportSize({ width:360, height:740 });
  await page.evaluate(() => {
    const actions = document.createElement('div');
    actions.className = 'v095-wizard-actions';
    actions.innerHTML = '<button class="button subtle" data-v095-cancel>取消品鉴</button><button class="button" data-v095-prev>上一步</button><button class="button primary" data-v095-next>下一步</button>';
    document.body.append(actions);
  });
  const nodes = [page.locator('[data-v095-cancel]'), page.locator('[data-v095-next]'), page.locator('[data-v095-prev]')];
  const boxes = await Promise.all(nodes.map(node => node.boundingBox()));
  expect(boxes.every(Boolean)).toBeTruthy();
  expect(boxes[0].x).toBeLessThan(boxes[1].x);
  expect(boxes[1].x).toBeLessThan(boxes[2].x);
  expect(Math.max(...boxes.map(box => box.height)) - Math.min(...boxes.map(box => box.height))).toBeLessThan(0.5);
  expect(Math.max(...boxes.map(box => box.width)) - Math.min(...boxes.map(box => box.width))).toBeLessThan(1);
  const sizes = await Promise.all(nodes.map(node => node.evaluate(el => getComputedStyle(el).fontSize)));
  expect(new Set(sizes).size).toBe(1);
});
