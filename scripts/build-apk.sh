#!/usr/bin/env bash
# build-apk.sh - Build an installable Football Legend APK locally
# Prerequisites: Node 18+, JDK 17, Android SDK
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUILD_TYPE="${1:-debug}"
SKIP_TESTS="${SKIP_TESTS:-0}"

# Formatting helpers
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${CYAN}=== $1 ===${NC}"; }
ok()   { echo -e "  ${GREEN}OK${NC}  $1"; }
warn() { echo -e "  ${YELLOW}!${NC}   $1"; }
die()  { echo -e "  ${RED}X${NC}   $1"; exit 1; }

echo "Football Legend APK build - type '$BUILD_TYPE'"

# ---------------------------------------------------------------- pre-flight
step "Pre-flight checks"

[ -f "app/capacitor.config.json" ] || die "app/capacitor.config.json missing"
[ -f "app/android/gradlew" ] || die "app/android/gradlew missing"

if [ ! -d "node_modules" ]; then
  warn "Root node_modules missing - running npm install"
  npm install --no-audit --no-fund
fi

if [ ! -d "app/node_modules" ]; then
  warn "App node_modules missing - running npm install in app/"
  npm --prefix app install --no-audit --no-fund
fi
ok "Node dependencies present"

if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ] && [ ! -f "app/android/local.properties" ]; then
  die "ANDROID_HOME is not set and app/android/local.properties is missing"
fi
ok "Android SDK configuration detected"

# ---------------------------------------------------------------- audits
if [ "$SKIP_TESTS" -ne 1 ]; then
  step "Audits & Simulation Checks"
  npm run test:all
  ok "All audits and checks passed"
else
  warn "Audits skipped (SKIP_TESTS=1)"
fi

# ---------------------------------------------------------------- sync
step "Capacitor sync"
npm run sync
ok "Game synced to Android project"

# ---------------------------------------------------------------- gradle build
step "Gradle compilation ($BUILD_TYPE)"
cd app/android
chmod +x gradlew

if [ "$BUILD_TYPE" = "release" ]; then
  ./gradlew assembleRelease --no-daemon
  APK=$(find app/build/outputs/apk/release -name "*.apk" | head -1)
else
  ./gradlew assembleDebug --no-daemon
  APK=$(find app/build/outputs/apk/debug -name "*.apk" | head -1)
fi

cd "$ROOT"

[ -n "$APK" ] && [ -f "app/android/$APK" ] || die "APK build output not found"
cp -f "app/android/$APK" football-legend.apk
ok "Built football-legend.apk"

# ---------------------------------------------------------------- verification
step "Verify packaged app.js matches source"
if command -v unzip >/dev/null 2>&1 && command -v cmp >/dev/null 2>&1; then
  TMP_DIR=$(mktemp -d)
  unzip -q -p football-legend.apk assets/public/app.js > "$TMP_DIR/apk-app.js"
  cmp "$TMP_DIR/apk-app.js" game/app.js
  rm -rf "$TMP_DIR"
  ok "Packaged app.js is byte-identical to game/app.js"
else
  warn "unzip or cmp not found, skipping byte verification"
fi

step "Done"
echo "football-legend.apk is ready in the repository root."
echo "Transfer to your phone and sideload to test."
