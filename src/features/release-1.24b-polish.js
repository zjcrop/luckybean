import './release-1.24b-brew-mode-controller.js';
import './release-1.24b-ui-policy.js';
import '../ui/release-1.24b-followup-controller.js';
import { getSetting } from '../db.js';
import { grinderReference, mapCustomGrinderRange } from '../services/grind-psd-reference-service.js';

const $ = (s,r=document) => r?.querySelector?.(s) || null;
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function closeHelp(){ document.querySelector('[data-lb-centered-help]')?.remove(); }
function openCenteredHelp(title, body){
  closeHelp();
  const layer=document.createElement('div');
  layer.className='lb-centered-help-layer';
  layer.dataset.lbCenteredHelp='1';
  layer.innerHTML=`<div class="lb-centered-help-card" role="dialog" aria-modal="true" aria-label="${esc(title)}"><button type="button" class="lb-help-close" aria-label="关闭">×</button><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
  document.body.append(layer);
  layer.addEventListener('click',e=>{if(e.target===layer||e.target.closest('.lb-help-close'))closeHelp();});
}

function coolingHelpText(title=''){
  if(/首段/.test(title)) return '首段降温用于改变前段粉床升温速度与溶解动力学，适合需要降低初段热冲击、控制前段提取推进的方案。它不等同于“降低酸度”。是否使用及降温幅度应由咖啡豆、方案目标和模型计算共同决定。';
  return '尾段降温用于在接近目标萃取后降低继续高温提取的推动力，可用于控制后段苦、涩与干燥风险。它不是固定降温若干摄氏度的规则，是否使用及幅度应以方案计算值为准。';
}

function bindCoolingHelp(){
  const overlay=$('#overlayRoot > [data-overlay="cooling-mode"]');
  const old=overlay?.querySelector?.('[data-lb-cooling-note]');
  if(!overlay||!old||old.dataset.lbModalBound==='1') return;
  const fresh=old.cloneNode(true); fresh.dataset.lbModalBound='1'; old.replaceWith(fresh);
  fresh.addEventListener('click',e=>{
    e.preventDefault(); e.stopPropagation();
    const title=$('.dialog-header h2',overlay)?.textContent?.trim() || '降温说明';
    openCenteredHelp(title,coolingHelpText(title));
  });
}

async function showGrindReference(){
  const settings=await getSetting('app.settings',{}) || {};
  const grinders=Array.isArray(settings?.gear?.grinders) ? settings.gear.grinders : [];
  const grinder=grinders[0];
  if(!grinder){openCenteredHelp('研磨度','请先在器设中添加研磨设备。自定义设备需要设置较细、中间、较粗三个刻度锚点。');return;}
  const ref=await grinderReference(grinder);
  const custom=mapCustomGrinderRange(grinder,0.5,0.08);
  const device=[grinder.brand,grinder.model,grinder.name].filter(Boolean).join(' ') || '当前研磨设备';
  let text=`${device}。${ref.message}`;
  if(custom) text += ` 当前自定义三点标定的中等研磨参考区间约为 ${custom.min.toFixed(1)}–${custom.max.toFixed(1)}；该区间由本机锚点映射得到，不代表 Grind-PSD 实测范围。`;
  else text += ' 若需要把方案研磨要求转换成可用刻度范围，请在器设中补齐较细、中间、较粗三个刻度锚点。';
  openCenteredHelp('研磨度',text);
}

function interceptGrindButton(){
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('[data-lb-grind]');
    if(!button) return;
    e.preventDefault(); e.stopImmediatePropagation();
    showGrindReference();
  },true);
}

function bindEscapeAndBack(){
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('[data-lb-centered-help]')){e.preventDefault();closeHelp();}});
  document.addEventListener('luckybean:navigation-back',()=>closeHelp());
}

new MutationObserver(()=>bindCoolingHelp()).observe(document.documentElement,{childList:true,subtree:true});
bindCoolingHelp(); interceptGrindButton(); bindEscapeAndBack();
console.info('[LuckyBean] 1.24B help, Grind-PSD, brew-mode and UI policy active');
