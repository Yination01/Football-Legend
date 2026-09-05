# Build Guide

## Prerequisites (all free)

- **Node.js** 18+
- **JDK 17** (Temurin recommended)
- **Android SDK** command-line tools (no Android Studio needed)

### Toolchain install recipe (Linux, ~2 min)

```bash
# JDK 17
cd /opt
curl -sL -o jdk.tar.gz "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.11%2B9/OpenJDK17U-jdk_x64_linux_hotspot_17.0.11_9.tar.gz"
tar xzf jdk.tar.gz && rm jdk.tar.gz

# Android SDK command-line tools
mkdir -p /opt/android-sdk/cmdline-tools
curl -sL -o ct.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
unzip -q ct.zip -d /opt/android-sdk/cmdline-tools
mv /opt/android-sdk/cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest && rm ct.zip

export JAVA_HOME=/opt/jdk-17.0.11+9 ANDROID_HOME=/opt/android-sdk PATH=$JAVA_HOME/bin:$PATH
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

## Build steps

```bash
cd app
npm install                    # installs Capacitor + plugins (preferences, filesystem, etc.)
node copy-game.js              # copies ../game -> www/
npx cap sync android           # syncs www/ + plugins into the Android project
echo "sdk.dir=/opt/android-sdk" > android/local.properties
cd android
chmod +x gradlew
./gradlew assembleDebug        # output: app/build/outputs/apk/debug/app-debug.apk
```

## Cache-busting mint (browser build)

`game/index.html` references versioned copies (`app.<timestamp>.js` etc.) so browsers never serve stale code. After editing any base file:

```bash
cd game
rm -f engine.1*.js app.1*.js style.1*.css ml.1*.js
V=$(date +%s)
cp engine.js engine.$V.js; cp app.js app.$V.js; cp style.css style.$V.css; cp ml.js ml.$V.js
sed -i "s/engine\.[0-9]*\.js/engine.$V.js/; s/app\.[0-9]*\.js/app.$V.js/; s/style\.[0-9]*\.css/style.$V.css/; s/ml\.[0-9]*\.js/ml.$V.js/" index.html
cp index.html play.html
```

The APK path uses the plain files (`copy-game.js` copies base files), so minting is only needed for browser testing.

## Verification before shipping (mandatory)

```bash
cd game
node --check app.js && node --check engine.js && node --check ml.js
node test-fairness.js    # must be 21/21
node test-ml.js          # must be 0 failures
```

After building, verify the APK actually contains the new code:

```bash
jar -xf FootballLegend.apk assets/public/app.js
cmp assets/public/app.js game/app.js   # must be identical
```

## Signing notes

- Debug builds are signed with the debug keystore (`~/.android/debug.keystore`). Keep this file — updates only install over an existing app if the signature matches.
- For Google Play: generate a release keystore, build `.aab` with `./gradlew bundleRelease`, and NEVER lose the keystore.

## Save system (3 layers)

1. **localStorage** (primary) mirrored to **Capacitor Preferences** (survives WebView storage eviction).
2. **Documents backup file** — `Documents/FootballLegend/backup.json`, rewritten (debounced 1.5s) after every save. Survives uninstall. On fresh boot with no saves, the app offers to restore from it. Android ≤10 requires one storage-permission prompt; 11+ is automatic (app-scoped Documents access).
3. **Android Auto Backup** (`allowBackup="true"` in the manifest).
4. Manual **backup codes** in Settings (base64 pack `{v:1,bal,ml}`) for cross-device moves.

## Release APK / AAB (one command)

```bash
# Requires JDK 17, ANDROID_HOME, and app/android/keystore.properties
./scripts/build-release.sh
# → releases/FootballLegend-v1.4-release.apk
# → releases/FootballLegend-v1.4-playstore.aab
```

`app/copy-game.js` copies from `../game` (plain filenames). Do not point it at any other folder.
