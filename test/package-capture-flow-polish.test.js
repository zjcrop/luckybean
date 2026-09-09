import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeJarcDisplayText } from '../src/ui/package-capture-flow-polish.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

test('JARC numeric varieties are shortened only for display text', () => {
  assert.equal(normalizeJarcDisplayText('JARC 74110'), '74110');
  assert.equal(normalizeJarcDisplayText('Jarc-74158'), '74158');
  assert.equal(normalizeJarcDisplayText('埃塞 / JARC 74112 / 水洗'), '埃塞 / 74112 / 水洗');
  assert.equal(normalizeJarcDisplayText('JARC Selection'), 'JARC Selection');
});

test('any completed package image entry schedules OCR and hides manual recognition UI', () => {
  const source = fs.readFileSync(path.join(root, 'src/ui/package-capture-flow-polish.js'), 'utf8');
  assert.match(source, /\[data-bag-image-id\]/);
  assert.match(source, /signature && signature !== lastTriggeredImageSignature/);
  assert.match(source, /queueAutomaticRecognition\(signature\)/);
  assert.match(source, /button\.hidden = true/);
  assert.match(source, /button\.click\(\)/);
  assert.doesNotMatch(source, /originalPreprocessFiles/);
  assert.doesNotMatch(source, /installGalleryAutoRecognition/);
});

test('automatic OCR applies to camera, small upload and cropped upload through the shared addFiles card state', () => {
  const controller = fs.readFileSync(path.join(root, 'src/package-capture-controller.js'), 'utf8');
  assert.match(controller, /#bagCameraInput[^\n]*addFiles\(event\.target\.files\)/);
  assert.match(controller, /processed\?\.length\) await addFiles\(processed\)/);
  assert.match(controller, /data-bag-image-id/);
  assert.match(controller, /id="bagRecognizeBtn"/);
});

test('production html loads the flow polish controller', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /src\/ui\/package-capture-flow-polish\.js/);
});
