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
node test-ml-ct.js && node test-bal-ct.js
node test-v15.js        # Ghost PvP / news / owner / seasons surface
```

## Current release — v1.4 / v1.5 (cloud + ghost)

Code is complete on `main`. Final signed APK/AAB is built on a machine with JDK 17 (see `scripts/build-release.sh`); until then share the web build:

- **Web game:** https://yination01.github.io/Football-Legend/game/
- **Admin console:** https://yination01.github.io/Football-Legend/game/admin/
- Prior APKs in `releases/` are v1.2/v1.3-era (still installable for offline play).

### What's new in v1.4–v1.5
- Cloud saves (Supabase) with anti-cheat validation, Google sign-in, gift inbox, live-ops events, broadcasts
- Global rankings (Legends + Clubs) + **monthly seasons** with top-3 auto-gifts
- **Ghost PvP** — async matches vs real players' cloud clubs
- **News Inbox** — full announcement history
- Owner panel key verified **server-side** (hash no longer in the APK)
- Admin console: Overview, Players, Events, Codes, Broadcast, Seasons, Flagged, Admins

Store submission pack lives in `store/` (listing copy, privacy policy, graphics, launch checklist).
Owner cloud setup: `docs/V14-RELEASE-CHECKLIST.md` + `game/supabase/SETUP.md`.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md). Launch track: your Supabase config → final APK → friend playtest → Play Store ($25 from revenue).
