from pathlib import Path

path = Path('tests/v120-requirements-ui.spec.mjs')
text = path.read_text(encoding='utf-8')
old = '''test('bean recognition splits numeric varieties, maps labeled roast levels and hides unsupported empty evidence', async ({ page }) => {
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
  ].join('\\n'));
  await page.locator('#parseTextBtn').click();
  await expect(page.locator('[data-overlay="bean-form"]')).toBeVisible();
  await expect(page.locator('#beanRoast')).toHaveValue('RL-L2');
  await expect(page.locator('#beanVariety')).toHaveValue('');
  await expect(page.locator('[data-evidence-field="varietyCode"][data-evidence-value="VA-JA10"]')).toBeVisible();
  await expect(page.locator('[data-evidence-field="varietyCode"][data-evidence-value="VA-JA12"]')).toBeVisible();
  await expect(page.locator('.evidence-row-v2').filter({ hasText: '产区' })).toHaveCount(0);
});'''
new = '''test('bean recognition audits into fixed-format preflight before filling the compact bean form', async ({ page }) => {
  await openApp(page, 'requirements-recognition-fields=1');
  await page.locator('#fabAddBtn').click();
  await page.locator('[data-add-mode="text"]').click();
  await page.locator('#recognitionText').fill([
    'COUNTRY: Ethiopia',
    'REGION: XQZ UNKNOWN REGION',
    'VARIETAL: 74110 / 74112',
    'PROCESS: Washed',
    'CROP YEAR: 2025/26',
    'ROAST LEVEL: L2',
    'ROAST DATE: 2026-08-02',
    'NET WEIGHT: 150 g'
  ].join('\\n'));
  await page.locator('#parseTextBtn').click();
  const preflight = page.locator('[data-overlay="recognition-preflight"]');
  await expect(preflight).toBeVisible();
  await expect(preflight.locator('.recognition-preflight-row').filter({ hasText: '国家' })).toContainText('埃塞俄比亚');
  await expect(preflight.locator('.recognition-preflight-row').filter({ hasText: '产季' })).toContainText('2025/2026');
  await expect(preflight.locator('.recognition-preflight-row').filter({ hasText: '烘焙度' })).toContainText('浅中烘');
  await expect(preflight.locator('.recognition-preflight-row').filter({ hasText: '豆种' })).toContainText('—');
  await expect(preflight.locator('text=96%')).toHaveCount(0);
  await page.locator('#preflightConfirmBtn').click();
  await expect(page.locator('[data-overlay="bean-form"]')).toBeVisible();
  await expect(page.locator('#beanRoast')).toHaveValue('RL-L2');
  await expect(page.locator('#beanHarvestSeason')).toHaveValue('2025/2026');
  await expect(page.locator('#beanVariety')).toHaveValue('');
  await expect(page.locator('.evidence-row-v2')).toHaveCount(0);
});'''
if old not in text:
    raise SystemExit('target test block not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
