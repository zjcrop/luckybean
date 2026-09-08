import test from 'node:test';
import assert from 'node:assert/strict';
import { PACKAGE_OCR_MAX_EDGE, PACKAGE_OCR_JPEG_QUALITY } from '../src/image-quality.js';

test('web package OCR preserves detail up to the PP-OCR detector budget', () => {
  assert.equal(PACKAGE_OCR_MAX_EDGE, 2200);
  assert.equal(PACKAGE_OCR_JPEG_QUALITY, 0.94);
  assert.ok(PACKAGE_OCR_MAX_EDGE > 1600, 'web OCR must not regress to the former 1600px package downscale');
});
