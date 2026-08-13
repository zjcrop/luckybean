import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const integration = readFileSync(new URL('../src/features/full-integration-controller-v3.js', import.meta.url), 'utf8');
const lifecycle = readFileSync(new URL('../src/domain/beans/bean-lifecycle-service.js', import.meta.url), 'utf8');
const onboarding = readFileSync(new URL('../src/ui/onboarding-controller.js', import.meta.url), 'utf8');
const beanCards = readFileSync(new URL('../src/ui/bean-card-controller.js', import.meta.url), 'utf8');

assert.match(app, /data-manage-action="batch">批量管理/);
assert.match(app, /data-batch-bean/);
assert.match(app, /删除所选/);
assert.match(lifecycle, /entity: 'beans'/);
assert.match(lifecycle, /recycledAt: recycledAtIso/);
assert.match(lifecycle, /7 \* 24 \* 60 \* 60 \* 1000/);
assert.match(lifecycle, /syncIntentionalDeletion/);
assert.match(onboarding, /luckybean\.onboarding\.v2/);
for (const stage of ['new','account-pending','account-pending-verification','account-completed','guide-completed']) assert.match(onboarding, new RegExp(stage));
assert.match(onboarding, /data-settings-key=\\"account\\"|data-settings-key="\$\{key\}"/);
assert.match(onboarding, /data-lb-open-guide/);
assert.match(onboarding, /cloud-register-success/);
assert.match(onboarding, /cloud-sync-state/);
assert.doesNotMatch(integration, /luckybean\.onboarding\.v1|data-lb-onboard-start|injectBatchButton/);
assert.match(beanCards, /LONG_PRESS_MS = 500/);
assert.match(beanCards, /CANCEL_DISTANCE = 8/);
assert.match(beanCards, /moveBeansToRecycle/);
assert.match(beanCards, /archiveBeans/);
assert.match(app, /添加第一支咖啡豆小酌一杯吧/);
assert.match(app, /\.sort\(\(a, b\) => Number\(b\.score\) - Number\(a\.score\)\)\s*\.slice\(0, 3\)/);
assert.match(app, /推荐冲煮方案（按匹配度）/);
assert.match(app, /data-recommended-profile/);
assert.doesNotMatch(app, /<h3>冲煮轨迹拟合图<\/h3>/);
assert.match(app, /brewSpatialMount/);

console.log('LuckyBean canonical bean lifecycle, long-press onboarding, matching and spatial-preservation checks passed');
