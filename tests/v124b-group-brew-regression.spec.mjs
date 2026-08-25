import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';

async function waitForStartup(page){
  const splash=page.locator('#splashScreen');
  if(await splash.isVisible().catch(()=>false)) await splash.click();
  await expect(page.locator('#appShell')).toBeVisible({timeout:15000});
  await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');
}

async function refreshFrom(page,source){
  await page.evaluate(async source=>{
    await new Promise(resolve=>{
      const done=event=>{
        if(event.detail?.source!==source)return;
        document.removeEventListener('luckybean:app-refreshed',done);
        resolve();
      };
      document.addEventListener('luckybean:app-refreshed',done);
      document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh',{detail:{source}}));
    });
  },source);
}

async function dispatchBack(page){
  return page.evaluate(()=>{
    const event=new CustomEvent('luckybean:navigation-back',{cancelable:true,detail:{source:'regression-test'}});
    document.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

async function chooseGroupMethod(page,method){
  await page.locator('#groupBtn').click();
  const option=page.locator(`[data-group-method="${method}"]`);
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator('#beanGroups [data-open-group]').first()).toBeVisible({timeout:10000});
}

async function chooseRecommendation(page,mode){
  await page.locator('#fabRecommendBtn').click();
  const option=page.locator(`[data-recommend-mode="${mode}"]`);
  await expect(option).toBeVisible();
  await option.click();
}

async function selectedBeanId(page){
  const id=await page.evaluate(()=>localStorage.getItem('luckybean.selected.bean.v098')||'');
  expect(id).not.toBe('');
  return id;
}

async function expectSelectedBeanVisible(page){
  const id=await selectedBeanId(page);
  await expect(page.locator(`#beanGroups [data-bean-id="${id}"]`)).toBeVisible({timeout:10000});
}

async function openFirstNativeGroup(page){
  const button=page.locator('#beanGroups [data-open-group]').first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('#beanGroups [data-active-group-panel]')).toHaveCount(1);
  await expect(page.locator('#beanGroups [data-close-bean-group]')).toHaveCount(1);
}

async function setSpecialMode(page,mode){
  await page.evaluate(async mode=>{
    const db=await import('/src/db.js');
    await db.setSetting('v099i.group.mode',mode);
    await db.setSetting('v099f.group.mode','native');
    document.dispatchEvent(new CustomEvent('luckybean:data-changed',{detail:{source:'group-regression-special-mode'}}));
  },mode);
  await page.reload({waitUntil:'domcontentloaded'});
  await waitForStartup(page);
  await expect(page.locator('#beanGroups [data-v099t-open-group]').first()).toBeVisible({timeout:10000});
}

async function openFirstSpecialGroup(page){
  const button=page.locator('#beanGroups [data-v099t-open-group]').first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('#beanGroups [data-v099t-group-root].active-group-panel')).toHaveCount(1);
  await expect(page.locator('#beanGroups [data-close-bean-group]')).toHaveCount(1);
}

test.beforeEach(async({page})=>{
  test.setTimeout(120000);
  await page.addInitScript(()=>{
    localStorage.setItem('luckybean.onboarding.v2',JSON.stringify({stage:'existing-user',updatedAt:new Date().toISOString(),reason:'group-regression'}));
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort('failed'));
  await page.goto(`${BASE_URL}/?group-regression=1`,{waitUntil:'domcontentloaded'});
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
      price:50+index*20,
      initialWeight:100,
      remainingWeight:12+index*29,
      archived:false,
      source:'manual',
      createdAt:now,
      updatedAt:now
    }));
    await db.bulkPut('beans',beans);
    await db.setSetting('v099i.group.mode','native');
    await db.setSetting('v099f.group.mode','native');
    const settings=await db.getSetting('app.settings',{});
    await db.setSetting('app.settings',{...settings,groupMethod:'country'});
  });
  await refreshFrom(page,'group-regression-seed');
});

test('country variety roast and process folders use one canonical close action',async({page})=>{
  for(const method of ['country','variety','roast','process']){
    await chooseGroupMethod(page,method);
    await openFirstNativeGroup(page);

    // 底部“藏”是长分组时的备用关闭入口。
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

    // 与赏味期/余量一致：选择结果只打开目标豆所在的一个分组，且当前实际选中的豆必须位于该组。
    await expect(page.locator('#beanGroups [data-active-group-panel]')).toHaveCount(1,{timeout:10000});
    await expect(page.locator('#beanGroups [data-close-bean-group]')).toHaveCount(1);
    await expectSelectedBeanVisible(page);

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
    await expectSelectedBeanVisible(page);

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

  await expect(page.locator('#brewDose')).not.toContainText('自动 ·');
  await expect(page.locator('#brewDripper option[value="recommended"]')).not.toContainText('方案推荐');

  for(const selector of ['#brewDose','#brewRatio']){
    await expect(page.locator(selector)).toHaveCSS('font-size','14px');
  }
  for(const selector of ['#brewDripper','#brewFilterPaper','#brewWaterProfile']){
    await expect(page.locator(selector)).toHaveCSS('font-size','13px');
    await expect(page.locator(selector)).toHaveCSS('text-align','center');
  }
  await expect(page.locator('#brewProfile')).toHaveCSS('font-size','13px');

  const autoRatio=page.locator('#brewRatio');
  await expect(autoRatio).toHaveClass(/lb-auto-field/);
  await expect(autoRatio).toHaveCSS('border-bottom-width','1px');
  await expect(autoRatio).toHaveCSS('box-shadow','none');
});