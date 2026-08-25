const $=(s,r=document)=>r?.querySelector?.(s)||null;
let gesture=null;
let closing=false;
let syncQueued=false;

function groupApi(){return globalThis.LuckyBeanV099tBeanGroups||null;}
function nativePanel(){return $('#beanGroups [data-active-group-panel]');}
function nativeCollapse(){return nativePanel()?.querySelector?.('[data-collapse-group]')||null;}
function hasControllerGroup(){return Boolean(groupApi()?.hasActiveGroup?.());}
function hasNativeGroup(){return Boolean(nativePanel());}
function hasActiveGroup(){return hasControllerGroup()||hasNativeGroup();}
function isBeanPageVisible(){return $('#pageBeans')?.classList?.contains('active');}
function isBrewPageVisible(){return $('#pageBrew')?.classList?.contains('active');}
function isInteractive(target){return Boolean(target?.closest?.('button,a,input,select,textarea,.bean-card,[role="button"]'));}

function injectStyle(){
  if($('#lb124bInteractionFixStyle'))return;
  const style=document.createElement('style');
  style.id='lb124bInteractionFixStyle';
  style.textContent=`
    /* 豆藏：榜单从当前界面删除；库存摘要恢复为辅助信息层级。 */
    #beanGroups .preference-board-strip,
    #beanGroups [data-open-recommend-board]{display:none!important;}
    .bean-consumption-summary .lb-stock-total{
      font-size:.98rem!important;
      line-height:1.38!important;
      font-weight:600!important;
      letter-spacing:0!important;
    }

    /* 豆藏分组：统一使用一个关闭入口，底部留出真实可点击的透明返回区域。 */
    #beanGroups .group-collapse-zone{display:none!important;}
    #beanGroups .lb-group-dismiss-zone{
      display:block!important;
      width:100%!important;
      min-height:clamp(110px,18vh,170px)!important;
      margin:8px 0 0!important;
      padding:0!important;
      appearance:none!important;
      border:0!important;
      background:transparent!important;
      color:transparent!important;
      box-shadow:none!important;
      cursor:pointer;
      -webkit-tap-highlight-color:transparent;
      touch-action:manipulation;
    }
    #beanGroups .active-group-panel,#beanGroups .group-grid{
      animation:lbGroupEnter 170ms cubic-bezier(.2,.8,.2,1) both;
    }
    @keyframes lbGroupEnter{from{opacity:.74;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

    /* 统一菜单/小酌字体。原生 select 的弹出层最终仍由系统 WebView 渲染，但显式继承同一字体栈。 */
    :where(.popup-menu,.recommend-menu,.popup-menu button,.recommend-menu button,#brewContent button,#brewContent select,#brewContent option,#brewContent input,.dialog select,.dialog option){
      font-family:DengXian,"Microsoft YaHei UI","Noto Sans CJK SC","Noto Sans SC","PingFang SC",system-ui,sans-serif!important;
      font-synthesis:none;
    }
    .popup-menu,.recommend-menu{
      transform-origin:top center;
      animation:lbMenuEnter 145ms cubic-bezier(.2,.8,.2,1) both;
    }
    @keyframes lbMenuEnter{from{opacity:0;transform:translateY(-4px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}

    /* 小酌：自动参数只使用一条细下划线，不再使用灰框、底色、粗体或额外徽标。 */
    #brewContent .lb-auto-note{display:none!important;}
    #brewContent :is(.lb-auto-field,.model-recommended){
      background:transparent!important;
      border:0!important;
      border-bottom:1px solid color-mix(in srgb,var(--active,currentColor) 58%,transparent)!important;
      border-radius:0!important;
      box-shadow:none!important;
      font-weight:inherit!important;
      text-decoration:none!important;
    }
    #brewContent :is(.lb-auto-field,.model-recommended):hover,
    #brewContent :is(.lb-auto-field,.model-recommended):focus-visible{
      text-decoration:none!important;
      outline:none!important;
    }

    /* 第一行粉量/粉水比使用完全一致的数字字号、基线和居中方式。 */
    #brewContent .brew-row-primary :is(#brewDose,#brewRatio){
      width:100%!important;
      min-height:36px!important;
      padding:6px 0 5px!important;
      font-size:14px!important;
      font-weight:500!important;
      line-height:1.45!important;
      text-align:center!important;
      text-align-last:center!important;
      font-variant-numeric:tabular-nums;
    }

    /* 第二行滤杯/滤纸/调水方案三列等宽、字段与值统一居中。 */
    #brewContent [data-brew-row="filter-gear-water"]{align-items:end!important;}
    #brewContent [data-brew-row="filter-gear-water"]>.field{
      min-width:0!important;
      text-align:center!important;
    }
    #brewContent [data-brew-row="filter-gear-water"]>.field>span,
    #brewContent [data-brew-row="filter-gear-water"] .custom-summary{
      width:100%!important;
      text-align:center!important;
    }
    #brewContent [data-brew-row="filter-gear-water"] :is(select,button,.control){
      width:100%!important;
      min-height:34px!important;
      padding:5px 0!important;
      font-size:13px!important;
      font-weight:450!important;
      line-height:1.45!important;
      text-align:center!important;
      text-align-last:center!important;
    }

    /* 冲煮法“自动”及其列表与“生成方案/直接品鉴”使用同一文字尺度。 */
    #brewContent :is(#brewProfile,.brew-profile-row .control,.brew-generate-row .button){
      font-size:13px!important;
      line-height:1.45!important;
      font-weight:450!important;
    }
    #brewContent #brewProfile{text-align:center!important;text-align-last:center!important;}
    #brewContent :is(#brewProfile,#brewDripper,#brewFilterPaper,#brewWaterProfile,#brewRatio) option{
      font-size:13px!important;
      font-weight:400!important;
    }

    @media (max-width:720px){
      .bean-consumption-summary .lb-stock-total{font-size:.94rem!important;}
    }
    @media (prefers-reduced-motion:reduce){
      #beanGroups .active-group-panel,#beanGroups .group-grid,.popup-menu,.recommend-menu{animation:none!important;}
    }
  `;
  document.head.append(style);
}

function removeLeaderboard(){
  document.querySelectorAll('#beanGroups .preference-board-strip,#beanGroups [data-open-recommend-board]').forEach(node=>node.remove());
}

function normalizeGroupMenu(){
  document.querySelectorAll('[data-group-method="process"]').forEach(button=>{
    const text=button.textContent||'';
    if(text.includes('处理工法'))button.textContent=text.replace(/处理工法/g,'处理法');
  });
}

function ensureDismissZone(){
  const root=$('#beanGroups');
  if(!root)return;
  const existing=$('[data-lb-group-dismiss-zone]',root);
  if(!isBeanPageVisible()||!hasActiveGroup()){
    existing?.remove();
    return;
  }
  if(existing)return;
  const zone=document.createElement('button');
  zone.type='button';
  zone.className='lb-group-dismiss-zone';
  zone.dataset.lbGroupDismissZone='1';
  zone.setAttribute('aria-label','关闭当前分组并返回分组列表');
  zone.title='返回分组列表';
  zone.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    closeActiveGroup();
  });
  root.append(zone);
}

function normalizeBrewUi(){
  const root=$('#brewContent');
  if(!root)return;

  const ratioAuto=$('#brewRatio option[value="auto"]',root);
  if(ratioAuto){
    const normalized=(ratioAuto.textContent||'').replace(/^自动\s*[·・]?\s*/,'').trim()||'自动';
    if(ratioAuto.textContent!==normalized)ratioAuto.textContent=normalized;
  }

  const dripper=$('#brewDripper',root);
  const recommended=dripper?.querySelector('option[value="recommended"]');
  if(recommended){
    const normalized=(recommended.textContent||'').replace(/^方案推荐\s*[·・]?\s*/,'').trim()||'自动';
    if(recommended.textContent!==normalized)recommended.textContent=normalized;
  }

  const dose=$('#brewDose',root);
  if(dose&&/^自动\s*[·・]/.test(dose.textContent||'')){
    dose.textContent=(dose.textContent||'').replace(/^自动\s*[·・]\s*/,'');
  }

  const controls=[
    [dose,control=>control?.classList.contains('model-recommended')||control?.dataset.source==='auto'],
    [$('#brewRatio',root),control=>control?.value==='auto'],
    [dripper,control=>control?.value==='recommended'],
    [$('#brewProfile',root),control=>control?.value==='recommended'],
    [$('#brewWaterProfile',root),control=>control?.classList.contains('model-recommended')||control?.dataset.source==='auto']
  ];
  controls.forEach(([control,isAuto])=>{
    if(control)control.classList.toggle('lb-auto-field',Boolean(isAuto(control)));
  });
}

function syncUi(){
  syncQueued=false;
  injectStyle();
  removeLeaderboard();
  normalizeGroupMenu();
  ensureDismissZone();
  if(isBrewPageVisible())normalizeBrewUi();
}
function queueSync(){
  if(syncQueued)return;
  syncQueued=true;
  requestAnimationFrame(syncUi);
}

function closeNativeGroup(){
  const collapse=nativeCollapse();
  if(!collapse)return false;
  collapse.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
  return true;
}

function closeControllerGroup(){
  const api=groupApi();
  if(!api?.hasActiveGroup?.())return false;
  Promise.resolve(api.closeActiveGroup?.())
    .catch(error=>console.warn('豆藏分组关闭失败',error))
    .finally(queueSync);
  return true;
}

function closeActiveGroup(){
  if(closing)return false;
  closing=true;
  try{
    const nativeClosed=closeNativeGroup();
    const controllerClosed=closeControllerGroup();
    const closed=nativeClosed||controllerClosed;
    if(closed){
      queueSync();
      document.dispatchEvent(new CustomEvent('luckybean:bean-group-dismissed'));
    }
    return closed;
  }finally{
    closing=false;
  }
}

function bindPageLevelDismiss(){
  if(document.documentElement.dataset.lb124bPageGroupDismiss==='4')return;
  document.documentElement.dataset.lb124bPageGroupDismiss='4';

  document.addEventListener('click',event=>{
    if(closing)return;
    const target=event.target;

    /* App 的实际 render 发生在本次事件后；只排一个 rAF，不观察 DOM。 */
    if(target.closest?.('[data-open-group],#groupBtn,[data-group-method],[data-page-target="brew"],#brewContent'))queueSync();

    const pageTarget=target.closest?.('[data-page-target]');
    if(pageTarget&&hasActiveGroup()){
      closeActiveGroup();
      return;
    }

    if(!isBeanPageVisible()||!hasActiveGroup())return;
    const page=$('#pageBeans');
    if(!page?.contains(target))return;
    if(isInteractive(target))return;
    closeActiveGroup();
  },{capture:true});

  document.addEventListener('change',event=>{
    if(event.target?.closest?.('#brewContent'))queueSync();
  },{capture:true});

  document.addEventListener('pointerdown',event=>{
    if(closing||!hasActiveGroup()||!isBeanPageVisible()||isInteractive(event.target))return;
    const page=$('#pageBeans');
    if(!page?.contains(event.target))return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY};
  },{capture:true,passive:true});

  document.addEventListener('pointerup',event=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    gesture=null;
    if(dx<=-72&&Math.abs(dx)>Math.abs(dy)*1.35)closeActiveGroup();
  },{capture:true,passive:true});
}

document.addEventListener('luckybean:navigation-back',event=>{
  if(closeActiveGroup())event.preventDefault?.();
});
[
  'luckybean:data-changed',
  'luckybean:app-refreshed',
  'luckybean:local-app-ready',
  'luckybean:brew-profile-catalog-updated'
].forEach(type=>document.addEventListener(type,queueSync));

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queueSync,{once:true});
else queueSync();
injectStyle();
bindPageLevelDismiss();
queueSync();

globalThis.LuckyBean124BGroupNavigation={close:closeActiveGroup,hasActiveGroup,sync:queueSync};
console.info('[LuckyBean] 1.24B canonical folder-state navigation active; bean groups and brew UI interaction fix active');
