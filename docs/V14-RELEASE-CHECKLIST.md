# v1.4 Final APK — Release Checklist

## ⚠️ BEFORE building the final APK (one-time cloud config)

1. **Supabase redirect URLs** — Dashboard → Authentication → URL Configuration → *Redirect URLs* → add BOTH:
   - `com.footballlegend.game://callback`   ← the Android app's deep link (sign-in inside the APK fails without this!)
   - `https://yination01.github.io/Football-Legend/game/`   ← web version + admin console (after enabling Pages)
2. **GitHub Pages** — repo → Settings → Pages → *Deploy from a branch* → `main` / root → Save.
   - Game: `https://yination01.github.io/Football-Legend/game/`
   - Admin console: `https://yination01.github.io/Football-Legend/game/admin/`
3. **Google OAuth origins** — console.cloud.google.com → Credentials → your OAuth client → *Authorized JavaScript origins* → add `https://yination01.github.io` (only if web sign-in complains).
4. **Make yourself admin** — sign into the game (web or app) with Google once, then in Supabase SQL Editor:
   ```sql
   insert into admins (uid) select uid from profiles where player_id = 'YOUR-FL-ID';
   ```

## Building the final v1.4 APK (versionCode 5 / "1.4" — already set)

From `football-legend-app/`: `node copy-game.js && npx cap sync android`, then in `android/`:
separate `./gradlew assembleRelease` and `./gradlew bundleRelease` runs (low-memory settings, keep them).

## Phone test plan (do these on the real device)

- [ ] Install over v1.3 — existing saves intact
- [ ] Settings → Account → SIGN IN WITH GOOGLE → system browser opens → returns to app signed in
- [ ] Play a matchday → check Supabase Table Editor → `saves` row updated (cloud sync works)
- [ ] Admin console (Pages URL) → gift yourself from Players tab → reopen app → gift arrives
- [ ] Create an event in the console → Gifts & Events tile in-app shows it (within ~5 min)
- [ ] Publish a broadcast → gold ANNOUNCEMENT banner on the main menu
- [ ] Generate a code in the console → redeem it in-app (signed in) → try again → "already used"
- [ ] Airplane mode → whole game still plays offline
- [ ] ML → Table → league tabs + Champions Trophy panel render
- [ ] Gifts screen → history panel lists past rewards

## Notes
- Anon key in cloud.js/admin.js is PUBLIC by design (RLS + edge functions enforce security). The service_role key must never leave Supabase.
- Owner key (in-game panel) is separate from cloud admin (Google-based). Both remain valid.
