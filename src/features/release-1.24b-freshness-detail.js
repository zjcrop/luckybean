import { get } from '../db.js';
import { computeEffectiveAgeDays, normalizeBeanRecord, StorageMode, DEFAULT_AGING_FACTORS } from '../release-1.24b.js';

const $=(s,r=document)=>r?.querySelector?.(s)||null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayMs=86400000;

function actualAgeDays(bean,now=new Date()){
  const roast=bean?.roastDate||bean?.roast?.date;
  if(!roast)return null;
  const start=new Date(roast);if(Number.isNaN(start.getTime()))return null;
  return Math.max(0,(now-start)/dayMs);
}
function modeName(mode){return mode===StorageMode.FROZEN?'冷冻':mode===StorageMode.REFRIGERATED?'冷藏':'常温';}
function storageRows(bean,now=new Date()){
  const n=normalizeBeanRecord(bean);
  const roast=n.roastDate||n.roast?.date;
  const history=n.storage.history.length?n.storage.history:[{mode:n.storage.currentMode,startAt:roast,endAt:null}];
  return history.filter(x=>x?.startAt).map(item=>{
    const start=new Date(item.startAt);const end=item.endAt?new Date(item.endAt):now;
    const days=Math.max(0,(end-start)/dayMs);
    const factor=Number(DEFAULT_AGING_FACTORS[item.mode]??1);
    return {mode:item.mode,startAt:item.startAt,endAt:item.endAt||'',days,effective:days*factor,factor};
  });
}
function curveSvg(bean){
  const effective=computeEffectiveAgeDays(bean)||0;
  const maxDays=Math.max(45,effective*1.35,60);
  const x=Math.max(4,Math.min(296,effective/maxDays*292+4));
  // Single continuous curve with stage colors; no grid/legend clutter in default view.
  return `<svg class="lb-freshness-detail-svg" viewBox="0 0 360 170" role="img" aria-label="完整赏味期曲线">
    <defs><linearGradient id="lbFreshDetailGradient" x1="0" x2="1"><stop offset="0" stop-color="#71877c"/><stop offset=".34" stop-color="#d49b48"/><stop offset=".68" stop-color="#b88954"/><stop offset="1" stop-color="#6e6b69"/></linearGradient></defs>
    <path d="M12 145 C55 138,72 72,128 38 C181 6,230 36,270 84 C306 126,328 139,348 145" fill="none" stroke="url(#lbFreshDetailGradient)" stroke-width="7" stroke-linecap="round"/>
    <line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="18" y2="150" class="lb-freshness-now-line"/>
    <circle cx="${x.toFixed(1)}" cy="${Math.max(18,145-108*Math.sin(Math.min(1,effective/maxDays)*Math.PI)).toFixed(1)}" r="7" class="freshness-current-point"/>
  </svg>`;
}
function close(){ $('[data-lb-freshness-detail-overlay]')?.remove(); }
function open(bean){
  close();
  const actual=actualAgeDays(bean);const effective=computeEffectiveAgeDays(bean);const n=normalizeBeanRecord(bean);const rows=storageRows(bean);
  const layer=document.createElement('div');layer.className='lb-freshness-detail-layer';layer.dataset.lbFreshnessDetailOverlay='1';
  layer.innerHTML=`<div class="lb-freshness-detail-card" role="dialog" aria-modal="true" aria-label="完整赏味期"><button type="button" class="lb-help-close" data-lb-freshness-close aria-label="关闭">×</button><h3>赏味期</h3>${curveSvg(bean)}<div class="lb-freshness-metrics"><div><small>实际豆龄</small><strong>${actual==null?'待确定':`${Math.round(actual)} 天`}</strong></div><div><small>有效豆龄</small><strong>${effective==null?'待确定':`${Math.round(effective)} 天`}</strong></div><div><small>当前储存</small><strong>${esc(modeName(n.storage.currentMode))}</strong></div></div><div class="lb-storage-history">${rows.map(row=>`<div><span>${esc(modeName(row.mode))}</span><span>${row.days.toFixed(1)} 天 × ${row.factor.toFixed(2)}</span><strong>${row.effective.toFixed(1)} 有效天</strong></div>`).join('')||'<p class="muted small">暂无可计算的储存历史。</p>'}</div><p class="muted small">有效豆龄按储存历史折算；冷藏/冷冻表示老化速率降低而非完全暂停。系数为可校准模型参数。</p></div>`;
  document.body.append(layer);
  layer.addEventListener('click',e=>{if(e.target===layer||e.target.closest('[data-lb-freshness-close]'))close();});
}

document.addEventListener('click',async event=>{
  const target=event.target.closest?.('.lb-freshness-mini');if(!target)return;
  event.preventDefault();event.stopImmediatePropagation();
  const beanId=globalThis.__lbLastBeanId||target.closest?.('[data-bean-id]')?.dataset?.beanId||'';
  const bean=beanId?await get('beans',beanId).catch(()=>null):null;
  if(bean)open(bean);
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('[data-lb-freshness-detail-overlay]')){e.preventDefault();close();}});
document.addEventListener('luckybean:navigation-back',()=>close());

globalThis.LuckyBeanFreshnessDetail={open,close,actualAgeDays,storageRows};
console.info('[LuckyBean] 1.24B full freshness detail active');
