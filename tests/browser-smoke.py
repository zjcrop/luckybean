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
    page=await context.new_page()
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('console',lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
    html=(ROOT/'index.html').read_text()
    html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
    html=re.sub(r'<link rel="(?:manifest|icon|stylesheet)"[^>]*>','',html)
    html=re.sub(r'<script type="module"[^>]*></script>','',html)
    html=html.replace('</head>',f'<style>{(ROOT/"styles.css").read_text()}</style></head>')
    await page.set_content(html, wait_until='domcontentloaded')
    await page.add_script_tag(content=FAKE_IDB)
    await page.add_script_tag(content="class QRCodeStub{constructor(box){box.innerHTML='<canvas width=220 height=220></canvas>';}};QRCodeStub.CorrectLevel={L:1};globalThis.QRCode=QRCodeStub;")
    await page.add_script_tag(content=bundle())
    await page.wait_for_timeout(1000)

    results['title']=await page.title()
    results['login_visible']=await page.locator('#loginScreen').is_visible()
    await page.locator('#testBtn').click()
    await page.wait_for_selector('#appShell:not(.hidden)')
    await page.wait_for_timeout(500)

    results['cards']=await page.locator('.bean-card').count()
    results['first_demo_weight']=await page.locator('.bean-card strong').first.inner_text()
    results['nav']=await page.locator('.nav-button span').all_text_contents()
    results['headings']=await page.locator('.page-heading h1').all_text_contents()
    results['header_removed']=await page.locator('.app-header').count()==0
    results['profile_removed']=await page.locator('#profileBtn').count()==0
    results['page_kicker_removed']=await page.locator('.page-kicker').count()==0
    results['seal']={
      'background':await page.locator('#titleBeans').evaluate("e=>getComputedStyle(e).backgroundColor"),
      'font':await page.locator('#titleBeans').evaluate("e=>getComputedStyle(e).fontFamily"),
      'text':await page.locator('#titleBeans').inner_text()
    }
    await page.screenshot(path=str(ROOT/'docs/smoke-beans.png'),full_page=True)

    # Search: bottom sheet, options only from current beans.
    await page.locator('#fabSearchBtn').click()
    await page.wait_for_selector('[data-overlay="bean-search"]')
    sheet=await page.locator('[data-overlay="bean-search"] .dialog').bounding_box()
    results['search']={
      'bottom_sheet':bool(sheet and sheet['y']+sheet['height']>=840),
      'country_options':await page.locator('#searchCountry option').count(),
      'variety_options':await page.locator('#searchVariety option').count(),
      'process_options':await page.locator('#searchProcess option').count(),
      'flavor_count':await page.locator('[data-filter-flavor]').count(),
      'full_overlay':await page.locator('[data-overlay="bean-search"].full').count()
    }
    await page.evaluate("document.querySelector('[data-close-overlay]')?.click()")

    # Text recognition + bean form dependencies.
    await page.locator('#fabAddBtn').click()
    await page.locator('[data-add-mode="text"]').click()
    await page.fill('#recognitionText','埃塞俄比亚 古吉 日晒 埃塞原生种 浅烘 2026-07-20 海拔2100m 净重150g 茉莉 蓝莓 蜂蜜')
    await page.locator('#parseTextBtn').click()
    await page.wait_for_selector('#beanForm')
    region_count=await page.locator('#beanRegion option').count()
    await page.fill('#beanRoastColor','88')
    await page.wait_for_timeout(100)
    results['form']={
      'bean_name_removed':await page.locator('#beanName').count()==0,
      'country':await page.input_value('#beanCountry'),
      'region_options':region_count,
      'process':await page.input_value('#beanProcess'),
      'variety':await page.input_value('#beanVariety'),
      'weight':await page.input_value('#beanInitialWeight'),
      'roast_color':await page.input_value('#beanRoastColor'),
      'roast_auto':await page.input_value('#beanRoast'),
      'roast_disabled':await page.locator('#beanRoast').is_disabled(),
      'flavor_summary':await page.locator('#formFlavorSummary [data-summary-code]').count(),
      'control_radius':await page.locator('#beanInitialWeight').evaluate("e=>getComputedStyle(e).borderRadius")
    }
    await page.evaluate("document.querySelector('[data-close-overlay]')?.click()")

    # Detail and share.
    await page.locator('.bean-card').first.click()
    await page.wait_for_selector('[data-overlay="bean-detail"]')
    results['detail_buttons']={k:await page.locator(sel).is_visible() for k,sel in {'weight':'#correctWeightBtn','cold':'#toggleColdBtn','archive':'#archiveBeanBtn','share':'#shareBeanBtn'}.items()}
    await page.locator('#shareBeanBtn').click()
    await page.wait_for_selector('#shareLinkTab')
    await page.locator('#shareLinkTab').click()
    results['share']={'link_panel':await page.locator('#shareLinkPanel').is_visible(),'version_visible':'0.7.0' in await page.locator('[data-overlay="share"]').inner_text()}
    await page.evaluate("document.querySelector('[data-close-overlay]')?.click()")

    # Brew plan and timer.
    await page.locator('[data-page-target="brew"]').click()
    await page.wait_for_selector('#generatePlanBtn')
    results['brew_heading']=await page.locator('#titleBrew').inner_text()
    results['fab_hidden_brew']=not await page.locator('#fabWrap').is_visible()
    await page.locator('#generatePlanBtn').click()
    await page.wait_for_selector('#generatedPlan')
    results['plan']={
      'stages':await page.locator('.plan-stage').count(),
      'trajectory':await page.locator('.trajectory-chart').count(),
      'flavor_rows':await page.locator('.bar-row').count(),
      'low_temp_note':await page.locator('.low-temp-note').is_visible(),
      'auto_segment':'模型自动推荐' in await page.locator('#brewSegments option').first.inner_text(),
      'button_text':await page.locator('#generatePlanBtn').inner_text()
    }
    await page.screenshot(path=str(ROOT/'docs/smoke-brew.png'),full_page=True)
    await page.locator('#startBrewBtn').click()
    await page.wait_for_selector('#timerPauseBtn')
    await page.locator('#timerPauseBtn').click()
    clock1=await page.locator('#timerClock').inner_text()
    await page.wait_for_timeout(1200)
    clock2=await page.locator('#timerClock').inner_text()
    await page.locator('#timerNextBtn').click()
    results['timer']={'pause_works':clock1==clock2,'stage_after_next':await page.locator('#timerStageCounter').inner_text(),'total_remaining':await page.locator('#timerTotalRemaining').inner_text()}
    await page.locator('#timerExitBtn').click()
    await page.wait_for_selector('#skipConsumptionBtn')
    await page.locator('#skipConsumptionBtn').click()

    # Sensory history and record configuration entry.
    await page.locator('[data-page-target="sensory"]').click()
    await page.wait_for_selector('#sensoryHistoryToggle')
    results['sensory']={'collapsed_records':await page.locator('.sensory-history .record-item').count(),'history_label':await page.locator('#sensoryHistoryToggle span').first.inner_text()}
    await page.locator('#sensoryHistoryToggle').click()
    results['sensory']['expanded_max5']=await page.locator('.sensory-history .record-item').count()<=5
    results['sensory']['more_visible']=await page.locator('#sensoryMoreBtn').is_visible()
    await page.locator('#sensoryMoreBtn').click()
    await page.wait_for_selector('[data-overlay="sensory-records"]')
    results['sensory']['settings_char']=await page.locator('#sensoryRecordSettingsBtn').inner_text()
    await page.evaluate("document.querySelector('[data-close-overlay]')?.click()")

    # Settings hierarchy; technical information only appears inside About.
    await page.locator('[data-page-target="settings"]').click()
    await page.wait_for_selector('.settings-category')
    results['settings']={'categories':await page.locator('.settings-category > summary > span').all_text_contents(),'version_before_open':'0.7.0' in await page.locator('#settingsContent').inner_text()}
    about=page.locator('.settings-category').filter(has=page.locator('summary',has_text='本物'))
    await about.locator(':scope > summary').click()
    about_text=await about.inner_text()
    results['settings'].update({'version_after_open':'0.7.0' in about_text,'wechat':'zj_crop' in about_text,'xiaohongshu':'端茶倒水的秦始皇🐻' in about_text})
    data=page.locator('.settings-category').filter(has=page.locator('summary',has_text='数藏'))
    await data.locator(':scope > summary').click()
    results['settings']['api_hidden']=not await page.locator('#brewApiEndpoint').is_visible()
    await data.locator('.nested-settings > summary').click()
    results['settings']['api_revealed']=await page.locator('#brewApiEndpoint').is_visible()
    await page.screenshot(path=str(ROOT/'docs/smoke-settings.png'),full_page=True)

    await browser.close()
  checks = {
    'cards': results.get('cards') == 7,
    'nav': results.get('nav') == ['藏','拾','鉴','器'],
    'headings': results.get('headings') == ['豆藏','拾味','品鉴','器设'],
    'header_removed': results.get('header_removed') and results.get('profile_removed') and results.get('page_kicker_removed'),
    'seal': results.get('seal',{}).get('background') == 'rgb(166, 40, 35)' and 'FangSong' in results.get('seal',{}).get('font',''),
    'search_sheet': results.get('search',{}).get('bottom_sheet') and results.get('search',{}).get('full_overlay') == 0,
    'search_dynamic': 1 < results.get('search',{}).get('country_options',0) <= 8 and 1 < results.get('search',{}).get('variety_options',0) <= 8,
    'flavors': results.get('search',{}).get('flavor_count',0) > 0 and results.get('form',{}).get('flavor_summary',0) > 0,
    'form': results.get('form',{}).get('bean_name_removed') and results.get('form',{}).get('region_options',0) > 1 and results.get('form',{}).get('roast_auto') == 'RL-L1' and results.get('form',{}).get('roast_disabled') and results.get('form',{}).get('control_radius') == '0px',
    'share_version_hidden': not results.get('share',{}).get('version_visible'),
    'brew': results.get('brew_heading') == '拾味' and results.get('plan',{}).get('stages',0) >= 4 and results.get('plan',{}).get('trajectory') == 1 and results.get('plan',{}).get('flavor_rows') == 4 and results.get('plan',{}).get('low_temp_note') and results.get('plan',{}).get('auto_segment'),
    'timer': results.get('timer',{}).get('pause_works') and results.get('timer',{}).get('stage_after_next','').startswith('2/'),
    'sensory': results.get('sensory',{}).get('collapsed_records') == 0 and results.get('sensory',{}).get('history_label') == '往昔……' and results.get('sensory',{}).get('expanded_max5') and results.get('sensory',{}).get('more_visible') and results.get('sensory',{}).get('settings_char') == '设',
    'settings': results.get('settings',{}).get('categories') == ['账户','私器','数藏','本物'] and not results.get('settings',{}).get('version_before_open') and results.get('settings',{}).get('version_after_open') and results.get('settings',{}).get('wechat') and results.get('settings',{}).get('xiaohongshu') and results.get('settings',{}).get('api_hidden') and results.get('settings',{}).get('api_revealed'),
  }
  output={'results':results,'checks':checks,'page_errors':errors,'console':logs}
  (ROOT/'docs/browser-smoke-result.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
  print(json.dumps(output,ensure_ascii=False,indent=2))
  if errors or any(line.startswith('error:') for line in logs) or not all(checks.values()): raise SystemExit(1)

asyncio.run(main())
