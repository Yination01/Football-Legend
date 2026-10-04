# Roadmap

## Shipped ✅

- **Core:** Become a Legend career (all positions incl. GK), Master League (Dream Team-style), Friend Match (challenge codes).
- **Engine:** honest odds (test-enforced), playing styles, game plans with real match influence, position playability, decision variety (GK + outfield), stamina/condition/medical systems.
- **Match presentation:** text ticker + 2D live view; 9+ position-aware goal choreographies + tackle/claim cutscenes; goal replays; zone drift; you-marker; keeper dives/tracking; attack-state banner with pulsing direction arrows; compact attack strip in ticker mode; momentum sparkline; danger edge tint.
- **Economy:** GP + Legend Coins, card packs, trainers (drops + shop + dupe conversion), gate-receipt finances (losses never cost money).
- **Persistence:** localStorage + Capacitor Preferences mirror + Documents backup file (uninstall-proof, restore prompt on reinstall) + Android Auto Backup + manual backup codes.
- **Android app:** Capacitor wrapper, debug/release APK builds, splash + icon.
- **v1.2 World:** 6-league galaxy, Champions Trophy (groups + KO), cross-league transfers, January window, weekly market.
- **v1.3:** BaL retirement/HoF, ML retirements + academy regens, gift events + redeem codes, owner panel.
- **v1.4 Cloud:** Supabase backend, Google sign-in (web + native PKCE), server-validated saves, server codes, cloud gift inbox, live-ops events, broadcasts, admin console, global rankings.
- **v1.5.2 UI:** BaL player card shows PAC–PHY on Home/Career; ML Squad decluttered (tap a player for TRAIN/SELL).
- **v1.5 Live-ops + Ghost:**
  - **Ghost PvP** — async matches vs real players' validated ML cloud clubs (AI tactics, honest engine).
  - **News Inbox** — full broadcast history in-game (not banner-only).
  - **Owner panel hardening** — key verified server-side via `verify-owner` edge function (hash no longer in the APK).
  - **Leaderboard seasons** — monthly snapshots + auto-gifts for top 3 (admin "Close season").
  - Fixed `app/copy-game.js` source path (`../game`).

- **v1.6 (in code, unreleased) — Master Plan Wave 2:**
  - **#1 Mid-match pause + tactics drawer** — BaL pause modal (score clock stamina role; resume, drawer, sub, auto-play) and a sliding drawer with `Engine.setRole()` switches that apply from the current minute; ML pause opens its tactical window on demand.
  - **#11 Segmented match HUD** — scoreboard sub-line (role / commentary mode / knockout tag), control strip + bottom speed/sub bar, one honest sub path for HUD, drawer and modal.
  - **#2 Half-time locker room** — clock halts at 45', real first-half stats, honest gaffer note, role choice for the second half.
  - **#3 Extra time + interactive shootouts** — knockout ties play 120' (`ko: true`), then an honest `Engine.penaltyShootout()` whose exact kick list drives the UI, the summary and the rewards. All six former coin-flip tie-breaks removed (incl. AI-vs-AI CT ties).
  - **#4 Key Highlights mode** — in-play replays skipped and stored as deterministic cuts, replayed in a post-match 2D reel; "Full Commentary" replays every shot live (`longCommentary` setting).
  - **#5 Defender decision matrix** — tackle / jockey / step up / drop off across five scenarios, shown % == rolled % (measured over ~2.9k duels in `test-wave2.js`).
  - **#5 extension** - DMF/CMF defensive role profiles (Sit & Screen / Press & Win) plus DMF on the set-piece taker list; GK and the back line still never take them. Keeper penalty odds corrected to an exact mirror of the engine (they were ~9pp pessimistic).
  - New suite `game/test-wave2.js` (95 checks incl. DOM-hook integrity and per-position decision coverage for both match screens).

- **v1.6 (in code, unreleased) — Master Plan Wave 1:**
  - **#8 PES 5-direction form arrows** (⬆ ↗ ➡ ↘ ⬇) with seeded, deterministic drift; each arrow step is a real 1.5 OVR in `effOvr`.
  - **#7 Tactical counter system** surfaced as a full 4x4 matrix on the Tactics screen — identical to the +1.0/0/-1.0 baked into the shown odds.
  - **#10 Season-2 transition fixed** — tier-aware galaxy binding (my league *is* the galaxy league; promoted clubs vacate their slot), Super-League top-4 continental route, and a full end-of-season pipeline with a Season Review panel (awards, settle, rollover).
  - **#14 Auto-refresh bug fixed** — native storage race removed (restores hydrate in place, no page reboot) and reloads can never fire mid-match.
  - New suite `game/test-v16.js` (54 checks) + `scripts/sync-assets.js` (plain/cache-busted twins stay identical).
  - Full 18-item spec: `docs/MASTER-PLAN-v1.6.md` (Waves 2-4 queued: match-day UX, defender matrix, career/economy, cloud).

## To launch (owner actions — see store/LAUNCH-CHECKLIST.md + docs/V14-RELEASE-CHECKLIST.md)

- [ ] Supabase: run `game/supabase/leaderboard.sql` (includes ghosts + seasons).
- [ ] Supabase: redirect URLs + deploy `verify-owner` edge function + set `OWNER_KEY_HASH` secret.
- [ ] Make yourself admin; revoke old GitHub PAT.
- [ ] Build final APK/AAB on a machine with JDK 17 + Android SDK (`scripts/build-release.sh`).
- [ ] Device test plan in `docs/V14-RELEASE-CHECKLIST.md`.
- [ ] Back up the release keystore in 2+ places.
- [ ] Friend playtest (5–10 people).
- [ ] Host privacy policy (GitHub Pages — already on `main` once pushed).
- [ ] Play Console account ($25) → internal → closed → production.
- [ ] Publish Google OAuth consent screen before public launch.

## Post-launch

- [ ] Monetization only after retention is proven: rewarded ads / LC purchases.
- [ ] Real-time online PvP when revenue supports matchmaking infra (Ghost PvP first — shipped).

## Deferred until revenue

- Online real-time PvP (needs a server beyond Supabase free tier).
- 3D match rendering (permanently out of scope per concept).
- Paid assets/services.
