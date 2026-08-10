import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('all pages use the same red seal slot geometry', async () => {
  const index = await read('index.html');
  assert.equal((index.match(/class="page-seal-slot"/g) || []).length, 4);
  const styles = await read('styles.css');
  assert.match(styles, /one canonical header geometry/);
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

test('bean collection restores coffee world and preference profile', async () => {
  const app = await read('src/app.js');
  const upgrades = await read('src/ui-upgrade-controller.js');
  const originMap = await read('src/origin-map-controller.js');
  assert.match(app, /data-v099f-preference/);
  assert.match(app, /data-v099f-world/);
  assert.match(upgrades, /风味喜好数字测写/);
  assert.match(upgrades, /咖啡世界/);
  assert.match(originMap, /public\/vendor\/jsvectormap\/jsvectormap\.min\.js/);
  assert.match(originMap, /public\/vendor\/jsvectormap\/world\.js/);
  assert.doesNotMatch(originMap, /cdn\.jsdelivr\.net/);
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
