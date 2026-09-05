#!/usr/bin/env bash
# Build release APK + Play Store AAB into releases/
# Prerequisites: Node 18+, JDK 17, Android SDK (see docs/BUILD.md)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${CYAN}=== $1 ===${NC}"; }
ok()   { echo -e "  ${GREEN}OK${NC}  $1"; }
warn() { echo -e "  ${YELLOW}!${NC}   $1"; }
die()  { echo -e "  ${RED}X${NC}   $1"; exit 1; }

echo "Football Legend Release Build (APK + Play Store AAB)"

step "1. Run Full Audit & Test Suite"
npm run test:all
ok "All tests and simulation audits passed"

step "2. Sync Game to Capacitor Android"
npm run sync
ok "Game synced to Android assets"

if [ ! -f app/android/local.properties ]; then
  if [ -n "${ANDROID_HOME:-}" ]; then
    echo "sdk.dir=$ANDROID_HOME" > app/android/local.properties
    ok "Configured app/android/local.properties from ANDROID_HOME"
  elif [ -n "${ANDROID_SDK_ROOT:-}" ]; then
    echo "sdk.dir=$ANDROID_SDK_ROOT" > app/android/local.properties
    ok "Configured app/android/local.properties from ANDROID_SDK_ROOT"
  else
    warn "ANDROID_HOME not set and local.properties missing"
  fi
fi

if [ ! -f app/android/keystore.properties ]; then
  warn "app/android/keystore.properties missing — release build will be UNSIGNED."
  warn "Create it with storeFile / storePassword / keyAlias / keyPassword for signed Google Play builds."
fi

step "3. Gradle assembleRelease & bundleRelease"
cd app/android
chmod +x gradlew
./gradlew assembleRelease --no-daemon
./gradlew bundleRelease --no-daemon
cd "$ROOT"

APK=$(find app/android/app/build/outputs/apk/release -name "*.apk" 2>/dev/null | head -1 || true)
AAB=$(find app/android/app/build/outputs/bundle/release -name "*.aab" 2>/dev/null | head -1 || true)

mkdir -p "$ROOT/releases"
if [ -n "$APK" ] && [ -f "$APK" ]; then
  cp -f "$APK" "$ROOT/releases/FootballLegend-v1.5-release.apk"
  cp -f "$APK" "$ROOT/releases/FootballLegend-release.apk"
  ok "Release APK generated: releases/FootballLegend-release.apk"
fi

if [ -n "$AAB" ] && [ -f "$AAB" ]; then
  cp -f "$AAB" "$ROOT/releases/FootballLegend-v1.5-playstore.aab"
  cp -f "$AAB" "$ROOT/releases/FootballLegend-playstore.aab"
  ok "Play Store AAB generated: releases/FootballLegend-playstore.aab"
fi

step "4. Verify Packaged app.js"
if [ -n "$APK" ] && [ -f "$APK" ] && command -v unzip >/dev/null 2>&1 && command -v cmp >/dev/null 2>&1; then
  TMP=$(mktemp -d)
  unzip -q -p "$APK" assets/public/app.js > "$TMP/app.js"
  cmp "$TMP/app.js" "$ROOT/game/app.js"
  rm -rf "$TMP"
  ok "Byte-identical app.js verified in release APK"
fi

step "Artifacts"
ls -lh "$ROOT/releases/"* || true
