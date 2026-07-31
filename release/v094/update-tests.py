from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f'{label}: expected old assertion not found')
    return text.replace(old, new, 1)


core_path = ROOT / 'tests' / 'core.test.mjs'
core = core_path.read_text(encoding='utf-8')
core = replace_required(
    core,
    "['>藏<','>拾<','>鉴<','>器<','>豆藏<','>拾味<','>品鉴<','>器设<','>寻<','>添<','>撷<','>择<']",
    "['>藏<','>酌<','>鉴<','>器<','>豆藏<','>小酌<','>品鉴<','>器设<','>搜索<','>添丁<','>溯旧<','>选择<']",
    'core navigation labels',
)
core = replace_required(
    core,
    "['豆藏：咖啡豆管理','拾味：冲煮制作','品鉴：感官评价','器设：设备与系统设置']",
    "['豆藏：咖啡豆管理','小酌：冲煮制作','品鉴：感官评价','器设：设备与系统设置']",
    'core navigation aria labels',
)
core = replace_required(core, "'不记录则返回拾味'", "'不记录则返回小酌'", 'core brew return copy')
core_path.write_text(core, encoding='utf-8')

v092_path = ROOT / 'tests' / 'v092.test.mjs'
v092 = v092_path.read_text(encoding='utf-8')
v092 = replace_required(v092, "test('0.9.3 keeps 0.9.2 interaction baseline'", "test('0.9.4 keeps 0.9.2 interaction baseline'", 'v092 test title')
v092 = replace_required(v092, "assert.equal(JSON.parse(pkg).version, '0.9.3');", "assert.equal(JSON.parse(pkg).version, '0.9.4');", 'v092 package version')
v092 = replace_required(v092, "assert.match(sw, /luckybean-v0\\.9\\.3/);", "assert.match(sw, /luckybean-v0\\.9\\.4/);", 'v092 cache version')
v092_path.write_text(v092, encoding='utf-8')

v093_path = ROOT / 'tests' / 'v093.test.mjs'
v093 = v093_path.read_text(encoding='utf-8')
v093 = replace_required(v093, "test('0.9.3 version and visual assets'", "test('0.9.4 version and visual assets'", 'v093 test title')
v093 = replace_required(v093, "assert.equal(JSON.parse(pkg).version,'0.9.3');", "assert.equal(JSON.parse(pkg).version,'0.9.4');", 'v093 package version')
v093 = replace_required(v093, "assert.match(sw,/luckybean-v0\\.9\\.3/);", "assert.match(sw,/luckybean-v0\\.9\\.4/);", 'v093 cache version')
v093_path.write_text(v093, encoding='utf-8')

v094 = '''import test from 'node:test';
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
'''
(ROOT / 'tests' / 'v094.test.mjs').write_text(v094, encoding='utf-8')

print('Updated release tests for Lucky Bean 0.9.4.')
