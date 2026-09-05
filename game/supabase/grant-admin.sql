-- Football Legend — grant yourself admin (chicken-and-egg safe)
-- Paste into Supabase → SQL Editor → Run.
--
-- Why the simple insert often does nothing:
--   insert into admins ... select uid from profiles where player_id = '...'
-- returns "Success. No rows returned" when NO matching profile exists.
-- Profiles are only created after you Sign in with Google INSIDE THE GAME
-- (Settings → Account), not merely the admin console.
--
-- This script grants admin by your Google email (auth.users), which always
-- exists once you've signed in anywhere. It also links/creates the profile
-- if you already know your in-game Player ID.

-- ========== 1) DIAGNOSE (read-only) ==========
-- Who is signed into auth?
select id, email, created_at
from auth.users
order by created_at desc
limit 10;

-- Any profiles yet?
select uid, player_id, name, created_at, last_seen
from public.profiles
order by created_at desc
limit 20;

-- Anyone already admin?
select a.uid, u.email, p.player_id
from public.admins a
left join auth.users u on u.id = a.uid
left join public.profiles p on p.uid = a.uid;

-- ========== 2) GRANT BY EMAIL (edit the email) ==========
-- This is the reliable path. SQL Editor runs as postgres → bypasses RLS.
insert into public.admins (uid)
select id from auth.users
where lower(email) = lower('johnpaulonovo@gmail.com')  -- ← your Google email
on conflict (uid) do nothing;

-- Confirm:
select a.uid, u.email
from public.admins a
join auth.users u on u.id = a.uid;

-- ========== 3) OPTIONAL — bind Player ID if profile is missing ==========
-- Only needed so the game/cloud register + admin Players tab look right.
-- Skip if step 1 already showed a profiles row for you.
--
-- insert into public.profiles (uid, player_id, name)
-- select u.id, 'FL-MS30-HUS1', 'Owner'   -- ← your in-game Player ID from Settings
-- from auth.users u
-- where lower(u.email) = lower('johnpaulonovo@gmail.com')
-- on conflict (uid) do update
--   set player_id = excluded.player_id,
--       name = excluded.name,
--       last_seen = now();
--
-- If player_id conflicts (unique), first check:
--   select * from profiles where player_id = 'FL-MS30-HUS1';

-- ========== 4) After grant ==========
-- Reload https://yination01.github.io/Football-Legend/game/admin/
-- (hard refresh). You should land on Overview, not the lock screen.
