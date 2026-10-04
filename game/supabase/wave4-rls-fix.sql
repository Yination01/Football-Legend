-- Football Legend — Wave 4 (#18): RLS fix + anon select-only hardening
-- Run AFTER schema.sql and leaderboard.sql, in Supabase SQL Editor (paste ALL -> Run).
-- Idempotent: safe to re-run any number of times.

-- ============================================================================
-- 1) THE BUG: the owner-update policy on `profiles` referenced its own table.
--
--    create policy p_profiles_own_u on profiles for update
--      with check (auth.uid() = uid and banned = (select banned from profiles p where p.uid = auth.uid()));
--
--    Postgres evaluates that `select ... from profiles` under the same policy,
--    so the policy calls itself: 42P17 "infinite recursion detected in policy
--    for relation profiles". Every owner profile write (display name, last_seen)
--    failed in production while the game kept working offline.
--
--    Fix: read the row through a SECURITY DEFINER helper, which bypasses RLS and
--    therefore cannot recurse. The helper is read-only and takes only a uid.
-- ============================================================================
create or replace function fl_is_banned(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select banned from profiles where uid = p_uid), false);
$$;
revoke execute on function fl_is_banned(uuid) from anon;          -- do not leak ban state to logged-out callers
grant execute on function fl_is_banned(uuid) to authenticated;    -- the policy needs it

drop policy if exists p_profiles_own_u on profiles;
create policy p_profiles_own_u on profiles for update
  using (auth.uid() = uid)
  with check (auth.uid() = uid and fl_is_banned(auth.uid()) = false);

-- ============================================================================
-- 2) SELECT-ONLY FOR anon / authenticated, at the PRIVILEGE level.
--
--    RLS already had no write policy on `saves` (writes go through the
--    `sync-save` edge function's service-role client), but the grants still
--    allowed INSERT/UPDATE/DELETE. Belt and braces: remove the privilege too,
--    so a future policy mistake cannot silently re-open a write path.
-- ============================================================================
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
grant select on public.events,        public.broadcasts, public.seasons, public.season_ranks to anon, authenticated;
grant select on public.profiles,      public.saves,      public.inbox  to authenticated;   -- own row, filtered by RLS
grant select on public.admins,        public.flags,      public.stats_daily,
               public.codes,          public.code_redemptions to authenticated;             -- admin-only, filtered by RLS

-- Same rules for anything created later.
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;

-- `bump_stat` is an internal counter used by the edge functions (service role);
-- it must not be callable by players (default function EXECUTE is PUBLIC).
revoke execute on function bump_stat(text) from anon, authenticated;

-- ============================================================================
-- 3) Leaderboards keep reading server-computed values from validated saves.
--    (No change needed — re-asserted here so the invariant is checkable.)
--    * leaderboard_bal / leaderboard_ml / leaderboard_ghosts are SECURITY
--      DEFINER and read only `saves` rows written by the sync-save validator.
--    * every one of them filters `not p.banned`.
--    * leaderboard_ghosts returns strength/tactics only — never raw squad JSON.
-- ============================================================================

-- ============================================================================
-- 4) Verify (run these two queries; both must return zero rows)
--
--    -- a) no non-SELECT policy for logged-out users anywhere
--    select tablename, policyname, cmd, roles from pg_policies
--     where 'anon' = any(roles) and cmd <> 'SELECT';
--
--    -- b) no write privilege left for anon/authenticated on saves
--    select grantee, privilege_type from information_schema.role_table_grants
--     where table_name = 'saves' and grantee in ('anon','authenticated')
--       and privilege_type <> 'SELECT';
-- ============================================================================
