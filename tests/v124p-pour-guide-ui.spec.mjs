import { test, expect } from '@playwright/test';
import { installBrewProfilesBrowserFixture } from './helpers/brewprofiles-browser-fixture.mjs';

const BASE_URL = 'http://127.0.0.1:4173';

test('timer renders method-specific pour guidance and flow-linked animation', async ({ page }) => {
  await installBrewProfilesBrowserFixture(page);
  await page.goto(`${BASE_URL}/?pour-guide=1`, { waitUntil:'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout:15000 });
  await expect.poll(() => page.evaluate(() => globalThis.LuckyBeanRuntimeFeatures?.loaded?.includes('brew-pour-guide'))).toBe(true);

  const classification = await page.evaluate(() => ({
    center: LuckyBeanPourGuide.patternForStage({ method:'中心定点连续注水', stageWaterG:80 }),
    circle: LuckyBeanPourGuide.patternForStage({ method:'稳定绕圈注水', stageWaterG:80 }),
    spiral: LuckyBeanPourGuide.patternForStage({ method:'螺旋向外注水', stageWaterG:80 }),
    immersion: LuckyBeanPourGuide.patternForStage({ method:'关闭底阀保持浸泡', stageWaterG:240 }),
    release: LuckyBeanPourGuide.patternForStage({ method:'开阀释放，不再注水', stageWaterG:0 })
  }));
  expect(classification).toEqual({ center:'center', circle:'circle', spiral:'spiral-out', immersion:'immersion', release:'release' });

  await page.evaluate(() => {
    LuckyBeanPourGuide.setPlan({ stages:[
      { index:1, name:'主体注水', method:'螺旋向外注水', stageWaterG:90, cumulativeWaterG:140, flowGPerSec:5.5 },
      { index:2, name:'收束', method:'中心定点注水', stageWaterG:80, cumulativeWaterG:220, flowGPerSec:3.5 }
    ] });
    document.querySelector('#overlayRoot').innerHTML = `<div class="overlay full" data-overlay="timer"><div class="dialog"><div class="timer-full"><span id="timerStageCounter">1/2</span><div class="timer-stage-grid"></div><p id="timerStageText"></p></div></div></div>`;
  });

  const guide = page.locator('[data-lb-pour-guide]');
  await expect(guide).toBeVisible();
  await expect(guide).toHaveAttribute('data-lb-pour-guide','spiral-out');
  await expect(guide).toContainText('螺旋向外');
  await expect(guide).toContainText('90g · 累计 140g · 5.5g/s');
  await expect(guide).toContainText('实际水流与落点以手部操作为准');
  const fastPeriod = await page.locator('.brew-pour-guide-svg').evaluate(node => node.style.getPropertyValue('--lb-pour-period'));

  await page.evaluate(() => {
    document.querySelector('#timerStageCounter').textContent = '2/2';
  });
  await expect(guide).toHaveAttribute('data-lb-pour-guide','center');
  await expect(guide).toContainText('中心定点');
  const slowPeriod = await page.locator('.brew-pour-guide-svg').evaluate(node => node.style.getPropertyValue('--lb-pour-period'));
  expect(parseFloat(fastPeriod)).toBeLessThan(parseFloat(slowPeriod));
});
