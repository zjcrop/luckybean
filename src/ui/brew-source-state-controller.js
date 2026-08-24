function syncRatioSource(){
  const ratio=document.querySelector('#brewRatio');
  if(!ratio)return;
  const automatic=String(ratio.value||'')==='recommended';
  ratio.dataset.source=automatic?'auto':'manual';
  ratio.classList.toggle('lb-auto-field',automatic);
  ratio.classList.toggle('model-recommended',automatic);
  if(ratio.dataset.lbSourceBound==='1')return;
  ratio.dataset.lbSourceBound='1';
  ratio.addEventListener('change',()=>{
    const isAuto=String(ratio.value||'')==='recommended';
    ratio.dataset.source=isAuto?'auto':'manual';
    ratio.classList.toggle('lb-auto-field',isAuto);
    ratio.classList.toggle('model-recommended',isAuto);
  });
}

for(const eventName of ['luckybean:brew-rendered','luckybean:app-refreshed','luckybean:local-app-ready']){
  document.addEventListener(eventName,()=>queueMicrotask(syncRatioSource));
}
queueMicrotask(syncRatioSource);
