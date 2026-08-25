import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

async function enterApp(page) {
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout:15000 });
}

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

test('selected sensory tags use single activate, double remove and live-preview long-press sorting', async ({ page }) => {
  await page.goto(`${BASE_URL}/?sensory-sort=1`, { waitUntil:'domcontentloaded' });
  await page.setViewportSize({ width:390, height:760 });
  await enterApp(page);
  await page.waitForFunction(() => globalThis.LuckyBeanRuntimeFeatures?.loaded?.includes('shared-sortable') && globalThis.LuckyBeanRuntimeFeatures?.loaded?.includes('sensory-tag-sort'));

  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.id = 'v095ProfessionalOverlay';
    overlay.innerHTML = `<div class="v095-wizard-step">
      <small class="v095-sort-hint"></small>
      <div class="v120-selected-tag-list" data-v120-selected-list="dry" style="width:330px">
        ${['花香','莓果','茶感'].map(tag => `<button type="button" class="cupping-flavor-tag selected v120-selected-tag" data-v120-selected-tag="${tag}"><span>${tag}</span><span class="cupping-drag-handle"></span></button>`).join('')}
      </div>
      <div class="v095-tag-grid">
        ${['花香','莓果','茶感'].map(tag => `<button type="button" data-v095-tag="${tag}" aria-pressed="true">${tag}</button>`).join('')}
      </div>
    </div>`;
    document.body.append(overlay);
    overlay.querySelectorAll('[data-v095-tag]').forEach(button => button.addEventListener('click', () => {
      overlay.querySelector(`[data-v120-selected-tag="${button.dataset.v095Tag}"]`)?.remove();
    }));
    document.dispatchEvent(new CustomEvent('luckybean:sensory-rendered'));
  });

  const list = page.locator('[data-v120-selected-list="dry"]');
  await expect(page.locator('.v095-sort-hint')).toContainText('单击激活标签');
  await expect(page.locator('.v095-sort-hint')).toContainText('双击移除');
  await expect(page.locator('.v095-sort-hint')).toContainText('实时预览');

  const berry = page.locator('[data-v120-selected-tag="莓果"]');
  await berry.click();
  await page.waitForTimeout(300);
  await expect(berry).toHaveClass(/lb-sort-active/);

  const first = page.locator('[data-v120-selected-tag="花香"]');
  const third = page.locator('[data-v120-selected-tag="茶感"]');
  const firstBox = await first.boundingBox();
  const thirdBox = await third.boundingBox();
  expect(firstBox).toBeTruthy();
  expect(thirdBox).toBeTruthy();

  // Long press the entire tag body; sorting must show a floating ghost and a live placeholder.
  await page.mouse.move(firstBox.x + firstBox.width * 0.35, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(410);
  await expect(page.locator('.lb-sort-ghost')).toHaveCount(1);
  await expect(page.locator('.lb-sort-placeholder')).toHaveCount(1);
  await expect(first).toHaveCSS('visibility', 'hidden');
  const initialPreview = await list.getAttribute('data-lb-sort-preview');

  await page.mouse.move(thirdBox.x + thirdBox.width * 0.9, thirdBox.y + thirdBox.height / 2, { steps:10 });
  await page.waitForTimeout(50);
  const movedPreview = await list.getAttribute('data-lb-sort-preview');
  expect(movedPreview).not.toBe(initialPreview);
  expect(movedPreview).toBe('莓果|茶感|花香');
  await page.mouse.up();

  await expect(page.locator('.lb-sort-ghost')).toHaveCount(0);
  await expect(page.locator('.lb-sort-placeholder')).toHaveCount(0);
  const domOrder = await list.locator('[data-v120-selected-tag]').evaluateAll(nodes => nodes.map(node => node.dataset.v120SelectedTag));
  expect(domOrder).toEqual(['莓果','茶感','花香']);

  const persisted = await page.evaluate(() => {
    const detail = {
      summary:['干香 / 湿香：花香、莓果、茶感；强度 7.5'],
      professionalData:{ selections:{ dry:['花香','莓果','茶感'] }, intensities:{ dry:7.5 } }
    };
    document.dispatchEvent(new CustomEvent('luckybean:professional-sensory-complete', { detail }));
    return detail;
  });
  expect(persisted.professionalData.selections.dry).toEqual(['莓果','茶感','花香']);
  expect(persisted.summary[0]).toContain('莓果、茶感、花香');
});

test('double click removes a selected sensory tag without changing the vocabulary', async ({ page }) => {
  await page.goto(`${BASE_URL}/?sensory-sort-remove=1`, { waitUntil:'domcontentloaded' });
  await enterApp(page);
  await page.waitForFunction(() => globalThis.LuckyBeanRuntimeFeatures?.loaded?.includes('shared-sortable'));
  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.id = 'v095ProfessionalOverlay';
    overlay.innerHTML = `<small class="v095-sort-hint"></small><div class="v120-selected-tag-list" data-v120-selected-list="dry"><button type="button" class="cupping-flavor-tag selected v120-selected-tag" data-v120-selected-tag="花香">花香</button></div><button type="button" data-v095-tag="花香">花香</button>`;
    document.body.append(overlay);
    overlay.querySelector('[data-v095-tag]').addEventListener('click', () => overlay.querySelector('[data-v120-selected-tag="花香"]')?.remove());
    document.dispatchEvent(new CustomEvent('luckybean:sensory-rendered'));
  });
  const chip = page.locator('[data-v120-selected-tag="花香"]');
  await chip.dblclick({ delay:80 });
  await expect(chip).toHaveCount(0);
  await expect(page.locator('[data-v095-tag="花香"]')).toHaveCount(1);
});
