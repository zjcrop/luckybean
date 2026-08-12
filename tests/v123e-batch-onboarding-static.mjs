import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const integration = readFileSync(new URL('../src/features/full-integration-controller-v3.js', import.meta.url), 'utf8');

assert.match(app, /data-manage-action="batch">批量管理/);
assert.match(app, /data-batch-bean/);
assert.match(app, /删除所选/);
assert.match(app, /entity: 'beans'/);
assert.match(app, /recycledAt: at/);
assert.match(app, /7 \* 24 \* 60 \* 60 \* 1000/);
assert.match(app, /恢复所选/);
assert.match(integration, /请进入“器”设定个人账户及设备设定/);
assert.match(integration, /data-page-target=\"settings\"/);
assert.match(app, /添加第一支咖啡豆小酌一杯吧/);
assert.match(app, /\.sort\(\(a, b\) => Number\(b\.score\) - Number\(a\.score\)\)\s*\.slice\(0, 3\)/);
assert.match(app, /推荐冲煮方案（按匹配度）/);
assert.match(app, /data-recommended-profile/);
assert.match(app, /云端将在后台同步/);
assert.doesNotMatch(integration, /injectBatchButton\(\);ensurePlanEffect/);
assert.doesNotMatch(app, /<h3>冲煮轨迹拟合图<\/h3>/);
assert.match(app, /brewSpatialMount/);

console.log('LuckyBean batch recycle, onboarding, top-three matching and spatial-preservation checks passed');
