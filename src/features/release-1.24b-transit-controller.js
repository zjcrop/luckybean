import { get, put } from '../db.js';
import { normalizeBeanRecord, markBeanDelivered, transitionStorage, StorageMode } from '../release-1.24b.js';

const $ = (s,r=document) => r?.querySelector?.(s) || null;
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function notice(message, kind='status-good') {
  document.dispatchEvent(new CustomEvent('luckybean:user-notice',{detail:{message,kind}}));
}
function refresh(source) {
  document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh',{detail:{source}}));
}
function close() { $('#overlayRoot')?.replaceChildren(); }
function line(label,value){return value==null||value===''?'':`<div class="field"><span class="field-label">${esc(label)}</span><span class="field-value">${esc(value)}</span></div>`;}

function transitDetailHtml(bean) {
  const n=normalizeBeanRecord(bean), p=n.purchase||{};
  const origin=[n.origin.country,n.origin.region,n.origin.subRegion,n.origin.farm].filter(Boolean).join(' · ');
  const varieties=(n.varieties||[]).map(v=>v.ratio?`${v.name} ${v.ratio}%`:v.name).filter(Boolean).join(' · ');
  return [
    line('名称',bean.name||p.productName||'在途咖啡豆'),
    line('烘焙商',bean.roasterName||p.merchant),
    line('产地',origin),
    line('豆种',varieties),
    line('处理法',[n.processing.process,n.processing.detail].filter(Boolean).join(' · ')),
    line('规格',p.weight?`${p.weight} g`:''),
    line('数量',p.quantity&&p.quantity!==1?p.quantity:''),
    line('实付',p.paidPrice!=null?`${p.currency||'CNY'} ${p.paidPrice}`:''),
    line('下单日期',p.orderDate),
    line('物流状态',n.logistics?.status==='in_transit'?'在途':n.logistics?.status||'已下单'),
    ...(n.customFields||[]).map(x=>line(x.label||x.name||'自定义',x.value))
  ].filter(Boolean).join('');
}

function openTransitBean(bean) {
  const n=normalizeBeanRecord(bean), root=$('#overlayRoot'); if(!root)return;
  const defaultWeight=Number(n.purchase?.weight||n.initialWeight||0)||'';
  root.innerHTML=`<div class="overlay" data-overlay="lb-transit-detail"><div class="dialog"><div class="dialog-header"><div><h2>${esc(bean.name||n.purchase?.productName||'在途咖啡豆')}</h2><p>已购买 · 在途</p></div><button class="close-button" type="button">×</button></div><section class="lb-bean-detail">${transitDetailHtml(bean)}</section><div class="grid-2" style="margin-top:.65rem"><label class="field"><span>到货重量 g</span><input class="control" data-lb-delivery-weight type="number" min="0" step="0.1" value="${esc(defaultWeight)}"></label><label class="field"><span>烘焙日期</span><input class="control" data-lb-delivery-roast type="date" value="${esc(bean.roastDate||'')}"></label><label class="field"><span>入库储存</span><select class="control" data-lb-delivery-storage><option value="room">常温</option><option value="refrigerated">冷藏</option><option value="frozen">冷冻</option></select></label></div><div class="row end"><button class="button" type="button" data-lb-transit-close>关闭</button><button class="button primary" type="button" data-lb-deliver>入库</button></div></div></div>`;
  const overlay=root.firstElementChild;
  overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('.close-button')||e.target.closest('[data-lb-transit-close]'))close();});
  $('[data-lb-deliver]',overlay)?.addEventListener('click',()=>deliverBean(bean,overlay));
}

async function deliverBean(bean, overlay) {
  const weight=Number($('[data-lb-delivery-weight]',overlay)?.value||0);
  if(!(weight>0)) return notice('请填写实际到货重量','status-warn');
  const roastDate=$('[data-lb-delivery-roast]',overlay)?.value||bean.roastDate||'';
  const storage=$('[data-lb-delivery-storage]',overlay)?.value||StorageMode.ROOM;
  let updated={...bean,initialWeight:weight,remainingWeight:weight,roastDate,updatedAt:new Date().toISOString()};
  updated=markBeanDelivered(updated,new Date());
  if(storage!==StorageMode.ROOM) updated=transitionStorage(updated,storage,new Date());
  updated.refrigerated=storage!==StorageMode.ROOM;
  updated.freezeDate=storage===StorageMode.FROZEN?new Date().toISOString().slice(0,10):'';
  await put('beans',updated);
  close();
  refresh('transit-bean-delivered');
  notice(storage===StorageMode.FROZEN?'在途豆已入库并设为冷冻':storage===StorageMode.REFRIGERATED?'在途豆已入库并设为冷藏':'在途豆已入库');
}

document.addEventListener('click',async event=>{
  const card=event.target.closest?.('[data-lb-transit-section] .bean-card[data-bean-id]');
  if(!card) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const bean=await get('beans',card.dataset.beanId).catch(()=>null);
  if(bean) openTransitBean(bean);
},true);

console.info('[LuckyBean] 1.24B transit lifecycle controller active');
