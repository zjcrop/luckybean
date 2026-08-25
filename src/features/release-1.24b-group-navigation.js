const $=(s,r=document)=>r?.querySelector?.(s)||null;
let gesture=null;

function activePanel(){return $('#beanGroups .active-group-panel');}
function isInteractive(target){return Boolean(target?.closest?.('button,a,input,select,textarea,.bean-card,[role="button"]'));}
function isBeanPageVisible(){return $('#pageBeans')?.classList?.contains('active');}

function closeActiveGroup(){
  const panel=activePanel();
  if(!panel)return false;
  const back=panel.querySelector('button[data-v099t-group-back]')||panel.querySelector('[data-v099t-group-back]');
  if(!back)return false;
  back.click();
  return true;
}

function bindRoot(){
  const root=$('#beanGroups');
  if(!root||root.dataset.lb124bGroupNavigation==='1')return;
  root.dataset.lb124bGroupNavigation='1';

  // An expanded group behaves like an opened folder page: any non-control blank canvas inside it closes the folder.
  root.addEventListener('click',event=>{
    const panel=activePanel();
    if(!panel||!panel.contains(event.target)||isInteractive(event.target))return;
    event.preventDefault();
    event.stopPropagation();
    closeActiveGroup();
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

  // Capture phase is deliberate: close folder state before the navigation controller refreshes pages.
  document.addEventListener('click',event=>{
    const panel=activePanel();
    if(!panel)return;

    const pageTarget=event.target.closest?.('[data-page-target]');
    if(pageTarget){
      closeActiveGroup();
      return;
    }

    if(!isBeanPageVisible())return;
    const page=$('#pageBeans');
    if(!page?.contains(event.target))return;

    // Outside the opened folder, only actual controls remain non-dismiss targets.
    if(panel.contains(event.target))return;
    if(event.target.closest?.('#groupBtn,#manageBtn,#themeToggleBtn,[data-open-group],.bean-card,button,a,input,select,textarea,[role="button"]'))return;
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
