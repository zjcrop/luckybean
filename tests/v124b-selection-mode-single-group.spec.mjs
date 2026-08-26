import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';
const FRESHNESS_PROMPTS=[
  '此只风味精绝，君既选中，甚是妥当。',
  '正逢此只风味最盛，您这一选，再好不过。',
  '此只正值风味精妙处，既已选定，便是良配。',
  '此只正得意时，恰被君眼相中，眼光不差。'
];

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
  await expect(page.locator('#beanGroups [data-active-group-panel]')).toHaveCount(1,{timeout:20000});
  await expect(page.locator('#beanGroups [data-all-groups]')).toHaveCount(0);
  await expect(page.locator('#beanGroups .recommendation-all-groups')).toHaveCount(0);
  await expect(page.locator('#beanGroups [data-close-bean-group]')).toHaveCount(1);
  await page.locator('#beanGroups [data-close-bean-group]').click({position:{x:10,y:10}});
  await expect(page.locator('#beanGroups [data-active-group-panel]')).toHaveCount(0);
  await expect(page.locator('#beanGroups [data-open-group]').first()).toBeVisible();
}

test.beforeEach(async({page})=>{
  test.setTimeout(180000);
  await page.addInitScript(()=>{
    localStorage.setItem('luckybean.onboarding.v2',JSON.stringify({stage:'existing-user',updatedAt:new Date().toISOString(),reason:'selection-group-unification'}));
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort('failed'));
  await page.goto(`${BASE_URL}/?selection-group-unification=1`,{waitUntil:'domcontentloaded'});
  await waitForStartup(page);

  await page.evaluate(async()=>{
    const db=await import('/src/db.js');
    const now=new Date().toISOString();
    const beans=Array.from({length:8},(_,index)=>({
      id:`selection-unify-${index}`,
      name:`选择统一豆${index+1}`,
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
  await refreshFrom(page,'selection-group-unification-seed');
});

test('selection colors are semantic and theme dependent only where contrast requires it',async({page})=>{
  await page.locator('#fabRecommendBtn').click();
  await expect(page.locator('[data-recommend-mode="price"] .recommend-dot')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(page.locator('[data-recommend-mode="remaining"] .recommend-dot')).toHaveCSS('background-color','rgb(128, 128, 128)');
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await expect(page.locator('[data-recommend-mode="price"] .recommend-dot')).toHaveCSS('background-color','rgb(0, 0, 0)');
});

test('selection fun prompt remains the only visible recommendation prompt while ordinary status notices still work',async({page})=>{
  await page.locator('#fabRecommendBtn').click();
  const option=page.locator('[data-recommend-mode="freshness"]');
  await expect(option).toBeVisible();
  await option.click();

  const prompt=page.locator('#lbRecommendationToast');
  await expect(prompt).toBeVisible({timeout:1000});
  await expect(prompt).toHaveClass(/show/,{timeout:1000});
  const promptText=(await prompt.textContent())?.trim()||'';
  expect(FRESHNESS_PROMPTS).toContain(promptText);

  const geometry=await prompt.evaluate(node=>{
    const rect=node.getBoundingClientRect();
    const style=getComputedStyle(node);
    return {
      top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,
      width:rect.width,height:rect.height,
      opacity:Number(style.opacity),
      display:style.display,
      visibility:style.visibility,
      background:style.backgroundColor,
      color:style.color,
      viewportWidth:innerWidth,viewportHeight:innerHeight
    };
  });
  expect(geometry.width).toBeGreaterThan(80);
  expect(geometry.height).toBeGreaterThan(20);
  expect(geometry.opacity).toBeGreaterThan(0.9);
  expect(geometry.display).not.toBe('none');
  expect(geometry.visibility).not.toBe('hidden');
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth+1);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight+1);

  // The legacy app recommendation toast fires after the selection animation. It must stay hidden
  // so it cannot cover the dedicated fun prompt.
  await page.waitForTimeout(1200);
  await expect(page.locator('#toast.toast.recommendation')).toBeHidden();
  await expect(prompt).toHaveText(promptText);
  await expect(prompt).toBeVisible();

  // Non-recommendation status notices still use the shared toast and must remain visible.
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('luckybean:user-notice',{detail:{message:'普通状态提示',kind:'status-good'}})));
  await expect(page.locator('#toast')).toHaveText('普通状态提示');
  await expect(page.locator('#toast')).toBeVisible();
  await expect(prompt).toHaveText(promptText);
  await expect(prompt).toBeVisible();
  await expect(prompt).toHaveClass(/show/);
});

test('all five selection modes keep exactly one target group open across every native grouping method',async({page})=>{
  for(const method of ['country','variety','roast','process']){
    await chooseGroupMethod(page,method);
    for(const mode of ['leaderboard','freshness','price','remaining','random']){
      await chooseRecommendation(page,mode);
    }
  }
});
