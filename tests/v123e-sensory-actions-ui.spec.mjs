import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test('cupping actions stay one row in cancel-previous-next order with equal sizing', async ({ page }) => {
  await page.goto(`${BASE_URL}/?sensory-actions=1`, { waitUntil:'domcontentloaded' });
  await page.setViewportSize({ width:360, height:740 });
  await page.evaluate(() => {
    const actions = document.createElement('div');
    actions.className = 'v095-wizard-actions';
    actions.innerHTML = '<button class="button subtle" data-v095-cancel>取消品鉴</button><button class="button" data-v095-prev>上一步</button><button class="button primary" data-v095-next>下一步</button>';
    document.body.append(actions);
  });
  const nodes = [page.locator('[data-v095-cancel]'), page.locator('[data-v095-prev]'), page.locator('[data-v095-next]')];
  await expect(nodes[0]).toHaveText('取消品鉴');
  await expect(nodes[1]).toHaveText('上一步');
  await expect(nodes[2]).toHaveText('下一步');
  const boxes = await Promise.all(nodes.map(node => node.boundingBox()));
  expect(boxes.every(Boolean)).toBeTruthy();
  expect(boxes[0].x).toBeLessThan(boxes[1].x);
  expect(boxes[1].x).toBeLessThan(boxes[2].x);
  expect(Math.max(...boxes.map(box => box.height)) - Math.min(...boxes.map(box => box.height))).toBeLessThan(0.5);
  expect(Math.max(...boxes.map(box => box.width)) - Math.min(...boxes.map(box => box.width))).toBeLessThan(1);
  const sizes = await Promise.all(nodes.map(node => node.evaluate(el => getComputedStyle(el).fontSize)));
  expect(new Set(sizes).size).toBe(1);
});

test('selected sensory tags long-press anywhere, reorder with pointer capture, and persist the new order', async ({ page }) => {
  await page.goto(`${BASE_URL}/?sensory-sort=1`, { waitUntil:'domcontentloaded' });
  await page.setViewportSize({ width:390, height:760 });
  await page.waitForFunction(() => globalThis.LuckyBeanRuntimeFeatures?.loaded?.includes('sensory-tag-sort'));

  await page.evaluate(() => {
    const list = document.createElement('div');
    list.className = 'v120-selected-tag-list';
    list.dataset.v120SelectedList = 'dry';
    list.style.width = '330px';
    list.innerHTML = ['花香','莓果','茶感'].map(tag => `<button type="button" class="cupping-flavor-tag selected v120-selected-tag" data-v120-selected-tag="${tag}"><span>${tag}</span><span class="cupping-drag-handle"></span></button>`).join('');
    document.body.append(list);
  });

  const first = page.locator('[data-v120-selected-tag="花香"]');
  const third = page.locator('[data-v120-selected-tag="茶感"]');
  const firstBox = await first.boundingBox();
  const thirdBox = await third.boundingBox();
  expect(firstBox).toBeTruthy();
  expect(thirdBox).toBeTruthy();

  // Press the tag body—not the tiny drag dot—past the 320ms activation threshold.
  await page.mouse.move(firstBox.x + firstBox.width * 0.35, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(380);
  await expect(first).toHaveClass(/lb-sort-dragging/);
  await page.mouse.move(thirdBox.x + thirdBox.width * 0.85, thirdBox.y + thirdBox.height / 2, { steps:8 });
  await page.mouse.up();

  const domOrder = await page.locator('[data-v120-selected-list="dry"] [data-v120-selected-tag]').evaluateAll(nodes => nodes.map(node => node.dataset.v120SelectedTag));
  expect(domOrder).toEqual(['莓果','茶感','花香']);

  const persisted = await page.evaluate(() => {
    const detail = {
      summary:['干香 / 湿香：花香、莓果、茶感；强度 7.5'],
      professionalData:{
        selections:{ dry:['花香','莓果','茶感'] },
        intensities:{ dry:7.5 }
      }
    };
    document.dispatchEvent(new CustomEvent('luckybean:professional-sensory-complete', { detail }));
    return detail;
  });
  expect(persisted.professionalData.selections.dry).toEqual(['莓果','茶感','花香']);
  expect(persisted.summary[0]).toContain('莓果、茶感、花香');
});
