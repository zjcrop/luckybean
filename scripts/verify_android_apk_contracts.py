#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APK = (ROOT / (sys.argv[1] if len(sys.argv) > 1 else "android/app/build/outputs/apk/debug/app-debug.apk")).resolve()
RELEASE_PATH = ROOT / "release.json"


def fail(message: str) -> None:
    raise SystemExit(message)


def require_source(path: str, needle: str) -> None:
    text = (ROOT / path).read_text(encoding="utf-8")
    if needle not in text:
        fail(f"source contract marker missing: {path} :: {needle}")


def read_entry(archive: zipfile.ZipFile, entry: str) -> bytes:
    try:
        return archive.read(entry)
    except KeyError:
        fail(f"APK contract entry missing: {entry}")


def require_entry(archive: zipfile.ZipFile, entry: str, needle: str) -> None:
    text = read_entry(archive, entry).decode("utf-8")
    if needle not in text:
        fail(f"APK contract marker missing: {entry} :: {needle}")


def forbid_entry(archive: zipfile.ZipFile, entry: str, needle: str) -> None:
    text = read_entry(archive, entry).decode("utf-8")
    if needle in text:
        fail(f"forbidden APK contract marker present: {entry} :: {needle}")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


if not APK.is_file():
    fail(f"debug APK missing: {APK}")
if not RELEASE_PATH.is_file():
    fail(f"release metadata missing: {RELEASE_PATH}")

release = json.loads(RELEASE_PATH.read_text(encoding="utf-8"))
try:
    display_version = str(release["displayVersion"])
    revision = str(release["revision"])
    android_version_code = int(release["androidVersionCode"])
    android_user_agent = str(release["androidUserAgent"])
    cache_revision = str(release["cacheRevision"])
except (KeyError, TypeError, ValueError) as error:
    fail(f"invalid release metadata: {error}")

expected_user_agent = f"LuckyBeanAndroid/{display_version}"
if android_user_agent != expected_user_agent:
    fail(
        "release metadata Android user agent mismatch: "
        f"expected {expected_user_agent}, got {android_user_agent}"
    )

# Android version identity must be derived from release.json rather than copied as
# literals into Gradle/Java. This prevents CI from drifting when the release moves.
require_source("android/app/build.gradle", "versionCode (releaseMeta.androidVersionCode as int)")
require_source("android/app/build.gradle", "versionName releaseMeta.displayVersion as String")
require_source(
    "android/app/src/main/java/com/luckybean/app/MainActivity.java",
    '" LuckyBeanAndroid/" + BuildConfig.VERSION_NAME',
)
require_source("android/app/src/main/java/com/luckybean/app/BrewTimerService.java", "SystemClock.elapsedRealtime()")

required = [
    ("assets/web-cache/index.html", f'release-revision" content="{revision}"'),
    ("assets/web-cache/index.html", f'application-version" content="{display_version}"'),
    ("assets/web-cache/sw.js", f"const REVISION = '{revision}'"),
    ("assets/web-cache/sw.js", cache_revision),
    ("assets/web-cache/src/features/runtime-features.js", f"|| '{revision}'"),
    ("assets/web-cache/src/features/runtime-features.js", "feature('shared-sortable'"),
    ("assets/web-cache/src/features/runtime-features.js", "sensory-tag-sort-controller.js"),
    ("assets/web-cache/src/domain/beans/bean-group-state.js", "export const beanGroupState"),
    ("assets/web-cache/src/bean-groups-controller.js", "beanGroupState.groupKey"),
    ("assets/web-cache/src/bean-groups-controller.js", "async function closeActiveGroup"),
    ("assets/web-cache/src/features/release-1.24b-group-navigation.js", "LuckyBeanBeanGroupState"),
    ("assets/web-cache/src/ui/sortable-controller.js", "lb-sort-ghost"),
    ("assets/web-cache/src/ui/sortable-controller.js", "lb-sort-placeholder"),
    ("assets/web-cache/src/ui/sortable-controller.js", "onPreview"),
    ("assets/web-cache/src/ui/sortable-controller.js", "onCommit"),
    ("assets/web-cache/src/features/sensory-tag-sort-controller.js", "LuckyBeanSortable"),
    ("assets/web-cache/src/features/sensory-tag-sort-controller.js", "professional-sensory-complete"),
    ("assets/web-cache/src/features/release-1.24b-ui-policy.js", f"|| '{revision}'"),
    ("assets/web-cache/src/release-1.24b.css", "main.7 professional score responsive layout"),
    ("assets/web-cache/src/recognition-bridge.js", "dataUrl: nativeSource ? '' : await blobToDataUrl(image.blob)"),
    ("assets/web-cache/src/package-capture-controller.js", "bindAndroidImageSource(id, nativeSource)"),
    ("assets/web-cache/src/services/brew-analysis-service.js", "BREW_ANALYSIS_CONTRACT = 'brew-analysis/2.1'"),
    ("assets/web-cache/src/services/brew-analysis-service.js", "BREW_SPATIAL_CONTRACT = 'brew-spatial/1.3'"),
]
forbidden = [
    ("assets/web-cache/src/bean-groups-controller.js", "let activeGroup"),
    ("assets/web-cache/src/features/release-1.24b-group-navigation.js", "dispatchEvent(new MouseEvent"),
]

with zipfile.ZipFile(APK) as archive:
    for entry, needle in required:
        require_entry(archive, entry, needle)
    for entry, needle in forbidden:
        forbid_entry(archive, entry, needle)

    source_release = RELEASE_PATH.read_bytes()
    apk_release = read_entry(archive, "assets/web-cache/release.json")
    if source_release != apk_release:
        fail("APK release.json differs from canonical source")

    source_css = (ROOT / "src/release-1.24b.css").read_bytes()
    apk_css = read_entry(archive, "assets/web-cache/src/release-1.24b.css")
    if sha256(source_css) != sha256(apk_css):
        fail("APK CSS differs from canonical source")

android_home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
if not android_home:
    fail("ANDROID_HOME/ANDROID_SDK_ROOT is missing")
aapt = Path(android_home) / "build-tools/35.0.0/aapt"
if not aapt.is_file():
    fail(f"aapt missing: {aapt}")
badging = subprocess.run(
    [str(aapt), "dump", "badging", str(APK)],
    check=True,
    capture_output=True,
    text=True,
).stdout
identity = (
    "package: name='com.luckybean.app' "
    f"versionCode='{android_version_code}' versionName='{display_version}'"
)
if identity not in badging:
    fail(f"APK package identity mismatch: expected {identity}")

(ROOT / "android-contracts.txt").write_text(
    f"release={display_version}\n"
    f"revision={revision}\n"
    f"androidVersionCode={android_version_code}\n"
    f"androidUserAgent={android_user_agent}\n"
    "canonical-state-api\n"
    "shared-live-preview-ghost-placeholder\n"
    "single-activate-double-remove-longpress-preview\n"
    "brew_ui=text-interactions\n",
    encoding="utf-8",
)
print(
    "APK canonical contract verification passed: "
    f"{display_version} / {revision} / {android_version_code}"
)
