#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:?source directory is required}"
SOURCE_DIR="$(cd "$SOURCE_DIR" && pwd)"
cd "$SOURCE_DIR"

echo '== Verify and decode consolidation payload =='
cat .consolidation/payload.* > /tmp/materialize.b64
test "$(wc -c < /tmp/materialize.b64)" -eq 26852
echo "c1e0e3284090a56d4e31685446b9adf06afb60759570144c847bfc1a2a745ffd  /tmp/materialize.b64" | sha256sum -c -
base64 --decode /tmp/materialize.b64 > /tmp/materialize.py.gz
gzip -t /tmp/materialize.py.gz
gzip -dc /tmp/materialize.py.gz > /tmp/materialize_v107.py

python3 - <<'PY'
from pathlib import Path
path = Path('/tmp/materialize_v107.py')
text = path.read_text(encoding='utf-8')
start = text.index("\nfrom pathlib import Path\nimport re\npath=Path('src/codebook.js')")
end = text.index("\n\nfrom pathlib import Path\n\n# Persist parse metadata", start)
path.write_text(
    text[:start] + "\nprint('parser update deferred to validated codebook payload')\n" + text[end:],
    encoding='utf-8',
)
PY

python3 /tmp/materialize_v107.py

echo '== Restore validated final codebook parser =='
cat .consolidation/codebook.payload.* > /tmp/codebook.b64
test "$(wc -c < /tmp/codebook.b64)" -eq 10988
echo "e19bc30a2a280d0e4052ebcfda8060ce58a8b5b17f3f33281fe6547c7722e653  /tmp/codebook.b64" | sha256sum -c -
base64 --decode /tmp/codebook.b64 > /tmp/codebook.js.gz
gzip -t /tmp/codebook.js.gz
gzip -dc /tmp/codebook.js.gz > src/codebook.js
echo "afb2d3a8f70e1eff63100062496c0ec21f3dc74414374218adfd2ad27c939873  src/codebook.js" | sha256sum -c -

echo '== Ensure Android Web asset generation is defined =='
python3 - <<'PY'
from pathlib import Path
import re

path = Path('android/app/build.gradle')
text = path.read_text(encoding='utf-8')
block = """

def generatedOnlineShellAssets = layout.buildDirectory.dir('generated/onlineShellAssets')

tasks.register('copyOnlineShellCriticalAssets', Copy) {
    from(rootProject.projectDir.parentFile) {
        include 'public/**'
        include 'src/**'
        include 'styles.css'
    }
    into(generatedOnlineShellAssets.map { it.dir('web-cache') })
}

android.sourceSets.main.assets.srcDir(generatedOnlineShellAssets)
tasks.named('preBuild').configure { dependsOn tasks.named('copyOnlineShellCriticalAssets') }
"""
existing = re.compile(
    r"\n\ndef generatedOnlineShellAssets = .*?tasks\.named\('preBuild'\)\.configure \{ dependsOn tasks\.named\('copyOnlineShellCriticalAssets'\) \}\n?",
    re.S,
)
if existing.search(text):
    text = existing.sub(block, text)
elif 'copyOnlineShellCriticalAssets' not in text:
    text = text.rstrip() + block + '\n'
path.write_text(text, encoding='utf-8')
PY

grep -F "tasks.register('copyOnlineShellCriticalAssets', Copy)" android/app/build.gradle
grep -F "include 'src/**'" android/app/build.gradle
sed -i 's#refactor/v1-consolidated#android/v1-source-consolidation#g' .github/workflows/android-v1-online-shell.yml
rm -rf .consolidation

echo '== JavaScript syntax and focused tests =='
find src -name '*.js' -print0 | xargs -0 -n1 node --check
npm test
npm run check
python3 tests/browser-smoke.py

echo '== Build Android APK from the same Web source =='
gradle --no-daemon --stacktrace -p android clean
gradle --no-daemon --stacktrace -p android :app:copyOnlineShellCriticalAssets
test -f android/app/build/generated/onlineShellAssets/web-cache/src/app.js
test -f android/app/build/generated/onlineShellAssets/web-cache/src/v099f-cloud-codec.js
cmp src/app.js android/app/build/generated/onlineShellAssets/web-cache/src/app.js
cmp src/v099f-cloud-codec.js android/app/build/generated/onlineShellAssets/web-cache/src/v099f-cloud-codec.js
gradle --no-daemon --stacktrace -p android :app:assembleDebug

echo '== Verify APK version, signature and embedded source =='
apk="$(find android/app/build/outputs/apk/debug -name '*.apk' -type f -print -quit)"
test -n "$apk"
"$ANDROID_SDK_ROOT/build-tools/35.0.0/apksigner" verify --verbose --print-certs "$apk" | tee SIGNING-CERTIFICATE.txt
"$ANDROID_SDK_ROOT/build-tools/35.0.0/aapt" dump badging "$apk" > APK-BADGING.txt
grep -F "versionCode='100107'" APK-BADGING.txt
unzip -t "$apk" > APK-ZIP-TEST.txt
unzip -Z1 "$apk" > APK-CONTENTS.txt
grep -F 'assets/web-cache/' APK-CONTENTS.txt | sed -n '1,40p'
unzip -p "$apk" assets/web-cache/src/app.js > /tmp/apk-app.js
unzip -p "$apk" assets/web-cache/src/v099f-cloud-codec.js > /tmp/apk-cloud-codec.js
cmp src/app.js /tmp/apk-app.js
cmp src/v099f-cloud-codec.js /tmp/apk-cloud-codec.js

echo '== Collect APK and Web preview =='
rm -rf artifacts web-preview
mkdir -p artifacts web-preview
cp "$apk" artifacts/LuckyBean-1.0.7-consolidated-test.apk
cp SIGNING-CERTIFICATE.txt APK-BADGING.txt APK-CONTENTS.txt APK-ZIP-TEST.txt artifacts/
sha256sum artifacts/LuckyBean-1.0.7-consolidated-test.apk > artifacts/SHA256SUMS.txt
cp index.html manifest.webmanifest sw.js styles.css web-preview/
cp -R src public web-preview/
touch web-preview/.nojekyll
zip -qr artifacts/LuckyBean-1.0.7-web-preview.zip web-preview

echo '== Publish isolated Web test branch =='
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
PUBLISH_DIR="$(mktemp -d)"
git worktree add --detach "$PUBLISH_DIR" HEAD
(
  cd "$PUBLISH_DIR"
  git switch --discard-changes --orphan test-v107-web
  git rm -rf --ignore-unmatch .
  find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  cp -R "$SOURCE_DIR/web-preview/." .
  git add index.html manifest.webmanifest sw.js styles.css src public .nojekyll
  git diff --cached --check
  git commit -m 'test(web): publish LuckyBean 1.0.7 isolated preview'
  git push --force origin HEAD:refs/heads/test-v107-web
)
git worktree remove --force "$PUBLISH_DIR"

echo 'APK artifact and Web test branch are ready.'
