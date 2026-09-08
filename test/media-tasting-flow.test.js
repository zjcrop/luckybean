import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('media tasting UI is loaded and adds a generator beside sensory records', async () => {
  const boot = await read('src/ui/recognition-interaction-controller.js');
  const ui = await read('src/ui/media-tasting-controller.js');
  assert.match(boot, /import '\.\/media-tasting-controller\.js'/);
  assert.match(ui, /\.sensory-record-button\[data-sensory-record\]/);
  assert.match(ui, /生成媒体品鉴/);
  assert.match(ui, /BUILTIN_TEMPLATES/);
  for (const id of ['builtin-clean-card','builtin-social-note','builtin-professional','builtin-brew-log','builtin-caption']) assert.match(ui, new RegExp(id));
});

test('custom templates persist but generated media copy is explicitly ephemeral', async () => {
  const ui = await read('src/ui/media-tasting-controller.js');
  assert.match(ui, /TEMPLATE_SETTING_ID = 'media\.tasting\.templates\.v1'/);
  assert.match(ui, /mediaTemplateUpload/);
  assert.match(ui, /await setSetting\(TEMPLATE_SETTING_ID/);
  assert.match(ui, /退出后将立即销毁/);
  assert.match(ui, /activeSession\.draftText = ''/);
  assert.doesNotMatch(ui, /put\(['"]sensoryRecords/);
  assert.doesNotMatch(ui, /put\(['"]beans/);
  assert.match(ui, /navigator\.clipboard\.writeText\(activeSession\.draftText\)/);
});

test('media AI client uses the existing public gateway pattern and an explicit contract', async () => {
  const service = await read('src/services/media-tasting-ai-service.js');
  assert.match(service, /media-tasting-v1/);
  assert.match(service, /luckybean-media-tasting\/1\.0/);
  assert.match(service, /BREW_API_PUBLIC_KEY/);
  assert.match(service, /x-installation-id/);
  assert.match(service, /cache: 'no-store'/);
});
