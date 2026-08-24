import { getRecognitionBatchSnapshot } from '../recognition-bridge.js';

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
  const rows=(batch.tasks||[]).map(task=>`<span class="${task.status==='completed'?'done':task.status==='processing'?'active':''}">${task.taskId} ${label(task.status)}</span>`).join('');
  node.innerHTML=`<strong>${batch.status==='completed'?'识别完成':`正在识别 ${current}/${batch.totalTasks}`}</strong><div>${rows}</div>`;
}

document.addEventListener('luckybean:recognition-batch-progress',event=>render(event.detail?.batch));
new MutationObserver(records=>{
  // Only use DOM observation to restore progress after the capture overlay itself is rebuilt.
  // render() is signature-idempotent, so its own DOM writes cannot form a feedback loop.
  const overlayChanged=records.some(record=>[...record.addedNodes].some(node=>
    node?.nodeType===1&&(node.matches?.('[data-overlay="bag-capture"]')||node.querySelector?.('[data-overlay="bag-capture"]'))
  ));
  if(!overlayChanged)return;
  const batch=getRecognitionBatchSnapshot();
  if(batch&&['processing','paused'].includes(batch.status))render(batch);
}).observe(document.documentElement,{childList:true,subtree:true});

console.info('[LuckyBean] 1.24B serial OCR progress UI active');
