from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def ensure_replace(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one old value, got {count}')
    return text.replace(old, new, 1)


def write_vector_assets() -> None:
    assets = {
        'splash-red.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" role="img" aria-labelledby="title desc">
<title id="title">富贵盒子红色启动页</title><desc id="desc">深红色咖啡豆主题启动画面</desc>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#130302"/><stop offset="0.55" stop-color="#6e0e0a"/><stop offset="1" stop-color="#180403"/></linearGradient>
  <radialGradient id="glow"><stop stop-color="#f3c17b" stop-opacity=".62"/><stop offset="1" stop-color="#f3c17b" stop-opacity="0"/></radialGradient>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="24" stdDeviation="30" flood-color="#000" flood-opacity=".55"/></filter>
</defs>
<rect width="1080" height="1920" fill="url(#bg)"/>
<circle cx="540" cy="720" r="460" fill="url(#glow)" opacity=".5"/>
<g filter="url(#shadow)" transform="translate(540 690) rotate(-18)">
  <ellipse rx="225" ry="330" fill="#2a0906" stroke="#d9a765" stroke-width="8"/>
  <path d="M0-305 C-70-180 62-85 -10 5 C-86 100 45 205 0 305" fill="none" stroke="#d9a765" stroke-width="18" stroke-linecap="round"/>
  <ellipse rx="190" ry="290" fill="none" stroke="#8f3028" stroke-width="3" opacity=".8"/>
</g>
<g text-anchor="middle" fill="#f7dfb1">
  <text x="540" y="1185" font-size="132" font-family="serif" letter-spacing="22">富贵盒子</text>
  <text x="540" y="1275" font-size="34" font-family="sans-serif" letter-spacing="16" opacity=".82">LUCKY BEAN</text>
</g>
<path d="M315 1360 H765" stroke="#d9a765" stroke-width="2" opacity=".7"/>
<text x="540" y="1438" text-anchor="middle" fill="#e7c997" font-size="30" font-family="sans-serif" letter-spacing="8">藏豆 · 小酌 · 品鉴</text>
</svg>''',
        'splash-alt.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" role="img" aria-labelledby="title desc">
<title id="title">富贵盒子素色启动页</title><desc id="desc">米白纸张与黑金咖啡豆主题启动画面</desc>
<defs>
  <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f1efe7"/><stop offset="1" stop-color="#d8d3c6"/></linearGradient>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#000" flood-opacity=".26"/></filter>
</defs>
<rect width="1080" height="1920" fill="url(#paper)"/>
<rect x="58" y="58" width="964" height="1804" rx="18" fill="none" stroke="#191815" stroke-width="3"/>
<g transform="translate(540 710) rotate(16)" filter="url(#shadow)">
  <ellipse rx="220" ry="325" fill="#171613" stroke="#9f7a42" stroke-width="10"/>
  <path d="M0-300 C75-180 -60-85 10 8 C88 112 -42 210 0 300" fill="none" stroke="#c19a5b" stroke-width="17" stroke-linecap="round"/>
</g>
<g text-anchor="middle" fill="#181713">
  <text x="540" y="1195" font-size="132" font-family="serif" letter-spacing="22">富贵盒子</text>
  <text x="540" y="1280" font-size="34" font-family="sans-serif" letter-spacing="16">LUCKY BEAN</text>
</g>
<path d="M330 1370 H750" stroke="#8f6c39" stroke-width="3"/>
<text x="540" y="1450" text-anchor="middle" fill="#5d513f" font-size="30" font-family="sans-serif" letter-spacing="8">咖啡豆与冲煮档案</text>
</svg>''',
        'action-grid.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="四格快捷操作背景">
<defs><radialGradient id="g"><stop stop-color="#3f3d37"/><stop offset="1" stop-color="#101110"/></radialGradient><filter id="s"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-opacity=".45"/></filter></defs>
<g filter="url(#s)"><rect x="8" y="8" width="384" height="384" rx="86" fill="url(#g)" stroke="#b79761" stroke-width="5"/><path d="M200 18V382M18 200H382" stroke="#b79761" stroke-width="3" opacity=".85"/><circle cx="200" cy="200" r="16" fill="#b79761"/></g>
</svg>''',
    }
    public = ROOT / 'public'
    public.mkdir(parents=True, exist_ok=True)
    for name, text in assets.items():
        (public / name).write_text(text.strip() + '\n', encoding='utf-8')


write_vector_assets()

package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '0.9.4'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

utils_path = ROOT / 'src' / 'utils.js'
utils = utils_path.read_text(encoding='utf-8')
utils = ensure_replace(utils, "export const APP_VERSION = '0.9.3';", "export const APP_VERSION = '0.9.4';", 'app version')
utils_path.write_text(utils, encoding='utf-8')

index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
if 'styles-v094.css' not in index:
    index = ensure_replace(index, '<link rel="stylesheet" href="./styles.css">', '<link rel="stylesheet" href="./styles.css">\n  <link rel="stylesheet" href="./styles-v094.css?v=094">', 'extension stylesheet')
image_pattern = r'<img(?: id="splashImage")? src="\./public/[^"]+" alt="富贵盒子启动画面">'
index, image_count = re.subn(image_pattern, '<img id="splashImage" src="./public/splash-red.svg?v=094" alt="富贵盒子启动画面">', index, count=1)
if image_count != 1:
    raise RuntimeError(f'index splash: expected one image, got {image_count}')
if 'id="themeToggleBtn"' not in index:
    index = ensure_replace(index, '<button class="small-control" id="manageBtn" type="button">管理</button>', '<button class="small-control" id="manageBtn" type="button">管理</button>\n            <button class="theme-toggle" id="themeToggleBtn" type="button" aria-label="切换到白天模式"></button>', 'theme button')
index = index.replace('<h1 id="titleBrew" class="page-seal">拾味</h1>', '<h1 id="titleBrew" class="page-seal">小酌</h1>')
index = index.replace('aria-label="拾味：冲煮制作"><span>拾</span>', 'aria-label="小酌：冲煮制作"><span>酌</span>')
index = index.replace('aria-label="寻找豆卡">寻</button>', 'aria-label="搜索豆卡">搜索</button>')
index = index.replace('aria-label="新增豆卡">添</button>', 'aria-label="新增豆卡">添丁</button>')
index = index.replace('aria-label="撷取往昔记录">撷</button>', 'aria-label="追溯往昔记录">溯旧</button>')
index = index.replace('aria-label="选择推荐豆卡">择</button>', 'aria-label="选择推荐豆卡">选择</button>')
if 'v094-ui.js' not in index:
    index = ensure_replace(index, '<script type="module" src="./src/app.js"></script>', '<script type="module" src="./src/app.js"></script>\n  <script type="module" src="./src/v094-ui.js?v=094"></script>', 'extension script')
index_path.write_text(index, encoding='utf-8')

app_path = ROOT / 'src' / 'app.js'
app = app_path.read_text(encoding='utf-8')
app = ensure_replace(app, "brew: { nav: '拾', title: '拾味', browser: '拾味' },", "brew: { nav: '酌', title: '小酌', browser: '小酌' },", 'brew page metadata')
app = app.replace('aria-label="用这只豆拾一味">拾</button>', 'aria-label="用这只豆酌一味">酌</button>')
app = app.replace('>拾一味</button>', '>酌一味</button>')
app = app.replace('返回拾味', '返回小酌')
app = app.replace('点击“添”录入，或从“寻”调整条件。', '点击“添丁”录入，或从“搜索”调整条件。')
app_path.write_text(app, encoding='utf-8')

extension_path = ROOT / 'src' / 'v094-ui.js'
extension = extension_path.read_text(encoding='utf-8')
old_guard = "if (button) { button.click(); await sleep(35); return true; }"
new_guard = "if (button) { if (!button.classList.contains('selected')) { button.click(); await sleep(35); } return true; }"
if old_guard in extension:
    extension = extension.replace(old_guard, new_guard, 1)
elif new_guard not in extension:
    raise RuntimeError('sensory default-selection guard not found')
extension_path.write_text(extension, encoding='utf-8')

sw_path = ROOT / 'sw.js'
sw = sw_path.read_text(encoding='utf-8')
sw, cache_count = re.subn(r"const CACHE_NAME = 'luckybean-v[^']+';", "const CACHE_NAME = 'luckybean-v0.9.4';", sw, count=1)
if cache_count != 1:
    raise RuntimeError('service worker cache declaration not found')
if "'./styles-v094.css'" not in sw:
    sw = ensure_replace(sw, "'./', './index.html', './styles.css', './manifest.webmanifest',", "'./', './index.html', './styles.css', './styles-v094.css', './manifest.webmanifest',", 'service worker css')
if "'./src/v094-ui.js'" not in sw:
    sw = ensure_replace(sw, "'./src/app.js', './src/utils.js'", "'./src/app.js', './src/v094-ui.js', './src/utils.js'", 'service worker js')
if "'./public/splash-red.svg'" not in sw:
    sw = ensure_replace(sw, "'./public/fallback-codebook.json', './public/legacy-flavor-map.json', './public/app-logo.webp', './public/splash.webp', './public/action-grid.webp'", "'./public/fallback-codebook.json', './public/legacy-flavor-map.json', './public/app-logo.webp', './public/splash.webp', './public/splash-red.svg', './public/splash-alt.svg', './public/action-grid.svg', './public/action-grid.webp'", 'service worker assets')
sw_path.write_text(sw, encoding='utf-8')

checks = {
    'index splash': 'splash-red.svg?v=094' in index,
    'theme toggle': 'themeToggleBtn' in index,
    'four action labels': all(label in index for label in ['搜索</button>', '添丁</button>', '溯旧</button>', '选择</button>']),
    'extension import': 'v094-ui.js?v=094' in index,
    'brew title': '小酌' in index and "nav: '酌'" in app,
    'sensory default guard': "classList.contains('selected')" in extension,
    'cache': 'luckybean-v0.9.4' in sw,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise RuntimeError('failed assertions: ' + ', '.join(failed))

print('Applied Lucky Bean 0.9.4 UI, vector assets, theme, brew layout and sensory extension.')
