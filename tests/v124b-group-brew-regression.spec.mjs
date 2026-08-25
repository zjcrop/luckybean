import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';

async function waitForStartup(page){
  const splash=page.locator('#splashScreen');
  if(await splash.isVisible().catch(()=>false))await splash.click();
  await expect(page.locator('#appShell')).toBeVisible({timeout:15000});
  await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');
}

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

async function dispatchBack(page){
  return page.evaluate(()=>{
    const event=new CustomEvent('luckybean:navigation-back',{cancelable:true});
    document.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('luckybean.onboarding.v2',JSON.stringify({stage:'existing-user',updatedAt:new Date().toISOString(),reason:'group-brew-regression'}));
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort('failed'));
  await page.goto(`${BASE_URL}/?v124b-group-brew-regression=1`,{waitUntil:'domcontentloaded'});
  await waitForStartup(page);

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
      roastDate:index<3?'2026-08-23':index<6?'2026-08-10':'2026-07-20',
      initialWeight:100,
      remainingWeight:20+index*32,
      archived:false,
      source:'manual',
      createdAt:now,
      updatedAt:now
    }));
    await db.bulkPut('beans',beans);
    await db.setSetting('v099i.group.mode','native');
    await db.setSetting('v099f.group.mode','native');
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

async function openFirstNativeGroup(page){
  await page.locator('#beanGroups [data-open-group]').first().click();
  await expect(page.locator('#beanGroups [data-active-group-panel]')).toBeVisible();
  await expect(page.locator('#beanGroups [data-close-bean-group]')).toHaveCount(1);
}

async function setSpecialMode(page,mode){
  await page.evaluate(async mode=>{
    const db=await import('/src/db.js');
    await db.setSetting('v099i.group.mode',mode);
    await db.setSetting('v099f.group.mode','native');
  },mode);
  await page.reload({waitUntil:'domcontentloaded'});
  await waitForStartup(page);
  await expect(page.locator('#beanGroups [data-v099t-open-group]').first()).toBeVisible({timeout:15000});
}

async function openFirstSpecialGroup(page){
  await page.locator('#beanGroups [data-v099t-open-group]').first().click();
  await expect(page.locator('#beanGroups [data-v099t-group-root].active-group-panel')).toBeVisible();
  await expect(page.locator('#beanGroups [data-close-bean-group]')).toHaveCount(1);
}

async function chooseRecommendation(page,mode){
  await page.locator('#fabRecommendBtn').click();
  const option=page.locator(`[data-recommend-mode="${mode}"]`);
  await expect(option).toBeVisible();
  await option.click();
}

test('country variety roast and process folders use one canonical close action',async({page})=>{
  await expect(page.locator('#beanGroups .preference-board-strip')).toHaveCount(0);
  await expect(page.locator('#beanGroups [data-open-recommend-board]')).toHaveCount(0);

  for(const method of ['country','variety','roast','process']){
    await chooseGroupMethod(page,method);
    await openFirstNativeGroup(page);

    // 底部“藏”仅是长列表的备用关闭入口。
    await page.locator('[data-page-target="beans"]').last().click();
    await expect(page.locator('#beanGroups [data-active-group-panel]')).toHaveCount(0);
    await expect(page.locator('#beanGroups [data-open-group]').first()).toBeVisible();

    // 分组内容末尾的专用自然留白是主关闭入口。
    await openFirstNativeGroup(page);
    await page.locator('#beanGroups [data-close-bean-group]').click({position:{x:10,y:10}});
    await expect(page.locator('#beanGroups [data-active-group-panel]')).toHaveCount(0);

    // 系统 Back 同样只关闭当前分组，页面仍停留在豆藏。
    await openFirstNativeGroup(page);
    expect(await dispatchBack(page)).toBe(true);
    await expect(page.locator('#beanGroups [data-active-group-panel]')).toHaveCount(0);
    await expect(page.locator('#pageBeans')).toHaveClass(/active/);
    await expect(page.locator('#beanGroups [data-open-group]').first()).toBeVisible();
  }
});

test('native recommendation opens only the target group and never expands all groups',async({page})=>{
  // 选择菜单颜色属于功能语义，不再依赖旧主题色。
  await page.locator('#fabRecommendBtn').click();
  await expect(page.locator('[data-recommend-mode="price"] .recommend-dot')).toHaveCSS('background-color','rgb(0, 0, 0)');
  await expect(page.locator('[data-recommend-mode="remaining"] .recommend-dot')).toHaveCSS('background-color','rgb(128, 128, 128)');
  await page.keyboard.press('Escape');

  for(const method of ['country','variety','roast','process']){
    await chooseGroupMethod(page,method);
    await chooseRecommendation(page,'remaining');

    // 旧功能遗留的“全组同时展开”必须彻底不存在。
    await expect(page.locator('#beanGroups [data-all-groups]')).toHaveCount(0);
    await expect(page.locator('#beanGroups .recommendation-all-groups')).toHaveCount(0);

    // 与赏味期/余量一致：选择结果只打开目标豆所在的一个分组。
    await expect(page.locator('#beanGroups [data-active-group-panel]')).toHaveCount(1,{timeout:10000});
    await expect(page.locator('#beanGroups [data-close-bean-group]')).toHaveCount(1);
    await expect(page.locator('#beanGroups [data-bean-id="group-regression-7"]')).toBeVisible();

    // 推荐后的分组仍然使用同一个正式关闭动作。
    await page.locator('#beanGroups [data-close-bean-group]').click({position:{x:10,y:10}});
    await expect(page.locator('#beanGroups [data-active-group-panel]')).toHaveCount(0);
    await expect(page.locator('#beanGroups [data-open-group]').first()).toBeVisible();
  }
});

test('freshness and remaining groups keep their renderer while sharing canonical state',async({page})=>{
  for(const mode of ['freshness-ratio','remaining-50']){
    await setSpecialMode(page,mode);

    await openFirstSpecialGroup(page);
    await page.locator('#beanGroups [data-close-bean-group]').click({position:{x:10,y:10}});
    await expect(page.locator('#beanGroups [data-v099t-open-group]').first()).toBeVisible();
    await expect(page.locator('#beanGroups [data-open-group]')).toHaveCount(0);

    await openFirstSpecialGroup(page);
    await page.locator('[data-page-target="beans"]').last().click();
    await expect(page.locator('#beanGroups [data-v099t-open-group]').first()).toBeVisible();
    await expect(page.locator('#beanGroups [data-open-group]')).toHaveCount(0);

    await openFirstSpecialGroup(page);
    expect(await dispatchBack(page)).toBe(true);
    await expect(page.locator('#beanGroups [data-v099t-open-group]').first()).toBeVisible();
    await expect(page.locator('#beanGroups [data-open-group]')).toHaveCount(0);
    await expect(page.locator('#pageBeans')).toHaveClass(/active/);
  }
});

test('special group recommendations also keep exactly one target group open',async({page})=>{
  for(const mode of ['freshness-ratio','remaining-50']){
    await setSpecialMode(page,mode);
    await chooseRecommendation(page,'remaining');

    await expect(page.locator('#beanGroups [data-all-groups]')).toHaveCount(0);
    await expect(page.locator('#beanGroups .recommendation-all-groups')).toHaveCount(0);
    await expect(page.locator('#beanGroups [data-v099t-group-root].active-group-panel')).toHaveCount(1,{timeout:10000});
    await expect(page.locator('#beanGroups [data-close-bean-group]')).toHaveCount(1);
    await expect(page.locator('#beanGroups [data-bean-id="group-regression-7"]')).toBeVisible();

    await page.locator('#beanGroups [data-close-bean-group]').click({position:{x:10,y:10}});
    await expect(page.locator('#beanGroups [data-v099t-open-group]').first()).toBeVisible();
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
