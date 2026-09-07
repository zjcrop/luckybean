import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';
const TARGET_IDS=['acidity','floral','fruity','sweetness','bitterness','astringency'];

test.beforeEach(async({page})=>{
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort('failed'));
  await page.goto(`${BASE_URL}/?p2-spatial-latest=1`,{waitUntil:'domcontentloaded'});
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({timeout:15000});
  await page.locator('[data-page-target="brew"]').click();
  await page.waitForFunction(()=>Boolean(globalThis.LuckyBeanSpatial),null,{timeout:15000});
});

test('rapid recalculation cannot let an older async 3D scene overwrite the latest plan',async({page})=>{
  const result=await page.evaluate(async(targetIds)=>{
    const scene=(fingerprint,offset)=>({
      schemaVersion:'brew-spatial/1.2',
      planFingerprint:fingerprint,
      path:[[0,90,0],[120,88+offset,240]],
      targets:targetIds.map((id,targetIndex)=>({
        id,
        points:Array.from({length:12},(_,index)=>[
          index*10,
          86+targetIndex*0.2+offset+index*0.03,
          20+index*18
        ])
      })),
      prediction:{verdict:fingerprint,suitability:.8,positiveNegativeRatio:2,confidence:'test'}
    });
    const plan=(fingerprint,offset)=>({
      executionSource:'brew-profiles-authoritative',
      visualization3d:scene(fingerprint,offset),
      analysisFingerprint:fingerprint
    });

    const first=globalThis.LuckyBeanSpatial.mount(plan('old-plan',0));
    const second=globalThis.LuckyBeanSpatial.mount(plan('latest-plan',1));
    const settled=await Promise.all([first,second]);
    return {
      settled,
      fingerprint:globalThis.LuckyBeanSpatial.getLastRenderFingerprint(),
      generation:globalThis.LuckyBeanSpatial.getRenderGeneration(),
      previews:document.querySelectorAll('#brewSpatialMount [data-brew-spatial-preview]').length
    };
  },TARGET_IDS);

  expect(result.settled[0]).toBe(false);
  expect(result.settled[1]).toBe(true);
  expect(result.fingerprint).toBe('latest-plan');
  expect(result.generation).toBeGreaterThanOrEqual(2);
  expect(result.previews).toBe(1);
});
