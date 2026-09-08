import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync('src/ui/p3-cloud-list-refresh-controller.js', 'utf8');
const boot = fs.readFileSync('src/ui/recognition-interaction-controller.js', 'utf8');

test('priority cloud list restore refreshes the established UI path immediately', () => {
  assert.match(bridge, /luckybean:cloud-list-restored/);
  assert.match(bridge, /luckybean:app-refreshed/);
  assert.match(bridge, /phase:\s*'list'/);
  assert.doesNotMatch(bridge, /luckybean:data-changed/, 'list-only UI refresh must not mark data dirty or schedule upload');
});

test('list refresh bridge is loaded by the normal UI boot path', () => {
  assert.match(boot, /import '\.\/p3-cloud-list-refresh-controller\.js'/);
});
