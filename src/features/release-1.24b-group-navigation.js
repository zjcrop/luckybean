const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
let syncQueued=false;
let recommendationPromptObserver=null;
let recommendationHideTimer=null;
let recommendationCleanupTimer=null;

function injectStyle(){
  if($('#lb124bInteractionFixStyle'))return;
  const style=document.createElement('style');
  style.id='lb124bInteractionFixStyle';
  style.textContent=`
    #beanGroups .preference-board-strip,#beanGroups [data-open-recommend-board]{display:none!important;}
    .bean-consumption-summary .lb-stock-total{font-size:.98rem!important;line-height:1.38!important;font-weight:600!important;letter-spacing:0!important;}
    :where(.popup-menu,.recommend-menu,.popup-menu button,.recommend-menu button,#brewContent button,#brewContent select,#brewContent option,#brewContent input,.dialog select,.dialog option){font-family:DengXian,"Microsoft YaHei UI","Noto Sans CJK SC","Noto Sans SC","PingFang SC",system-ui,sans-serif!important;font-synthesis:none;}
    .popup-menu,.recommend-menu{transform-origin:top center;animation:lbMenuEnter 145ms cubic-bezier(.2,.8,.2,1) both;}
    .recommend-menu [data-recommend-mode="remaining"] .recommend-dot{background:#808080!important;}
    .recommend-menu [data-recommend-mode="price"] .recommend-dot{background:#000!important;}
    @keyframes lbMenuEnter{from{opacity:0;transform:translateY(-4px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
    #lbRecommendationToast{z-index:121;}
    html[data-theme="light"] #lbRecommendationToast.toast.recommendation{background:#e8d7ad!important;color:#111!important;}
    #brewContent .lb-auto-note{display:none!important;}
    #brewContent :is(.lb-auto-field,.model-recommended){background:transparent!important;border:0!important;border-bottom:1px solid color-mix(in srgb,var(--active,currentColor) 58%,transparent)!important;border-radius:0!important;box-shadow:none!important;font-weight:inherit!important;text-decoration:none!important;}
    #brewContent .brew-row-primary :is(#brewDose,#brewRatio){width:100%!important;min-height:36px!important;padding:6px 0 5px!important;font-size:14px!important;font-weight:500!important;line-height:1.45!important;text-align:center!important;text-align-last:center!important;font-variant-numeric:tabular-nums;}
    #brewContent [data-brew-row="filter-gear-water"]{align-items:end!important;}
    #brewContent [data-brew-row="filter-gear-water"]>.field{min-width:0!important;text-align:center!important;}
    #brewContent [data-brew-row="filter-gear-water"]>.field>span,#brewContent [data-brew-row="filter-gear-water"] .custom-summary{width:100%!important;text-align:center!important;}
    #brewContent [data-brew-row="filter-gear-water"] :is(select,button,.control){width:100%!important;min-height:34px!important;padding:5px 0!important;font-size:13px!important;font-weight:450!important;line-height:1.45!important;text-align:center!important;text-align-last:center!important;}
    #brewContent :is(#brewProfile,.brew-profile-row .control,.brew-generate-row .button){font-size:13px!important;line-height:1.45!important;font-weight:450!important;}
    #brewContent #brewProfile{text-align:center!important;text-align-last:center!important;}
    #brewContent :is(#brewProfile,#brewDripper,#brewFilterPaper,#brewWaterProfile,#brewRatio) option{font-size:13px!important;font-weight:400!important;}
    @media (max-width:720px){.bean-consumption-summary .lb-stock-total{font-size:.94rem!important;}}
    @media (prefers-reduced-motion:reduce){.popup-menu,.recommend-menu{animation:none!important;}}
  `;
  document.head.append(style);
}
function removeLeaderboard(){document.querySelectorAll('#beanGroups .preference-board-strip,#beanGroups [data-open-recommend-board]').forEach(node=>node.remove());}
function normalizeBrewUi(){
  const root=$('#brewContent');if(!root)return;
  const ratioAuto=$('#brewRatio option[value="auto"]',root);if(ratioAuto){const text=(ratioAuto.textContent||'').replace(/^自动\s*[·・]?\s*/,'').trim()||'自动';if(ratioAuto.textContent!==text)ratioAuto.textContent=text;}
  const dripper=$('#brewDripper',root);const recommended=dripper?.querySelector('option[value="recommended"]');if(recommended){const text=(recommended.textContent||'').replace(/^方案推荐\s*[·・]?\s*/,'').trim()||'自动';if(recommended.textContent!==text)recommended.textContent=text;}
  const dose=$('#brewDose',root);if(dose&&/^自动\s*[·・]/.test(dose.textContent||''))dose.textContent=(dose.textContent||'').replace(/^自动\s*[·・]\s*/,'');
  [[dose,c=>c?.classList.contains('model-recommended')||c?.dataset.source==='auto'],[$('#brewRatio',root),c=>c?.value==='auto'],[dripper,c=>c?.value==='recommended'],[$('#brewProfile',root),c=>c?.value==='recommended'],[$('#brewWaterProfile',root),c=>c?.classList.contains('model-recommended')||c?.dataset.source==='auto']].forEach(([control,isAuto])=>{if(control)control.classList.toggle('lb-auto-field',Boolean(isAuto(control)));});
}
function ensureRecommendationToast(){
  let node=$('#lbRecommendationToast');
  if(node)return node;
  node=document.createElement('div');
  node.id='lbRecommendationToast';
  node.className='toast recommendation';
  node.dataset.lbRecommendationMirror='1';
  node.setAttribute('role','status');
  node.setAttribute('aria-live','polite');
  document.body.append(node);
  return node;
}
function showRecommendationPrompt(message){
  const text=String(message||'').trim();if(!text)return;
  const node=ensureRecommendationToast();
  if(node.dataset.lbPrompt===text&&node.classList.contains('show'))return;
  clearTimeout(recommendationHideTimer);clearTimeout(recommendationCleanupTimer);
  node.dataset.lbPrompt=text;
  node.textContent=text;
  node.className='toast recommendation';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(node.dataset.lbPrompt===text)node.classList.add('show');
  }));
  recommendationHideTimer=setTimeout(()=>node.classList.remove('show'),6000);
  recommendationCleanupTimer=setTimeout(()=>{
    if(node.dataset.lbPrompt!==text)return;
    node.className='toast recommendation';
    node.textContent='';
    delete node.dataset.lbPrompt;
  },7000);
}
function mirrorRecommendationPrompt(){
  const source=$('#toast');
  if(!source?.classList.contains('recommendation'))return;
  showRecommendationPrompt(source.textContent||'');
}
function installRecommendationPromptGuard(){
  const source=$('#toast');
  if(!source||recommendationPromptObserver)return;
  recommendationPromptObserver=new MutationObserver(mirrorRecommendationPrompt);
  recommendationPromptObserver.observe(source,{attributes:true,attributeFilter:['class'],childList:true,subtree:true,characterData:true});
  mirrorRecommendationPrompt();
}
function syncUi(){syncQueued=false;injectStyle();installRecommendationPromptGuard();removeLeaderboard();normalizeBrewUi();}
function queueSync(){if(syncQueued)return;syncQueued=true;requestAnimationFrame(syncUi);}
document.addEventListener('luckybean:navigation-back',event=>{const api=globalThis.LuckyBeanBeanGroupState;if(api?.hasActiveGroup?.()&&api.close?.())event.preventDefault?.();});
['luckybean:data-changed','luckybean:app-refreshed','luckybean:local-app-ready','luckybean:brew-profile-catalog-updated','luckybean:bean-group-opened','luckybean:bean-group-closed'].forEach(type=>document.addEventListener(type,queueSync));
document.addEventListener('change',event=>{if(event.target?.closest?.('#brewContent'))queueSync();},{capture:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queueSync,{once:true});else queueSync();
injectStyle();installRecommendationPromptGuard();queueSync();
globalThis.LuckyBean124BGroupNavigation={close:()=>globalThis.LuckyBeanBeanGroupState?.close?.()||false,hasActiveGroup:()=>Boolean(globalThis.LuckyBeanBeanGroupState?.hasActiveGroup?.()),sync:queueSync};
console.info('[LuckyBean] 1.24B canonical bean-group state active; group UI adapter loaded');