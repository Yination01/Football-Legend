# Football Legend — Android app build

One-time setup on your PC (all free):
1. Install Node.js (nodejs.org) and Android Studio (developer.android.com/studio).
2. In this folder: `npm install`
3. `npm run copy-game`            <- pulls the latest game from ../naija-legend
4. `npx cap add android`
5. `npx @capacitor/assets generate --android`   <- icon + splash from resources/
6. `npm run sync`
7. `npm run open`                 <- opens Android Studio
8. Android Studio: Build > Build Bundle(s)/APK(s) > Build APK(s). APK lands in
   android/app/build/outputs/apk/debug/app-debug.apk — share it directly (WhatsApp etc).

Every time the game changes: `npm run sync`, then rebuild the APK.

Play Store later: Build > Generate Signed Bundle (create a keystore, KEEP IT SAFE),
pay the one-time $25 developer fee, upload the .aab.

What's already wired in the game itself:
- Android back button navigates screens, minimizes at root (Capacitor App plugin).
- Saves write-through to Capacitor Preferences and auto-restore if WebView
  localStorage is ever evicted (Preferences plugin).
- Splash/icon sources in resources/.
- Offline-only, no permissions needed beyond defaults.
