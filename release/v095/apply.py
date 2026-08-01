from pathlib import Path
import json

ROOT = Path('.')


def replace(path, pairs):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    for old, new in pairs:
        text = text.replace(old, new)
    p.write_text(text, encoding='utf-8')


replace('index.html', [
    ('./styles-v094.css?v=094', './styles-v095.css?v=095'),
    ('./public/splash-red.svg?v=094', './public/splash-red.jpg?v=095'),
    ('./src/v094-ui.js?v=094', './src/v095-ui.js?v=095'),
])
replace('src/utils.js', [("APP_VERSION = '0.9.4'", "APP_VERSION = '0.9.5'")])
replace('src/app.js', [
    ('放入撷吉', '移至溯旧'),
    ('移入撷吉', '移至溯旧'),
    ('酌一味', '小酌'),
    ('撷取', '溯旧'),
])

package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '0.9.5'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

lock_path = ROOT / 'package-lock.json'
if lock_path.exists():
    lock = json.loads(lock_path.read_text(encoding='utf-8'))
    lock['version'] = '0.9.5'
    if isinstance(lock.get('packages'), dict) and isinstance(lock['packages'].get(''), dict):
        lock['packages']['']['version'] = '0.9.5'
    lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

manifest_path = ROOT / 'manifest.webmanifest'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['name'] = '富贵盒子 0.9.5'
manifest['description'] = '富贵盒子 0.9.5 内部测试版：咖啡豆管理、专业冲煮计算、品鉴与器具库存'
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

sw_path = ROOT / 'sw.js'
sw = sw_path.read_text(encoding='utf-8')
sw = sw.replace("luckybean-v0.9.4", "luckybean-v0.9.5")
sw = sw.replace("'./styles-v094.css'", "'./styles-v095.css'")
sw = sw.replace("'./src/v094-ui.js'", "'./src/v095-ui.js'")
sw = sw.replace("'./public/fallback-codebook.json', './public/legacy-flavor-map.json', './public/app-logo.webp', './public/splash.webp', './public/splash-red.svg', './public/splash-alt.svg', './public/action-grid.svg', './public/action-grid.webp'", "'./public/fallback-codebook.json', './public/legacy-flavor-map.json', './public/app-logo.webp', './public/splash-red.jpg', './public/splash-white.jpg', './public/settings-mascot.png'")
sw_path.write_text(sw, encoding='utf-8')

for test in (ROOT / 'tests').glob('*.test.mjs'):
    text = test.read_text(encoding='utf-8')
    text = text.replace('0.9.4', '0.9.5').replace('v094-ui.js', 'v095-ui.js').replace('styles-v094.css', 'styles-v095.css')
    test.write_text(text, encoding='utf-8')

(ROOT / 'tests/v095.test.mjs').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('v0.9.5 runtime entry and version align', async () => {
  const [html, pkg, utils, sw, manifest] = await Promise.all([
    read('index.html'), read('package.json'), read('src/utils.js'), read('sw.js'), read('manifest.webmanifest')
  ]);
  assert.match(html, /styles-v095\.css\?v=095/);
  assert.match(html, /src\/v095-ui\.js\?v=095/);
  assert.match(html, /splash-red\.jpg\?v=095/);
  assert.equal(JSON.parse(pkg).version, '0.9.5');
  assert.match(utils, /APP_VERSION = '0\.9\.5'/);
  assert.match(sw, /luckybean-v0\.9\.5/);
  assert.equal(JSON.parse(manifest).name, '富贵盒子 0.9.5');
});

test('v0.9.5 requested modes, labels and artwork exist', async () => {
  const ui = await read('src/v095-ui.js');
  for (const marker of [
    '雷达图 / 互动品鉴 / 札记',
    '品鉴全流程',
    '互动品鉴 / 札记',
    '仅作分段互动 / 札记 / 打分',
    '仅作札记 / 打分',
    'settings-mascot.png',
    'splash-white.jpg',
    '移至溯旧',
  ]) assert.ok(ui.includes(marker), marker);
});

test('only note mode may skip native sensory nodes', async () => {
  const ui = await read('src/v095-ui.js');
  assert.match(ui, /async function skipNativeToNote/);
  assert.doesNotMatch(ui, /advanceNativeToScore/);
  assert.match(ui, /attachNativeSummary/);
});
''', encoding='utf-8')

readme = '''# 富贵盒子 Lucky Bean

**当前内部测试版本：v0.9.5**  
**稳定网址：<https://zjcrop.github.io/BrewIon/luckybean/>**

富贵盒子是本地优先的咖啡豆档案、冲煮方案和感官品鉴工具。1.0 之前均为内部测试版本，允许直接在 `main` 修改和部署；仓库根目录 `index.html` 是唯一网页入口，不再维护独立 Beta 页面。

## v0.9.5

- 使用用户提供的红色、白色启动封面；红色默认，白色可在器设中选择；
- 修复黑色/白色模式切换，顶部“分组 / 管理 / 主题”同排靠右；
- 统一“溯旧”“小酌”等正式命名；
- 修正豆卡处理法、冷藏雪花和详情操作排版；
- 冲煮基础字段按整行四等分，冲煮法与分段方式按二等分；
- 冲煮轨迹与专业内容标题左对齐，箭头紧随标题；
- 品鉴入口改为三个直接启动的流程模式；
- 器设页底部加入透明背景品牌图；
- 删除 v0.9.4 扩展、旧 SVG/WebP 封面、旧 Beta 文档和不再使用的发布资源。

## 目录

```text
index.html              主线网页入口
styles.css              基础样式
styles-v095.css         v0.9.5 响应式界面
src/                    应用、数据库、冲煮与品鉴逻辑
public/                 正式运行图片和编码表
tests/                  单元、静态及浏览器测试
android/                暂停发布的 Android 工程
```

## 本地运行与检查

```bash
python3 -m http.server 8080
npm test
npm run check
npm run browser:smoke
```

不要通过 `file://` 打开。每次发布必须同步更新 `package.json`、`src/utils.js`、`sw.js`、`manifest.webmanifest` 和 README，并由 BrewIon 发布流程核验线上版本、源 SHA 与资源 HTTP 状态。

## 数据边界

数据默认保存在当前设备 IndexedDB。真实邮箱/微信注册、跨设备同步和跨用户留言仍需独立后端；网页不会伪装为已经完成这些能力。

## 许可证

以 `LICENSE` 和 `LICENSE-NOTICE.md` 为准。
'''
(ROOT / 'README.md').write_text(readme, encoding='utf-8')

changelog_path = ROOT / 'CHANGELOG.md'
changelog = changelog_path.read_text(encoding='utf-8')
entry = '''## 0.9.5 — 2026-08-01\n\n- 替换为用户提供的红色/白色启动封面，红色默认、白色可选；\n- 修复主题切换、顶部控制排版、豆卡和详情操作布局；\n- 重构小酌字段、结果折叠标题和三种品鉴流程；\n- 器设页加入透明品牌图；\n- 1.0 前统一按内部测试版在 main 维护；\n- 清理旧 v094 扩展、旧 SVG/WebP 封面和 Beta 发布残留。\n\n'''
if '## 0.9.5 — 2026-08-01' not in changelog:
    changelog = changelog.replace('# Changelog\n\n', '# Changelog\n\n' + entry, 1)
changelog_path.write_text(changelog, encoding='utf-8')

for path in [
    'src/v094-ui.js',
    'styles-v094.css',
    'tests/v094.test.mjs',
    'public/splash-red.svg',
    'public/splash-alt.svg',
    'public/action-grid.svg',
    'public/action-grid.webp',
    'public/splash.webp',
    'public/app-icon.svg',
    'docs/SHARE_CODE_FORMAT_v0.8-beta.md',
    'docs/v0.8.0-beta-release-note.md',
    'docs/v0.9.0-beta-release-note.md',
    'docs/逐条校验报告_v0.8.0-beta.md',
]:
    (ROOT / path).unlink(missing_ok=True)

print('Applied Lucky Bean v0.9.5 source changes.')
