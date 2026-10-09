import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});
test.setTimeout(60000);

async function openCapture(page,failedStage){
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort());
  await page.addInitScript(()=>localStorage.setItem('luckybean.onboarding.v2',JSON.stringify({stage:'existing-user',updatedAt:new Date().toISOString(),reason:'capture-recovery'})));
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  const splash=page.locator('#splashScreen');
  if(await splash.isVisible())await splash.click();
  await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready',null,{timeout:20000});
  await page.waitForFunction(()=>Boolean(globalThis.LuckyBeanRuntimeFeatures?.loadMany));
  await page.evaluate(async stage=>{
    await globalThis.LuckyBeanRuntimeFeatures.loadMany(['recognition-paddle-ocr','gallery-image-preprocess','package-capture']);
    globalThis.__recoveryCalls=0;
    const provider=globalThis.LuckyBeanPaddleOCR;
    globalThis.LuckyBeanPaddleOCR={...provider,beginSession:async()=>null,warmForRecognition:async()=>null,
      recognizeCoffeeBag:async images=>{
        globalThis.__recoveryCalls++;
        if(stage==='ocr'&&globalThis.__recoveryCalls===1){const error=new Error('Injected OCR timeout');error.name='RecognitionTimeoutError';throw error;}
        const text='COUNTRY: Panama\nVARIETY: Gesha\nPROCESS: Washed\nROAST DATE: 2026-09-20\nNET WEIGHT: 15g';
        return {engine:'capture-recovery-fixture',fullText:text,blocks:text.split('\n').map((line,index)=>({imageId:images[0].id,text:line,confidence:0.99,polygon:[[20,20+index*40],[500,20+index*40],[500,45+index*40],[20,45+index*40]]}))};
      }
    };
    if(stage==='gallery'){
      globalThis.__realGallery=globalThis.LuckyBeanGalleryImagePreprocess;
      globalThis.LuckyBeanGalleryImagePreprocess={...globalThis.__realGallery,preprocessFiles:async files=>{globalThis.__originalRetryFile=files[0];throw new Error('Injected gallery timeout');}};
    }
    globalThis.LuckyBeanPackageCapture.open();
  },failedStage);
  const bytes=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,800);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#bagGalleryBtn').click()]);
  await chooser.setFiles({name:'capture-recovery.jpg',mimeType:'image/jpeg',buffer:Buffer.from(bytes)});
}

for(const stage of ['gallery','ocr'])test(stage+' failure retains photos and survives P3 normalization until explicit retry',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await openCapture(page,stage);
  const retry=page.locator('#bagRetryRecognitionBtn');
  await expect(retry).toBeVisible();await expect(retry).toBeEnabled();
  await page.waitForTimeout(250); // Allow both production normalization observers to run.
  await expect(retry).toBeVisible();
  await expect(page.locator('#bagOcrText')).toHaveCount(0);
  await expect(page.locator('#bagHandoffBtn')).toBeDisabled();
  await expect(page.locator('[data-overlay="recognition-preflight"]')).toHaveCount(0);
  if(stage==='gallery')await page.evaluate(()=>{
    const original=globalThis.__realGallery;
    globalThis.LuckyBeanGalleryImagePreprocess={...original,preprocessFiles:async files=>{
      if(files[0]!==globalThis.__originalRetryFile)throw new Error('Original file lost across retry');
      return original.preprocessFiles(files);
    }};
  });
  await retry.click();
  await expect(page.locator('[data-overlay="recognition-preflight"]')).toBeVisible({timeout:20000});
  await expect(page.locator('[data-overlay="recognition-preflight"]')).toContainText('巴拿马');
  await page.locator('#preflightConfirmBtn').click();
  await expect(page.locator('#beanInitialWeight')).toHaveValue('15');
  await expect(page.locator('#beanRoastDate')).toHaveValue('2026-09-20');
  expect(errors).toEqual([]);
});
