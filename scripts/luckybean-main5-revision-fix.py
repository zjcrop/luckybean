from pathlib import Path

TEXT_SUFFIXES = {'.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.md', '.yml', '.yaml'}
roots = [Path('src'), Path('tests'), Path('test'), Path('.github/workflows')]
files = [Path('index.html'), Path('sw.js')]
for root in roots:
    if root.exists():
        files.extend(p for p in root.rglob('*') if p.is_file() and p.suffix in TEXT_SUFFIXES)

changed = 0
for p in files:
    if not p.exists():
        continue
    text = p.read_text(encoding='utf-8')
    next_text = text.replace('1.24B-main.4', '1.24B-main.5')
    next_text = next_text.replace(r'1\.24B-main\.4', r'1\.24B-main\.5')
    next_text = next_text.replace('main-4-interaction3', 'main-5-sensory1')
    if next_text != text:
        p.write_text(next_text, encoding='utf-8')
        changed += 1

sw = Path('sw.js').read_text(encoding='utf-8')
if "REVISION = '1.24B-main.5'" not in sw:
    raise SystemExit('service worker revision was not advanced to main.5')
if 'main-5-sensory1' not in sw:
    raise SystemExit('service worker cache key was not advanced to main.5')
if '1.24B-main.4' in Path('index.html').read_text(encoding='utf-8'):
    raise SystemExit('stale main.4 asset revision remains in index.html')

for workflow in Path('.github/workflows').glob('*.yml'):
    if '1.24B-main.4' in workflow.read_text(encoding='utf-8'):
        raise SystemExit(f'stale main.4 workflow contract remains in {workflow}')

print(f'updated revision contract in {changed} files')
Path('scripts/luckybean-main5-revision-fix.py').unlink(missing_ok=True)
