import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = async path => readFile(new URL(path, root), 'utf8');

test('0.9.4 interface, vector assets and cache manifest', async () => {
  const [pkg, html, css, extension, sw] = await Promise.all([
    text('package.json'), text('index.html'), text('styles-v094.css'), text('src/v094-ui.js'), text('sw.js')
  ]);
  assert.equal(JSON.parse(pkg).version, '0.9.4');
  for (const marker of ['themeToggleBtn','splash-red.svg?v=094','styles-v094.css?v=094','v094-ui.js?v=094','>小酌<','>搜索<','>添丁<','>溯旧<','>选择<']) assert.ok(html.includes(marker), marker);
  for (const marker of ['html[data-theme="light"]','.fab-wrap.action-grid','action-grid.svg?v=094','.v094-sensory-overlay','.v094-radar-editor']) assert.ok(css.includes(marker), marker);
  for (const marker of ['splashSources','applyTheme','restructureBrew','openSegmentedWizard','bindRadar']) assert.ok(extension.includes(marker), marker);
  for (const marker of ['luckybean-v0.9.4','styles-v094.css','v094-ui.js','splash-red.svg','splash-alt.svg','action-grid.svg']) assert.ok(sw.includes(marker), marker);
  for (const path of ['public/splash-red.svg','public/splash-alt.svg','public/action-grid.svg']) {
    const content = await text(path);
    assert.match(content, /<svg/);
    assert.match(content, /viewBox=/);
    assert.ok((await stat(new URL(path, root))).size > 300, path);
  }
});

test('0.9.4 segmented sensory workflow and draggable radar editors are present', async () => {
  const extension = await text('src/v094-ui.js');
  for (const marker of ['干香','高温','中温','低温','整体强度','跳过当前温区','拖拽圆点标定各轴强度','sensoryNaturalNote']) assert.ok(extension.includes(marker), marker);
  assert.ok(extension.includes("if (!button.classList.contains('selected'))"));
});
