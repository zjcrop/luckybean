import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const release=JSON.parse(fs.readFileSync(new URL('../release.json',import.meta.url),'utf8'));
test.use({serviceWorkers:'allow'});
test('same release retains one service worker across navigation and keeps IndexedDB data',async({page,context})=>{
  test.setTimeout(90000);
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort());
  await context.addInitScript(()=>localStorage.setItem('luckybean.onboarding.v2',JSON.stringify({stage:'existing-user',updatedAt:new Date().toISOString()})));
  const workers=[];
  context.on('serviceworker',worker=>workers.push(worker.url()));
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  const expected='http://127.0.0.1:4173/sw.js?v='+encodeURIComponent(release.revision);
  for(let index=0;index<3;index++){
    await page.goto('http://127.0.0.1:4173/?worker-lifecycle='+index,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');
    await page.waitForFunction(expected=>navigator.serviceWorker.controller?.scriptURL===expected,expected);
    await page.waitForTimeout(750);
    const state=await page.evaluate(async()=>{
      const registrations=await navigator.serviceWorker.getRegistrations();
      const db=await import('/src/db.js');
      return {count:registrations.length,active:registrations[0]?.active?.scriptURL,installing:Boolean(registrations[0]?.installing),value:await db.getSetting('worker-lifecycle-proof',null)};
    });
    expect(state.count).toBe(1);expect(state.active).toBe(expected);expect(state.installing).toBe(false);
    if(index===0) await page.evaluate(async()=>{const db=await import('/src/db.js');await db.setSetting('worker-lifecycle-proof','preserved');});
    else expect(state.value).toBe('preserved');
  }
  expect(workers).toEqual([expected]);expect(errors).toEqual([]);
});
