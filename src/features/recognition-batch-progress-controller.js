import { getRecognitionBatchSnapshot, clearRecognitionBatchSnapshot } from '../recognition-bridge.js';

const $=(s,r=document)=>r?.querySelector?.(s)||null;
const $$=(s,r=document)=>r?.querySelectorAll?[...r.querySelectorAll(s)]:[];
const progressByTask=new Map();
let lastBatch=null;

function terminal(status){ return ['paused','failed','completed'].includes(String(status||'')); }

function clearTerminalSnapshot(batch){
  if(!terminal(batch?.status))return;
  const current=getRecognitionBatchSnapshot();
  if(!current||current.batchId!==batch.batchId)return;
  clearRecognitionBatchSnapshot();
}

function taskKey(task,index=0){ return String(task?.taskId||`task-${index}`); }

function targetProgress(task,index=0){
  const key=taskKey(task,index);
  const previous=Number(progressByTask.get(key)||0);
  if(task?.status==='completed')return 100;
  if(task?.status==='failed')return previous;
  if(task?.status==='processing')return Math.max(previous,1);
  return previous;
}

function render(batch){
  const overlay=$('#overlayRoot [data-overlay="bag-capture"]');
  if(!overlay||!batch?.totalTasks)return;
  lastBatch=batch;
  const cards=$$('.bag-photo-card',overlay);
  (batch.tasks||[]).forEach((task,index)=>{
    const key=taskKey(task,index);
    const next=targetProgress(task,index);
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
    bar.setAttribute('aria-label',task.status==='failed'
      ? `本次识别失败，停止于 ${Math.round(value)}%，可重新拍摄、上传或再次识别`
      : `图片识别实际进度 ${Math.round(value)}%`);
    requestAnimationFrame(()=>{ const fill=$('span',bar); if(fill)fill.style.width=`${value}%`; });
  });
}

function currentProcessingTask(batch){
  if(!batch||batch.status!=='processing')return null;
  const explicitIndex=Math.max(0,Number(batch.currentTask||1)-1);
  const explicit=batch.tasks?.[explicitIndex];
  if(explicit?.status==='processing')return {task:explicit,index:explicitIndex};
  const index=(batch.tasks||[]).findIndex(task=>task?.status==='processing');
  return index>=0?{task:batch.tasks[index],index}:null;
}

function applyProviderProgress(detail){
  const batch=lastBatch;
  const current=currentProcessingTask(batch);
  if(!current)return;
  const progress=Number(detail?.progress);
  if(!Number.isFinite(progress))return;
  const key=taskKey(current.task,current.index);
  const previous=Number(progressByTask.get(key)||1);
  // Provider progress is authoritative. Keep it monotonic within one image so a
  // retry phase (e.g. low-memory engine bootstrap) never makes the bar run backward.
  progressByTask.set(key,Math.max(previous,Math.max(1,Math.min(99,progress))));
  render(batch);
}

// A JavaScript OCR task cannot survive a full page reload. Persisted processing
// state therefore represents an interrupted/crashed tab, not a resumable task.
// Remove it at controller startup so a previous memory failure cannot poison the
// next capture session or leave a phantom progress bar after refresh.
const stale=getRecognitionBatchSnapshot();
if(stale&&(terminal(stale.status)||stale.status==='processing'))clearRecognitionBatchSnapshot();

document.addEventListener('luckybean:recognition-batch-progress',event=>{
  const batch=event.detail?.batch;
  if(!batch)return;
  render(batch);
  if(terminal(batch.status)){
    render(batch);
    queueMicrotask(()=>clearTerminalSnapshot(batch));
    if(batch.status==='completed')setTimeout(()=>progressByTask.clear(),500);
  }
});

globalThis.addEventListener('luckybean:ocr-progress',event=>applyProviderProgress(event.detail));

new MutationObserver(records=>{
  const overlayChanged=records.some(record=>[...record.addedNodes].some(node=>
    node?.nodeType===1&&(node.matches?.('[data-overlay="bag-capture"]')||node.querySelector?.('[data-overlay="bag-capture"]'))
  ));
  if(!overlayChanged)return;
  const batch=getRecognitionBatchSnapshot();
  if(batch?.status==='processing')render(batch);
  else if(batch&&terminal(batch.status))clearRecognitionBatchSnapshot();
}).observe(document.documentElement,{childList:true,subtree:true});

console.info('[LuckyBean] per-image OCR progress is bound to provider progress; interrupted batches are cleared on reload');
