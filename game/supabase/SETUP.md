# Football Legend — Cloud Setup (Supabase, $0)

You'll do this once. ~15 minutes. No card required.

## 1. Create the project (2 min)
1. Go to **https://supabase.com** → *Start your project* → sign in with **GitHub** (your Yination01 account works).
2. *New project* → Organization: your personal org → Name: `football-legend` → Database password: click *Generate* and **save it somewhere safe** → Region: **West EU (London)** (closest to Nigeria) → *Create new project*. Wait ~2 min for provisioning.

## 2. Run the database schema (1 min)
1. Left sidebar → **SQL Editor** → *New query*.
2. Open `supabase/schema.sql` from the repo, paste ALL of it, press **Run**.
3. You should see "Success. No rows returned".

## 3. Enable Google login (5 min)
1. Sidebar → **Authentication → Sign In / Providers → Google** → toggle *Enable*.
2. It shows a **Callback URL** (like `https://xxxx.supabase.co/auth/v1/callback`) — copy it.
3. In a new tab: **https://console.cloud.google.com** → sign in with YOUR Google account → *New project* → name `football-legend` → Create.
4. *APIs & Services → OAuth consent screen* → External → fill App name `Football Legend`, your email → Save through the steps (no scopes needed).
5. *APIs & Services → Credentials → Create credentials → OAuth client ID* → type **Web application** → *Authorized redirect URIs* → paste the Callback URL from step 2 → Create.
6. Copy the **Client ID** and **Client secret** → back in Supabase's Google provider form → paste both → Save.

## 4. Deploy the edge functions (5 min)
The functions live in `supabase/functions/`. Easiest path — the dashboard editor:
1. Sidebar → **Edge Functions** → *Deploy a new function* → *Via Editor*.
2. Name it exactly `sync-save` → delete the sample code → paste the contents of `supabase/functions/sync-save/index.ts`. **Important:** where it imports `../_shared/validate.ts`, the dashboard editor needs the code inline — use the pre-merged file `supabase/functions/sync-save/index.merged.ts` instead (paste that one).
3. Deploy. Repeat for `redeem-code` (paste `supabase/functions/redeem-code/index.ts` — no merge needed).
4. For both functions: open the function → **Details** → turn **OFF** "Verify JWT with legacy secret" is NOT needed — leave defaults.

## 5. Give me the keys (1 min)
Sidebar → **Project Settings → API**. Send me these two values (they are SAFE to share and to ship in the app — security is enforced server-side):
- **Project URL** (like `https://abcdefgh.supabase.co`)
- **anon public** API key (long string starting `eyJ...` or `sb_publishable_...`)

⚠️ Do NOT send the `service_role` key. Never share that one with anyone — it bypasses all security. The edge functions access it automatically on the server; we never need it outside Supabase.

## 6. Make yourself admin (after I wire the keys in)
1. Open the game → Settings → Sign in with Google (use YOUR account).
2. Then in Supabase: SQL Editor → run:
   ```sql
   insert into admins (uid) select uid from profiles where player_id = 'YOUR-PLAYER-ID';
   ```
   (replace with your FL-XXXX-XXXX id — visible in game Settings)
3. That account now has full admin rights in the web dashboard.

That's it. After step 5, I plug the two values into the game + dashboard and everything lights up.
