# ⚽ Football Legend

A mobile football (soccer) game for Android. eFootball-style card/meta progression with **simulated, spectated matches** — no 3D gameplay, no rigged results.

**Built on a $0 budget.** Web-tech game (HTML/JS/Canvas) wrapped as a native Android app with Capacitor.

## Game modes

| Mode | Description |
|---|---|
| **Become a Legend (BaL)** | Create a player (any position incl. GK), pick a playing style and region, and grow from local league to legend. Interactive match decisions, training, upgrades, objectives, transfers. |
| **Master League (ML)** | eFootball Dream Team-style squad builder: card packs, dual currency (GP + Legend Coins), trainers, formations, game plans, gate-receipt finances. One save, forever. |
| **Friend Match** | Challenge-code PvP: export your squad as a code, a friend imports it and plays against it. |

## Key principles (non-negotiable)

- **The simulation is never rigged** — displayed odds ARE the engine's true odds (enforced by unit tests in `game/test-fairness.js`).
- **Global identity** — realistic fictional player/club names, not centered on any one country.
- **Losses never deduct money** in ML (gate-receipts finance model).
- **Native app is the end goal** — the browser build is for testing only.

## Repository layout

```
game/       The game itself (engine, UI, ML, styles, tests). Runs in any browser.
app/        Capacitor Android wrapper project (builds the APK).
docs/       Game spec, build guide, project instructions, dev handbook.
releases/   Latest built APK.
```

## Quick start (play in browser)

```bash
cd game
python3 serve.py   # or: python3 -m http.server 8000
# open http://localhost:8000
```

## Build the Android APK

See [docs/BUILD.md](docs/BUILD.md). Short version:

```bash
cd app
npm install
node copy-game.js
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Run the tests

```bash
cd game
node test-fairness.js   # odds honesty: displayed odds == engine odds
node test-ml.js         # 350+ Master League checks
```

## Current release

`releases/FootballLegend.apk` — debug-signed build including:
- 2D live match view with 9+ position-aware goal choreographies, replays, keeper AI
- Attack-state indicators (ATTACKING / DANGEROUS ATTACK) with direction arrows, momentum sparkline, danger tint
- Uninstall-proof saves: Documents backup file + Android Auto Backup + restore prompt on reinstall
- Backup codes for manual cross-device transfer

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md). Next up: ML 2D match-view parity, ghost PvP, onboarding polish, then Google Play release (.aab + keystore, $25 fee funded from revenue).
