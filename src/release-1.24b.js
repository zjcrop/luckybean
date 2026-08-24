// Lucky Bean 1.24B release feature module
// Centralizes lifecycle, serial OCR batches, storage/freshness and local brew helpers.

export const LB_VERSION = '1.24B';

export const BeanOwnershipStatus = Object.freeze({ ORDERED:'ordered', OWNED:'owned', ARCHIVED:'archived' });
export const LogisticsStatus = Object.freeze({ NOT_APPLICABLE:'not_applicable', ORDERED:'ordered', SHIPPED:'shipped', IN_TRANSIT:'in_transit', DELIVERED:'delivered' });
export const StorageMode = Object.freeze({ ROOM:'room', REFRIGERATED:'refrigerated', FROZEN:'frozen' });
export const RecognitionDocumentType = Object.freeze({ BEAN_LABEL:'bean_label', PRODUCT_PAGE:'product_page', ORDER_PAGE:'order_page', UNKNOWN:'unknown' });

export function createRecognitionBatch(images = []) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const batchId = `BATCH-${stamp}`;
  return {
    batchId, status:'pending', currentTask:0, totalTasks:images.length, createdAt:now.toISOString(),
    tasks:images.map((image,index)=>({
      taskId:`${batchId}-IMG-${String(index+1).padStart(3,'0')}`,
      imageId:image.imageId||image.id||`IMG-${String(index+1).padStart(3,'0')}`,
      order:index+1, uri:image.uri||null, documentType:image.documentType||RecognitionDocumentType.UNKNOWN,
      status:'pending', ocrStatus:'pending', parseStatus:'pending', mergeStatus:'pending', result:null, error:null
    }))
  };
}

export async function runRecognitionBatchSerial(batch, handlers = {}) {
  const { recognize, parse, persist, merge } = handlers;
  if (!batch || !Array.isArray(batch.tasks)) throw new Error('Invalid recognition batch');
  batch.status = 'processing';
  for (let i=0; i<batch.tasks.length; i+=1) {
    const task = batch.tasks[i];
    if (task.status === 'completed') continue;
    batch.currentTask = i+1;
    task.status = 'processing';
    try {
      task.ocrStatus = 'processing';
      const ocrResult = recognize ? await recognize(task) : null;
      task.ocrStatus = 'completed';
      task.parseStatus = 'processing';
      const parsed = parse ? await parse(ocrResult, task) : ocrResult;
      task.parseStatus = 'completed'; task.result = parsed;
      if (persist) await persist(task, batch);
      task.mergeStatus = 'processing';
      if (merge) await merge(parsed, task, batch);
      task.mergeStatus = 'completed'; task.status = 'completed';
      if (persist) await persist(task, batch);
    } catch (error) {
      task.status = 'failed'; task.error = String(error?.message || error);
      if (persist) await persist(task, batch);
      batch.status = 'paused';
      throw error;
    }
  }
  batch.status = 'completed';
  return batch;
}

export function normalizeBeanRecord(bean = {}) {
  const legacyMode = bean.storageMode || (bean.refrigerated ? StorageMode.REFRIGERATED : StorageMode.ROOM);
  return {
    ...bean,
    ownershipStatus:bean.ownershipStatus || BeanOwnershipStatus.OWNED,
    logistics:{
      status:bean.logistics?.status || LogisticsStatus.NOT_APPLICABLE,
      orderedAt:bean.logistics?.orderedAt || bean.purchase?.orderDate || null,
      deliveredAt:bean.logistics?.deliveredAt || null,
      ...bean.logistics
    },
    purchase:{
      currency:bean.purchase?.currency || 'CNY', listPrice:bean.purchase?.listPrice ?? null,
      paidPrice:bean.purchase?.paidPrice ?? null, quantity:bean.purchase?.quantity ?? 1,
      weight:bean.purchase?.weight ?? null, shippingFee:bean.purchase?.shippingFee ?? null,
      discount:bean.purchase?.discount ?? null, orderDate:bean.purchase?.orderDate || null,
      merchant:bean.purchase?.merchant || null, orderIdHash:bean.purchase?.orderIdHash || null,
      ...bean.purchase
    },
    origin:{
      country:bean.origin?.country || bean.country || null, region:bean.origin?.region || bean.region || null,
      subRegion:bean.origin?.subRegion || null, farm:bean.origin?.farm || bean.farm || bean.estate || null,
      producer:bean.origin?.producer || bean.producer || null, washingStation:bean.origin?.washingStation || null,
      lot:bean.origin?.lot || bean.lot || null, ...bean.origin
    },
    varieties:Array.isArray(bean.varieties) ? bean.varieties : bean.variety
      ? String(bean.variety).split(/[、,，/]/).map(name=>({name:name.trim(),ratio:null})).filter(v=>v.name) : [],
    processing:{ process:bean.processing?.process || bean.process || null, detail:bean.processing?.detail || bean.processDetail || null, ...bean.processing },
    storage:{
      currentMode:bean.storage?.currentMode || legacyMode,
      history:Array.isArray(bean.storage?.history) ? bean.storage.history.map(item=>({...item})) : [],
      freezeCycles:Number(bean.storage?.freezeCycles || 0),
      ...bean.storage
    },
    customFields:Array.isArray(bean.customFields) ? bean.customFields : []
  };
}

export function transitionStorage(bean, nextMode, at = new Date()) {
  const normalized = normalizeBeanRecord(bean);
  const timestamp = at instanceof Date ? at.toISOString() : String(at);
  const previousMode = normalized.storage.currentMode;
  if (previousMode === nextMode) return normalized;
  const history = normalized.storage.history.map(item=>({...item}));
  if (!history.length) {
    const initialStart = normalized.roastDate || normalized.createdAt || timestamp;
    if (new Date(initialStart) < new Date(timestamp)) history.push({ mode:previousMode, startAt:initialStart, endAt:timestamp });
  } else {
    const open = history[history.length-1];
    if (open && !open.endAt) open.endAt = timestamp;
  }
  history.push({ mode:nextMode, startAt:timestamp, endAt:null });
  return {
    ...normalized,
    storage:{
      ...normalized.storage, currentMode:nextMode, history,
      freezeCycles:normalized.storage.freezeCycles + (nextMode===StorageMode.FROZEN && previousMode!==StorageMode.FROZEN ? 1 : 0)
    }
  };
}

export const DEFAULT_AGING_FACTORS = Object.freeze({ room:1, refrigerated:0.35, frozen:0.08 });

export function computeEffectiveAgeDays(bean, now = new Date(), factors = DEFAULT_AGING_FACTORS) {
  const b = normalizeBeanRecord(bean);
  const roastDate = b.roastDate || b.roast?.date || null;
  if (!roastDate) return null;
  const start = new Date(roastDate);
  if (Number.isNaN(start.getTime())) return null;
  const end = now instanceof Date ? now : new Date(now);
  const periods = b.storage.history.length
    ? b.storage.history
    : [{ mode:b.storage.currentMode, startAt:start.toISOString(), endAt:null }];
  let totalMs = 0;
  for (const period of periods) {
    const pStart = new Date(period.startAt || start);
    const pEnd = new Date(period.endAt || end);
    const boundedStart = pStart < start ? start : pStart;
    const boundedEnd = pEnd > end ? end : pEnd;
    if (boundedEnd <= boundedStart) continue;
    totalMs += (boundedEnd-boundedStart) * Number(factors[period.mode] ?? 1);
  }
  return totalMs / 86400000;
}

export function markBeanInTransit(bean, purchase = {}) {
  const b = normalizeBeanRecord(bean);
  const purchasedWeight = Number(purchase.weight ?? b.purchase.weight ?? b.initialWeight ?? 0) || 0;
  return {
    ...b,
    ownershipStatus:BeanOwnershipStatus.ORDERED,
    availabilityStatus:'unavailable',
    initialWeight:Number(b.initialWeight || purchasedWeight || 0),
    remainingWeight:0,
    logistics:{ ...b.logistics, status:LogisticsStatus.IN_TRANSIT, orderedAt:purchase.orderDate || b.logistics.orderedAt || new Date().toISOString() },
    purchase:{ ...b.purchase, ...purchase, weight:purchase.weight ?? b.purchase.weight ?? purchasedWeight }
  };
}

export function markBeanDelivered(bean, at = new Date()) {
  const b = normalizeBeanRecord(bean);
  const deliveredAt = at instanceof Date ? at.toISOString() : String(at);
  const receivedWeight = Number(b.initialWeight || b.purchase?.weight || 0) || 0;
  return {
    ...b,
    ownershipStatus:BeanOwnershipStatus.OWNED,
    availabilityStatus:'available',
    remainingWeight:Number(b.remainingWeight)>0 ? Number(b.remainingWeight) : receivedWeight,
    logistics:{ ...b.logistics, status:LogisticsStatus.DELIVERED, deliveredAt }
  };
}

export function beanCardVisualState(bean) {
  const b = normalizeBeanRecord(bean);
  if (b.ownershipStatus===BeanOwnershipStatus.ORDERED || ['ordered','shipped','in_transit'].includes(b.logistics.status)) return { tone:'muted', label:'在途', usable:false };
  if (b.storage.currentMode===StorageMode.FROZEN) return { tone:'frozen', label:'❄️ 冷冻', usable:true };
  if (b.storage.currentMode===StorageMode.REFRIGERATED) return { tone:'cold', label:'❄ 冷藏', usable:true };
  return { tone:'normal', label:'', usable:true };
}

export const AUTO_FIELD_CLASS = 'lb-auto-field';
export function setFieldSource(element, source) {
  if (!element) return;
  element.dataset.source = source;
  element.classList.toggle(AUTO_FIELD_CLASS, source==='auto');
}

export const LOCAL_BREW_METHODS = Object.freeze([
  {id:'espresso',name:'意式浓缩',category:'pressure'}, {id:'ristretto',name:'Ristretto',category:'pressure'},
  {id:'lungo',name:'Lungo',category:'pressure'}, {id:'aeropress',name:'AeroPress',category:'pressure'},
  {id:'moka',name:'摩卡壶',category:'pressure'}, {id:'french_press',name:'法压壶',category:'immersion'},
  {id:'cold_brew',name:'冷萃',category:'immersion'}, {id:'cold_drip',name:'冰滴',category:'immersion'},
  {id:'siphon',name:'虹吸壶',category:'vacuum'}, {id:'cezve',name:'土耳其咖啡',category:'boiled'},
  {id:'phin',name:'越南滴滤',category:'regional'}, {id:'south_indian_filter',name:'南印度滤杯',category:'regional'}
]);
export const BEVERAGE_RECIPES = Object.freeze([
  '美式','Long Black','拿铁','卡布奇诺','Flat White','Cortado','Macchiato','Piccolo','Café au lait',
  '冰美式','冰拿铁','Shakerato','Espresso Tonic','Nitro Cold Brew','特调','自定义'
]);
