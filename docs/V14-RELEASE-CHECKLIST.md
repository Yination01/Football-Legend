# v1.4 / v1.5 Final APK — Release Checklist

## ⚠️ BEFORE building the final APK (one-time cloud config)

1. **Supabase redirect URLs** — Dashboard → Authentication → URL Configuration → *Redirect URLs* → add BOTH:
   - `com.footballlegend.game://callback`   ← the Android app's deep link (sign-in inside the APK fails without this!)
   - `https://yination01.github.io/Football-Legend/game/`   ← web version + admin console
2. **GitHub Pages** — repo → Settings → Pages → *Deploy from a branch* → `main` / root → Save.
   - Game: `https://yination01.github.io/Football-Legend/game/`
   - Admin console: `https://yination01.github.io/Football-Legend/game/admin/`
3. **Google OAuth origins** — console.cloud.google.com → Credentials → your OAuth client → *Authorized JavaScript origins* → add `https://yination01.github.io` (only if web sign-in complains).
4. **Leaderboards + Ghosts + Seasons SQL** — Supabase SQL Editor → paste ALL of `game/supabase/leaderboard.sql` → Run ("Success. No rows returned").
   - Without this: Global Rankings spin forever, Ghost PvP has no opponents, Seasons admin page fails.
5. **Deploy `verify-owner` edge function** — Edge Functions → Deploy via Editor → name `verify-owner` → paste `game/supabase/functions/verify-owner/index.ts`.
   - Secrets → set `OWNER_KEY_HASH` to the decimal hash of `flown:` + your key (default `1728818593` matches the legacy key if unset).
6. **Make yourself admin** — Supabase SQL Editor (email grant; profile-based insert often matches 0 rows):
   ```sql
   insert into public.admins (uid)
   select id from auth.users
   where lower(email) = lower('you@gmail.com')  -- the Google account you use on the admin console
   on conflict (uid) do nothing;
   ```
   Full script + diagnostics: `game/supabase/grant-admin.sql`. Then hard-reload the admin console.
7. **Revoke any old GitHub PAT** that is no longer needed.

## Building the final APK (versionCode 5 / "1.4" — already set)

On a machine with JDK 17 + Android SDK (this Arena sandbox cannot download them):

```bash
# one-time toolchain: see docs/BUILD.md
cd app
npm install
# place release.keystore + keystore.properties under app/android/ (NEVER commit)
./../scripts/build-release.sh
# outputs:
#   releases/FootballLegend-v1.4-release.apk
#   releases/FootballLegend-v1.4-playstore.aab
```

Or manually:
```bash
cd app && node copy-game.js && npx cap sync android
cd android && ./gradlew assembleRelease && ./gradlew bundleRelease
```

## Phone test plan (do these on the real device)

- [ ] Install over v1.3 — existing saves intact
- [ ] Settings → Account → SIGN IN WITH GOOGLE → system browser opens → returns to app signed in
- [ ] Play a matchday → check Supabase Table Editor → `saves` row updated (cloud sync works)
- [ ] Admin console (Pages URL) → gift yourself from Players tab → reopen app → gift arrives
- [ ] Create an event in the console → Gifts & Events tile in-app shows it (within ~5 min)
- [ ] Publish a broadcast → gold ANNOUNCEMENT banner on the main menu **and** News Inbox entry
- [ ] Generate a code in the console → redeem it in-app (signed in) → try again → "already used"
- [ ] Airplane mode → whole game still plays offline
- [ ] ML → Table → league tabs + Champions Trophy panel render
- [ ] Gifts screen → history panel lists past rewards (up to 30)
- [ ] **Ghost PvP** → list shows cloud clubs → play one → honest odds → result screen
- [ ] **Owner unlock** → 7 taps on Player ID while signed in → server verifies key
- [ ] **Seasons** (admin) → Close season → top 3 receive inbox gifts on next sign-in
- [ ] Global Rankings → LIVE + past season chips render

## Notes
- Anon key in cloud.js/admin.js is PUBLIC by design (RLS + edge functions enforce security). The service_role key must never leave Supabase.
- Owner key verification is cloud-side as of v1.5. Offline devices that already had `ownerMode` stay unlocked locally; new unlocks require sign-in.
