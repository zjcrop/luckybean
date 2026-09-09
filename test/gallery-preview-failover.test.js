import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('gallery preview never aborts solely because an EXIF thumbnail is broken', async () => {
  const source = await readFile(new URL('../src/gallery-image-preview.js', import.meta.url), 'utf8');
  assert.match(source, /async function tryEmbeddedThumbnail/);
  assert.match(source, /EXIF 内嵌缩略图不可解码，回退到受限原图预览/);
  assert.match(source, /const embedded = await tryEmbeddedThumbnail\(header, maxEdge\);/);
  assert.match(source, /const boundedDecode = await tryBoundedBitmapDecode\(blob, header, maxEdge\);/);
  assert.ok(source.indexOf('tryEmbeddedThumbnail(header, maxEdge)') < source.indexOf('tryBoundedBitmapDecode(blob, header, maxEdge)'));
});

test('gallery preview has a second bounded decoder path before failing', async () => {
  const source = await readFile(new URL('../src/gallery-image-preview.js', import.meta.url), 'utf8');
  assert.match(source, /async function tryImageDecoderPreview/);
  assert.match(source, /desiredWidth:target\.width/);
  assert.match(source, /desiredHeight:target\.height/);
  assert.match(source, /const imageDecoder = await tryImageDecoderPreview\(blob, header, maxEdge\);/);
});

test('gallery preview failures must be user-visible instead of silently swallowing upload', async () => {
  const source = await readFile(new URL('../src/gallery-image-preview.js', import.meta.url), 'utf8');
  assert.match(source, /function notifyPreviewFailure/);
  assert.match(source, /luckybean:user-notice/);
  assert.match(source, /图片已选择，但裁切预览失败/);
  assert.match(source, /notifyPreviewFailure\(wrapped\.message\)/);
});

test('package capture routes the real gallery input directly through preprocessFiles before addFiles', async () => {
  const source = await readFile(new URL('../src/package-capture-controller.js', import.meta.url), 'utf8');
  assert.match(source, /async function addGalleryFiles\(fileList\)/);
  assert.match(source, /LuckyBeanGalleryImagePreprocess\?\.preprocessFiles/);
  assert.match(source, /const processed = await preprocess\(files\);/);
  assert.match(source, /if \(processed\?\.length\) await addFiles\(processed\);/);
  assert.match(source, /input\.dataset\.lbPreprocessed = '1';[\s\S]{0,80}input\.click\(\)/);
  assert.match(source, /#bagGalleryInput'[\s\S]{0,260}addGalleryFiles\(files\)/);
  assert.doesNotMatch(source, /new DataTransfer\(\)/);
});
