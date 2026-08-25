import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';
const V1='luckybean.fab.position.v1';
const V2='luckybean.fab.position.v2';

async function openApp(page,{legacy=null,relative=null}={}){
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(({legacy,relative,V1,V2})=>{
    localStorage.setItem('luckybean.onboarding.v2',JSON.stringify({stage:'existing-user',updatedAt:new Date().toISOString(),reason:'fab-regression'}));
    localStorage.removeItem(V1);
    localStorage.removeItem(V2);
    if(legacy)localStorage.setItem(V1,JSON.stringify(legacy));
    if(relative)localStorage.setItem(V2,JSON.stringify(relative));
  },{legacy,relative,V1,V2});
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort('failed'));
  await page.goto(`${BASE_URL}/?v124b-fab-regression=1`,{waitUntil:'domcontentloaded'});
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({timeout:15000});
  await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');
  await expect.poll(()=>page.evaluate(()=>Boolean(globalThis.LuckyBeanFabController?.snapshot?.().measurable))).toBe(true);
}

async function snapshot(page){
  return page.evaluate(()=>globalThis.LuckyBeanFabController.snapshot());
}

function isInsideBounds(state){
  if(!state?.measurable||!state?.bounds)return false;
  return state.rect.width>=20
    && state.rect.height>=20
    && state.rect.left>=state.bounds.minX-1
    && state.rect.top>=state.bounds.minY-1
    && state.rect.left<=state.bounds.maxX+1
    && state.rect.top<=state.bounds.maxY+1;
}

function expectInsideBounds(state){
  expect(state.measurable).toBe(true);
  expect(state.rect.width).toBeGreaterThanOrEqual(20);
  expect(state.rect.height).toBeGreaterThanOrEqual(20);
  expect(state.rect.left).toBeGreaterThanOrEqual(state.bounds.minX-1);
  expect(state.rect.top).toBeGreaterThanOrEqual(state.bounds.minY-1);
  expect(state.rect.left).toBeLessThanOrEqual(state.bounds.maxX+1);
  expect(state.rect.top).toBeLessThanOrEqual(state.bounds.maxY+1);
}

async function expectEventuallyInside(page){
  await expect.poll(async()=>isInsideBounds(await snapshot(page)),{timeout:3000}).toBe(true);
  expectInsideBounds(await snapshot(page));
}

test('legacy off-screen FAB position migrates once and stays inside the bean viewport',async({page})=>{
  await openApp(page,{legacy:{x:99999,y:99999}});

  await expect.poll(()=>page.evaluate(()=>globalThis.LuckyBeanRuntimeFeatures?.loaded?.includes('ui-layout'))).toBe(true);
  await expectEventuallyInside(page);
  const first=await snapshot(page);
  expect(first.owner).toBe('canonical');

  const storage=await page.evaluate(({V1,V2})=>({v1:localStorage.getItem(V1),v2:JSON.parse(localStorage.getItem(V2)||'null'),guard:document.querySelector('#fabWrap')?.dataset.v097DragBound}),{V1,V2});
  expect(storage.v1).toBeNull();
  expect(storage.guard).toBe('1');
  expect(storage.v2?.version).toBe(2);
  expect(storage.v2?.rx).toBeGreaterThanOrEqual(0);
  expect(storage.v2?.rx).toBeLessThanOrEqual(1);
  expect(storage.v2?.ry).toBeGreaterThanOrEqual(0);
  expect(storage.v2?.ry).toBeLessThanOrEqual(1);

  await page.setViewportSize({width:844,height:390});
  await expectEventuallyInside(page);
  await expect.poll(()=>page.evaluate(V1=>localStorage.getItem(V1),V1)).toBeNull();

  await page.locator('[data-page-target="brew"]').click();
  await expect(page.locator('#fabWrap')).toBeHidden();
  await page.locator('[data-page-target="beans"]').click();
  await expect(page.locator('#fabWrap')).toBeVisible();
  await expectEventuallyInside(page);
});

test('invalid relative coordinates self-heal and dragging never recreates v1 ownership',async({page})=>{
  await openApp(page,{relative:{version:2,rx:9,ry:-4}});

  await expectEventuallyInside(page);
  let saved=await page.evaluate(({V1,V2})=>({v1:localStorage.getItem(V1),v2:JSON.parse(localStorage.getItem(V2)||'null')}),{V1,V2});
  expect(saved.v1).toBeNull();
  expect(saved.v2.rx).toBeGreaterThanOrEqual(0);
  expect(saved.v2.rx).toBeLessThanOrEqual(1);
  expect(saved.v2.ry).toBeGreaterThanOrEqual(0);
  expect(saved.v2.ry).toBeLessThanOrEqual(1);

  const handle=page.locator('#fabWrap .v097-fab-drag-handle');
  await expect(handle).toHaveCount(1);
  const box=await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(Math.max(20,box.x-45),Math.max(20,box.y-55),{steps:5});
  await page.mouse.up();

  await expect.poll(()=>page.evaluate(V1=>localStorage.getItem(V1),V1)).toBeNull();
  await expectEventuallyInside(page);
  saved=await page.evaluate(V2=>JSON.parse(localStorage.getItem(V2)||'null'),V2);
  expect(saved.version).toBe(2);
  expect(saved.rx).toBeGreaterThanOrEqual(0);
  expect(saved.rx).toBeLessThanOrEqual(1);
  expect(saved.ry).toBeGreaterThanOrEqual(0);
  expect(saved.ry).toBeLessThanOrEqual(1);
});
