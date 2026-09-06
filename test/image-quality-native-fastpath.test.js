import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePackageImage } from '../src/image-quality.js';

test('native Android OCR bypasses WebView decode and canvas preprocessing', async () => {
  const previousAndroid = globalThis.__LUCKYBEAN_ANDROID__;
  const previousBridge = globalThis.LuckyBeanRecognitionBridge;
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  let decodeCalls = 0;
  try {
    globalThis.__LUCKYBEAN_ANDROID__ = true;
    globalThis.LuckyBeanRecognitionBridge = { recognizeCoffeeBag() {} };
    globalThis.createImageBitmap = async () => { decodeCalls += 1; throw new Error('native fast path must not decode in WebView'); };
    Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: { createElement() { throw new Error('native fast path must not allocate canvas'); } } });
    const source = new Blob([new Uint8Array(2_000_000)], { type: 'image/jpeg' });
    const prepared = await preparePackageImage(source);
    assert.equal(prepared.blob, source);
    assert.equal(prepared.nativeSource, true);
    assert.equal(prepared.metrics, null);
    assert.equal(decodeCalls, 0);
  } finally {
    if (previousAndroid === undefined) delete globalThis.__LUCKYBEAN_ANDROID__; else globalThis.__LUCKYBEAN_ANDROID__ = previousAndroid;
    if (previousBridge === undefined) delete globalThis.LuckyBeanRecognitionBridge; else globalThis.LuckyBeanRecognitionBridge = previousBridge;
    if (previousBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = previousBitmap;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});
