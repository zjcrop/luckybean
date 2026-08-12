import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

assert.match(app, /data-manage-action="batch">批量管理/);
assert.match(app, /data-batch-bean/);
assert.match(app, /删除所选/);
assert.match(app, /entity: 'beans'/);
assert.match(app, /recycledAt: at/);
assert.match(app, /7 \* 24 \* 60 \* 60 \* 1000/);
assert.match(app, /恢复所选/);
assert.match(app, /请进入“器”设定个人账户及设备设定/);
assert.match(app, /添加第一支咖啡豆小酌一杯吧/);
assert.match(app, /\.sort\(\(a, b\) => Number\(b\.score\) - Number\(a\.score\)\)\s*\.slice\(0, 3\)/);
assert.match(app, /匹配方案前三名/);
assert.doesNotMatch(app, /<h3>冲煮轨迹拟合图<\/h3>/);
assert.match(app, /brewSpatialMount/);

console.log('LuckyBean batch recycle, onboarding, top-three matching and spatial-preservation checks passed');
