# Football Legend Build Guide

## Overview

Football Legend is a web-native hybrid game built with HTML5/Canvas/JavaScript wrapped into a native Android application using Capacitor.

You can build the installable APK using **GitHub Actions (zero local toolchain required)** or locally using **PowerShell / Bash**.

---

## 1. Automated Builds via GitHub Actions (Recommended)

No local Android SDK or JDK required. GitHub's Ubuntu runners compile the APK with Gradle caching and upload the release.

### Steps to trigger a Preview APK:
1. Navigate to the **Actions** tab in GitHub.
2. Under Workflows, select **Preview APK**.
3. Click **Run workflow**.
4. Enter the **Build number** (e.g., `6`).
5. When the workflow completes:
   - Download the APK from the GitHub Release (`preview-<n>`) or run artifacts.
   - Sideload onto your Android phone.

---

## 2. Local Build Prerequisites

- **Node.js** 18+
- **JDK 17** (Temurin 17 recommended)
- **Android SDK** (API 34, Build-Tools 34.0.0, commandline-tools)

### Linux / WSL SDK Setup

```bash
# JDK 17
cd /opt
curl -sL -o jdk.tar.gz "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.11%2B9/OpenJDK17U-jdk_x64_linux_hotspot_17.0.11_9.tar.gz"
tar xzf jdk.tar.gz && rm jdk.tar.gz

# Android SDK cmdline-tools
mkdir -p /opt/android-sdk/cmdline-tools
curl -sL -o ct.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
unzip -q ct.zip -d /opt/android-sdk/cmdline-tools
mv /opt/android-sdk/cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest && rm ct.zip

export JAVA_HOME=/opt/jdk-17.0.11+9 ANDROID_HOME=/opt/android-sdk PATH=$JAVA_HOME/bin:$PATH
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

---

## 3. Local Build Commands

### One-command build (PowerShell)
```powershell
.\scripts\build-apk.ps1
```

### One-command build (Bash)
```bash
./scripts/build-apk.sh
```

### Manual step-by-step
```bash
# 1. Run audits
npm run test:all

# 2. Sync web assets into Android project
npm run sync

# 3. Assemble Debug APK
cd app/android
./gradlew assembleDebug --no-daemon
# Output: app/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 4. Verification Before Shipping

Always run the full suite before making or tagging a build:
```bash
npm run test:all
```

After building, verify that `app.js` packed inside the APK is byte-identical to source:
```bash
unzip -p football-legend.apk assets/public/app.js > tmp-app.js
cmp tmp-app.js game/app.js
```

---

## 5. Google Play Release (AAB)

To generate a signed `.aab` for Google Play:
1. Provide `app/android/keystore.properties` (with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`).
2. Run:
   ```bash
   ./scripts/build-release.sh
   ```
3. Artifacts will be generated in `releases/`:
   - `releases/FootballLegend-v1.5-release.apk`
   - `releases/FootballLegend-v1.5-playstore.aab`
