import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  StorageMode,
  createRecognitionBatch,
  runRecognitionBatchSerial,
  normalizeBeanRecord,
  transitionStorage,
  computeEffectiveAgeDays,
  markBeanInTransit,
  markBeanDelivered,
  beanCardVisualState
} from '../src/release-1.24b.js';
import { parseCoffeeOrderText } from '../src/domain/recognition/order-recognition-1.24b.js';
import { LOCAL_BREW_RECIPES_124B } from '../src/data/local-brew-recipes-1.24b.js';

const read = path => fs.readFileSync(path,'utf8');

const legacyCold = normalizeBeanRecord({ refrigerated:true });
assert.equal(legacyCold.storage.currentMode, StorageMode.REFRIGERATED, 'legacy refrigerated bean must migrate to refrigerated storage mode');

let bean = { id:'age-test', roastDate:'2026-08-01', createdAt:'2026-08-01T00:00:00.000Z', remainingWeight:100, initialWeight:100 };
bean = transitionStorage(bean, StorageMode.FROZEN, new Date('2026-08-11T00:00:00.000Z'));
assert.equal(bean.storage.history[0].mode, StorageMode.ROOM);
assert.equal(bean.storage.history[0].endAt, '2026-08-11T00:00:00.000Z');
assert.equal(bean.storage.history[1].mode, StorageMode.FROZEN);
const effective = computeEffectiveAgeDays(bean, new Date('2026-08-21T00:00:00.000Z'));
assert.ok(Math.abs(effective - 10.8) < 0.01, `expected 10.8 effective days, got ${effective}`);

const transit = markBeanInTransit({ id:'transit', initialWeight:200, remainingWeight:200 }, { paidPrice:128, weight:200, orderDate:'2026-08-20' });
assert.equal(transit.remainingWeight, 0, 'in-transit beans must not enter available brew inventory');
assert.equal(beanCardVisualState(transit).usable, false);
const delivered = markBeanDelivered(transit, new Date('2026-08-24T00:00:00.000Z'));
assert.equal(delivered.remainingWeight, 200, 'delivery should restore received weight to available inventory');
assert.equal(beanCardVisualState(delivered).usable, true);

const batch = createRecognitionBatch([{id:'a'},{id:'b'},{id:'c'}]);
assert.deepEqual(batch.tasks.map(t=>t.order),[1,2,3]);
assert.deepEqual(batch.tasks.map(t=>t.taskId.endsWith(`IMG-${String(t.order).padStart(3,'0')}`)),[true,true,true]);
let active=0,maxActive=0;
const calls=[];
await runRecognitionBatchSerial(batch,{
  async recognize(task){active+=1;maxActive=Math.max(maxActive,active);calls.push(`ocr:${task.order}`);await new Promise(r=>setTimeout(r,2));active-=1;return {text:String(task.order)};},
  async parse(result,task){calls.push(`parse:${task.order}`);return result;},
  async persist(task){calls.push(`persist:${task.order}:${task.status}`);},
  async merge(result,task){calls.push(`merge:${task.order}`);}
});
assert.equal(maxActive,1,'recognition queue concurrency must remain 1');
assert.deepEqual(batch.tasks.map(t=>t.status),['completed','completed','completed']);
assert.ok(calls.indexOf('ocr:2') > calls.indexOf('merge:1'),'second image must not begin before first image merge');

const order = parseCoffeeOrderText(`订单号: ABC123456\n下单时间: 2026-08-20\n商品名称: Ethiopia Sidama Washed 200g\n店铺: Sample Roaster\n规格: 200g\n数量: x2\n商品金额: ¥256\n优惠金额: ¥20\n实付款: ¥236\n运费: ¥0\n待收货`);
assert.equal(order.productName,'Ethiopia Sidama Washed 200g');
assert.equal(order.purchase.weight,200);
assert.equal(order.purchase.quantity,2);
assert.equal(order.purchase.paidPrice,236);
assert.equal(order.logisticsStatus,'in_transit');

for (const method of ['espresso','moka','french_press','cold_brew','cold_drip','siphon','cezve','phin']) {
  assert.ok(LOCAL_BREW_RECIPES_124B[method]?.steps?.length, `missing offline recipe ${method}`);
}

const index = read('index.html');
const sw = read('sw.js');
const gradle = read('android/app/build.gradle');
const recognition = read('src/recognition-bridge.js');
const integration = read('src/features/release-1.24b-finalize.js');
assert.match(index,/application-version" content="1\.24B"/);
assert.match(index,/release-1\.24b-finalize\.js/);
assert.match(gradle,/versionCode 102402/);
assert.match(gradle,/versionName '1\.24B'/);
assert.match(recognition,/queueConcurrency:1/);
assert.match(recognition,/for \(let index=0; index<images\.length; index\+=1\)/);
assert.match(integration,/订单录入/);
assert.match(integration,/灰色|data-lb-transit-section|lb-bean-card/);
assert.match(integration,/LOCAL_BREW_RECIPES_124B/);
assert.match(sw,/luckybean-main-v124b-/);

console.log('LuckyBean 1.24B lifecycle, serial OCR, transit/frozen storage, order parsing and local brew regression checks passed');
