import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';

test.beforeEach(async({page})=>{
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort('failed'));
  await page.goto(`${BASE_URL}/?p2-brew-strategy=1`,{waitUntil:'domcontentloaded'});
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({timeout:15000});
  await page.waitForFunction(()=>Boolean(globalThis.LuckyBeanBrewStrategies),null,{timeout:15000});
  await page.locator('[data-page-target="brew"]').click();
});

test('hot recommended plan is projected into three distinct LuckyBean strategy choices',async({page})=>{
  const result=await page.evaluate(()=>{
    const plan={
      profile:{id:'three-pulse',label:'三段式'},
      recommendation:{candidates:[
        {id:'three-pulse',score:0.91,profile:{id:'three-pulse',label:'三段式',tags:['clarity','aroma']}},
        {id:'four-six-v17',score:0.89,profile:{id:'four-six-v17',label:'四六法',tags:['sweetness','structure']}},
        {id:'one-pour',score:0.82,profile:{id:'one-pour',label:'一刀流',tags:['body']}}
      ]},
      professional:{}
    };
    const input={
      bean:{countryCode:'ET',varietyCode:'JARC-74158',processCode:'NA',roastCode:'RL-L1'},
      brew:{serveMode:'hot',dripperCode:'V60',profileId:'recommended',repeatability:false},
      targets:{acidity:1.5,floral:2,fruity:2,sweetness:2,bitterness:2,astringency:2}
    };
    document.dispatchEvent(new CustomEvent('luckybean:plan-ready',{detail:{plan,input,source:'p2-test'}}));
    return {
      mode:plan.recommendation.candidateMode,
      ids:plan.recommendation.candidates.map(item=>item.id),
      labels:plan.recommendation.candidates.map(item=>item.profile?.label||''),
      strategies:plan.professional.luckyBeanStrategies?.choices||[]
    };
  });

  expect(result.mode).toBe('luckybean-three-strategy');
  expect(result.ids).toHaveLength(3);
  expect(new Set(result.ids).size).toBe(3);
  expect(result.labels.join('|')).toContain('清晰香气');
  expect(result.labels.join('|')).toContain('甜感平衡');
  expect(result.labels.join('|')).toContain('醇厚高萃');
  expect(result.strategies.map(item=>item.strategyId)).toEqual(['clarity-aroma','sweet-balance','body-extraction']);
});

test('strategy options are surfaced above professional details without cloning action nodes',async({page})=>{
  await page.evaluate(()=>{
    const host=document.querySelector('#planResult');
    host.innerHTML=`<details class="details-block professional-result"><summary>专业内容</summary><div class="details-content"><section class="nested-settings recommended-profile-options"><h3>推荐冲煮方案（按匹配度）</h3><div class="nested-content"><button data-recommended-profile="three-pulse"><span>清晰香气 · 三段式</span></button><button data-recommended-profile="four-six-v17"><span>甜感平衡 · 四六法</span></button><button data-recommended-profile="one-pour"><span>醇厚高萃 · 一刀流</span></button></div></section></div></details>`;
  });

  const section=page.locator('#planResult > .brew-strategy-options');
  await expect(section).toHaveCount(1,{timeout:5000});
  await expect(section.locator('h3')).toHaveText('三种冲煮倾向');
  await expect(section.locator('[data-recommended-profile]')).toHaveCount(3);
  expect(await section.evaluate(node=>Boolean(node.closest('details.professional-result')))).toBe(false);
});

test('cold plan keeps BrewProfiles dedicated candidates untouched',async({page})=>{
  const result=await page.evaluate(()=>{
    const candidates=[
      {id:'ice-a',score:0.9,profile:{id:'ice-a',label:'冰冲A'}},
      {id:'ice-b',score:0.8,profile:{id:'ice-b',label:'冰冲B'}},
      {id:'ice-c',score:0.7,profile:{id:'ice-c',label:'冰冲C'}}
    ];
    const plan={recommendation:{candidates:structuredClone(candidates)},professional:{}};
    const input={brew:{serveMode:'cold'},targets:{acidity:1.5,floral:2,fruity:2,sweetness:2,bitterness:2,astringency:2}};
    document.dispatchEvent(new CustomEvent('luckybean:plan-ready',{detail:{plan,input,source:'p2-cold-test'}}));
    return {ids:plan.recommendation.candidates.map(item=>item.id),strategy:Boolean(plan.professional.luckyBeanStrategies)};
  });
  expect(result.ids).toEqual(['ice-a','ice-b','ice-c']);
  expect(result.strategy).toBe(false);
});
