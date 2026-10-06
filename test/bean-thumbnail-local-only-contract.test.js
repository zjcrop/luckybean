import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const storage = fs.readFileSync(new URL('../src/domain/beans/bean-thumbnail-storage.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const cards = fs.readFileSync(new URL('../src/ui/bean-thumbnail-controller.js', import.meta.url), 'utf8');
const cloudCodec = fs.readFileSync(new URL('../src/cloud-codec-base.js', import.meta.url), 'utf8');

test('thumbnail bytes live in an independent local IndexedDB database', () => {
  assert.match(storage, /luckybean-local-assets/);
  assert.match(storage, /indexedDB\.open/);
  assert.match(storage, /data:image\\\/jpeg;base64/);
  assert.doesNotMatch(storage, /\b(cloud|sync|archive)\b/i);
  assert.doesNotMatch(cloudCodec, /thumbnail/i);
});

test('required maker and brand are saved separately from local thumbnails', () => {
  assert.match(app, /\['beanRoaster','烘豆商'\]/);
  assert.match(app, /\['beanBrand','品牌'\]/);
  assert.match(app, /roasterName: formValue\('beanRoaster'\), productName: formValue\('beanBrand'\)/);
  assert.match(cards, /getBeanThumbnail\(beanId\)/);
  assert.match(app, /data-bean-thumbnail="\$\{esc\(bean\.id\)\}"/);
  assert.match(cloudCodec, /bean\.productName.*bean\.brand/);
  assert.match(cloudCodec, /productName: row\[25\]/);
});
