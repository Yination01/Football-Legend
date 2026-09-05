# Football Legend — Android app build

One-time setup on your PC (all free):
1. Install Node.js (nodejs.org) and Android Studio (developer.android.com/studio) — or the CLI toolchain in `docs/BUILD.md`.
2. In this folder: `npm install`
3. `npm run copy-game`            <- pulls the latest game from `../game`
4. `npx cap add android`          (already done in this repo)
5. `npx @capacitor/assets generate --android`   <- icon + splash from resources/ (optional refresh)
6. `npm run sync`
7. `npm run open`                 <- opens Android Studio
8. Android Studio: Build > Build Bundle(s)/APK(s) > Build APK(s). APK lands in
   android/app/build/outputs/apk/debug/app-debug.apk — share it directly (WhatsApp etc).

Every time the game changes: `npm run sync`, then rebuild the APK.

**Release build (v1.4 / versionCode 5):** see `docs/BUILD.md` and `docs/V14-RELEASE-CHECKLIST.md`.
Needs `android/keystore.properties` + `release.keystore` (never commit these).

Play Store later: Build > Generate Signed Bundle, pay the one-time $25 developer fee, upload the .aab.

What's already wired:
- Android back button navigates screens, minimizes at root (Capacitor App plugin).
- Saves write-through to Capacitor Preferences and auto-restore if WebView localStorage is evicted.
- Google sign-in via system browser + deep link `com.footballlegend.game://callback`.
- Splash/icon sources in resources/.
