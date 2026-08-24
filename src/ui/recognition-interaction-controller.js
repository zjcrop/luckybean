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
  button.dataset[DEFER_FLAG]='1';
  setTimeout(()=>{
    if(!button.isConnected||button.disabled)return;
    button.click();
  },0);
},true);
