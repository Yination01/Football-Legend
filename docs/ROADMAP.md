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
