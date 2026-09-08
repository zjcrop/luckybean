import { getRecognitionBatchSnapshot, clearRecognitionBatchSnapshot } from '../recognition-bridge.js';

const $=(s,r=document)=>r?.querySelector?.(s)||null;

function label(status){
  if(status==='completed')return '✓';
  if(status==='processing')return '识别中';
  if(status==='failed')return '失败';
  return '等待';
}

function signatureFor(batch){
  return JSON.stringify({
    batchId:batch?.batchId||'',
    status:batch?.status||'',
    currentTask:Number(batch?.currentTask||0),
    totalTasks:Number(batch?.totalTasks||0),
    tasks:(batch?.tasks||[]).map(task=>[task.taskId,task.status,task.error||''])
  });
}

function terminal(status){ return ['paused','failed','completed'].includes(String(status||'')); }
function heading(batch,current){
  if(batch?.status==='completed')return '识别完成';
  if(batch?.status==='paused'||batch?.status==='failed')return '本次识别失败';
  return `正在识别 ${current}/${batch.totalTasks}`;
}
function clearTerminalSnapshot(batch){
  if(!terminal(batch?.status))return;
  const current=getRecognitionBatchSnapshot();
  if(!current||current.batchId!==batch.batchId)return;
  clearRecognitionBatchSnapshot();
}

function render(batch){
  const overlay=$('#overlayRoot [data-overlay="bag-capture"]');
  if(!overlay||!batch?.totalTasks)return;
  let node=$('[data-lb-batch-progress]',overlay);
  if(!node){
    node=document.createElement('div');
    node.className='lb-batch-progress';
    node.dataset.lbBatchProgress='1';
    const anchor=$('.bag-photo-list',overlay)||$('.bag-capture-actions',overlay);
    anchor?.before(node);
  }
  const signature=signatureFor(batch);
  if(node.dataset.lbBatchSignature===signature)return;
  node.dataset.lbBatchSignature=signature;
  const current=Math.max(1,Math.min(Number(batch.currentTask||1),Number(batch.totalTasks||1)));
  const rows=(batch.tasks||[]).map(task=>`<span class="${task.status==='completed'?'done':task.status==='processing'?'active':task.status==='failed'?'failed':''}">${task.taskId} ${label(task.status)}</span>`).join('');
  node.innerHTML=`<strong>${heading(batch,current)}</strong><div>${rows}</div>`;
}

// Purge stale terminal state left by older builds before the first overlay is opened.
const stale=getRecognitionBatchSnapshot();
if(stale&&terminal(stale.status))clearRecognitionBatchSnapshot();

document.addEventListener('luckybean:recognition-batch-progress',event=>{
  const batch=event.detail?.batch;
  render(batch);
  // Keep a terminal state visible only for the current render turn. The capture
  // controller will rebuild the overlay with its error/manual-entry state; never
  // persist a failed/paused batch so it cannot reappear on the next scan.
  if(terminal(batch?.status))queueMicrotask(()=>clearTerminalSnapshot(batch));
});
new MutationObserver(records=>{
  // Restore only an actively processing batch after the capture overlay itself is rebuilt.
  // A paused/failed/completed batch is terminal and must never be resurrected.
  const overlayChanged=records.some(record=>[...record.addedNodes].some(node=>
    node?.nodeType===1&&(node.matches?.('[data-overlay="bag-capture"]')||node.querySelector?.('[data-overlay="bag-capture"]'))
  ));
  if(!overlayChanged)return;
  const batch=getRecognitionBatchSnapshot();
  if(batch?.status==='processing')render(batch);
  else if(batch&&terminal(batch.status))clearRecognitionBatchSnapshot();
}).observe(document.documentElement,{childList:true,subtree:true});

console.info('[LuckyBean] serial OCR progress UI active; terminal batches are non-persistent');
