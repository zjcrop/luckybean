from pathlib import Path

path = Path('android/app/build.gradle')
text = path.read_text(encoding='utf-8')
for old in ['100101', '100103', '100104']:
    text = text.replace(f'versionCode {old}', 'versionCode 100105')
for old in ['1.0.1-online-test', '1.0.3-online-test', '1.0.4-online-test']:
    text = text.replace(f"versionName '{old}'", "versionName '1.0.5-online-test'")
if 'versionCode 100105' not in text or "versionName '1.0.5-online-test'" not in text:
    raise SystemExit('failed to set online shell v1.0.5 version')
path.write_text(text, encoding='utf-8')
