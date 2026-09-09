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

test('gallery crop completion schedules the existing recognition button automatically', () => {
  const source = fs.readFileSync(path.join(root, 'src/ui/package-capture-flow-polish.js'), 'utf8');
  assert.match(source, /const processed = await originalPreprocessFiles\(files\)/);
  assert.match(source, /processed\.length\) queueAutomaticRecognition\(\)/);
  assert.match(source, /#bagRecognizeBtn/);
  assert.match(source, /button\.click\(\)/);
  assert.match(source, /\.lb-img-pre/);
});

test('production html loads the flow polish controller', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /src\/ui\/package-capture-flow-polish\.js/);
});
