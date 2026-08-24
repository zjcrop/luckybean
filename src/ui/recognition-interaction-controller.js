const DEFER_FLAG='lbDeferredRecognition';

function syncRatioSource(){
  const ratio=document.querySelector('#brewRatio');
  if(!ratio)return;
  const apply=()=>{
    const automatic=String(ratio.value||'')==='recommended';
    ratio.dataset.source=automatic?'auto':'manual';
    ratio.classList.toggle('lb-auto-field',automatic);
    ratio.classList.toggle('model-recommended',automatic);
  };
  apply();
  if(ratio.dataset.lbSourceBound==='1')return;
  ratio.dataset.lbSourceBound='1';
  ratio.addEventListener('change',apply);
}

for(const eventName of ['luckybean:brew-rendered','luckybean:app-refreshed','luckybean:local-app-ready']){
  document.addEventListener(eventName,()=>queueMicrotask(syncRatioSource));
}
queueMicrotask(syncRatioSource);

document.addEventListener('click',event=>{
  const button=event.target.closest?.('#bagRecognizeBtn');
  if(!button)return;
  if(button.dataset[DEFER_FLAG]==='1'){
    delete button.dataset[DEFER_FLAG];
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  setTimeout(()=>{
    const current=document.querySelector('#bagRecognizeBtn');
    if(!current||current.disabled)return;
    current.dataset[DEFER_FLAG]='1';
    current.click();
  },0);
},true);
