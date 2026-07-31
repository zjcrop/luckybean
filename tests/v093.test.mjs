import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const text = async path => readFile(new URL(path, root), 'utf8');

test('0.9.4 version and visual assets', async () => {
  const [pkg, html, css, sw, manifest] = await Promise.all([text('package.json'),text('index.html'),text('styles.css'),text('sw.js'),text('manifest.webmanifest')]);
  assert.equal(JSON.parse(pkg).version,'0.9.4');
  assert.match(html,/id="splashScreen"/); assert.match(html,/点击进入/); assert.match(css,/public\/action-grid\.webp/); assert.match(sw,/luckybean-v0\.9\.4/);
  assert.equal(JSON.parse(manifest).icons.length,1);
  for (const path of ['public/app-logo.webp','public/splash.webp','public/action-grid.webp']) assert.ok((await stat(new URL(path,root))).size>500);
});

test('0.9.3 sensory, cold storage and gear requirements', async () => {
  const [app,css,codebook] = await Promise.all([text('src/app.js'),text('styles.css'),text('src/codebook.js')]);
  for(const marker of ['dripperPrice','data-dripper-item','点击展开滤杯列表','intensity: true','风味强度','酵感强度','增味强度','札记','frozen-weight','❄️','score-head-row','score-derived-row']) assert.ok(app.includes(marker)||css.includes(marker),marker);
  assert.ok(app.includes("floral: { 1: ['无'] }"));
  assert.ok(app.includes('取消</button><button id="prevSensoryNodeBtn"'));
  assert.doesNotMatch(app,/范围 -10 至 \+10/);
  assert.match(codebook,/row.length >= 9 \? row\[4\] : row\[1\]/);
  assert.match(app,/row\[4\]/);
});
