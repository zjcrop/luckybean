import { getRecognitionBatchSnapshot, clearRecognitionBatchSnapshot } from '../recognition-bridge.js';

const $=(s,r=document)=>r?.querySelector?.(s)||null;
const $$=(s,r=document)=>r?.querySelectorAll?[...r.querySelectorAll(s)]:[];
const progressByTask=new Map();
let lastBatch=null;
let tickTimer=0;

function terminal(status){ return ['paused','failed','completed'].includes(String(status||'')); }

function clearTerminalSnapshot(batch){
  if(!terminal(batch?.status))return;
  const current=getRecognitionBatchSnapshot();
  if(!current||current.batchId!==batch.batchId)return;
  clearRecognitionBatchSnapshot();
}

function targetProgress(task){
  const key=String(task?.taskId||'');
  const previous=Number(progressByTask.get(key)||0);
  if(task?.status==='completed')return 100;
  if(task?.status==='failed')return Math.max(previous,92);
  if(task?.status==='processing')return Math.max(previous,12);
  return previous;
}

function render(batch){
  const overlay=$('#overlayRoot [data-overlay="bag-capture"]');
  if(!overlay||!batch?.totalTasks)return;
  lastBatch=batch;
  const cards=$$('.bag-photo-card',overlay);
  (batch.tasks||[]).forEach((task,index)=>{
    const key=String(task.taskId||`task-${index}`);
    const next=targetProgress(task);
    progressByTask.set(key,Math.max(Number(progressByTask.get(key)||0),next));
    const card=cards[index];
    if(!card)return;
    let bar=$('.lb-image-progress',card);
    if(!bar){
      bar=document.createElement('div');
      bar.className='lb-image-progress';
      bar.setAttribute('role','progressbar');
      bar.setAttribute('aria-valuemin','0');
      bar.setAttribute('aria-valuemax','100');
      bar.append(document.createElement('span'));
      card.append(bar);
    }
    const value=Math.min(100,Math.max(0,Number(progressByTask.get(key)||0)));
    bar.classList.toggle('completed',task.status==='completed');
    bar.classList.toggle('failed',task.status==='failed');
    bar.setAttribute('aria-valuenow',String(Math.round(value)));
    bar.setAttribute('aria-label',task.status==='failed' ? '本次识别失败，可重新拍摄、上传或再次识别' : `图片识别进度 ${Math.round(value)}%`);
    requestAnimationFrame(()=>{ const fill=$('span',bar); if(fill)fill.style.width=`${value}%`; });
  });
}

function ensureTicking(){
  if(tickTimer)return;
  tickTimer=window.setInterval(()=>{
    const batch=lastBatch;
    if(!batch||batch.status!=='processing'){
      clearInterval(tickTimer); tickTimer=0; return;
    }
    let changed=false;
    for(const task of batch.tasks||[]){
      if(task.status!=='processing')continue;
      const key=String(task.taskId||'');
      const previous=Number(progressByTask.get(key)||12);
      const next=Math.min(92,previous+(previous<55?4:previous<78?2:1));
      if(next>previous){progressByTask.set(key,next);changed=true;}
    }
    if(changed)render(batch);
  },420);
}

const stale=getRecognitionBatchSnapshot();
if(stale&&terminal(stale.status))clearRecognitionBatchSnapshot();

document.addEventListener('luckybean:recognition-batch-progress',event=>{
  const batch=event.detail?.batch;
  if(!batch)return;
  render(batch);
  if(batch.status==='processing')ensureTicking();
  if(terminal(batch.status)){
    render(batch);
    queueMicrotask(()=>clearTerminalSnapshot(batch));
    if(batch.status==='completed')setTimeout(()=>progressByTask.clear(),500);
  }
});

new MutationObserver(records=>{
  const overlayChanged=records.some(record=>[...record.addedNodes].some(node=>
    node?.nodeType===1&&(node.matches?.('[data-overlay="bag-capture"]')||node.querySelector?.('[data-overlay="bag-capture"]'))
  ));
  if(!overlayChanged)return;
  const batch=getRecognitionBatchSnapshot();
  if(batch?.status==='processing')render(batch);
  if(batch?.status==='processing')ensureTicking();
  else if(batch&&terminal(batch.status))clearRecognitionBatchSnapshot();
}).observe(document.documentElement,{childList:true,subtree:true});

console.info('[LuckyBean] monotonic per-image OCR progress active; terminal batches are non-persistent');
