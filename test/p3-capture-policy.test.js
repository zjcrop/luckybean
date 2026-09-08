import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy = fs.readFileSync('src/ui/p3-capture-policy-controller.js', 'utf8');
const boot = fs.readFileSync('src/ui/recognition-interaction-controller.js', 'utf8');

test('photo OCR failure keeps the four-action flow and suppresses blank manual fallback UI', () => {
  assert.match(policy, /#bagManualBtn/);
  assert.match(policy, /#bagOcrText/);
  assert.match(policy, /!String\(raw\.value \|\| ''\)\.trim\(\)/);
  assert.match(policy, /\.bag-recognition-result/);
  assert.doesNotMatch(policy, /luckybean:data-changed/);
});

test('capture policy is loaded by the normal recognition UI boot path', () => {
  assert.match(boot, /import '\.\/p3-capture-policy-controller\.js'/);
});
