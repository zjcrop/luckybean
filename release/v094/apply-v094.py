from __future__ import annotations

import base64
import gzip
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RELEASE = ROOT / 'release' / 'v094'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


def write_asset(prefix: str, output: Path) -> None:
    parts = sorted((RELEASE / 'assets').glob(f'{prefix}-*.b64'))
    if not parts:
        raise RuntimeError(f'missing asset chunks for {prefix}')
    payload = ''.join(part.read_text(encoding='ascii').strip() for part in parts)
    raw = gzip.decompress(base64.b64decode(payload))
    text = raw.decode('utf-8')
    if '<svg' not in text or 'viewBox=' not in text:
        raise RuntimeError(f'{prefix} is not a valid SVG')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding='utf-8')


write_asset('red', ROOT / 'public' / 'splash-red.svg')
write_asset('alt', ROOT / 'public' / 'splash-alt.svg')
write_asset('icon', ROOT / 'public' / 'action-grid.svg')

package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '0.9.4'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

utils_path = ROOT / 'src' / 'utils.js'
utils = utils_path.read_text(encoding='utf-8')
utils = replace_once(utils, "export const APP_VERSION = '0.9.3';", "export const APP_VERSION = '0.9.4';", 'app version')
utils_path.write_text(utils, encoding='utf-8')

index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
index = replace_once(index, '<link rel="stylesheet" href="./styles.css">', '<link rel="stylesheet" href="./styles.css">\n  <link rel="stylesheet" href="./styles-v094.css?v=094">', 'extension stylesheet')
index = re.sub(r'<img src="\./public/splash\.(?:webp|svg)(?:\?[^\"]*)?" alt="富贵盒子启动画面">', '<img id="splashImage" src="./public/splash-red.svg?v=094" alt="富贵盒子启动画面">', index, count=1)
index = replace_once(index, '<button class="small-control" id="manageBtn" type="button">管理</button>', '<button class="small-control" id="manageBtn" type="button">管理</button>\n            <button class="theme-toggle" id="themeToggleBtn" type="button" aria-label="切换到白天模式"></button>', 'theme button')
index = index.replace('<h1 id="titleBrew" class="page-seal">拾味</h1>', '<h1 id="titleBrew" class="page-seal">小酌</h1>')
index = index.replace('aria-label="拾味：冲煮制作"><span>拾</span>', 'aria-label="小酌：冲煮制作"><span>酌</span>')
index = index.replace('aria-label="寻找豆卡">寻</button>', 'aria-label="搜索豆卡">搜索</button>')
index = index.replace('aria-label="新增豆卡">添</button>', 'aria-label="新增豆卡">添丁</button>')
index = index.replace('aria-label="撷取往昔记录">撷</button>', 'aria-label="追溯往昔记录">溯旧</button>')
index = index.replace('aria-label="选择推荐豆卡">择</button>', 'aria-label="选择推荐豆卡">选择</button>')
index = replace_once(index, '<script type="module" src="./src/app.js"></script>', '<script type="module" src="./src/app.js"></script>\n  <script type="module" src="./src/v094-ui.js?v=094"></script>', 'extension script')
index_path.write_text(index, encoding='utf-8')

app_path = ROOT / 'src' / 'app.js'
app = app_path.read_text(encoding='utf-8')
app = replace_once(app, "brew: { nav: '拾', title: '拾味', browser: '拾味' },", "brew: { nav: '酌', title: '小酌', browser: '小酌' },", 'brew page metadata')
app = app.replace('aria-label="用这只豆拾一味">拾</button>', 'aria-label="用这只豆酌一味">酌</button>')
app = app.replace('>拾一味</button>', '>酌一味</button>')
app = app.replace('返回拾味', '返回小酌')
app = app.replace('点击“添”录入，或从“寻”调整条件。', '点击“添丁”录入，或从“搜索”调整条件。')
app_path.write_text(app, encoding='utf-8')

sw_path = ROOT / 'sw.js'
sw = sw_path.read_text(encoding='utf-8')
sw = re.sub(r"const CACHE_NAME = 'luckybean-v[^']+';", "const CACHE_NAME = 'luckybean-v0.9.4';", sw, count=1)
sw = replace_once(sw, "'./', './index.html', './styles.css', './manifest.webmanifest',", "'./', './index.html', './styles.css', './styles-v094.css', './manifest.webmanifest',", 'service worker css')
sw = replace_once(sw, "'./src/app.js', './src/utils.js'", "'./src/app.js', './src/v094-ui.js', './src/utils.js'", 'service worker js')
sw = replace_once(sw, "'./public/fallback-codebook.json', './public/legacy-flavor-map.json', './public/app-logo.webp', './public/splash.webp', './public/action-grid.webp'", "'./public/fallback-codebook.json', './public/legacy-flavor-map.json', './public/app-logo.webp', './public/splash.webp', './public/splash-red.svg', './public/splash-alt.svg', './public/action-grid.svg', './public/action-grid.webp'", 'service worker assets')
sw_path.write_text(sw, encoding='utf-8')

checks = {
    'index splash': 'splash-red.svg?v=094' in index,
    'theme toggle': 'themeToggleBtn' in index,
    'four action labels': all(label in index for label in ['搜索</button>', '添丁</button>', '溯旧</button>', '选择</button>']),
    'extension import': 'v094-ui.js?v=094' in index,
    'brew title': '小酌' in index and "nav: '酌'" in app,
    'cache': 'luckybean-v0.9.4' in sw,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise RuntimeError('failed assertions: ' + ', '.join(failed))

print('Applied Lucky Bean 0.9.4 UI, vector splash, theme, brew layout and sensory extension.')
