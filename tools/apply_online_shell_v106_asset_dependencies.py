from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

gradle = ROOT / 'android/app/build.gradle'
text = gradle.read_text(encoding='utf-8')
include = "        include 'src/v106-brew-profile-service.js'\n"
if include.strip() not in text:
    marker = "        include 'src/v106-native-backup.js'\n"
    if marker not in text:
        raise SystemExit('v106 native backup asset include was not found')
    text = text.replace(marker, marker + include, 1)
gradle.write_text(text, encoding='utf-8')

cache = ROOT / 'android/app/src/main/java/com/luckybean/app/LocalWebAssetCache.java'
cache_text = cache.read_text(encoding='utf-8')
entry = '        files.put("src/v106-brew-profile-service.js", "text/javascript");\n'
if 'src/v106-brew-profile-service.js' not in cache_text:
    marker = '        files.put("src/v106-native-backup.js", "text/javascript");\n'
    if marker not in cache_text:
        raise SystemExit('v106 native backup cache entry was not found')
    cache_text = cache_text.replace(marker, marker + entry, 1)
cache.write_text(cache_text, encoding='utf-8')

print('Packaged LuckyBean v1.0.6 profile-service dependency.')
