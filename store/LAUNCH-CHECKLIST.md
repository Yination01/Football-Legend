# 🚀 Launch Checklist — from here to Google Play

Work through this top to bottom. Steps 1–3 cost nothing; step 5 costs the one-time $25.

## 1. Secure the release keystore (DO THIS FIRST — 10 minutes)

The file `release.keystore` + the password in `KEYSTORE-CREDENTIALS.txt` (in the
football-legend-app folder, NOT in the public repo) are irreplaceable.
If they're lost, you can never update the app on Play again.

- [ ] Download both files from the workspace
- [ ] Email them to yourself
- [ ] Copy them to a second place (Google Drive, second email, USB stick)
- [ ] NEVER commit them to the public GitHub repo

## 2. Final device test (1–2 days)

- [ ] Install `FootballLegend-release.apk` on your phone (uninstall the debug one first — different signature, they can't update over each other; make a backup code first, or rely on the Documents restore prompt)
- [ ] Play 3+ BaL matches, 3+ ML matches (try the new ML 2D Live view)
- [ ] Check the first-launch welcome screen appears once
- [ ] Verify sound: whistle at kickoff, roar on goals, tap sounds on buttons
- [ ] Uninstall → reinstall → confirm the restore prompt brings your careers back
- [ ] Settings → Error log should say 0 entries after your play session

## 3. Friend playtest (3–7 days, in parallel)

- [ ] Send the GitHub releases link or the release APK to 5–10 friends
- [ ] Watch at least 2 people play WITHOUT helping them — note every confusion
- [ ] Ask each: "would you keep playing?" and "what annoyed you?"
- [ ] Collect error logs (Settings → COPY) from anyone who hits problems
- [ ] Fix what matters, rebuild, bump versionCode

## 4. Host the privacy policy (free, 15 minutes)

Play requires a public URL:
- [ ] In the GitHub repo: Settings → Pages → Deploy from branch → main → save
- [ ] Policy will be live at: `https://yination01.github.io/Football-Legend/store/PRIVACY-POLICY`
      (or just link the GitHub file view: `https://github.com/Yination01/Football-Legend/blob/main/store/PRIVACY-POLICY.md` — Pages looks more professional)

## 5. Google Play Console ($25 one-time)

- [ ] Create a developer account at https://play.google.com/console (personal account, $25)
- [ ] Identity verification (needs an ID document; can take a few days)
- [ ] Create app → "Football Legend" → Game → Free
- [ ] Upload `FootballLegend-playstore.aab` to **Internal testing** first
- [ ] Fill in the store listing from `STORE-LISTING.md` (copy-paste ready)
- [ ] Upload icon + feature graphic from `store/`, plus your phone screenshots
- [ ] Complete Content rating + Data safety questionnaires (answers in STORE-LISTING.md)
- [ ] Add privacy policy URL from step 4
- [ ] Internal testing → add your email + friends as testers → test the Play-delivered build
- [ ] Promote to **Production** when stable

⚠️ Note: new personal developer accounts must run a closed test with 12+ testers
for 14 days before production release. Plan for this — start the closed test
immediately after account approval and recruit testers (friends, classmates,
WhatsApp groups).

## 6. Launch day

- [ ] Production release submitted (review takes ~1–7 days)
- [ ] Share the Play link everywhere once live
- [ ] Watch Play Console → Quality → Android vitals for crashes
- [ ] Ask happy players for 5-star reviews (early ratings matter enormously)

## After launch

- Updates: bump `versionCode`/`versionName` in `app/android/app/build.gradle`, rebuild the .aab, upload
- Same keystore every time (automatic — gradle reads keystore.properties)
- Monetization (only after retention looks good): rewarded ads or LC purchases
- Roadmap: ghost PvP, more leagues, online PvP when revenue supports a server
