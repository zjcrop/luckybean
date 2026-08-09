import { test, expect } from '@playwright/test';
import { installBrewProfilesBrowserFixture } from './helpers/brewprofiles-browser-fixture.mjs';

const BASE_URL = 'http://127.0.0.1:4173';
const SUPABASE_PATTERN = 'https://vaxwncdcuvbpvdbbketb.supabase.co/**';

async function openApp(page, suffix) {
  await installBrewProfilesBrowserFixture(page);
  await page.goto(`${BASE_URL}/?${suffix}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanRuntimeFeatures), null, { timeout: 15000 });
}

async function seedBean(page) {
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    await db.put('beans', {
      id: 'requirements-bean', name: '测试豆', countryCode: 'CO-ET', varietyCode: 'VA-GE', processCode: 'PR-WA', roastCode: 'RL-L1',
      roastDate: '2026-08-01', initialWeight: 100, remainingWeight: 100, altitude: 1900, archived: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: 'requirements-test' } }));
  });
}

test('one server login remains one panel after authentication and automatic sync has no settings', async ({ page }) => {
  await openApp(page, 'requirements-account-brew=1');
  await page.locator('[data-page-target="settings"]').click();
  const cloudSection = page.locator('#settingsContent [data-settings-key="account"]');
  await expect(cloudSection).toBeVisible();
  await expect(cloudSection.locator('summary > span')).toHaveText('账户');
  await cloudSection.locator('summary').click();

  await expect(page.locator('#settingsContent [data-settings-key="account"]')).toHaveCount(1);
  await expect(page.locator('[data-cloud-account-panel]')).toHaveCount(1);
  await expect(page.locator('[data-v099p-cloud-panel],[data-v099e-cloud-panel],[data-v099f-account-sync]')).toHaveCount(0);
  await expect(page.locator('#saveIdentityBtn,#settingsNickname,#settingsEmail,#settingsPhone,#settingsWechat,#settingsQq')).toHaveCount(0);
  await expect(page.locator('[data-cloud-sync-toggle],[data-cloud-sync-now],[data-cloud-pull],[data-cloud-register]')).toHaveCount(0);
  await expect(page.locator('[data-cloud-login]')).toHaveCount(1);
  await expect(page.locator('[data-cloud-login]')).toHaveText('登录服务器同步');

  await page.evaluate(() => {
    const original = globalThis.LuckyBeanCloudSync.ensureAutomatic;
    globalThis.__singleSyncCalls = [];
    globalThis.LuckyBeanCloudSync.ensureAutomatic = reason => {
      globalThis.__singleSyncCalls.push(reason);
      return original ? true : true;
    };
    localStorage.setItem('luckybean.supabase.session.v099d', JSON.stringify({
      user: { id: 'single-cloud-user', email: 'single@example.com' }
    }));
    document.dispatchEvent(new CustomEvent('luckybean:cloud-auth-state', {
      detail: { state: 'authenticated', user: { id: 'single-cloud-user', email: 'single@example.com' } }
    }));
  });

  await expect(page.locator('[data-cloud-account-panel]')).toHaveCount(1);
  await expect(page.locator('[data-cloud-account-panel]')).toContainText('single@example.com');
  await expect(page.locator('[data-cloud-account-panel]')).toContainText('自动同步始终启用');
  await expect(page.locator('[data-cloud-login],[data-cloud-register]')).toHaveCount(0);
  await expect(page.locator('[data-cloud-logout]')).toHaveCount(1);
  await expect(page.locator('[data-cloud-sync-toggle],[data-cloud-sync-now],[data-cloud-pull]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => globalThis.__singleSyncCalls.length)).toBeGreaterThan(0);

  await page.evaluate(() => {
    const root = document.querySelector('#settingsContent .settings-categories');
    const duplicate = document.createElement('details');
    duplicate.className = 'settings-category';
    duplicate.innerHTML = '<summary><span>账号</span><small>个人信息与云端储存</small></summary><div class="settings-category-body"><input id="settingsNickname"><button id="saveIdentityBtn">保存账户</button></div>';
    root.append(duplicate);
    const oldPanel = document.createElement('section');
    oldPanel.dataset.v099fAccountSync = '1';
    oldPanel.textContent = '旧服务器登录';
    root.append(oldPanel);
  });

  await expect(page.locator('#settingsContent .settings-category').filter({ hasText: '个人信息与云端储存' })).toHaveCount(0);
  await expect(page.locator('[data-v099f-account-sync],#settingsNickname,#saveIdentityBtn')).toHaveCount(0);
  await expect(page.locator('[data-cloud-account-panel]')).toHaveCount(1);

  await page.evaluate(() => {
    document.querySelector('[data-cloud-account-panel]')?.remove();
    document.dispatchEvent(new CustomEvent('luckybean:app-refreshed'));
  });
  await expect(page.locator('[data-cloud-account-panel]')).toHaveCount(1);

  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('luckybean:cloud-sync-state', {
      detail: { state: 'deletion-confirmation-required', fingerprint: 'risk-test', missingUnits: 6, remoteUnits: 10, ratioPct: 60, largeDeletion: true }
    }));
  });
  await expect(page.locator('[data-overlay="cloud-deletion-review"]')).toBeVisible();
  await expect(page.locator('[data-cloud-deletion-preserve]')).toHaveText('保留云端数据并同步');
  await expect(page.locator('[data-cloud-deletion-delete]')).toHaveText('删除云端缺失数据');
  await page.locator('[data-cloud-deletion-close]').click();

  await seedBean(page);
  await page.locator('[data-page-target="brew"]').click();
  const options = await page.locator('#brewProfile option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
  expect(options.length).toBeGreaterThan(8);
  const profile = page.locator('#brewProfile');
  const generate = page.locator('#generatePlanBtn');
  for (const selected of options) {
    await profile.selectOption(selected);
    await expect(profile).toHaveValue(selected);
    await generate.click();
    await expect(generate).toBeEnabled({ timeout: 20000 });
    await expect(page.locator('#generatedPlan')).toBeVisible({ timeout: 20000 });
    await expect(profile).toHaveValue(selected);
  }
  await expect(page.locator('#brewSpatialMount [data-brew-spatial-preview]')).toBeVisible({ timeout: 10000 });

  await page.locator('#directSensoryBtn').click();
  await expect(page.locator('.v095-sensory-modes [data-v095-mode]')).toHaveCount(3);
  await expect(page.locator('[data-sensory-mode="player"]')).toHaveCount(0);

  await page.locator('[data-page-target="brew"]').click();
  await expect(page.locator('#generatedPlan')).toBeVisible();
  const planSensoryButton = page.locator('#planToSensoryBtn');
  await expect(planSensoryButton).toHaveAttribute('data-brew-action', 'plan-sensory');
  await expect(planSensoryButton).toHaveAttribute('data-plan-reference', /.+/);
  const authoritativeProfileId = await planSensoryButton.getAttribute('data-profile-id');
  expect(authoritativeProfileId).toBeTruthy();
  await planSensoryButton.click();
  await expect(page.locator('[data-page="sensory"]')).toHaveClass(/active/);
  await expect(page.locator('#sensoryContent')).toBeVisible();
  await expect(page.locator('#sensoryContent')).toHaveAttribute('data-sensory-origin', 'generated-plan');
  await expect(page.locator('#sensoryContent')).toHaveAttribute('data-plan-reference', /.+/);
  await expect(page.locator('#sensoryContent')).toHaveAttribute('data-profile-id', authoritativeProfileId);
  await expect(page.locator('#sensoryContent')).toHaveAttribute('data-brew-session-id', '');
  await expect(page.locator('.v095-sensory-modes [data-v095-mode]')).toHaveCount(3);
  await expect(page.locator('[data-sensory-mode="player"]')).toHaveCount(0);
});

test('professional tags sort and radar nodes select and drag; note mode opens directly', async ({ page }) => {
  await openApp(page, 'requirements-sensory=1');
  await seedBean(page);
  await page.locator('[data-page-target="sensory"]').click();
  await page.locator('#sensoryBeanSelect').selectOption('requirements-bean');
  const modeButtons = page.locator('.v095-sensory-modes [data-v095-mode]');
  await expect(modeButtons).toHaveCount(3);
  await expect(modeButtons.nth(0)).toContainText('杯测品鉴');
  await expect(modeButtons.nth(1)).toContainText('玩家互动品鉴');
  await expect(modeButtons.nth(2)).toContainText('札记');
  await expect(page.locator('#startSensoryBtn')).toHaveCount(0);
  await page.locator('[data-v095-mode="professional"]').click();
  const tags = page.locator('[data-v095-tag]');
  await tags.nth(0).click();
  await tags.nth(1).click();
  await expect(page.locator('[data-v120-selected-tag]')).toHaveCount(2);
  const first = page.locator('[data-v120-selected-tag]').nth(0);
  const second = page.locator('[data-v120-selected-tag]').nth(1);
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width, secondBox.y + secondBox.height / 2, { steps: 5 });
  await page.mouse.up();

  for (let i = 0; i < 8; i += 1) await page.locator('[data-v095-next]').click();
  const node = page.locator('[data-v120-radar-node]').first();
  await expect(node).toBeVisible();
  const before = Number(await node.getAttribute('aria-valuenow'));
  const box = await node.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 24, { steps: 5 });
  await page.mouse.up();
  const after = Number(await node.getAttribute('aria-valuenow'));
  expect(after).not.toBe(before);

  await page.locator('[data-v095-next]').click();
  await expect(page.locator('.v095-score-stage')).toBeVisible();
  await expect(page.locator('.v095-score-stage')).toContainText('打分总结');
  await page.locator('[data-v095-next]').click();
  const professionalNote = page.locator('[data-v095-professional-note]');
  await expect(professionalNote).toBeVisible();
  await professionalNote.fill('高温花香清晰，低温甜感延续；下一次降低尾段扰动。');
  await page.locator('[data-v095-next]').click();
  await expect(page.locator('.v095-summary-stage')).toContainText('下一次降低尾段扰动');

  await page.locator('[data-v095-close]').click();
  await page.locator('[data-v095-mode="note"]').click();
  await expect(page.locator('[data-sensory-mode="note"]')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#sensoryNaturalNote')).toBeVisible();
  await expect(page.locator('#sensoryNoteScore')).toBeVisible();
  await expect(page.locator('#prevSensoryNodeBtn,#sensoryDeltaWheel,.sensory-option')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '退', exact: true })).toHaveCount(0);
  await page.locator('#cancelEvaluationBtn').click();
  await expect(page.locator('.v095-sensory-modes [data-v095-mode]')).toHaveCount(3);
  await expect(page.locator('[data-sensory-mode="player"]')).toHaveCount(0);

  await page.locator('[data-v095-mode="player"]').click();
  await expect(page.locator('[data-sensory-mode="player"]')).toBeVisible();
  await expect(page.locator('[data-sensory-mode="note"]')).toHaveCount(0);
  await page.locator('#cancelEvaluationBtn').click();
  await expect(page.locator('.v095-sensory-modes [data-v095-mode]')).toHaveCount(3);
});

test('settings splash previews keep their red and white backgrounds', async ({ page }) => {
  await openApp(page, 'requirements-splash-preview=1');
  await page.locator('[data-page-target="settings"]').click();
  const appearance = page.locator('#appearanceSettings');
  await expect(appearance).toBeVisible();
  await appearance.locator(':scope > summary').click();

  const red = appearance.locator('[data-appearance-splash="red"]');
  const white = appearance.locator('[data-appearance-splash="white"]');
  await expect(red).toHaveCSS('background-color', 'rgb(153, 51, 51)');
  await expect(white).toHaveCSS('background-color', 'rgb(243, 239, 229)');
  await expect(red.locator('img')).toBeVisible();
  await expect(white.locator('img')).toBeVisible();
  expect(await red.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await white.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await white.click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#splashScreen')).toHaveAttribute('data-splash-variant', 'white');
  await expect(page.locator('#splashScreen')).toHaveCSS('background-color', 'rgb(251, 251, 249)');
});

test('bean recognition splits numeric varieties, maps labeled roast levels and hides unsupported empty evidence', async ({ page }) => {
  await openApp(page, 'requirements-recognition-fields=1');
  await page.locator('#fabAddBtn').click();
  await page.locator('[data-add-mode="text"]').click();
  await page.locator('#recognitionText').fill([
    'COUNTRY: Ethiopia',
    'REGION: XQZ UNKNOWN REGION',
    'VARIETAL: 74110 / 74112',
    'PROCESS: Washed',
    'ROAST LEVEL: L2',
    'ROAST DATE: 2026-08-02',
    'NET WEIGHT: 150 g'
  ].join('\n'));
  await page.locator('#parseTextBtn').click();
  await expect(page.locator('[data-overlay="bean-form"]')).toBeVisible();
  await expect(page.locator('#beanRoast')).toHaveValue('RL-L2');
  await expect(page.locator('#beanVariety')).toHaveValue('');
  await expect(page.locator('[data-evidence-field="varietyCode"][data-evidence-value="VA-JA10"]')).toBeVisible();
  await expect(page.locator('[data-evidence-field="varietyCode"][data-evidence-value="VA-JA12"]')).toBeVisible();
  await expect(page.locator('.evidence-row-v2').filter({ hasText: '产区' })).toHaveCount(0);
});

test('region and estate selectors retain local add-option actions', async ({ page }) => {
  await openApp(page, 'requirements-custom-bean-options=1');
  await page.locator('#fabAddBtn').click();
  await page.locator('[data-add-mode="text"]').click();
  await page.locator('#manualBeanFormBtn').click();
  await page.locator('#beanCountry').selectOption('CO-ET');
  await page.locator('[data-add-bean-option="regions"]').click();
  await page.locator('#customBeanOptionName').fill('测试自定义产区');
  await page.locator('#saveCustomBeanOptionBtn').click();
  await expect(page.locator('#beanRegion option:checked')).toHaveText('测试自定义产区');
  await page.locator('[data-add-bean-option="entities"]').click();
  await page.locator('#customBeanOptionName').fill('测试自定义处理站');
  await page.locator('#saveCustomBeanOptionBtn').click();
  await expect(page.locator('#beanEntity option:checked')).toHaveText('测试自定义处理站');
  await expect(page.locator('[data-add-bean-option="regions"]')).toHaveText('新增选项');
  await expect(page.locator('[data-add-bean-option="entities"]')).toHaveText('新增选项');
});



test('private gear uses three closed, aligned list editors', async ({ page }) => {
  await openApp(page, 'requirements-gear=1');
  await page.locator('[data-page-target="settings"]').click();
  const privateGear = page.locator('#privateGearCategory');
  await expect(privateGear).not.toHaveAttribute('open', '');
  await privateGear.locator(':scope > summary').click();
  const subpages = privateGear.locator('.gear-subpage');
  await expect(subpages).toHaveCount(3);
  await expect(subpages.nth(0).locator(':scope > summary strong')).toHaveText('滤纸');
  await expect(subpages.nth(1).locator(':scope > summary strong')).toHaveText('滤杯');
  await expect(subpages.nth(2).locator(':scope > summary strong')).toHaveText('磨豆机');
  for (let index = 0; index < 3; index += 1) await expect(subpages.nth(index)).not.toHaveAttribute('open', '');
  const alignments = await subpages.locator(':scope > summary').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).textAlign));
  expect(alignments).toEqual(['left', 'left', 'left']);

  await subpages.nth(2).locator(':scope > summary').click();
  await page.locator('[data-add-gear="grinder"]').click();
  await page.locator('#grinderName').fill('测试磨豆机');
  await page.locator('#grinderSetting').fill('22格');
  await page.locator('#saveGrinderBtn').click();
  await expect(page.locator('[data-overlay="grinder-editor"]')).toHaveCount(0);

  await page.locator('#privateGearCategory > summary').click();
  const grinderSection = page.locator('[data-gear-kind="grinder"]');
  await grinderSection.locator(':scope > summary').click();
  await expect(page.locator('[data-grinder-item]')).toContainText('测试磨豆机');
  await page.locator('[data-grinder-item]').click();
  await expect(page.locator('#grinderName')).toHaveValue('测试磨豆机');
  await page.locator('#grinderSetting').fill('23格');
  await page.locator('#saveGrinderBtn').click();

  await page.locator('#privateGearCategory > summary').click();
  await page.locator('[data-gear-kind="filter"] > summary').click();
  await page.locator('[data-add-gear="filter"]').click();
  await page.locator('#filterBrand').fill('测试品牌');
  await page.locator('#filterType').fill('测试滤纸');
  await page.locator('#filterQuantity').fill('50');
  await page.locator('#saveFilterBtn').click();
  await expect(page.locator('[data-overlay="filter-editor"]')).toHaveCount(0);

  await page.locator('#privateGearCategory > summary').click();
  await page.locator('[data-gear-kind="dripper"] > summary').click();
  await page.locator('[data-add-gear="dripper"]').click();
  await page.locator('#dripperName').fill('测试滤杯');
  await page.locator('#dripperMaterial').selectOption('ceramic');
  await page.locator('#saveDripperBtn').click();
  await expect(page.locator('[data-overlay="dripper-editor"]')).toHaveCount(0);

  await page.locator('#privateGearCategory > summary').click();
  await page.locator('[data-gear-kind="dripper"] > summary').click();
  await expect(page.locator('[data-dripper-item]').filter({ hasText: '测试滤杯' })).toHaveCount(1);
  await page.locator('[data-dripper-item]').filter({ hasText: '测试滤杯' }).click();
  await expect(page.locator('#dripperMaterial')).toHaveValue('ceramic');
  await page.locator('[data-close-overlay]').click();

  await page.reload({ waitUntil: 'domcontentloaded' });
  const splash = page.locator('#splashScreen');
  if (await splash.isVisible()) await splash.click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-page-target="settings"]').click();
  await page.locator('#privateGearCategory > summary').click();

  for (const kind of ['filter', 'dripper', 'grinder']) {
    await expect(page.locator(`[data-gear-kind="${kind}"]`)).not.toHaveAttribute('open', '');
  }
  await page.locator('[data-gear-kind="filter"] > summary').click();
  await expect(page.locator('[data-filter-item]')).toContainText('测试品牌 测试滤纸');
  await page.locator('[data-gear-kind="filter"] > summary').click();
  await page.locator('[data-gear-kind="dripper"] > summary').click();
  await expect(page.locator('[data-dripper-item]').filter({ hasText: '测试滤杯' })).toHaveCount(1);
  await page.locator('[data-gear-kind="dripper"] > summary').click();
  await page.locator('[data-gear-kind="grinder"] > summary').click();
  await expect(page.locator('[data-grinder-item]')).toContainText('测试磨豆机');
  await expect(page.locator('[data-grinder-item]')).toContainText('23格');
});
