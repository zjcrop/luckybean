const $=(s,r=document)=>r?.querySelector?.(s)||null;
let gesture=null;

function activePanel(){return $('#beanGroups .active-group-panel');}
function isInteractive(target){return Boolean(target?.closest?.('button,a,input,select,textarea,.bean-card,.bean-grid,[role="button"]'));}

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

document.addEventListener('luckybean:navigation-back',event=>{
  if(closeActiveGroup())event.preventDefault?.();
});
new MutationObserver(bindRoot).observe(document.documentElement,{childList:true,subtree:true});
bindRoot();

globalThis.LuckyBean124BGroupNavigation={close:closeActiveGroup};
console.info('[LuckyBean] 1.24B group navigation active');
