import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';

test.beforeEach(async({page})=>{
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort('failed'));
  await page.addInitScript(()=>localStorage.setItem('luckybean.onboarding.v2',JSON.stringify({stage:'existing-user',updatedAt:new Date().toISOString(),reason:'p3-ux-flow-test'})));
  await page.goto(`${BASE_URL}/?p3-ux-flow=1`,{waitUntil:'domcontentloaded'});
  const splash=page.locator('#splashScreen');
  if(await splash.isVisible().catch(()=>false)) await splash.click();
  await expect(page.locator('#appShell')).toBeVisible({timeout:15000});
  await page.waitForFunction(()=>Boolean(globalThis.LuckyBeanPackageCapture),null,{timeout:15000});
});

test('package capture keeps only capture upload and confirmation actions because OCR is automatic',async({page})=>{
  await page.evaluate(()=>globalThis.LuckyBeanPackageCapture.open());
  const overlay=page.locator('[data-overlay="bag-capture"]');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('#bagCameraBtn')).toHaveText('拍摄');
  await expect(overlay.locator('#bagGalleryBtn')).toHaveText('上传');
  await expect(overlay.locator('#bagRecognizeBtn')).toHaveCount(0);
  await expect(overlay.locator('#bagHandoffBtn')).toHaveText('确认');
  await expect(overlay.locator('#bagManualBtn')).toHaveCount(0);
  const layout=await overlay.locator('.bag-capture-actions').evaluate(node=>{
    const style=getComputedStyle(node);
    return {position:style.position,columns:style.gridTemplateColumns};
  });
  expect(layout.position).toBe('fixed');
  expect(layout.columns.split(' ').filter(Boolean)).toHaveLength(3);
  const hint=overlay.locator('.bag-capture-hint');
  await expect(hint).toHaveCount(1);
  expect(await hint.evaluate(node=>getComputedStyle(node).borderTopWidth)).toBe('0px');
});

test('brew tendency is placed before the generated plan and heading is neutral',async({page})=>{
  await page.locator('[data-page-target="brew"]').click();
  await page.evaluate(()=>{
    const host=document.querySelector('#planResult');
    host.innerHTML='<section id="generatedPlan"><h2>热冲方案</h2><section class="brew-strategy-options"><h3>三种冲煮倾向</h3></section><div class="row menu-row"><button id="startBrewBtn">开始计时</button><button id="planToSensoryBtn">直接品鉴</button></div></section>';
  });
  await expect(page.locator('#planResult > .brew-strategy-options')).toHaveCount(1,{timeout:5000});
  await expect(page.locator('#generatedPlan > h2')).toHaveText('冲煮方案');
  const order=await page.locator('#planResult').evaluate(node=>[...node.children].map(child=>child.classList.contains('brew-strategy-options')?'tendency':child.id||child.tagName));
  expect(order.slice(0,2)).toEqual(['tendency','generatedPlan']);
  await expect.poll(async()=>page.locator('#startBrewBtn').evaluate(node=>getComputedStyle(node).textAlign),{timeout:5000}).toBe('center');
  const actions=await page.locator('#startBrewBtn').evaluate(node=>{const style=getComputedStyle(node);return {display:style.display,weight:Number(style.fontWeight),align:style.textAlign};});
  expect(actions.display).toBe('flex');
  expect(actions.weight).toBeGreaterThanOrEqual(700);
  expect(actions.align).toBe('center');
});

test('closing the 3D view physically removes stale fullscreen overlay and body lock',async({page})=>{
  const state=await page.evaluate(async()=>{
    const {brewSpatialView}=await import('./src/renderers/brew-spatial-view.js');
    const overlay=document.createElement('div');
    overlay.className='spatial-fullscreen-overlay';
    const info=document.createElement('div');
    overlay.append(info);
    document.body.append(overlay);
    document.body.classList.add('spatial-fullscreen-open');
    document.body.style.overflow='hidden';
    brewSpatialView.overlay=overlay;
    brewSpatialView.pointInfo=info;
    brewSpatialView.opened=true;
    brewSpatialView.pointers.clear();
    brewSpatialView.close();
    return {
      overlays:document.querySelectorAll('.spatial-fullscreen-overlay').length,
      bodyLocked:document.body.classList.contains('spatial-fullscreen-open'),
      overflow:document.body.style.overflow,
      opened:brewSpatialView.opened,
      overlayRef:Boolean(brewSpatialView.overlay)
    };
  });
  expect(state).toEqual({overlays:0,bodyLocked:false,overflow:'',opened:false,overlayRef:false});
});
