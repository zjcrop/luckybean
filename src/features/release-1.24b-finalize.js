import { all, getSetting, setSetting, put } from '../db.js';
import { preparePackageImage } from '../image-quality.js';
import { recognizeCoffeeBag } from '../recognition-bridge.js';
import { normalizeBeanRecord, beanCardVisualState, markBeanInTransit, LOCAL_BREW_METHODS } from '../release-1.24b.js';
import { parseCoffeeOrderText } from '../domain/recognition/order-recognition-1.24b.js';
import { LOCAL_BREW_RECIPES_124B, LOCAL_BEVERAGE_RECIPES_124B } from '../data/local-brew-recipes-1.24b.js';

const $=(s,r=document)=>r?.querySelector?.(s)||null;
const $$=(s,r=document)=>[...(r?.querySelectorAll?.(s)||[])];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let observing=false;

function notice(message,kind='status-good'){document.dispatchEvent(new CustomEvent('luckybean:user-notice',{detail:{message,kind}}));}
function refresh(source){document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh',{detail:{source}}));}
function closeOverlay(){ $('#overlayRoot')?.replaceChildren(); }

async function fixBeanDetail(){
  const overlay=$('#overlayRoot > [data-overlay="bean-detail"]'); if(!overlay||overlay.dataset.lbFinalized)return;
  overlay.dataset.lbFinalized='1';
  $('#correctWeightBtn',overlay)?.remove();
  const stack=$('.management-stack',overlay), edit=$('#editBeanBtn',overlay);
  if(stack&&edit){stack.prepend(edit);stack.classList.add('lb-bean-actions');}
  const cold=$('#toggleColdBtn',overlay); if(cold&&!/^❄/.test(cold.textContent||''))cold.textContent='冷藏';
  const beanId=overlay.closest('#overlayRoot') ? document.querySelector('.bean-card.recommended')?.dataset?.beanId : '';
  const header=$('.dialog-header h2',overlay);
  if(header&&/未定国家/.test(header.textContent||'')){
    const id=window.__lbLastBeanId||''; const bean=id?await (await import('../db.js')).get('beans',id).catch(()=>null):null;
    if(bean?.name)header.textContent=bean.name;
  }
}

function addSwipeClose(){
  const root=$('#beanGroups');if(!root||root.dataset.lbSwipeClose)return;root.dataset.lbSwipeClose='1';
  let start=null;
  root.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;start={x:e.clientX,y:e.clientY,id:e.pointerId};},{passive:true});
  root.addEventListener('pointerup',e=>{if(!start||start.id!==e.pointerId)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>=70&&Math.abs(dx)>Math.abs(dy)*1.4){const panel=$('[data-active-group-panel]',root);if(panel)panel.dispatchEvent(new MouseEvent('click',{bubbles:true}));}},{passive:true});
}

async function addTransitCards(){
  const host=$('#beanGroups');if(!host)return;
  const beans=await all('beans').catch(()=>[]);
  const transit=beans.filter(bean=>!bean.archived&&!bean.deletedAt&&!bean.recycledAt&&!bean.trashAt&&!bean.tombstoneAt&&!bean.isDeleted&&!bean._deleted&&!bean.deleted&&beanCardVisualState(bean).usable===false);
  let section=$('[data-lb-transit-section]',host);
  if(!transit.length){section?.remove();return;}
  const html=transit.map(bean=>{const n=normalizeBeanRecord(bean);const price=n.purchase?.paidPrice!=null?`${n.purchase.currency||'CNY'} ${n.purchase.paidPrice}`:'';const weight=n.purchase?.weight?`${Number(n.purchase.weight).toFixed(0)}g`:'';return `<article class="bean-card compact lb-bean-card" data-tone="muted" data-bean-id="${esc(bean.id)}" tabindex="0"><div class="compact-bean-copy"><h3>${esc(bean.name||n.purchase?.productName||'在途咖啡豆')}</h3><small>${esc([n.purchase?.merchant,n.logistics?.status==='in_transit'?'在途':'已下单'].filter(Boolean).join(' · '))}</small><div class="compact-bean-row"><strong>${esc(weight||'待入库')}</strong><span class="compact-score">${esc(price||'已购买')}</span></div></div><span class="cup-action compact-pick" aria-label="在途豆不可冲煮">在途</span></article>`;}).join('');
  if(!section){section=document.createElement('section');section.dataset.lbTransitSection='1';section.className='lb-transit-section';host.prepend(section);}
  section.innerHTML=`<div class="bean-grid compact-grid">${html}</div>`;
}

function bindLastBean(){document.addEventListener('click',e=>{const card=e.target.closest?.('.bean-card[data-bean-id]');if(card)window.__lbLastBeanId=card.dataset.beanId||'';},true);}

function enhanceAddMenu(){
  $$('.popup-menu').forEach(menu=>{
    if(!menu.querySelector('[data-add-mode]')||menu.querySelector('[data-lb-order-add]'))return;
    const b=document.createElement('button');b.type='button';b.dataset.lbOrderAdd='1';b.textContent='订单录入';menu.append(b);
  });
}

function bindAndroidImage(id,nativeSource){
  if(!nativeSource||!globalThis.__LUCKYBEAN_ANDROID__||typeof globalThis.LuckyBeanNative?.bindImageSource!=='function')return;
  try{globalThis.LuckyBeanNative.bindImageSource(String(id),false);}catch{}
}

function openOrderEntry(){
  closeOverlay(); const root=$('#overlayRoot');if(!root)return;
  root.innerHTML=`<div class="overlay full" data-overlay="lb-order-entry"><div class="dialog"><div class="dialog-header"><div><h2>订单录入</h2><p>支持订单页/商品页截图；只提取咖啡购买字段，不保存手机号和地址。</p></div><button class="close-button" type="button">×</button></div><input id="lbOrderImages" type="file" accept="image/*" multiple><textarea id="lbOrderText" class="control" rows="9" placeholder="也可直接粘贴订单文字"></textarea><p class="muted small" data-lb-order-status>多张图片按 IMG-001、IMG-002… 顺序单进程识别。</p><div class="row end"><button class="button" type="button" data-lb-order-recognize>识别图片</button><button class="button primary" type="button" data-lb-order-save>建立在途豆卡</button></div></div></div>`;
  const overlay=root.firstElementChild;overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('.close-button'))closeOverlay();});
  $('[data-lb-order-recognize]',overlay)?.addEventListener('click',()=>recognizeOrderImages(overlay));
  $('[data-lb-order-save]',overlay)?.addEventListener('click',()=>saveOrderBean(overlay));
}

async function recognizeOrderImages(overlay){
  const files=[...($('#lbOrderImages',overlay)?.files||[])].filter(f=>f.type.startsWith('image/')).slice(0,8);if(!files.length)return notice('请先选择订单或商品图片','status-warn');
  const status=$('[data-lb-order-status]',overlay);const images=[];
  for(let i=0;i<files.length;i+=1){status.textContent=`准备图片 ${i+1}/${files.length}`;const prepared=await preparePackageImage(files[i]);const id=`order_${Date.now().toString(36)}_${String(i+1).padStart(3,'0')}`;bindAndroidImage(id,prepared.nativeSource);images.push({id,role:'order',roleLabel:`订单图片 ${i+1}`,blob:prepared.blob,nativeSource:Boolean(prepared.nativeSource)});}
  try{
    const result=await recognizeCoffeeBag(images,{locale:'zh-CN',onProgress:p=>{status.textContent=`${p.taskId} · ${p.status==='processing'?'识别中':'完成'} (${p.order}/${p.total})`;}});
    $('#lbOrderText',overlay).value=result.fullText||'';status.textContent=`识别完成：${files.length} 张图片，严格串行处理。`;
  }catch(error){status.textContent=`识别失败：${error.message}`;}
}

async function saveOrderBean(overlay){
  const text=$('#lbOrderText',overlay)?.value?.trim()||'';if(!text)return notice('没有可解析的订单文字','status-warn');
  const parsed=parseCoffeeOrderText(text);const purchase={...parsed.purchase,productName:parsed.productName};
  let orderIdHash=null;if(parsed.purchase.orderId&&crypto?.subtle){const data=new TextEncoder().encode(parsed.purchase.orderId);const digest=await crypto.subtle.digest('SHA-256',data);orderIdHash=[...new Uint8Array(digest)].slice(0,12).map(v=>v.toString(16).padStart(2,'0')).join('');}
  delete purchase.orderId;purchase.orderIdHash=orderIdHash;
  const id=`bean_${crypto.randomUUID?.()||Date.now().toString(36)}`;
  const base={id,name:parsed.productName||'在途咖啡豆',initialWeight:Number(parsed.purchase.weight||0),remainingWeight:0,price:Number(parsed.purchase.paidPrice||0),roasterName:parsed.purchase.merchant||'',source:'order-ocr',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),recognitionMetadata:{documentType:'order_page',privacyRedactions:parsed.privacyRedactions}};
  const record=markBeanInTransit(base,purchase);record.logistics.status=parsed.logisticsStatus||'in_transit';await put('beans',record);closeOverlay();refresh('order-in-transit-created');notice('在途豆卡已建立，订单购买信息已保存','status-good');
}

async function brewExtraSettings(){const s=await getSetting('app.settings',{})||{};s.brew||={};s.brew.extMethod||='pourover';s.brew.beverageRecipe||='';return s;}
async function saveBrewExtra(method,beverage){const s=await brewExtraSettings();s.brew.extMethod=method;s.brew.beverageRecipe=beverage;await setSetting('app.settings',s);}

async function enhanceBrewMethods(){
  const root=$('#brewContent');if(!root||root.dataset.lbMethodBusy)return;root.dataset.lbMethodBusy='1';
  try{
    const s=await brewExtraSettings();let row=$('[data-lb-local-method-row]',root);
    if(!row){row=document.createElement('div');row.className='lb-local-method-row';row.dataset.lbLocalMethodRow='1';row.innerHTML=`<select class="control" data-lb-extraction aria-label="萃取方式"><option value="pourover">手冲</option>${LOCAL_BREW_METHODS.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select><select class="control" data-lb-beverage aria-label="制作方式"><option value="">原液 / 不追加</option>${Object.entries(LOCAL_BEVERAGE_RECIPES_124B).map(([id,x])=>`<option value="${esc(id)}">${esc(x.name)}</option>`).join('')}</select>`;const note=$('.lb-auto-note',root);(note||root.firstChild)?.after?.(row);if(!row.parentNode)root.prepend(row);}
    $('[data-lb-extraction]',row).value=s.brew.extMethod||'pourover';$('[data-lb-beverage]',row).value=s.brew.beverageRecipe||'';
    const apply=async()=>{const method=$('[data-lb-extraction]',row).value,bev=$('[data-lb-beverage]',row).value;await saveBrewExtra(method,bev);applyMethodState(root,method,bev);};
    if(!row.dataset.bound){row.dataset.bound='1';$('[data-lb-extraction]',row).addEventListener('change',apply);$('[data-lb-beverage]',row).addEventListener('change',apply);}
    applyMethodState(root,s.brew.extMethod||'pourover',s.brew.beverageRecipe||'');
  }finally{root.dataset.lbMethodBusy='';}
}

function applyMethodState(root,method,beverage){
  $$('.lb-disabled-for-method',root).forEach(n=>n.classList.remove('lb-disabled-for-method'));
  $('[data-lb-local-recipe]',root)?.remove();
  if(method==='pourover')return;
  const disabledTerms=/滤杯|滤纸|首段|尾段|降温|风味设定|环境细节|调水方案/;
  $$('.field,.brew-row',root).forEach(node=>{if(disabledTerms.test(node.textContent||''))node.classList.add('lb-disabled-for-method');});
  $$('button',root).forEach(button=>{if(/开始冲煮|倒计时|播放流程|生成方案/.test(button.textContent||''))button.classList.add('lb-disabled-for-method');});
  const recipe=LOCAL_BREW_RECIPES_124B[method],drink=beverage?LOCAL_BEVERAGE_RECIPES_124B[beverage]:null;if(!recipe&&!drink)return;
  const panel=document.createElement('section');panel.className='lb-local-recipe';panel.dataset.lbLocalRecipe='1';panel.innerHTML=`${recipe?`<strong>${esc(recipe.name)}</strong><p class="muted small">${esc([recipe.dose,recipe.water,recipe.temperature,`研磨 ${recipe.grind}`].filter(Boolean).join(' · '))}</p><ol>${recipe.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}${drink?`<strong>${esc(drink.name)}</strong><ol>${drink.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}<p class="muted small">本地制作流程仅显示步骤与细节，不启动倒计时，也不发送到 BrewProfiles 手冲计算。</p>`;root.append(panel);
}

function enhanceCoolingHelp(){
  const overlay=$('#overlayRoot > [data-overlay="cooling-mode"]');if(!overlay||$('[data-lb-cooling-note]',overlay))return;
  const btn=document.createElement('button');btn.type='button';btn.className='lb-help-note-button';btn.dataset.lbCoolingNote='1';btn.textContent='*注';$('.dialog-header',overlay)?.after(btn);btn.addEventListener('click',()=>{
    const first=/首段/.test($('.dialog-header h2',overlay)?.textContent||'');
    const text=first?'首段降温用于改变前段粉床升温和溶解动力学。适用于希望降低初段热冲击、控制前段提取速度的方案；它并不等同于“降低酸度”。幅度应以方案计算值为准。':'尾段降温用于在接近目标萃取后降低后段继续高温提取的推动力，可用于控制苦、涩等后段风险。幅度应由方案计算值决定，不使用固定降温量。';
    notice(text,'status-good');
  });
}

function showRegistrationPending(email){setTimeout(()=>{const root=$('#overlayRoot');if(!root)return;root.innerHTML=`<div class="overlay" data-overlay="lb-registration-pending"><div class="dialog"><div class="dialog-header"><div><h2>注册信息已提交</h2><p>激活邮件已发送至 ${esc(email||'注册邮箱')}</p></div><button class="close-button" type="button">×</button></div><p>请查收邮件并点击链接激活账户。完成激活后使用相同邮箱和密码登录。</p><div class="row end"><button class="button primary" type="button" data-lb-open-login>我已完成激活</button></div></div></div>`;const o=root.firstElementChild;o.addEventListener('click',e=>{if(e.target===o||e.target.closest('.close-button'))closeOverlay();if(e.target.closest('[data-lb-open-login]'))globalThis.LuckyBeanCloudAuth?.openDialog?.('login','请输入激活后的账号密码',{email});});},30);}

function installGrinderCalibration(){
  document.addEventListener('click',async e=>{const add=e.target.closest?.('[data-add-gear="grinder"]'),item=e.target.closest?.('[data-grinder-item]');if(!add&&!item)return;e.preventDefault();e.stopImmediatePropagation();const s=await getSetting('app.settings',{})||{};s.gear||={};s.gear.grinders=Array.isArray(s.gear.grinders)?s.gear.grinders:[];const id=item?.dataset.grinderItem||'';const g=s.gear.grinders.find(x=>String(x.id)===String(id))||{};const root=$('#overlayRoot');root.innerHTML=`<div class="overlay" data-overlay="lb-grinder-editor"><div class="dialog"><div class="dialog-header"><div><h2>${id?'编辑磨豆机':'添加磨豆机'}</h2><p>三点刻度用于把方案研磨要求映射到具体设备。</p></div><button class="close-button">×</button></div><div class="grid-2"><label class="field"><span>名称 *</span><input class="control" data-g-name value="${esc(g.name||'')}"></label><label class="field"><span>当前刻度</span><input class="control" data-g-setting value="${esc(g.setting||'')}"></label><label class="field"><span>较细刻度 *</span><input class="control" data-g-fine type="number" step="0.1" value="${esc(g.fineAnchor??'')}"></label><label class="field"><span>中间刻度 *</span><input class="control" data-g-mid type="number" step="0.1" value="${esc(g.midAnchor??'')}"></label><label class="field"><span>较粗刻度 *</span><input class="control" data-g-coarse type="number" step="0.1" value="${esc(g.coarseAnchor??'')}"></label><label class="field"><span>价格</span><input class="control" data-g-price type="number" min="0" step="0.01" value="${Number(g.price||0)}"></label></div><div class="row end"><button class="button primary" data-g-save>确定</button></div></div></div>`;const o=root.firstElementChild;o.addEventListener('click',ev=>{if(ev.target===o||ev.target.closest('.close-button'))closeOverlay();});$('[data-g-save]',o).addEventListener('click',async()=>{const name=$('[data-g-name]',o).value.trim(),fine=Number($('[data-g-fine]',o).value),mid=Number($('[data-g-mid]',o).value),coarse=Number($('[data-g-coarse]',o).value);if(!name||![fine,mid,coarse].every(Number.isFinite))return notice('名称和细/中/粗三点刻度均为必填项','status-warn');const rec={...g,id:g.id||`grinder_${crypto.randomUUID?.()||Date.now()}`,name,setting:$('[data-g-setting]',o).value.trim(),fineAnchor:fine,midAnchor:mid,coarseAnchor:coarse,price:Math.max(0,Number($('[data-g-price]',o).value)||0),createdAt:g.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};const i=s.gear.grinders.findIndex(x=>String(x.id)===String(rec.id));if(i>=0)s.gear.grinders[i]=rec;else s.gear.grinders.push(rec);await setSetting('app.settings',s);closeOverlay();refresh('grinder-calibration-saved');notice('研磨设备三点刻度已保存');});
  },true);
}

function observe(){if(observing)return;observing=true;const run=()=>{fixBeanDetail();addTransitCards();enhanceAddMenu();enhanceBrewMethods();enhanceCoolingHelp();};new MutationObserver(run).observe(document.documentElement,{subtree:true,childList:true});run();}

bindLastBean();addSwipeClose();installGrinderCalibration();document.addEventListener('luckybean:cloud-registration-pending',e=>showRegistrationPending(e.detail?.email||''));document.addEventListener('click',e=>{if(e.target.closest?.('[data-lb-order-add]')){e.preventDefault();openOrderEntry();}},true);observe();
console.info('[LuckyBean] 1.24B final integration active');
