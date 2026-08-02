import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeJsQrResult } from '../src/qr.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('JSON QR text is parsed before misleading raw bytes', () => {
  const decoded = decodeJsQrResult({
    data: JSON.stringify({ countryCode: 'CT-ET', varietyCode: 'VR-001' }),
    binaryData: Array.from({ length: 96 }, (_, index) => (index * 17) % 256)
  }, {});
  assert.equal(decoded.countryCode, 'CT-ET');
  assert.equal(decoded.varietyCode, 'VR-001');
  assert.equal(decoded.source, 'json-qr');
});

test('invalid binary QR no longer reports a generic CRC16 failure', () => {
  assert.throws(
    () => decodeJsQrResult({ data: '', binaryData: new Array(64).fill(65) }, {}),
    /不是有效的 BrewIon CRC16 编码/
  );
});

test('built-in web OCR runtime is loaded before package capture and cached', async () => {
  const [html, sw, ocr, capture] = await Promise.all([
    read('index.html'), read('sw.js'), read('src/v096-web-ocr.js'), read('src/v096-package-capture.js')
  ]);
  const ocrIndex = html.indexOf('src/v096-web-ocr.js?v=096c');
  const captureIndex = html.indexOf('src/v096-package-capture.js?v=096c');
  assert.ok(ocrIndex >= 0, 'web OCR entry missing');
  assert.ok(captureIndex > ocrIndex, 'web OCR must load before package capture');
  assert.match(html, /worker-src 'self' blob: https:\/\/cdn\.jsdelivr\.net/);
  assert.match(html, /'wasm-unsafe-eval'/);
  assert.match(sw, /luckybean-v0\.9\.6-ocr-qr-c/);
  assert.match(sw, /src\/v096-web-ocr\.js/);
  assert.match(ocr, /tesseract\.js@\$\{TESSERACT_VERSION\}/);
  assert.match(ocr, /LuckyBeanWebOCR/);
  assert.match(ocr, /chi_sim/);
  assert.match(capture, /内置网页 OCR 可用/);
});
