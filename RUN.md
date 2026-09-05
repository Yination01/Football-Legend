# Football Legend - Developer & Build Guide

Quick reference for running tests, local builds, and building APKs via GitHub Actions.

---

## 1. Quick Setup & Dependencies

```bash
# Pull latest code
git pull

# Install dependencies (root and app)
npm install
npm --prefix app install
```

---

## 2. Run Audits & Simulation Tests (Always do before building)

```bash
npm run test:all
```

Runs all 590+ checks across 4 gates:
- **Configuration & Assets:** Capacitor appId/webDir, Android Gradle config, `copy-game.js` asset list.
- **Syntax:** `node --check` across all JavaScript source files.
- **Engine & Gameplay:** Simulation fairness (21/21), Master League progression (354 checks), Tournament brackets (ML + BaL), Position skills (100 checks), and Ghost PvP / v1.5 features.
- **Build State:** Reports commits on `main` since the last recorded build.

---

## 3. Building an Installable APK

### Option A: GitHub Actions (Recommended — Zero local setup)

1. Go to **Actions** → **Preview APK** → **Run workflow**.
2. Enter the **Build number** (e.g., `6`).
3. Click **Run workflow**.
4. Once finished:
   - The workflow publishes a GitHub Release tagged `preview-<n>` with `football-legend.apk` attached.
   - An artifact is also uploaded to the Actions run summary.
5. Download the `.apk` directly to your Android device and install.

---

### Option B: Local PowerShell Build (Windows / Cross-platform)

```powershell
.\scripts\build-apk.ps1
```

Or for release profile:
```powershell
.\scripts\build-apk.ps1 -BuildType release
```

---

### Option C: Local Bash Build (Linux / macOS / WSL)

```bash
./scripts/build-apk.sh
```

---

## 4. On-Device Installation & Sideloading

1. Download `football-legend.apk` to your phone.
2. If Android prompts *"Unknown source"* or *"Install unknown apps"*:
   - Navigate to **Settings → Apps → Special app access → Install unknown apps**.
   - Toggle **Allow from this source** for your browser or file manager.
3. Tap **Install** / **Update**.
   - Debug builds share the debug keystore and install straight over previous preview builds without wiping save data.

---

## 5. Everyday Local Testing (Web Browser)

```bash
cd game
python3 serve.py   # or: python3 -m http.server 8000
# Open http://localhost:8000
```
