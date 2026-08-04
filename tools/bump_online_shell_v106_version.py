from pathlib import Path

path = Path('android/app/build.gradle')
text = path.read_text(encoding='utf-8')
for old in ['versionCode 100101', 'versionCode 100103', 'versionCode 100104', 'versionCode 100105']:
    text = text.replace(old, 'versionCode 100106')
for old in [
    "versionName '1.0.1-online-test'",
    "versionName '1.0.3-online-test'",
    "versionName '1.0.4-online-test'",
    "versionName '1.0.5-online-test'",
]:
    text = text.replace(old, "versionName '1.0.6-online-test'")
if 'versionCode 100106' not in text or "versionName '1.0.6-online-test'" not in text:
    raise SystemExit('failed to set online shell v1.0.6 version')
path.write_text(text, encoding='utf-8')
