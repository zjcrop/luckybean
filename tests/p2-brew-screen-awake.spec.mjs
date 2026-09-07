import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    globalThis.__p2NativeAwake=[];
    globalThis.__p2WakeRequests=[];
    globalThis.__p2WakeSentinels=[];
    globalThis.LuckyBeanNative={
      setBrewScreenAwake(value){ globalThis.__p2NativeAwake.push(Boolean(value)); }
    };
    Object.defineProperty(navigator,'wakeLock',{
      configurable:true,
      value:{
        async request(type){
          globalThis.__p2WakeRequests.push(type);
          const listeners=new Map();
          const sentinel={
            released:false,
            addEventListener(name,handler){ listeners.set(name,handler); },
            async release(){
              if(this.released) return;
              this.released=true;
              listeners.get('release')?.();
            }
          };
          globalThis.__p2WakeSentinels.push(sentinel);
          return sentinel;
        }
      }
    });
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort('failed'));
  await page.goto(`${BASE_URL}/?p2-brew-screen-awake=1`,{waitUntil:'domcontentloaded'});
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({timeout:15000});
  await page.waitForFunction(()=>Boolean(globalThis.LuckyBeanBrewScreenAwake),null,{timeout:15000});
});

test('brew timer acquires native and web screen-awake locks and releases both when timer closes',async({page})=>{
  const active=await page.evaluate(async()=>{
    const root=document.querySelector('#overlayRoot');
    root.innerHTML='<div class="overlay full" data-overlay="timer"><div class="dialog">timer</div></div>';
    await globalThis.LuckyBeanBrewScreenAwake.sync();
    return {
      native:[...globalThis.__p2NativeAwake],
      requests:[...globalThis.__p2WakeRequests],
      active:globalThis.LuckyBeanBrewScreenAwake.active()
    };
  });
  expect(active.active).toBe(true);
  expect(active.native.at(-1)).toBe(true);
  expect(active.requests.at(-1)).toBe('screen');

  const inactive=await page.evaluate(async()=>{
    document.querySelector('#overlayRoot').innerHTML='';
    await globalThis.LuckyBeanBrewScreenAwake.sync();
    return {
      native:[...globalThis.__p2NativeAwake],
      released:globalThis.__p2WakeSentinels.map(item=>item.released),
      active:globalThis.LuckyBeanBrewScreenAwake.active()
    };
  });
  expect(inactive.active).toBe(false);
  expect(inactive.native.at(-1)).toBe(false);
  expect(inactive.released.at(-1)).toBe(true);
});

test('screen-awake controller does not duplicate native transitions while timer state is unchanged',async({page})=>{
  const result=await page.evaluate(async()=>{
    const root=document.querySelector('#overlayRoot');
    root.innerHTML='<div data-overlay="timer"></div>';
    await globalThis.LuckyBeanBrewScreenAwake.sync();
    await globalThis.LuckyBeanBrewScreenAwake.sync();
    await globalThis.LuckyBeanBrewScreenAwake.sync();
    return [...globalThis.__p2NativeAwake];
  });
  const trueCalls=result.filter(Boolean);
  expect(trueCalls).toHaveLength(1);
});
