from pathlib import Path

OLD = "updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)"
NEW = "updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)"

for name in [
    'tools/apply_online_shell_v105_data_ui.py',
    'tools/apply_online_shell_v105_sensory.py',
]:
    path = Path(name)
    text = path.read_text(encoding='utf-8')
    if NEW in text:
        continue
    if OLD not in text:
        raise SystemExit(f'missing regex helper pattern in {name}')
    path.write_text(text.replace(OLD, NEW, 1), encoding='utf-8')

print('Prepared v1.0.5 patch helpers with literal replacement text.')
