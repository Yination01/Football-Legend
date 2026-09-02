# Roadmap

## Shipped ✅

- **Core:** Become a Legend career (all positions incl. GK), Master League (Dream Team-style), Friend Match (challenge codes).
- **Engine:** honest odds (test-enforced), playing styles, game plans with real match influence, position playability, decision variety (GK + outfield), stamina/condition/medical systems.
- **Match presentation:** text ticker + 2D live view; 9+ position-aware goal choreographies + tackle/claim cutscenes; goal replays; zone drift; you-marker; keeper dives/tracking; attack-state banner with pulsing direction arrows (ATTACKING / DANGEROUS ATTACK); compact attack strip in ticker mode; momentum sparkline (last 10'); danger edge tint.
- **Economy:** GP + Legend Coins, card packs, trainers (drops + shop + dupe conversion), gate-receipt finances (losses never cost money).
- **Persistence:** localStorage + Capacitor Preferences mirror + Documents backup file (uninstall-proof, restore prompt on reinstall) + Android Auto Backup + manual backup codes.
- **Android app:** Capacitor wrapper, debug APK builds, splash + icon.

## Update 2 (next)

- [ ] Master League match-view parity: 2D live + cutscenes in ML matches (currently BaL-grade in BaL only).
- [ ] Ghost PvP: play against a friend's exported squad with their tactics AI-driven.
- [ ] Onboarding polish + achievements.
- [ ] Continued phone playtest fixes.

## Release track

- [ ] Release keystore + signed `.aab` (`./gradlew bundleRelease`).
- [ ] Google Play developer account ($25, funded from revenue).
- [ ] Store listing: screenshots, description, content rating.
- [ ] Monetization (post-launch): rewarded ads / IAP for Legend Coins — only after the game is fun free.

## Deferred until revenue

- Online real-time PvP (needs a server).
- Cloud saves (needs a backend; local 3-layer backup covers uninstall/reinstall today).
