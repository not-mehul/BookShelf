#!/usr/bin/env bash
# Runs on a booted emulator (see .github/workflows/ci.yml):
#   1. the upgrade-in-place test: old hand-built shell → Capacitor debug build,
#   2. a launch smoke test of the minified release build.
#
#   scripts/android-emulator-tests.sh <dir with the bookshelf-apks artifact>
set -euo pipefail

DIR=${1:?usage: android-emulator-tests.sh <apk dir>}
PKG=app.mehul.bookshelf
log() { echo "==> [$(date -u +%H:%M:%S)] $*"; }

# sys.boot_completed can flip before the package and activity services are
# usable, and a fresh image may still restart system_server once.
wait_for_system() {
  for _ in $(seq 1 90); do
    if timeout 20 adb shell pm path android >/dev/null 2>&1 && timeout 20 adb shell am get-current-user >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "System services never became ready." >&2
  return 1
}

log "Waiting for system services"
timeout 300 adb wait-for-device
wait_for_system
sleep 10 # let a post-boot system_server restart happen before installing
wait_for_system

log "Upgrade-in-place test"
timeout 600 node "$(dirname "$0")/android-upgrade-test.mjs" "$DIR/old-shell/app-debug.apk" "$DIR/debug/app-debug.apk" || {
  echo "---- crash buffer ----" >&2
  adb logcat -d -b crash 2>/dev/null | tail -150 >&2 || true
  exit 1
}

# The release build is signed with the same (debug) key, but start clean so
# the smoke test also covers a first launch.
adb uninstall "$PKG" >/dev/null 2>&1 || true
log "Release smoke test"
"$(dirname "$0")/android-smoke.sh" "$DIR/release/app-release-smoke.apk"
