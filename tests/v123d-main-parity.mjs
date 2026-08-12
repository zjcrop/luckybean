import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('all pages use the same red seal slot geometry', async () => {
  const index = await read('index.html');
  assert.equal((index.match(/class="page-seal-slot"/g) || []).length, 4);
  const styles = await read('styles.css');
  assert.match(styles, /one compact canonical header geometry/);
  assert.match(styles, /\.page-heading\.centered-page-heading\s*\{[\s\S]*min-height:\s*42px !important;[\s\S]*margin-bottom:\s*10px !important;/);
});

test('bean custom fields and five-row brew order are locked to the current interaction contract', async () => {
  const app = await read('src/app.js');
  for (const table of ['countries', 'regions', 'entities', 'varieties', 'processes']) {
    assert.match(app, new RegExp(`${table}: \\{ field:`));
  }
  assert.match(app, /CUSTOM_BEAN_OPTION_VALUE = '__custom__'/);
  const rows = [...app.matchAll(/data-brew-row="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(rows.slice(0, 5), ['dose-ratio', 'filter-gear-water', 'actions', 'cooling', 'profile']);
  assert.doesNotMatch(app, /select\.addEventListener\('pointerdown', reopenCustom\)/);
  assert.doesNotMatch(app, /id="brewSegments"/);
  assert.match(app, /id="brewProfile"[\s\S]*>模型推荐<\/option>/);
});

test('about section contains the shipped illustration', async () => {
  const app = await read('src/app.js');
  assert.match(app, /about-illustration/);
  assert.match(app, /public\/Luckybean-END\.webp/);
  const styles = await read('styles.css');
  assert.match(styles, /\.about-illustration\s*\{[\s\S]*background:\s*transparent/);
  assert.match(styles, /\.about-illustration img\s*\{[\s\S]*width:\s*33\.333%/);
  assert.match(styles, /\.about-illustration img\s*\{[\s\S]*border:\s*0/);
});

test('settings data collection owns coffee world and preference profile', async () => {
  const app = await read('src/app.js');
  const upgrades = await read('src/ui-upgrade-controller.js');
  const originMap = await read('src/origin-map-controller.js');
  assert.match(app, /<span>数藏<\/span>[\s\S]*data-v099f-preference/);
  assert.match(app, /<span>数藏<\/span>[\s\S]*data-v099f-world/);
  assert.doesNotMatch(upgrades, /function ensureBeanModules/);
  assert.match(upgrades, /风味喜好数字测写/);
  assert.match(upgrades, /咖啡世界/);
  assert.match(originMap, /public\/vendor\/jsvectormap\/jsvectormap\.min\.js/);
  assert.match(originMap, /public\/vendor\/jsvectormap\/world\.js/);
  assert.doesNotMatch(originMap, /cdn\.jsdelivr\.net/);
});

test('bean page shows inventory and health digest above its leaderboard', async () => {
  const app = await read('src/app.js');
  const groups = await read('src/bean-groups-controller.js');
  assert.match(app, /beanSummaryBlockHtml/);
  assert.match(app, /bean-consumption-summary/);
  assert.match(app, /今日已饮用/);
  assert.match(app, /已经超量喽，可能影响身体健康/);
  assert.match(app, /可能妨碍入睡，要不明天再喝/);
  assert.match(app, /beanConsumptionSummaryHtml\(\).*recommendationLeaderboardHtml\(\)/s);
  assert.match(groups, /querySelector\('\.bean-summary-block'\)/);
});

test('cloud panel exposes status and both recovery actions', async () => {
  const panel = await read('src/ui/account-sync-panel.js');
  assert.match(panel, /cloud-sync-indicator/);
  assert.match(panel, /立即同步/);
  assert.match(panel, /下载云端数据合并本地/);
  assert.match(panel, /LuckyBeanCloudSync\?\.pullNow/);
  const sync = await read('src/services/cloud-sync-service.js');
  assert.match(sync, /markMergeBackPending/);
  assert.match(sync, /mergeBack: true/);
  assert.match(sync, /mergeAndUpload/);
  assert.match(sync, /lastSyncedUnitKeys/);
});
