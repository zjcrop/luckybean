#!/usr/bin/env bash
set -euo pipefail

apk=${1:?APK path required}
expected_code=${2:?Expected version code required}
export ANDROID_AVD_HOME="$RUNNER_TEMP/luckybean-avd"
mkdir -p "$ANDROID_AVD_HOME"
echo no | avdmanager create avd -n luckybean-install-check \
  -k 'system-images;android-29;google_apis;x86_64' --device pixel_2 --force

accel_args=()
if [ -e /dev/kvm ]; then
  sudo chmod 666 /dev/kvm
else
  accel_args=(-accel off)
fi
"$ANDROID_HOME/emulator/emulator" -avd luckybean-install-check -port 5554 \
  -no-window -noaudio -no-boot-anim -no-snapshot -wipe-data \
  -gpu swiftshader_indirect "${accel_args[@]}" > emulator-install.log 2>&1 &
emulator_pid=$!
trap 'adb -s emulator-5554 emu kill >/dev/null 2>&1 || true; kill "$emulator_pid" >/dev/null 2>&1 || true' EXIT

timeout 180 adb -s emulator-5554 wait-for-device
ready=false
for i in $(seq 1 120); do
  if [ "$(adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = '1' ] \
    && timeout 8 adb -s emulator-5554 shell pm path android 2>/dev/null | grep -q '^package:'; then
    ready=true
    break
  fi
  sleep 2
done
if [ "$ready" != true ]; then
  tail -n 100 emulator-install.log >&2
  exit 1
fi

timeout 120 adb -s emulator-5554 push "$apk" /data/local/tmp/luckybean-install-check.apk
set +e
timeout 120 adb -s emulator-5554 shell pm install /data/local/tmp/luckybean-install-check.apk > install-check.log 2>&1
status=$?
set -e
cat install-check.log
if [ "$status" -ne 0 ] && [ "$status" -ne 124 ]; then
  echo "Android package installation failed: $status" >&2
  exit 1
fi
if [ "$status" -eq 0 ] && ! grep -q '^Success' install-check.log; then
  echo 'Android package manager did not report a successful installation' >&2
  exit 1
fi
timeout 30 adb -s emulator-5554 shell dumpsys package com.luckybean.ds > installed-package.txt
grep -q "versionCode=${expected_code} " installed-package.txt
echo "Verified com.luckybean.ds installed on Android 10, versionCode ${expected_code}"
