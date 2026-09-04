# Roadmap

## Shipped ✅

- **Core:** Become a Legend career (all positions incl. GK), Master League (Dream Team-style), Friend Match (challenge codes).
- **Engine:** honest odds (test-enforced), playing styles, game plans with real match influence, position playability, decision variety (GK + outfield), stamina/condition/medical systems.
- **Match presentation:** text ticker + 2D live view; 9+ position-aware goal choreographies + tackle/claim cutscenes; goal replays; zone drift; you-marker; keeper dives/tracking; attack-state banner with pulsing direction arrows (ATTACKING / DANGEROUS ATTACK); compact attack strip in ticker mode; momentum sparkline (last 10'); danger edge tint.
- **Economy:** GP + Legend Coins, card packs, trainers (drops + shop + dupe conversion), gate-receipt finances (losses never cost money).
- **Persistence:** localStorage + Capacitor Preferences mirror + Documents backup file (uninstall-proof, restore prompt on reinstall) + Android Auto Backup + manual backup codes.
- **Android app:** Capacitor wrapper, debug APK builds, splash + icon.

## Launch prep (v1.1) — DONE ✅

- [x] Master League 2D live view (formation-aware pitch, attack banner/arrows, danger tint, event flashes).
- [x] Sound everywhere: crowd, whistles, goal roars, UI tap sounds (synthesized, $0 assets).
- [x] First-launch onboarding overlay (60-second intro to the three modes).
- [x] $0 crash diagnostics: on-device error log, copyable from Settings.
- [x] Release keystore + signed release APK + Play Store `.aab` (v1.1, versionCode 2).
- [x] Store pack: listing copy, privacy policy, icon 512, feature graphic 1024×500, launch checklist.

## To launch (owner actions — see store/LAUNCH-CHECKLIST.md)

- [ ] Back up the release keystore in 2+ places.
- [ ] Device test the release APK; friend playtest (5–10 people).
- [ ] Phone screenshots for the store listing.
- [ ] Host privacy policy (GitHub Pages).
- [ ] Play Console account ($25) → internal test → closed test (12 testers/14 days for new accounts) → production.

## Post-launch

- [ ] Ghost PvP (friend's squad with AI tactics).
- [ ] Monetization only after retention is proven: rewarded ads / LC purchases.
- [ ] Online PvP when revenue supports a server.

## Deferred until revenue

- Online real-time PvP (needs a server).
- Cloud saves (needs a backend; local 3-layer backup covers uninstall/reinstall today).
