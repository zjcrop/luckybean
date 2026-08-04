from pathlib import Path

path = Path('android/app/build.gradle')
text = path.read_text(encoding='utf-8')
text = text.replace("versionCode 100101", "versionCode 100103")
text = text.replace("versionName '1.0.1-online-test'", "versionName '1.0.3-online-test'")
if "versionCode 100103" not in text or "versionName '1.0.3-online-test'" not in text:
    raise SystemExit('failed to set online shell v1.0.3 version')
path.write_text(text, encoding='utf-8')
