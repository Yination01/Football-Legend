#!/usr/bin/env bash
# Build signed v1.4 release APK + Play Store AAB into releases/
# Prerequisites: Node 18+, JDK 17, Android SDK (see docs/BUILD.md)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== syntax + tests =="
cd game
node --check app.js && node --check engine.js && node --check ml.js && node --check cloud.js
node test-fairness.js
node test-ml.js
node test-ml-ct.js
node test-bal-ct.js
node test-v15.js
cd "$ROOT"

echo "== copy game → Capacitor www =="
cd app
npm install --no-fund --no-audit
node copy-game.js
npx cap sync android

if [ ! -f android/local.properties ]; then
  if [ -z "${ANDROID_HOME:-}" ]; then
    echo "ERROR: set ANDROID_HOME or write app/android/local.properties (sdk.dir=...)"
    exit 1
  fi
  echo "sdk.dir=$ANDROID_HOME" > android/local.properties
fi

if [ ! -f android/keystore.properties ]; then
  echo "WARNING: android/keystore.properties missing — release build will be UNSIGNED."
  echo "  Create it with storeFile / storePassword / keyAlias / keyPassword (see docs/BUILD.md)."
fi

cd android
chmod +x gradlew
echo "== assembleRelease =="
./gradlew assembleRelease --no-daemon
echo "== bundleRelease =="
./gradlew bundleRelease --no-daemon

APK=$(find app/build/outputs/apk/release -name "*.apk" | head -1)
AAB=$(find app/build/outputs/bundle/release -name "*.aab" | head -1)
mkdir -p "$ROOT/releases"
cp -f "$APK" "$ROOT/releases/FootballLegend-v1.4-release.apk"
cp -f "$AAB" "$ROOT/releases/FootballLegend-v1.4-playstore.aab"
# also refresh "latest" names
cp -f "$APK" "$ROOT/releases/FootballLegend-release.apk"
cp -f "$AAB" "$ROOT/releases/FootballLegend-playstore.aab"

echo "== verify packaged app.js matches source =="
TMP=$(mktemp -d)
(cd "$TMP" && jar xf "$ROOT/releases/FootballLegend-v1.4-release.apk" assets/public/app.js)
cmp "$TMP/assets/public/app.js" "$ROOT/game/app.js"
echo "OK byte-identical app.js"
echo "Artifacts:"
ls -lh "$ROOT/releases/FootballLegend-v1.4-"*
