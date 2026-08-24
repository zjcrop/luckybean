import './brew-source-state-controller.js';

const DEFER_FLAG='lbDeferredRecognition';

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
