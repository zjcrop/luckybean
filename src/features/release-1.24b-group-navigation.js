const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
const RECOMMENDATION_PROMPT_REVISION='1.24B-main.9-immediate';
let syncQueued=false;
let recommendationPromptObserver=null;
let recommendationHideTimer=null;
let recommendationCleanupTimer=null;
let directPromptLockUntil=0;
const recommendationPromptMemory=Object.create(null);

const RECOMMENDATION_PROMPTS=Object.freeze({
  leaderboard:[
    '直取榜首，不问其余。','依榜索魁，必得佳味。','榜单在前，今朝且试头筹。',
    '榜魁已定，此只风味精绝，不负众望。','一举摘魁，恰逢此豆风味正酣。',
    '众里寻它，终得榜首，宜细细品之。','照榜点将，专挑那个第一名！'
  ],
  freshness:[
    '此只风味精绝，君既选中，甚是妥当。','正逢此只风味最盛，您这一选，再好不过。',
    '此只正值风味精妙处，既已选定，便是良配。','此只正得意时，恰被君眼相中，眼光不差。'
  ],
  price:[
    '此只价冠诸豆，足见君之慧眼独钟。','此只乃众豆之魁，承君青睐，身价自高。',
    '此只位列首席，价亦昂，唯君堪配此味。','既择此只风骨，当知众豆之中，以此最为矜贵。'
  ],
  remaining:[
    '余粒无多，宜趁兴饮尽，为此豆作结。','所剩几何，当及时啜饮，不负此豆风华。',
    '残豆将尽，速饮之，好与此只从容作别。','此豆见底啦，趁风味未散，快快饮尽收场！'
  ],
  random:[
    '闭目拈签，任其自然。','信手拈签，以定今日之选。','且凭一签，决此豆归谁。',
    '一签落地，此只当归于君。','签指此只，风味正酣，君可安心享之。',
    '得此签，恰逢余粒无几，缘分也。','伸手拈一签，看天意选哪只！'
  ]
});

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
    .recommend-menu [data-recommend-mode="price"] .recommend-dot{background:#fff!important;}
    html[data-theme="light"] .recommend-menu [data-recommend-mode="price"] .recommend-dot{background:#000!important;}
    @keyframes lbMenuEnter{from{opacity:0;transform:translateY(-4px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
    #lbRecommendationToast.toast.recommendation{
      position:fixed!important;
      z-index:10060!important;
      left:50%!important;
      right:auto!important;
      bottom:calc(92px + var(--safe-bottom,0px))!important;
      width:max-content!important;
      max-width:min(90vw,520px)!important;
      min-width:0!important;
      padding:11px 17px!important;
      border:1px solid rgba(168,128,62,.55)!important;
      border-radius:12px!important;
      background:#e8d7ad!important;
      color:#17130d!important;
      font-family:FangSong,STFangsong,"FangSong_GB2312",serif!important;
      font-size:15px!important;
      font-weight:600!important;
      line-height:1.55!important;
      letter-spacing:.02em!important;
      text-align:center!important;
      white-space:normal!important;
      opacity:0!important;
      pointer-events:none!important;
      transform:translate(-50%,18px)!important;
      transition:opacity .18s ease,transform .18s ease!important;
      box-shadow:0 12px 36px rgba(0,0,0,.28)!important;
    }
    #lbRecommendationToast.toast.recommendation.show{opacity:1!important;transform:translate(-50%,0)!important;}
    html[data-theme="light"] #lbRecommendationToast.toast.recommendation{background:#e8d7ad!important;color:#17130d!important;}
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
    @media (max-width:720px){.bean-consumption-summary .lb-stock-total{font-size:.94rem!important;}#lbRecommendationToast.toast.recommendation{max-width:calc(100vw - 28px)!important;font-size:14px!important;}}
    @media (prefers-reduced-motion:reduce){.popup-menu,.recommend-menu{animation:none!important;}#lbRecommendationToast.toast.recommendation{transition:none!important;}}
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
  node.dataset.lbPromptRevision=RECOMMENDATION_PROMPT_REVISION;
  node.setAttribute('role','status');
  node.setAttribute('aria-live','polite');
  document.body.append(node);
  return node;
}
function showRecommendationPrompt(message){
  const text=String(message||'').trim();if(!text)return false;
  injectStyle();
  const node=ensureRecommendationToast();
  clearTimeout(recommendationHideTimer);clearTimeout(recommendationCleanupTimer);
  node.dataset.lbPrompt=text;
  node.dataset.lbPromptRevision=RECOMMENDATION_PROMPT_REVISION;
  node.textContent=text;
  node.className='toast recommendation';
  void node.offsetWidth;
  node.classList.add('show');
  recommendationHideTimer=setTimeout(()=>node.classList.remove('show'),6000);
  recommendationCleanupTimer=setTimeout(()=>{
    if(node.dataset.lbPrompt!==text)return;
    node.className='toast recommendation';
    node.textContent='';
    delete node.dataset.lbPrompt;
  },7000);
  return true;
}
function pickRecommendationPrompt(mode){
  const pool=RECOMMENDATION_PROMPTS[mode]||[];if(!pool.length)return '';
  const previous=recommendationPromptMemory[mode]||'';
  const choices=pool.filter(value=>value!==previous);
  const selected=choices[Math.floor(Math.random()*choices.length)]||pool[0];
  recommendationPromptMemory[mode]=selected;
  return selected;
}
function showRecommendationPromptForMode(mode){
  const text=pickRecommendationPrompt(String(mode||''));if(!text)return false;
  directPromptLockUntil=performance.now()+6500;
  return showRecommendationPrompt(text);
}
function mirrorRecommendationPrompt(){
  if(performance.now()<directPromptLockUntil)return false;
  const source=$('#toast');
  if(!source?.classList.contains('recommendation'))return false;
  return showRecommendationPrompt(source.textContent||'');
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
document.addEventListener('click',event=>{
  const trigger=event.target?.closest?.('[data-recommend-mode]');
  if(!trigger)return;
  if($('#beanGroups .empty-state'))return;
  showRecommendationPromptForMode(trigger.dataset.recommendMode);
},true);
['luckybean:data-changed','luckybean:app-refreshed','luckybean:local-app-ready','luckybean:brew-profile-catalog-updated','luckybean:bean-group-opened','luckybean:bean-group-closed'].forEach(type=>document.addEventListener(type,queueSync));
document.addEventListener('change',event=>{if(event.target?.closest?.('#brewContent'))queueSync();},{capture:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queueSync,{once:true});else queueSync();
injectStyle();installRecommendationPromptGuard();queueSync();
globalThis.LuckyBean124BGroupNavigation={revision:RECOMMENDATION_PROMPT_REVISION,close:()=>globalThis.LuckyBeanBeanGroupState?.close?.()||false,hasActiveGroup:()=>Boolean(globalThis.LuckyBeanBeanGroupState?.hasActiveGroup?.()),sync:queueSync,showRecommendationPromptForMode};
console.info(`[LuckyBean] ${RECOMMENDATION_PROMPT_REVISION} canonical bean-group state; immediate fun recommendation prompt active`);
