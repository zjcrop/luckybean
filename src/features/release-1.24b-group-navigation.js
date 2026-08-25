const $=(s,r=document)=>r?.querySelector?.(s)||null;
let gesture=null;

function groupApi(){return globalThis.LuckyBeanV099tBeanGroups||null;}
function hasActiveGroup(){return Boolean(groupApi()?.hasActiveGroup?.());}
function isInteractive(target){return Boolean(target?.closest?.('button,a,input,select,textarea,.bean-card,[role="button"]'));}
function isBeanPageVisible(){return $('#pageBeans')?.classList?.contains('active');}

function closeActiveGroup(){
  const api=groupApi();
  if(!api?.hasActiveGroup?.())return false;
  api.closeActiveGroup?.().catch?.(error=>console.warn('豆藏分组关闭失败',error));
  return true;
}

function bindPageLevelDismiss(){
  if(document.documentElement.dataset.lb124bPageGroupDismiss==='2')return;
  document.documentElement.dataset.lb124bPageGroupDismiss='2';

  // Capture phase is deliberate: clear the folder state before page navigation refreshes the Beans view.
  document.addEventListener('click',event=>{
    if(!hasActiveGroup())return;

    const pageTarget=event.target.closest?.('[data-page-target]');
    if(pageTarget){
      closeActiveGroup();
      return;
    }

    if(!isBeanPageVisible())return;
    const page=$('#pageBeans');
    if(!page?.contains(event.target))return;

    // An opened group behaves like a folder page. Only real controls and bean cards keep it open.
    if(isInteractive(event.target))return;
    closeActiveGroup();
  },{capture:true});

  document.addEventListener('pointerdown',event=>{
    if(!hasActiveGroup()||!isBeanPageVisible()||isInteractive(event.target))return;
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

bindPageLevelDismiss();

globalThis.LuckyBean124BGroupNavigation={close:closeActiveGroup,hasActiveGroup};
console.info('[LuckyBean] 1.24B canonical folder-state navigation active');
