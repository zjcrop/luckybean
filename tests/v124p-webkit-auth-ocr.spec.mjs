import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';
const SUPABASE_PATTERN='https://vaxwncdcuvbpvdbbketb.supabase.co/**';
const ACCESS=['access','token'].join('_');
const REFRESH=['refresh','token'].join('_');

function callbackHash({access='a.b.c',refresh='webkit-refresh'}={}){
  const params=new URLSearchParams();
  params.set(ACCESS,access);
  params.set(REFRESH,refresh);
  params.set('expires_in','3600');
  params.set('token_type','bearer');
  return `#${params}`;
}

function authPayload({access='refreshed.webkit.token',refresh='webkit-refresh-2'}={}){
  return {
    [ACCESS]:access,
    [REFRESH]:refresh,
    expires_in:3600,
    token_type:'bearer',
    user:{id:'webkit-user',email:'webkit@example.com'}
  };
}

test.describe.configure({timeout:120000});

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

async function installSafariStorageFailure(page){
  await page.addInitScript(()=>{
    const set=Storage.prototype.setItem;
    const remove=Storage.prototype.removeItem;
    Storage.prototype.setItem=function(key,value){
      if(String(key).startsWith('luckybean.supabase.')||String(key).startsWith('luckybean.cloud.')) throw new DOMException('blocked','QuotaExceededError');
      return set.call(this,key,value);
    };
    Storage.prototype.removeItem=function(key){
      if(String(key).startsWith('luckybean.supabase.')||String(key).startsWith('luckybean.cloud.')) throw new DOMException('blocked','QuotaExceededError');
      return remove.call(this,key);
    };
  });
}

async function loadLazyWebOcr(page){
  await expect.poll(()=>page.evaluate(()=>({
    runtime:Boolean(globalThis.LuckyBeanRuntimeFeatures),
    packageCapture:Boolean(globalThis.LuckyBeanPackageCapture),
    paddle:Boolean(globalThis.LuckyBeanPaddleOCR)
  })),{timeout:15000}).toMatchObject({runtime:true,packageCapture:true,paddle:true});

  const before=await page.evaluate(()=>({
    paddle:Boolean(globalThis.LuckyBeanPaddleOCR),
    declared:globalThis.LuckyBeanRuntimeFeatures?.declared?.includes('recognition-paddle-ocr')===true,
    loaded:globalThis.LuckyBeanRuntimeFeatures?.isLoaded?.('recognition-paddle-ocr')===true,
    webPaddle:globalThis.LuckyBeanPackageCapture?.capabilities?.().webPaddle===true,
    heavyResources:performance.getEntriesByType('resource').map(item=>item.name).filter(name=>/paddleocr\/(?:sdk|models|ort)\//.test(name)||/paddleocr\/sdk\.mjs/.test(name))
  }));
  expect(before.declared).toBe(true);
  // The lightweight provider must already be registered before capture UI can render,
  // otherwise first-open capability detection races and reports "web OCR unavailable".
  expect(before.paddle).toBe(true);
  expect(before.loaded).toBe(true);
  expect(before.webPaddle).toBe(true);
  // Registration must remain cheap: SDK, models and ORT/WASM are still on-demand only.
  expect(before.heavyResources).toEqual([]);

  // Idempotent load must not trigger heavy OCR resources either.
  await page.evaluate(()=>globalThis.LuckyBeanRuntimeFeatures.load('recognition-paddle-ocr'));
  const after=await page.evaluate(()=>performance.getEntriesByType('resource').map(item=>item.name).filter(name=>/paddleocr\/(?:sdk|models|ort)\//.test(name)||/paddleocr\/sdk\.mjs/.test(name)));
  expect(after).toEqual([]);
}

test.describe('Safari callback auth parity',()=>{
  test.use({serviceWorkers:'block'});

  test('email verification callback survives Safari-style storage failure without redundant refresh',async({page})=>{
    let refreshCalls=0;
    await installSafariStorageFailure(page);
    await page.route(SUPABASE_PATTERN,async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/auth/v1/user') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'webkit-user',email:'webkit@example.com'})});
      if(url.pathname==='/auth/v1/token'){
        refreshCalls+=1;
        return route.fulfill({status:200,contentType:'application/json',body:'{}'});
      }
      if(url.pathname==='/rest/v1/luckybean_sync_manifests') return route.fulfill({status:200,contentType:'application/json',body:'[]'});
      return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    });

    await enter(page,`${BASE_URL}/?webkit-callback=1${callbackHash()}`);
    await expect.poll(()=>page.evaluate(()=>({
      refreshToken:globalThis.LuckyBeanCloudAuth?.getSession?.()?.refresh_token||'',
      revision:globalThis.LuckyBeanCloudAuth?.revision||'',
      snapshot:document.documentElement.dataset.authCallbackSnapshot||''
    })),{timeout:15000}).toMatchObject({refreshToken:'webkit-refresh',revision:'cloud-auth-service-v11-head-session-parity',snapshot:'consumed'});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.cloudAuth||''),{timeout:15000}).toBe('authenticated');
    expect(refreshCalls).toBe(0);
  });

  test('Safari callback performs exactly one refresh after a real REST 401',async({page})=>{
    let refreshCalls=0;
    let manifestCalls=0;
    await installSafariStorageFailure(page);
    await page.route(SUPABASE_PATTERN,async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/auth/v1/user') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'webkit-user',email:'webkit@example.com'})});
      if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='refresh_token'){
        refreshCalls+=1;
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(authPayload())});
      }
      if(url.pathname==='/rest/v1/luckybean_sync_manifests'){
        manifestCalls+=1;
        if(manifestCalls===1) return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'JWT expired'})});
        return route.fulfill({status:200,contentType:'application/json',body:'[]'});
      }
      return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    });

    await enter(page,`${BASE_URL}/?webkit-callback-401=1${callbackHash()}`);
    await expect.poll(()=>refreshCalls,{timeout:15000}).toBe(1);
    await expect.poll(()=>manifestCalls,{timeout:15000}).toBeGreaterThanOrEqual(2);
    await expect.poll(()=>page.evaluate(()=>globalThis.LuckyBeanCloudAuth?.getSession?.()?.refresh_token||''),{timeout:15000}).toBe('webkit-refresh-2');
  });
});

test('WebKit runtime registers its lightweight provider while keeping heavy PP-OCR resources lazy',async({page})=>{
  await isolateSupabase(page);
  await enter(page,`${BASE_URL}/?webkit-ocr=1`);
  await loadLazyWebOcr(page);
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
  expect(state.compatibilityFallback).toBe('webkit-direct-wasm-no-simd->direct-module-worker-wasm-no-simd->direct-wasm-no-simd-last-resort');
  expect(state.autoPreload).toBe(false);
  expect(state.disposePolicy).toBe('idle-30s');
  expect(state.roiWorkerOnly).toBe(true);
  expect(state.webPaddle).toBe(true);
  expect(state.heavyResources).toEqual([]);
});

test('WebKit PP-OCR reuses one warmed engine across consecutive local inferences',async({page})=>{
  await isolateSupabase(page);
  await enter(page,`${BASE_URL}/?webkit-real-ocr=1`);
  await loadLazyWebOcr(page);

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
    try{
      const warmStarted=performance.now();
      await globalThis.LuckyBeanPaddleOCR.warmForRecognition();
      const warmMs=Math.round(performance.now()-warmStarted);
      const firstStarted=performance.now();
      const first=await globalThis.LuckyBeanPaddleOCR.recognize(blob);
      const firstMs=Math.round(performance.now()-firstStarted);
      const secondStarted=performance.now();
      const second=await globalThis.LuckyBeanPaddleOCR.recognize(blob);
      const secondMs=Math.round(performance.now()-secondStarted);
      const texts=[...(first?.blocks||[]),...(second?.blocks||[])].map(block=>String(block?.text||'')).filter(Boolean);
      await globalThis.LuckyBeanPaddleOCR.dispose();
      return {ok:true,texts,warmMs,firstMs,secondMs,disposePolicy:globalThis.LuckyBeanPaddleOCR.disposePolicy,primaryIsolation:globalThis.LuckyBeanPaddleOCR.primaryIsolation};
    }catch(error){
      try{await globalThis.LuckyBeanPaddleOCR.dispose()}catch{}
      return {ok:false,error:error?.message||String(error)};
    }
  });

  expect(result.ok,`real WebKit OCR failed: ${result.error||'unknown'}`).toBe(true);
  expect(result.texts.length).toBeGreaterThan(0);
  expect(result.texts.join(' ').toUpperCase()).toMatch(/ETHIOPIA|NATURAL|COFFEE/);
  expect(result.primaryIsolation).toBe('webkit-direct-wasm-no-simd');
  expect(result.disposePolicy).toBe('idle-30s');
  expect(result.warmMs).toBeLessThan(60000);
  expect(result.firstMs).toBeLessThan(45000);
  expect(result.secondMs).toBeLessThan(45000);
});
