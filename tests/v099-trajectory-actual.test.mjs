import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('highlighted trajectory is sourced from optimizer actualSignal', async () => {
  const [app, renderer, html, sw] = await Promise.all([
    read('src/app.js'), read('src/v098-trajectory-v17.js'), read('index.html'), read('sw.js')
  ]);
  assert.match(app, /trajectory-series extraction/);
  assert.match(app, /line\('actualSignal'\)/);
  assert.match(renderer, /sourceExtraction/);
  assert.match(renderer, /trajectory-series\.extraction/);
  assert.match(renderer, /const extraction = sourceExtraction\.length/);
  assert.match(renderer, /points="\$\{extraction\}"/);
  assert.match(app, /<summary>深入解读<\/summary>/);
  assert.match(html, /release-revision" content="099b/);
  assert.match(sw, /luckybean-v0\.9\.9-main-099b/);
});
