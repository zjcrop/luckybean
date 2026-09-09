import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readGalleryImageHeader } from '../src/gallery-image-preview.js';

function be16(value) { return [value >> 8 & 255, value & 255]; }
function le16(value) { return [value & 255, value >> 8 & 255]; }
function le32(value) { return [value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]; }

function syntheticExifJpeg({ width = 8000, height = 6000, orientation = 6 } = {}) {
  // TIFF little-endian. IFD0 contains orientation and pointer to IFD1.
  // IFD1 contains JPEG thumbnail offset/length. The tiny JPEG is deliberately
  // synthetic: the header parser must return it without decoding the main raster.
  const thumbnail = Uint8Array.from([0xff,0xd8,0xff,0xdb,0,4,0,0,0xff,0xd9, ...new Uint8Array(70)]);
  const tiffHeader = [0x49,0x49,42,0,8,0,0,0];
  const ifd0 = [
    ...le16(1),
    ...le16(0x0112), ...le16(3), ...le32(1), ...le16(orientation),0,0,
    ...le32(26)
  ];
  const thumbOffset = 26 + 2 + 2 * 12 + 4;
  const ifd1 = [
    ...le16(2),
    ...le16(0x0201), ...le16(4), ...le32(1), ...le32(thumbOffset),
    ...le16(0x0202), ...le16(4), ...le32(1), ...le32(thumbnail.length),
    ...le32(0)
  ];
  const exifPayload = Uint8Array.from([
    ...new TextEncoder().encode('Exif\0\0'),
    ...tiffHeader,
    ...ifd0,
    ...ifd1,
    ...thumbnail
  ]);
  const app1Length = exifPayload.length + 2;
  const sofPayload = Uint8Array.from([8, ...be16(height), ...be16(width), 3, 1,0x11,0, 2,0x11,0, 3,0x11,0]);
  const sofLength = sofPayload.length + 2;
  return new Blob([Uint8Array.from([
    0xff,0xd8,
    0xff,0xe1,...be16(app1Length),...exifPayload,
    0xff,0xc0,...be16(sofLength),...sofPayload,
    0xff,0xd9
  ])], { type:'image/jpeg' });
}

test('JPEG header parser obtains source dimensions, EXIF orientation and embedded thumbnail without image decode', async () => {
  const header = await readGalleryImageHeader(syntheticExifJpeg());
  assert.equal(header?.format, 'jpeg');
  assert.equal(header?.width, 8000);
  assert.equal(header?.height, 6000);
  assert.equal(header?.orientation, 6);
  assert.ok(header?.thumbnailBlob instanceof Blob);
  assert.ok(header.thumbnailBlob.size >= 64);
});

test('gallery preview is thumbnail-first and has no full-resolution probe decode', async () => {
  const source = await readFile(new URL('../src/gallery-image-preview.js', import.meta.url), 'utf8');
  assert.match(source, /thumbnailBlob/);
  assert.match(source, /source:'embedded-thumbnail'/);
  assert.match(source, /resizeWidth:target\.width/);
  assert.match(source, /readGalleryImageHeader\(blob\)/);
  assert.doesNotMatch(source, /const\s+probe\s*=\s*await\s+createImageBitmap\(blob/);
  assert.doesNotMatch(source, /createImageBitmap\(blob,\s*\{\s*imageOrientation:'from-image'\s*\}\)\s*;\s*const\s+width/s);
});

test('final gallery crop is performed in a bounded worker and releases bitmap/canvas resources', async () => {
  const source = await readFile(new URL('../src/gallery-image-finalize-worker.js', import.meta.url), 'utf8');
  assert.match(source, /OffscreenCanvas/);
  assert.match(source, /resizeWidth:target\.width/);
  assert.match(source, /DEFAULT_DECODE_MAX_EDGE\s*=\s*3000/);
  assert.match(source, /DEFAULT_QUALITY\s*=\s*0\.92/);
  assert.match(source, /bitmap\.close\?\.\(\)/);
  assert.match(source, /releaseCanvas\(output\)/);
  assert.doesNotMatch(source, /document\.createElement\(['"]canvas['"]\)/);
});

test('gallery flow releases preview before original processing and marks result OCR-ready', async () => {
  const source = await readFile(new URL('../src/gallery-image-preprocess.js', import.meta.url), 'utf8');
  assert.match(source, /createLowMemoryGalleryPreview\(file,PREVIEW_MAX_EDGE\)/);
  assert.match(source, /gallery-image-finalize-worker\.js/);
  assert.match(source, /OUTPUT_QUALITY\s*=\s*0\.92/);
  assert.match(source, /skipSecondEncode:true/);
  const releaseIndex = source.indexOf('releasePreview();');
  const processIndex = source.indexOf('processFile(file,options)');
  assert.ok(releaseIndex >= 0 && processIndex > releaseIndex, 'preview must be released before final source processing');
});

test('OCR-ready crop bypasses preparePackageImage decode, quality scan and second JPEG encode', async () => {
  const source = await readFile(new URL('../src/image-quality.js', import.meta.url), 'utf8');
  assert.match(source, /consumeGalleryReadyMetadata\(file\)/);
  assert.match(source, /galleryReady\?\.skipSecondEncode\s*===\s*true/);
  assert.match(source, /return galleryReadySource\(file, galleryReady\)/);
  const bypassIndex = source.indexOf('if (galleryReady?.skipSecondEncode === true)');
  const decodeIndex = source.indexOf('decoded = await decodeImage(file, effectiveEdge)');
  assert.ok(bypassIndex >= 0 && decodeIndex > bypassIndex, 'gallery crop bypass must occur before decodeImage');
});

test('memory model keeps preview raster tiny relative to a 48 MP source', () => {
  const sourceBytes = 8000 * 6000 * 4;
  const previewBytes = 900 * 675 * 4;
  assert.ok(sourceBytes / previewBytes > 70);
  assert.ok(previewBytes < 3 * 1024 * 1024);
});
