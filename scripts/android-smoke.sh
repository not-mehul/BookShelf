#!/usr/bin/env bash
# Launches a release APK on a connected device/emulator and checks the
# app starts and renders, catching R8 or packaging problems that unit
# and debug-build tests can't see.
#
#   scripts/android-smoke.sh path/to/app-release.apk
set -euo pipefail

APK=${1:?usage: android-smoke.sh path/to/app.apk}
PKG=app.mehul.bookshelf

for attempt in 1 2 3 4 5; do
  timeout 180 adb install -r "$APK" && break
  [[ $attempt -eq 5 ]] && exit 1
  echo "Install attempt $attempt failed; retrying…" >&2
  sleep 5
done
adb logcat -c
timeout 120 adb shell am start -W -n "$PKG/.MainActivity" || true

# The WebView exposes its content to UI Automator once rendered; the empty
# library still shows its sort control.
rendered=""
for _ in $(seq 1 30); do
  sleep 2
  ui=$(timeout 30 adb exec-out uiautomator dump /dev/tty 2>/dev/null || true)
  if grep -qiE 'sort by|the shelf is empty|stats' <<<"$ui"; then
    rendered=1
    break
  fi
done

PID=$(timeout 20 adb shell pidof "$PKG" | tr -d '\r' || true)
# Only this app's crashes and missing-class errors count, not other processes'.
# (Output is captured first: with pipefail, `cmd | grep -q` can fail on SIGPIPE.)
crashes=$(timeout 30 adb logcat -d -b crash || true)
app_log=""
[[ -n "$PID" ]] && app_log=$(timeout 30 adb logcat -d --pid="$PID" || true)
if grep -q "$PKG" <<<"$crashes" \
  || grep -E "FATAL EXCEPTION|ClassNotFoundException|NoSuchMethodException|NoClassDefFoundError" <<<"$app_log"; then
  echo "Release build crashed or hit a missing class (check R8 keep rules)." >&2
  exit 1
fi
if [[ -z "$PID" ]]; then
  echo "App is not running." >&2
  exit 1
fi
if [[ -z "$rendered" ]]; then
  echo "App never rendered the library." >&2
  tail -100 <<<"$app_log" >&2
  exit 1
fi
echo "Release smoke test passed."
