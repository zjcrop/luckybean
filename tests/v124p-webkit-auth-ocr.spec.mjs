import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';
const SUPABASE_PATTERN='https://vaxwncdcuvbpvdbbketb.supabase.co/**';

test.describe.configure({ timeout:120000 });

async function enter(page,url){
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#splashScreen')).toBeVisible();
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({timeout:15000});
  await page.waitForFunction(()=>Boolean(globalThis.LuckyBeanCloudAuth),null,{timeout:15000});
}

async function isolateSupabase(page){
  await page.route(SUPABASE_PATTERN,route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
}

test('email verification callback survives Safari-style storage failure',async({page})=>{
  await page.addInitScript(()=>{
    const set=Storage.prototype.setItem, remove=Storage.prototype.removeItem;
    Storage.prototype.setItem=function(key,value){
      if(String(key).startsWith('luckybean.supabase.')||String(key).startsWith('luckybean.cloud.')) throw new DOMException('blocked','QuotaExceededError');
      return set.call(this,key,value);
    };
    Storage.prototype.removeItem=function(key){
      if(String(key).startsWith('luckybean.supabase.')||String(key).startsWith('luckybean.cloud.')) throw new DOMException('blocked','QuotaExceededError');
      return remove.call(this,key);
    };
  });
  await page.route(SUPABASE_PATTERN,async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/auth/v1/user'){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'webkit-user',email:'webkit@example.com'})});
      return;
    }
    await route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });
  await enter(page,`${BASE_URL}/?webkit-callback=1#access_token=a.b.c&refresh_token=webkit-refresh&expires_in=3600&token_type=bearer`);
  await expect.poll(()=>page.evaluate(()=>globalThis.LuckyBeanCloudAuth?.getSession?.()?.refresh_token||'')).toBe('webkit-refresh');
  const state=await page.evaluate(()=>({hash:location.hash,auth:document.documentElement.dataset.cloudAuth,storage:document.documentElement.dataset.cloudStorage,email:globalThis.LuckyBeanCloudAuth.getSession()?.user?.email}));
  expect(state.hash).toBe('');
  expect(state.auth).toBe('authenticated');
  expect(state.storage).toBe('volatile');
  expect(state.email).toBe('webkit@example.com');
});

test('WebKit runtime stays lazy and exposes bounded PP-OCR compatibility mode',async({page})=>{
  await isolateSupabase(page);
  await enter(page,`${BASE_URL}/?webkit-ocr=1`);
  await page.waitForFunction(()=>Boolean(globalThis.LuckyBeanPaddleOCR)&&Boolean(globalThis.LuckyBeanPackageCapture),null,{timeout:15000});
  await page.waitForTimeout(4500);
  const state=await page.evaluate(()=>({
    browserSafe:globalThis.LuckyBeanPaddleOCR.browserSafe,
    primaryIsolation:globalThis.LuckyBeanPaddleOCR.primaryIsolation,
    compatibilityFallback:globalThis.LuckyBeanPaddleOCR.compatibilityFallback,
    autoPreload:globalThis.LuckyBeanPaddleOCR.autoPreload,
    disposePolicy:globalThis.LuckyBeanPaddleOCR.disposePolicy,
    roiWorkerOnly:globalThis.LuckyBeanPaddleOCR.roiWorkerOnly,
    webPaddle:globalThis.LuckyBeanPackageCapture.capabilities().webPaddle,
    heavyResources:performance.getEntriesByType('resource').map(item=>item.name).filter(name=>/paddleocr\/(?:sdk|models|ort)\//.test(name)||/paddleocr\/sdk\.mjs/.test(name))
  }));
  expect(state.browserSafe).toBe(true);
  expect(state.primaryIsolation).toBe('webkit-direct-wasm-no-simd');
  expect(state.compatibilityFallback).toBe('webkit-direct-wasm-no-simd');
  expect(state.autoPreload).toBe(false);
  expect(state.disposePolicy).toBe('after-each-task');
  expect(state.roiWorkerOnly).toBe(true);
  expect(state.webPaddle).toBe(true);
  expect(state.heavyResources).toEqual([]);
});

test('WebKit PP-OCR performs a real bounded local inference and releases the engine',async({page})=>{
  await isolateSupabase(page);
  await enter(page,`${BASE_URL}/?webkit-real-ocr=1`);
  await page.waitForFunction(()=>Boolean(globalThis.LuckyBeanPaddleOCR),null,{timeout:15000});

  const result=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');
    canvas.width=1200; canvas.height=640;
    const context=canvas.getContext('2d');
    context.fillStyle='#fff'; context.fillRect(0,0,canvas.width,canvas.height);
    context.fillStyle='#000'; context.font='bold 104px Arial, sans-serif';
    context.fillText('ETHIOPIA',70,165);
    context.fillText('NATURAL',70,325);
    context.fillText('COFFEE',70,485);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('synthetic-image-failed')),'image/png'));
    canvas.width=1; canvas.height=1;
    const started=performance.now();
    try{
      const output=await globalThis.LuckyBeanPaddleOCR.recognize(blob);
      const texts=(output?.blocks||[]).map(block=>String(block?.text||'')).filter(Boolean);
      await globalThis.LuckyBeanPaddleOCR.dispose();
      return {ok:true,texts,elapsedMs:Math.round(performance.now()-started),disposePolicy:globalThis.LuckyBeanPaddleOCR.disposePolicy,primaryIsolation:globalThis.LuckyBeanPaddleOCR.primaryIsolation};
    }catch(error){
      try{await globalThis.LuckyBeanPaddleOCR.dispose()}catch{}
      return {ok:false,error:error?.message||String(error),elapsedMs:Math.round(performance.now()-started)};
    }
  });

  expect(result.ok,`real WebKit OCR failed: ${result.error||'unknown'}`).toBe(true);
  expect(result.texts.length).toBeGreaterThan(0);
  expect(result.texts.join(' ').toUpperCase()).toMatch(/ETHIOPIA|NATURAL|COFFEE/);
  expect(result.primaryIsolation).toBe('webkit-direct-wasm-no-simd');
  expect(result.disposePolicy).toBe('after-each-task');
  expect(result.elapsedMs).toBeLessThan(60000);
});
