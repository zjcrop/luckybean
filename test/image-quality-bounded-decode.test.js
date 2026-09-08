import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/image-quality.js', import.meta.url), 'utf8');

test('oversized package photos are decoder-bounded before any full-raster canvas work', () => {
  assert.match(source, /async function encodedDimensions\(blob\)/);
  assert.match(source, /Math\.max\(encoded\.width, encoded\.height\) > maxEdge/);
  assert.match(source, /resizeWidth:target\.width/);
  assert.match(source, /resizeHeight:target\.height/);
  assert.match(source, /resizeQuality:'high'/);
  assert.match(source, /throw new Error\(`当前浏览器无法安全缩放高分辨率图片/,
    'known oversized images must not silently fall back to a full decoded raster');
});

test('quality sampling releases its canvas before the OCR JPEG output canvas is allocated', () => {
  const releaseIndex = source.indexOf('releaseCanvas(sampleCanvas);');
  const outputIndex = source.indexOf("outputCanvas = document.createElement('canvas');");
  assert.ok(releaseIndex >= 0 && outputIndex > releaseIndex,
    'sample backing memory must be released before output canvas allocation');
});
