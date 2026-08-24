import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';

test.beforeEach(async({page})=>{
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort('failed'));
  await page.goto(`${BASE_URL}/?v124b-brew-mode=1`,{waitUntil:'domcontentloaded'});
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({timeout:15000});
});

test('bean freshness line is present in the first painted one-line card',async({page})=>{
  await page.evaluate(async()=>{
    const db=await import('/src/db.js');
    const bean={id:'instant-freshness-bean',name:'Instant Freshness',countryCode:'ET',varietyCode:'GESHA',processCode:'WA',roastCode:'RL-L1',roastDate:new Date(Date.now()-14*86400000).toISOString().slice(0,10),initialWeight:100,remainingWeight:90,archived:false,source:'manual',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    await db.put('beans',bean);
    document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh',{detail:{source:'v124b-instant-freshness'}}));
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>queueMicrotask(resolve))));
  const card=page.locator('.bean-card.lb-one-line-bean[data-bean-id="instant-freshness-bean"]');
  expect(await card.count()).toBe(1);
  expect(await card.locator('[data-lb-freshness-timeline]').count()).toBe(1);
});

test('small brew uses one hand-pour/other switch and one coffee-type selector for all non-pour drinks',async({page})=>{
  await page.locator('[data-page-target="brew"]').click();
  const mode=page.locator('[data-lb-brew-mode-switch]');
  await expect(mode).toBeVisible();
  const toggle=mode.locator('[role="switch"]');
  await expect(toggle).toHaveAttribute('aria-checked','false');
  await expect(page.locator('[data-brew-row="dose-ratio"]')).toBeVisible();
  await expect(page.locator('[data-lb-local-method-row]')).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked','true');
  await expect(page.locator('#brewContent')).toHaveClass(/lb-brew-other-active/);
  await expect(page.locator('[data-brew-row="dose-ratio"]')).toBeHidden();
  const panel=page.locator('[data-lb-other-brew-panel]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-lb-other-coffee]')).toHaveCount(1);

  await panel.locator('[data-lb-other-coffee]').selectOption('drink:latte');
  await expect(panel.locator('[data-lb-other-base]')).toContainText('意式浓缩');
  await expect(panel.locator('[data-lb-other-additions]')).toContainText('牛奶');

  await panel.locator('[data-lb-other-coffee]').selectOption('method:cold_brew');
  await expect(panel.locator('[data-lb-other-base]')).toContainText('冷萃');
  await expect(panel.locator('[data-lb-other-additions]')).toContainText('水 / 冰');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked','false');
  await expect(page.locator('[data-brew-row="dose-ratio"]')).toBeVisible();
});
