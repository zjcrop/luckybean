const $=(s,r=document)=>r?.querySelector?.(s)||null;
let gesture=null;

function activePanel(){return $('#beanGroups .active-group-panel');}
function isInteractive(target){return Boolean(target?.closest?.('button,a,input,select,textarea,.bean-card,.bean-grid,[role="button"]'));}
function isBeanPageVisible(){return $('#pageBeans')?.classList?.contains('active');}

function closeActiveGroup(){
  const panel=activePanel();
  if(!panel)return false;
  const marker=document.createElement('button');
  marker.type='button';
  marker.hidden=true;
  marker.dataset.v099tGroupBack='1';
  marker.setAttribute('aria-hidden','true');
  panel.append(marker);
  marker.click();
  marker.remove();
  return true;
}

function bindRoot(){
  const root=$('#beanGroups');
  if(!root||root.dataset.lb124bGroupNavigation==='1')return;
  root.dataset.lb124bGroupNavigation='1';

  // An expanded group behaves like an opened folder page: clicking its blank canvas closes it.
  root.addEventListener('click',event=>{
    const panel=activePanel();
    if(!panel||!panel.contains(event.target)||isInteractive(event.target))return;
    if(event.target===panel||event.target.closest?.('.active-group-title')||event.target.closest?.('[data-v099t-group-root]')===panel){
      event.preventDefault();
      event.stopPropagation();
      closeActiveGroup();
    }
  });

  root.addEventListener('pointerdown',event=>{
    if(!activePanel()||isInteractive(event.target))return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY};
  },{passive:true});
  root.addEventListener('pointerup',event=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    gesture=null;
    if(dx<=-72&&Math.abs(dx)>Math.abs(dy)*1.35)closeActiveGroup();
  },{passive:true});
}

function bindPageLevelDismiss(){
  if(document.documentElement.dataset.lb124bPageGroupDismiss==='1')return;
  document.documentElement.dataset.lb124bPageGroupDismiss='1';

  document.addEventListener('click',event=>{
    const panel=activePanel();
    if(!panel)return;

    const beansNav=event.target.closest?.('[data-page-target="beans"]');
    if(beansNav){
      // Clicking “藏” while already on 豆藏 is the folder-level refresh/back action.
      closeActiveGroup();
      return;
    }

    if(!isBeanPageVisible())return;
    const page=$('#pageBeans');
    if(!page?.contains(event.target))return;

    // Keep actual controls/cards interactive; everything else outside the opened folder is blank page space.
    if(panel.contains(event.target))return;
    if(event.target.closest?.('#groupBtn,#manageBtn,#themeToggleBtn,[data-open-group],.bean-card,button,a,input,select,textarea,[role="button"]'))return;
    closeActiveGroup();
  });

  document.addEventListener('click',event=>{
    const target=event.target.closest?.('[data-page-target]');
    if(!target||target.dataset.pageTarget==='beans')return;
    closeActiveGroup();
  },{capture:true});
}

document.addEventListener('luckybean:navigation-back',event=>{
  if(closeActiveGroup())event.preventDefault?.();
});
new MutationObserver(bindRoot).observe(document.documentElement,{childList:true,subtree:true});
bindRoot();
bindPageLevelDismiss();

globalThis.LuckyBean124BGroupNavigation={close:closeActiveGroup};
console.info('[LuckyBean] 1.24B folder-style group navigation active');
