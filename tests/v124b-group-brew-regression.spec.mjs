import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';

async function refreshFrom(page,source){
  await page.evaluate(async source=>{
    await new Promise(resolve=>{
      const onRefreshed=event=>{
        if(event.detail?.source!==source)return;
        document.removeEventListener('luckybean:app-refreshed',onRefreshed);
        resolve();
      };
      document.addEventListener('luckybean:app-refreshed',onRefreshed);
      document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh',{detail:{source}}));
    });
  },source);
}

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('luckybean.onboarding.v2',JSON.stringify({stage:'existing-user',updatedAt:new Date().toISOString(),reason:'group-brew-regression'}));
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort('failed'));
  await page.goto(`${BASE_URL}/?v124b-group-brew-regression=1`,{waitUntil:'domcontentloaded'});
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({timeout:15000});
  await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');

  await page.evaluate(async()=>{
    const db=await import('/src/db.js');
    const now=new Date().toISOString();
    const beans=Array.from({length:8},(_,index)=>({
      id:`group-regression-${index}`,
      name:`分组测试豆${index+1}`,
      countryCode:index%2?'CO':'ET',
      varietyCode:index%2?'BOURBON':'GESHA',
      processCode:index%2?'NA':'WA',
      roastCode:index%2?'RL-L2':'RL-L1',
      roastDate:'2026-08-10',
      initialWeight:100,
      remainingWeight:90,
      archived:false,
      source:'manual',
      createdAt:now,
      updatedAt:now
    }));
    await db.bulkPut('beans',beans);
  });
  await refreshFrom(page,'v124b-group-brew-regression-seed');
});

async function chooseGroupMethod(page,method){
  await page.locator('#groupBtn').click();
  const option=page.locator(`[data-group-method="${method}"]`);
  await expect(option).toBeVisible();
  if(method==='process'){
    await expect(option).toContainText('处理法');
    await expect(option).not.toContainText('处理工法');
  }
  await option.click();
  await expect(page.locator('#beanGroups [data-open-group]').first()).toBeVisible();
}

async function openFirstGroup(page){
  await page.locator('#beanGroups [data-open-group]').first().click();
  await expect(page.locator('#beanGroups [data-active-group-panel]')).toBeVisible();
  await expect(page.locator('#beanGroups [data-lb-group-dismiss-zone]')).toHaveCount(1);
}

test('country variety roast and process folders share the same close behavior',async({page})=>{
  await expect(page.locator('#beanGroups .preference-board-strip')).toHaveCount(0);
  await expect(page.locator('#beanGroups [data-open-recommend-board]')).toHaveCount(0);

  for(const method of ['country','variety','roast','process']){
    await chooseGroupMethod(page,method);
    await openFirstGroup(page);

    // Re-tapping bottom 藏 closes the folder before ordinary page navigation continues.
    await page.locator('[data-page-target="beans"]').last().click();
    await expect(page.locator('#beanGroups [data-active-group-panel]')).toHaveCount(0);
    await expect(page.locator('#beanGroups [data-open-group]').first()).toBeVisible();

    // The large transparent space below the opened folder is also a real close target.
    await openFirstGroup(page);
    await page.locator('#beanGroups [data-lb-group-dismiss-zone]').click({position:{x:10,y:10}});
    await expect(page.locator('#beanGroups [data-active-group-panel]')).toHaveCount(0);
  }
});

test('small brew has normalized auto text centered rows and underline-only automatic state',async({page})=>{
  const stock=page.locator('.bean-consumption-summary .lb-stock-total');
  if(await stock.count()){
    const stockSize=parseFloat(await stock.evaluate(node=>getComputedStyle(node).fontSize));
    expect(stockSize).toBeLessThan(17);
  }

  await page.locator('[data-page-target="brew"]').click();
  await expect(page.locator('#brewDose')).toBeVisible();
  await expect(page.locator('#brewRatio')).toBeVisible();

  await expect.poll(()=>page.locator('#brewRatio option[value="auto"]').textContent()).not.toMatch(/^自动\s*[·・]/);
  const recommendedDripper=page.locator('#brewDripper option[value="recommended"]');
  if(await recommendedDripper.count()){
    await expect.poll(()=>recommendedDripper.textContent()).not.toMatch(/^方案推荐/);
  }

  const doseSize=await page.locator('#brewDose').evaluate(node=>getComputedStyle(node).fontSize);
  const ratioSize=await page.locator('#brewRatio').evaluate(node=>getComputedStyle(node).fontSize);
  expect(doseSize).toBe('14px');
  expect(ratioSize).toBe('14px');

  for(const selector of ['#brewDripper','#brewFilterPaper','#brewWaterProfile']){
    const control=page.locator(selector);
    if(await control.count()){
      await expect(control).toHaveCSS('text-align-last','center');
      await expect(control).toHaveCSS('font-size','13px');
    }
  }

  const ratio=page.locator('#brewRatio');
  if(await ratio.inputValue()==='auto'){
    await expect(ratio).toHaveClass(/lb-auto-field/);
    await expect(ratio).toHaveCSS('border-bottom-width','1px');
    await expect(ratio).toHaveCSS('box-shadow','none');
  }

  const profile=page.locator('#brewProfile');
  if(await profile.count())await expect(profile).toHaveCSS('font-size','13px');
});
