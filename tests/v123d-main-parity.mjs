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
  assert.match(app, /public\/settings-mascot\.webp/);
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
});
