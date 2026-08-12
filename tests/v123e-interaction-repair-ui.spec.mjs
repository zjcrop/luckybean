import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?v123e-interaction-repair=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
});

test('local QR runtime is shipped and failed camera overlay keeps a clickable rescan action', async ({ page }) => {
  const response = await page.request.get(`${BASE_URL}/public/vendor/jsqr/jsQR.js`);
  expect(response.ok()).toBeTruthy();
  expect(await response.text()).toContain('jsQR');

  await page.evaluate(() => {
    document.querySelector('#overlayRoot').innerHTML = '<div class="overlay full" data-overlay="camera"><div class="dialog"><video id="cameraVideo"></video><p id="cameraStatus">扫描失败</p><div class="row end"><button id="cameraFileBtn" class="button">改用图片</button></div></div></div>';
  });
  const retry = page.locator('#cameraRetryBtn');
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  await expect(retry).toHaveText('重新扫描');
  await expect(retry).toHaveCSS('pointer-events', 'auto');
});

test('bean flavor picker is regrouped to five requested categories and starts at top', async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector('#overlayRoot').innerHTML = `<div class="overlay full" data-overlay="flavors"><div class="dialog" style="height:320px;overflow:auto"><div class="flavor-groups" style="height:900px;overflow:auto"><section class="flavor-group"><h3>旧分类</h3><div class="flavor-grid">
      <button class="flavor-button" data-flavor-code="a">茉莉</button>
      <button class="flavor-button" data-flavor-code="b">柑橘</button>
      <button class="flavor-button" data-flavor-code="c">乌龙茶</button>
      <button class="flavor-button" data-flavor-code="d">肉桂</button>
      <button class="flavor-button" data-flavor-code="e">巧克力</button>
    </div></section></div></div></div>`;
    const dialog = document.querySelector('[data-overlay="flavors"] .dialog');
    const host = document.querySelector('[data-overlay="flavors"] .flavor-groups');
    dialog.scrollTop = 100;
    host.scrollTop = 100;
  });
  const groups = page.locator('[data-overlay="flavors"] .flavor-group');
  await expect(groups).toHaveCount(5, { timeout: 15000 });
  const labels = await groups.locator('summary').allTextContents();
  expect(labels).toEqual(['花香', '果香', '茶感', '香料', '其他']);
  await expect(groups.nth(0)).not.toHaveAttribute('open', '');
  await groups.nth(0).locator('summary').click();
  await expect(groups.nth(0)).toHaveAttribute('open', '');
  await expect(page.locator('[data-overlay="flavors"] .flavor-group').nth(0)).toContainText('茉莉');
  await expect(page.locator('[data-overlay="flavors"] .flavor-group').nth(4)).toContainText('巧克力');
  expect(await page.locator('[data-overlay="flavors"] .dialog').evaluate(node => node.scrollTop)).toBe(0);
  await expect(page.locator('[data-overlay="flavors"]')).toHaveCSS('overflow-y', 'auto');
  await expect(page.locator('[data-overlay="flavors"] .flavor-button').first()).toHaveCSS('border-radius', '6px');
});

test('professional sensory flavor tags use small-radius rectangles', async ({ page }) => {
  await page.evaluate(() => {
    const node = document.createElement('div');
    node.className = 'v095-tag-grid';
    node.innerHTML = '<button data-v095-tag="花香">花香</button><button data-v095-tag="果香">果香</button>';
    document.body.append(node);
  });
  await expect(page.locator('[data-v095-tag="花香"]')).toHaveCSS('border-radius', '6px');
});

test('本物 exposes compact scrollable guide with required workflow text', async ({ page }) => {
  await page.locator('[data-page-target="settings"]').click();
  const category = page.locator('.settings-category').filter({ has: page.locator('summary span', { hasText: '本物' }) });
  await expect(category).toHaveCount(1, { timeout: 10000 });
  await category.locator('summary').click();
  await expect(category.locator('[data-lb-open-guide]')).toBeVisible();
  await expect(category.locator('.about-content > p')).toContainText('请先在器设页面中注册或登录账户，以便同步数据到云端');
  await category.locator('[data-lb-open-guide]').click();
  const dialog = page.locator('.lb-guide-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('一、豆藏');
  await expect(dialog).toContainText('二、小酌');
  await expect(dialog).toContainText('三、品鉴');
  await expect(dialog).toContainText('四、器设');
  await expect(dialog).toContainText('杯测品鉴');
  await expect(dialog).toContainText('玩家互动品鉴');
  await expect(dialog).toContainText('札记');
  expect(await dialog.evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(await page.evaluate(() => innerHeight));
  await expect(dialog.locator('.lb-guide-scroll')).toHaveCSS('overflow-y', 'auto');
  await dialog.locator('[data-lb-guide-close]').click();
  await expect(dialog).toHaveCount(0);
});

test('automatic profile recommendation is made visible when BrewProfiles returns a match', async ({ page }) => {
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'planResult';
    document.body.append(host);
    document.dispatchEvent(new CustomEvent('luckybean:plan-ready', { detail: { plan: { profile: { id: 'two-pulse' }, matching: { selectedProfileId: 'two-pulse', score: 91.4 } } } }));
  });
  const panel = page.locator('[data-lb-auto-profile]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('模型推荐结果');
  await expect(panel).toContainText('91.4');
});
