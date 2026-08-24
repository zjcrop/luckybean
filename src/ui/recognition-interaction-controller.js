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

for(const eventName of ['luckybean:brew-rendered','luckybean:app-refreshed','luckybean:local-app-ready']){
  document.addEventListener(eventName,()=>queueMicrotask(syncRatioSource));
}
queueMicrotask(syncRatioSource);

function deferRecognitionClick(event){
  const button=event.target.closest?.('#bagRecognizeBtn');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  document.removeEventListener('click',deferRecognitionClick,true);
  setTimeout(()=>{
    try{
      const current=document.querySelector('#bagRecognizeBtn');
      if(current&&!current.disabled)current.click();
    }finally{
      setTimeout(()=>document.addEventListener('click',deferRecognitionClick,true),0);
    }
  },0);
}

document.addEventListener('click',deferRecognitionClick,true);
