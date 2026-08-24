function syncRatioSource(){
  const ratio=document.querySelector('#brewRatio');
  if(!ratio)return;
  const apply=()=>{
    const mode=String(ratio.value||'');
    const automatic=mode==='auto'||mode==='recommended';
    ratio.dataset.source=automatic?'auto':'manual';
    ratio.classList.toggle('lb-auto-field',automatic);
    ratio.classList.toggle('model-recommended',automatic);
  };
  apply();
  if(ratio.dataset.lbSourceBound==='1')return;
  ratio.dataset.lbSourceBound='1';
  ratio.addEventListener('change',apply);
}

const brewRoot=document.querySelector('#brewContent');
if(brewRoot){
  new MutationObserver(()=>syncRatioSource()).observe(brewRoot,{childList:true,subtree:true});
}
for(const eventName of ['luckybean:brew-rendered','luckybean:app-refreshed','luckybean:local-app-ready']){
  document.addEventListener(eventName,()=>queueMicrotask(syncRatioSource));
}
document.addEventListener('click',event=>{if(event.target.closest?.('[data-page-target="brew"]'))queueMicrotask(syncRatioSource);},true);
queueMicrotask(syncRatioSource);
