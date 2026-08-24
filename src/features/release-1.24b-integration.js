import { get, put, getSetting, setSetting } from '../db.js';
import {
  LB_VERSION,
  StorageMode,
  createRecognitionBatch,
  runRecognitionBatchSerial,
  normalizeBeanRecord,
  transitionStorage,
  computeEffectiveAgeDays,
  markBeanInTransit,
  markBeanDelivered,
  beanCardVisualState,
  LOCAL_BREW_METHODS,
  BEVERAGE_RECIPES
} from '../release-1.24b.js';

const $ = (s, r=document) => r?.querySelector?.(s) || null;
const $$ = (s, r=document) => [...(r?.querySelectorAll?.(s) || [])];
let lastBeanId = '';
let processingOverlay = false;

function notify(message, kind='status-good') {
  document.dispatchEvent(new CustomEvent('luckybean:user-notice', { detail:{ message, kind } }));
}
function requestRefresh(source='release-1.24b') {
  document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail:{ source } }));
}
function esc(v='') { return String(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function valueLine(label, value) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return '';
  const text = Array.isArray(value) ? value.join(' · ') : String(value);
  return `<div class="field"><span class="field-label">${esc(label)}</span><span class="field-value">${esc(text)}</span></div>`;
}
function beanVarieties(bean) {
  const n = normalizeBeanRecord(bean);
  return n.varieties.map(v => v.ratio ? `${v.name} ${v.ratio}%` : v.name).filter(Boolean);
}
function fullBeanInfo(bean) {
  const n = normalizeBeanRecord(bean);
  const purchase = n.purchase || {};
  return [
    valueLine('国家', n.origin.country || bean.countryName),
    valueLine('产区', n.origin.region || bean.regionName),
    valueLine('子产区', n.origin.subRegion),
    valueLine('庄园', n.origin.farm),
    valueLine('生产者', n.origin.producer),
    valueLine('处理站', n.origin.washingStation),
    valueLine('批次', n.origin.lot),
    valueLine('豆种', beanVarieties(bean)),
    valueLine('处理法', n.processing.process || bean.processName),
    valueLine('处理细节', n.processing.detail),
    valueLine('海拔', bean.altitude ? `${bean.altitude} m` : ''),
    valueLine('产季', bean.harvestYear || bean.cropYear),
    valueLine('烘焙度', bean.roastName || bean.roastCode),
    valueLine('烘焙日期', bean.roastDate),
    valueLine('烘焙商', bean.roasterName),
    valueLine('购买日期', purchase.orderDate),
    valueLine('购买价格', purchase.paidPrice != null ? `${purchase.currency || 'CNY'} ${purchase.paidPrice}` : (bean.price ? `CNY ${bean.price}` : '')),
    valueLine('购买数量', purchase.quantity && purchase.quantity !== 1 ? purchase.quantity : ''),
    valueLine('商家', purchase.merchant),
    ...(n.customFields || []).map(row => valueLine(row.label || row.name || '自定义', row.value))
  ].filter(Boolean).join('');
}

function miniFreshnessSvg(bean) {
  const age = computeEffectiveAgeDays(bean);
  const x = Number.isFinite(age) ? Math.max(3, Math.min(97, age / 60 * 100)) : 5;
  return `<svg viewBox="0 0 300 62" class="lb-mini-freshness-svg" role="img" aria-label="赏味期迷你曲线">
    <defs><linearGradient id="lbFreshGradient" x1="0" x2="1"><stop offset="0" stop-color="#7b8c83"/><stop offset=".36" stop-color="#d59a46"/><stop offset=".68" stop-color="#bc8d55"/><stop offset="1" stop-color="#6c6a68"/></linearGradient></defs>
    <path d="M4 51 C40 45,60 18,105 10 C150 3,187 13,218 29 C248 43,270 48,296 52" fill="none" stroke="url(#lbFreshGradient)" stroke-width="5" stroke-linecap="round"/>
    <circle cx="${(x*3).toFixed(1)}" cy="${(51 - 41*Math.sin(Math.min(1,x/100)*Math.PI)).toFixed(1)}" r="5.5" class="freshness-current-point"/>
  </svg>`;
}

async function compactBeanDetail(root) {
  if (processingOverlay || !root?.matches?.('[data-overlay="bean-detail"]')) return;
  processingOverlay = true;
  try {
    const bean = lastBeanId ? await get('beans', lastBeanId).catch(()=>null) : null;
    $('#correctWeightBtn', root)?.remove();
    const archive = $('#archiveBeanBtn', root); if (archive) archive.textContent = archive.textContent.includes('移出') ? '恢复' : '溯旧';
    const del = $('#deleteBeanBtn', root); if (del) del.textContent = '删除';
    const edit = $('#editBeanBtn', root); if (edit) edit.textContent = '编辑';
    const cold = $('#toggleColdBtn', root);
    if (cold && bean) {
      const n = normalizeBeanRecord(bean);
      const mode = n.storage.currentMode || (bean.refrigerated ? StorageMode.REFRIGERATED : StorageMode.ROOM);
      cold.textContent = mode === StorageMode.FROZEN ? '❄️ 冷冻' : mode === StorageMode.REFRIGERATED ? '❄ 冷藏' : '储存';
      cold.classList.toggle('lb-cold-active', mode !== StorageMode.ROOM);
      cold.replaceWith(cold.cloneNode(true));
      const freshCold = $('#toggleColdBtn', root);
      freshCold?.addEventListener('click', event => {
        event.preventDefault(); event.stopImmediatePropagation();
        openStorageMenu(bean, root);
      }, true);
    }
    const stack = $('.management-stack', root); if (stack) stack.classList.add('lb-bean-actions');
    const detailLayout = $('.detail-layout', root); if (detailLayout) detailLayout.classList.add('lb-detail-top');
    const curvePanel = $('.freshness-curve-panel', root);
    const freshCard = $('.freshness-card', root);
    if (bean && curvePanel && freshCard) {
      const effective = computeEffectiveAgeDays(bean);
      const n = normalizeBeanRecord(bean);
      const state = beanCardVisualState(bean);
      const left = document.createElement('div');
      left.className = 'lb-freshness-state';
      left.innerHTML = `<strong>${esc(state.label || $('h2', freshCard)?.textContent || '赏味期')}</strong>${Number.isFinite(effective)?`<small>有效豆龄 ${Math.round(effective)} 天</small>`:''}`;
      curvePanel.innerHTML = miniFreshnessSvg(bean);
      curvePanel.classList.add('lb-freshness-mini');
      const row = document.createElement('section'); row.className = 'lb-freshness-row'; row.append(left, curvePanel);
      freshCard.replaceWith(row);
      curvePanel.addEventListener('click', () => openFreshnessDetail(bean));
    }
    if (bean) {
      const existingInfo = $('.lb-bean-detail', root);
      if (!existingInfo) {
        const info = document.createElement('section'); info.className='lb-bean-detail'; info.innerHTML=fullBeanInfo(bean);
        const tags = $('.detail-tags', root); (tags || $('.detail-actions', root))?.before(info);
      }
    }
    const panels = $$('.panel', root);
    const brewPanel = panels.find(p => $('h3',p)?.textContent?.trim()==='冲煮记录');
    const sensoryPanel = panels.find(p => $('h3',p)?.textContent?.trim()==='最近品鉴');
    if (brewPanel && sensoryPanel) {
      const links = document.createElement('div'); links.className='lb-record-links';
      const bCount = $$('.record-item', brewPanel).length; const sCount = $$('.record-item', sensoryPanel).length;
      links.innerHTML = `<button class="button" type="button" data-lb-open-brews>冲煮记录${bCount?` ${bCount}`:''}</button><button class="button" type="button" data-lb-open-sensory>最近品鉴${sCount?` ${sCount}`:''}</button>`;
      const bClone=brewPanel.cloneNode(true), sClone=sensoryPanel.cloneNode(true);
      brewPanel.replaceWith(links); sensoryPanel.remove();
      $('[data-lb-open-brews]', links)?.addEventListener('click',()=>openRecordsSheet('冲煮记录',bClone));
      $('[data-lb-open-sensory]', links)?.addEventListener('click',()=>openRecordsSheet('最近品鉴',sClone));
    }
  } finally { processingOverlay = false; }
}

function openRecordsSheet(title, contentNode) {
  const root=$('#overlayRoot'); if(!root) return;
  const wrap=document.createElement('div'); wrap.className='overlay'; wrap.dataset.overlay='lb-record-list';
  wrap.innerHTML=`<div class="dialog bottom-sheet"><div class="dialog-header"><h2>${esc(title)}</h2><button class="close-button" type="button">×</button></div>${contentNode.innerHTML}</div>`;
  root.replaceChildren(wrap); wrap.addEventListener('click',e=>{if(e.target===wrap||e.target.closest('.close-button'))root.replaceChildren();});
}
function openFreshnessDetail(bean) {
  notify(bean.storage?.currentMode===StorageMode.FROZEN ? `冷冻保存中；有效豆龄按储存历史折算，当前约 ${Math.round(computeEffectiveAgeDays(bean)||0)} 天` : `有效豆龄约 ${Math.round(computeEffectiveAgeDays(bean)||0)} 天`);
}

function openStorageMenu(bean, detailRoot) {
  const root=$('#overlayRoot'); const n=normalizeBeanRecord(bean); if(!root)return;
  const chooser=document.createElement('div'); chooser.className='overlay'; chooser.dataset.overlay='lb-storage';
  chooser.innerHTML=`<div class="dialog bottom-sheet"><div class="dialog-header"><h2>储存</h2><button class="close-button" type="button">×</button></div><div class="lb-choice-grid"><button class="button" data-storage="room">常温</button><button class="button" data-storage="refrigerated">冷藏</button><button class="button" data-storage="frozen">冷冻</button></div></div>`;
  root.replaceChildren(chooser);
  chooser.addEventListener('click',async e=>{
    if(e.target===chooser||e.target.closest('.close-button')){root.replaceChildren();return;}
    const btn=e.target.closest('[data-storage]'); if(!btn)return;
    const next=btn.dataset.storage;
    let updated=transitionStorage(n,next,new Date());
    updated.refrigerated=next!==StorageMode.ROOM; updated.freezeDate=next===StorageMode.FROZEN?(bean.freezeDate||new Date().toISOString().slice(0,10)):''; updated.updatedAt=new Date().toISOString();
    await put('beans',updated); requestRefresh('storage-transition'); root.replaceChildren(); notify(next===StorageMode.FROZEN?'已设为冷冻保存':next===StorageMode.REFRIGERATED?'已设为冷藏':'已改为常温保存');
  });
}

async function decorateBeanCards() {
  for(const card of $$('.bean-card[data-bean-id]')){
    const id=card.dataset.beanId; if(!id||card.dataset.lb124b==='1')continue;
    const bean=await get('beans',id).catch(()=>null); if(!bean)continue;
    const visual=beanCardVisualState(bean); card.dataset.tone=visual.tone; card.classList.add('lb-bean-card'); card.dataset.lb124b='1';
    if(visual.label){const copy=$('.compact-bean-copy',card);if(copy&&!$('[data-lb-state]',copy)){const badge=document.createElement('small');badge.dataset.lbState='1';badge.textContent=visual.label;copy.append(badge);}}
    if(!visual.usable){const brew=$('[data-brew-bean]',card);if(brew){brew.disabled=true;brew.title='在途豆尚未入库';}}
  }
}

function compactBrewUi() {
  const root=$('#brewContent'); if(!root)return;
  if(!$('.lb-auto-note',root)){const note=document.createElement('div');note.className='lb-auto-note';note.textContent='灰色框选为自动计算选项';root.prepend(note);}
  $$('.field',root).forEach(field=>{
    const label=$(':scope > span',field) || $('label > span',field); const control=$('select,input,button',field);
    if(label && control && !/环境|风味/.test(label.textContent||'')) label.classList.add('lb-compact-hidden-label');
  });
  $$('select option',root).forEach(option=>{if(/^自动\s*[·・]/.test(option.textContent||''))option.textContent=option.textContent.replace(/^自动\s*[·・]\s*/,'');});
  $$('button',root).forEach(btn=>{if(/^自动\s*[·・]/.test(btn.textContent||'')){btn.textContent=btn.textContent.replace(/^自动\s*[·・]\s*/,'');btn.classList.add('lb-auto-field');btn.dataset.source='auto';}});
  const autoSelectors=['#brewDose','#brewRatio','#brewProfile','#brewDripper'];
  autoSelectors.forEach(sel=>{const el=$(sel,root);if(el&&(/auto|recommended/.test(el.value||'')||el.dataset.source==='auto'))el.classList.add('lb-auto-field');});
  const coolingButtons=$$('[data-cooling-menu]',root);
  const coolingRow=coolingButtons[0]?.closest('.brew-row');
  if(coolingRow&&!$('[data-lb-grind]',coolingRow)){
    coolingRow.classList.add('lb-three-controls');
    const grind=document.createElement('button');grind.type='button';grind.className='button';grind.dataset.lbGrind='1';grind.textContent='研磨度';coolingRow.prepend(grind);grind.addEventListener('click',openGrindAdvice);
  }
}

async function openGrindAdvice(){
  const settings=await getSetting('app.settings',{}); const grinders=settings?.gear?.grinders||[]; const g=grinders[0]||null;
  const calibrated=g&&[g.fineAnchor,g.midAnchor,g.coarseAnchor].every(v=>v!==undefined&&v!=='');
  notify(g ? `${g.name}：${calibrated?`建议范围按细 ${g.fineAnchor} / 中 ${g.midAnchor} / 粗 ${g.coarseAnchor} 三点映射`:'尚未设置较细/中间/较粗刻度锚点'}` : '请先在器设中添加研磨设备并设置细/中/粗三个刻度锚点');
}

function removeGroupCollapse(){
  $$('.group-collapse-zone').forEach(node=>node.remove());
  const root=$('#beanGroups'); if(root&&!root.dataset.lbGroupClose){root.dataset.lbGroupClose='1';root.addEventListener('click',e=>{
    const panel=$('[data-active-group-panel]',root); if(!panel)return;
    if(e.target===root){requestRefresh('group-background-close');}
  });}
}

function enhancePendingFields(){
  $$('.evidence-row').forEach(row=>{row.classList.add('lb-pending-field');row.title='点击确认此项';});
}

function installAboutContacts(){
  const settings=$('#settingsContent'); if(!settings||$('[data-lb-contact]',settings))return;
  const section=document.createElement('section');section.className='panel';section.dataset.lbContact='1';section.innerHTML='<div class="panel-title"><div><h3>联系</h3></div></div><p>微信：<strong>zj_crop</strong></p><p>小红书：<strong>端茶倒水的秦始皇🐻</strong></p>';
  settings.append(section);
}

function installOrderAndTransitApi(){
  if(globalThis.LuckyBean124B)return;
  globalThis.LuckyBean124B={
    version:LB_VERSION,
    createRecognitionBatch,
    runRecognitionBatchSerial,
    localBrewMethods:LOCAL_BREW_METHODS,
    beverageRecipes:BEVERAGE_RECIPES,
    async createInTransitBean(bean,purchase={}){const record=markBeanInTransit({...bean,id:bean.id||`bean_${crypto.randomUUID?.()||Date.now()}`},purchase);await put('beans',record);requestRefresh('in-transit-create');return record;},
    async receiveBean(beanId){const bean=await get('beans',beanId);if(!bean)throw new Error('豆卡不存在');const record=markBeanDelivered(bean);await put('beans',record);requestRefresh('in-transit-delivered');return record;},
    computeEffectiveAgeDays
  };
}

function installRecognitionBatchAdapter(){
  document.addEventListener('luckybean:recognition-images-selected', async event=>{
    const images=Array.isArray(event.detail?.images)?event.detail.images:[]; if(images.length<2)return;
    const batch=createRecognitionBatch(images); await setSetting(`recognition.batch.${batch.batchId}`,batch);
    document.dispatchEvent(new CustomEvent('luckybean:recognition-batch-created',{detail:{batch}}));
  });
}

function observe(){
  const observer=new MutationObserver(()=>{
    decorateBeanCards(); compactBrewUi(); removeGroupCollapse(); enhancePendingFields(); installAboutContacts();
    const overlay=$('#overlayRoot > [data-overlay="bean-detail"]'); if(overlay)compactBeanDetail(overlay);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true});
  decorateBeanCards(); compactBrewUi(); removeGroupCollapse(); installAboutContacts();
}

document.addEventListener('click',e=>{const card=e.target.closest?.('.bean-card[data-bean-id]');if(card)lastBeanId=card.dataset.beanId||'';},true);
installOrderAndTransitApi(); installRecognitionBatchAdapter(); observe();
console.info(`[LuckyBean] ${LB_VERSION} integration active`);
