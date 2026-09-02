#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APK = (ROOT / (sys.argv[1] if len(sys.argv) > 1 else "android/app/build/outputs/apk/debug/app-debug.apk")).resolve()


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

require_source("android/app/build.gradle", "versionCode 102402")
require_source("android/app/build.gradle", "versionName '1.24B'")
require_source("android/app/src/main/java/com/luckybean/app/MainActivity.java", "LuckyBeanAndroid/1.24B")
require_source("android/app/src/main/java/com/luckybean/app/BrewTimerService.java", "SystemClock.elapsedRealtime()")

required = [
    ("assets/web-cache/index.html", 'release-revision" content="1.24B-main.6"'),
    ("assets/web-cache/sw.js", "REVISION = '1.24B-main.6'"),
    ("assets/web-cache/sw.js", "main-6-ui2"),
    ("assets/web-cache/src/features/runtime-features.js", "1.24B-main.6"),
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
    ("assets/web-cache/src/features/release-1.24b-ui-policy.js", "UI_POLICY_REVISION = '1.24B-main.6'"),
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
identity = "package: name='com.luckybean.app' versionCode='102402' versionName='1.24B'"
if identity not in badging:
    fail("APK package identity mismatch")

(ROOT / "android-contracts.txt").write_text(
    "canonical-state-api\n"
    "shared-live-preview-ghost-placeholder\n"
    "single-activate-double-remove-longpress-preview\n"
    "brew_ui=text-interactions\n",
    encoding="utf-8",
)
print("APK canonical contract verification passed")
