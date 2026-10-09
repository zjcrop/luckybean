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

test('package controller automatically starts OCR after every successful image entry', () => {
  const controller = fs.readFileSync(path.join(root, 'src/package-capture-controller.js'), 'utf8');
  assert.match(controller, /let addedCount = 0/);
  assert.match(controller, /addedCount \+= 1/);
  assert.match(controller, /luckybean:package-auto-recognition-start/);
  assert.match(controller, /void runRecognition\(\)/);
  assert.doesNotMatch(controller, /bagRecognizeBtn/);
  assert.doesNotMatch(controller, /interceptRecognitionClick/);
});

test('OCR failure keeps the current photos and exposes an explicit retry action', () => {
  const controller = fs.readFileSync(path.join(root, 'src/package-capture-controller.js'), 'utf8');
  assert.match(controller, /ocrError/);
  assert.match(controller, /id="bagRetryRecognitionBtn"/);
  assert.match(controller, /bagRetryRecognitionBtn[^\n]*addEventListener\('click',[^\n]*runRecognition\(\)/);
  assert.match(controller, /若已刷新页面，请重新选择照片/);
});

test('released thumbnail URL is detached from its image element before revocation', () => {
  const controller = fs.readFileSync(path.join(root, 'src/package-capture-controller.js'), 'utf8');
  const releasePreview = controller.match(/function releasePreview\([\s\S]*?\n}/)?.[0] || '';
  assert.ok(releasePreview.indexOf("removeAttribute('src')") < releasePreview.indexOf('URL.revokeObjectURL(url)'));
});

test('camera, small upload and cropped upload all converge on addFiles', () => {
  const controller = fs.readFileSync(path.join(root, 'src/package-capture-controller.js'), 'utf8');
  assert.match(controller, /#bagCameraInput[^\n]*addFiles\(event\.target\.files\)/);
  assert.match(controller, /processed\?\.length\) await addFiles\(processed\)/);
});

test('flow polish retains JARC formatting only and does not own OCR triggering', () => {
  const source = fs.readFileSync(path.join(root, 'src/ui/package-capture-flow-polish.js'), 'utf8');
  assert.doesNotMatch(source, /queueAutomaticRecognition/);
  assert.doesNotMatch(source, /bagRecognizeBtn/);
});

test('production html loads the flow polish controller', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /src\/ui\/package-capture-flow-polish\.js/);
});
