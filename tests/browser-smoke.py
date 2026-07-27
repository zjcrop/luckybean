import asyncio, json, re, base64
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]

FAKE_IDB=r'''
(() => {
  const databases = new Map();
  class NameList {
    constructor(record){this.record=record;}
    contains(name){return this.record.stores.has(name);}
    [Symbol.iterator](){return this.record.stores.keys();}
  }
  function request(action){
    const req={result:undefined,error:null,onsuccess:null,onerror:null};
    setTimeout(()=>{try{req.result=action();req.onsuccess?.({target:req});}catch(e){req.error=e;req.onerror?.({target:req});}},0);
    return req;
  }
  function dbObject(record){
    return {
      objectStoreNames:new NameList(record),
      createObjectStore(name,options={}){record.stores.set(name,{map:new Map(),keyPath:options.keyPath||'id'});return {};},
      transaction(name,mode='readonly'){
        const tx={oncomplete:null,onerror:null,onabort:null,error:null};
        tx.objectStore=(storeName)=>{
          const store=record.stores.get(storeName); if(!store) throw new Error('store not found '+storeName);
          return {
            getAll:()=>request(()=>[...store.map.values()].map(v=>structuredClone(v))),
            get:(key)=>request(()=>store.map.has(key)?structuredClone(store.map.get(key)):undefined),
            put:(value)=>request(()=>{const key=value[store.keyPath];if(key===undefined)throw new Error('missing key');store.map.set(key,structuredClone(value));return key;}),
            delete:(key)=>request(()=>store.map.delete(key)),
            clear:()=>request(()=>{store.map.clear();})
          };
        };
        setTimeout(()=>tx.oncomplete?.(),20);
        return tx;
      },
      close(){}
    };
  }
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,writable:true,value:{
    open(name,version){
      const req={result:null,error:null,onsuccess:null,onerror:null,onupgradeneeded:null,transaction:null};
      setTimeout(()=>{
        let record=databases.get(name);const fresh=!record;
        if(!record){record={version:version||1,stores:new Map()};databases.set(name,record);}
        const tx={aborted:false,abort(){this.aborted=true;}};req.transaction=tx;req.result=dbObject(record);
        if(fresh) req.onupgradeneeded?.({target:req});
        setTimeout(()=>{
          if(tx.aborted){databases.delete(name);req.error=new Error('AbortError');req.onerror?.({target:req});}
          else req.onsuccess?.({target:req});
        },0);
      },0);return req;
    },
    deleteDatabase(name){databases.delete(name);return request(()=>undefined);}
  }});
})();
'''

def bundle():
    parts=[]
    for name in ['utils.js','db.js','codebook.js','qr.js','brew-engine.js','app.js']:
        text=(ROOT/'src'/name).read_text()
        text=re.sub(r'^import\s+.*?;\s*$', '', text, flags=re.M)
        text=re.sub(r'\bexport\s+', '', text)
        parts.append(f'\n/* {name} */\n{text}')
    code='\n'.join(parts)
    cb=base64.b64encode((ROOT/'public/fallback-codebook.json').read_bytes()).decode()
    lm=base64.b64encode((ROOT/'public/legacy-flavor-map.json').read_bytes()).decode()
    code=code.replace("const FALLBACK_CODEBOOK_URL = './public/fallback-codebook.json';", f"const FALLBACK_CODEBOOK_URL = 'data:application/json;base64,{cb}';")
    code=code.replace("fetch('./public/legacy-flavor-map.json')", f"fetch('data:application/json;base64,{lm}')")
    return code

async def main():
  errors=[]; logs=[]; results={}
  async with async_playwright() as p:
    browser=await p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    context=await browser.new_context(viewport={"width":390,"height":844}, locale='zh-CN', service_workers='block')
    page=await context.new_page();page.on('pageerror',lambda e: errors.append(str(e)));page.on('console',lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
    html=(ROOT/'index.html').read_text();html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html);html=re.sub(r'<link rel="(?:manifest|icon|stylesheet)"[^>]*>','',html);html=re.sub(r'<script type="module"[^>]*></script>','',html);html=html.replace('</head>',f'<style>{(ROOT/"styles.css").read_text()}</style></head>')
    await page.set_content(html, wait_until='domcontentloaded')
    await page.add_script_tag(content=FAKE_IDB)
    await page.add_script_tag(content="class QRCodeStub{constructor(box){box.innerHTML='<canvas width=220 height=220></canvas>';}};QRCodeStub.CorrectLevel={L:1};globalThis.QRCode=QRCodeStub;")
    await page.add_script_tag(content=bundle())
    await page.wait_for_timeout(800)
    results['title']=await page.title();results['login_visible']=await page.locator('#loginScreen').is_visible()
    await page.locator('#testBtn').click();await page.wait_for_selector('#appShell:not(.hidden)');await page.wait_for_timeout(300)
    results['cards']=await page.locator('.bean-card').count();results['first_demo_weight']=await page.locator('.bean-card strong').first.inner_text();results['nav']=await page.locator('.nav-button span').all_text_contents();results['headings']=await page.locator('.page-heading h1').all_text_contents();results['fab_visible']=await page.locator('#fabWrap').is_visible();await page.screenshot(path=str(ROOT/'docs/smoke-beans.png'),full_page=True)
    await page.locator('.bean-card').first.click();await page.wait_for_selector('[data-overlay="bean-detail"]');results['detail_buttons']={k:await page.locator(sel).is_visible() for k,sel in {'weight':'#correctWeightBtn','cold':'#toggleColdBtn','archive':'#archiveBeanBtn','share':'#shareBeanBtn'}.items()};await page.locator('#shareBeanBtn').click();await page.wait_for_selector('#shareLinkTab');await page.locator('#shareLinkTab').click();results['share']={'link_panel':await page.locator('#shareLinkPanel').is_visible(),'copy':await page.locator('#copyShareLinkBtn').is_enabled(),'html_save':await page.locator('#saveShareHtmlBtn').is_enabled(),'local_note':await page.locator('#shareLocalNote').is_visible()};await page.locator('[data-close-overlay]').click()
    await page.locator('#fabSearchBtn').click();await page.wait_for_selector('#searchInput');results['search_fields']=all([await page.locator(x).is_visible() for x in ['#searchInput','#searchCountry','#searchProcess','#searchSort','#searchDir']]);results['filter_flavor_count']=await page.locator('[data-filter-flavor]').count();results['recommended_sort']=await page.locator('#searchSort option[value=recommended]').count()==1;await page.locator('[data-close-overlay]').click()
    await page.locator('#fabAddBtn').click();await page.locator('[data-add-mode="text"]').click();await page.fill('#recognitionText','埃塞俄比亚 古吉 日晒 埃塞原生种 浅烘 2026-07-20 海拔2100m 净重150g 茉莉 蓝莓 蜂蜜');await page.locator('#parseTextBtn').click();await page.wait_for_selector('#beanForm')
    results['form']={'country':await page.input_value('#beanCountry'),'process':await page.input_value('#beanProcess'),'variety':await page.input_value('#beanVariety'),'weight':await page.input_value('#beanInitialWeight'),'remaining_input':await page.locator('#beanRemainingWeight').count(),'recommended_fields':await page.locator('.form-field.is-recommended').count(),'required_fields':await page.locator('.form-field.required').count()};await page.locator('[data-close-overlay]').click()
    await page.locator('[data-page-target="brew"]').click();await page.wait_for_selector('#generatePlanBtn');results['fab_hidden_brew']=not await page.locator('#fabWrap').is_visible();await page.locator('#generatePlanBtn').click();await page.wait_for_selector('#generatedPlan')
    results['plan']={'stages':await page.locator('.plan-stage').count(),'stage_indexes':await page.locator('.stage-index').all_text_contents(),'details_open':await page.locator('.details-block[open]').count(),'source_text':await page.locator('#generatedPlan .panel-title p').inner_text(),'button_text':await page.locator('#generatePlanBtn').inner_text()};await page.screenshot(path=str(ROOT/'docs/smoke-brew.png'),full_page=True)
    await page.locator('#startBrewBtn').click();await page.wait_for_selector('#timerPauseBtn');await page.locator('#timerPauseBtn').click();clock1=await page.locator('#timerClock').inner_text();await page.wait_for_timeout(1200);clock2=await page.locator('#timerClock').inner_text();results['pause_works']=clock1==clock2;await page.locator('#timerExitBtn').click();await page.wait_for_selector('#recordConsumptionBtn');results['consume_modal']=await page.locator('#skipConsumptionBtn').is_visible();await page.locator('#recordConsumptionBtn').click()
    await page.wait_for_selector('.sensory-progress');results['sensory_progress']=await page.locator('.sensory-progress span').count();results['sensory_options']=await page.locator('.sensory-option').count();await page.locator('#nextSensoryNodeBtn').click();results['sensory_empty_blocked']='1. 花香' in await page.locator('#sensoryContent h2').last.inner_text()
    for node_index in range(8):
      group_indexes=await page.locator('.sensory-option').evaluate_all("buttons => [...new Set(buttons.map(button => button.dataset.groupIndex))]")
      for group_index in group_indexes:
        options=page.locator(f'.sensory-option[data-group-index="{group_index}"]')
        no_option=options.filter(has_text='无')
        if await no_option.count(): await no_option.first.click()
        else: await options.first.click()
      await page.locator('#nextSensoryNodeBtn').click()
    await page.fill('#sensoryScore','82');await page.locator('#nextSensoryNodeBtn').click();await page.wait_for_selector('[data-overlay="bean-detail"]')
    detail_text=await page.locator('[data-overlay="bean-detail"]').inner_text();results['sensory_advances_after_choice']=True;results['evaluation_returns_detail']=True;results['inventory_consumed']='剩余 123.0g' in detail_text;await page.locator('[data-close-overlay]').click()
    await page.locator('[data-page-target="settings"]').click();results['settings']={'codebook':await page.locator('#updateCodebookBtn').is_visible(),'api':await page.locator('#brewApiEndpoint').is_visible(),'identity':await page.locator('#saveIdentityBtn').is_visible(),'version':await page.locator('#aboutVersionBtn').inner_text()};await page.screenshot(path=str(ROOT/'docs/smoke-settings.png'),full_page=True)
    await browser.close()
  print(json.dumps({'results':results,'page_errors':errors,'console':logs},ensure_ascii=False,indent=2))

asyncio.run(main())
