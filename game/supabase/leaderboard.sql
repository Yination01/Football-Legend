-- Football Legend — Leaderboards (run AFTER schema.sql, in Supabase SQL Editor)
-- Server-computed from validated cloud saves: cheat-resistant because sync-save
-- rejects impossible saves before they ever reach these queries.

-- Public leaderboard RPC: anyone (anon key) can call; returns only safe, public fields.
create or replace function leaderboard_bal(lim int default 50)
returns table (player_id text, name text, pname text, pos text, season int, age int, level int, rep int, goals int, apps int)
language sql stable security definer set search_path = public as $$
  select p.player_id, p.name,
         coalesce(s.bal_save->>'name', '?') as pname,
         coalesce(s.bal_save->>'pos', '?') as pos,
         coalesce((s.bal_save->>'season')::int, 0) as season,
         coalesce((s.bal_save->>'age')::int, 0) as age,
         coalesce((s.bal_save->>'level')::int, 0) as level,
         coalesce((s.bal_save->>'rep')::int, 0) as rep,
         coalesce((s.bal_save->'myStats'->>'goals')::int, 0) as goals,
         coalesce((s.bal_save->'myStats'->>'apps')::int, 0) as apps
  from saves s join profiles p on p.uid = s.uid
  where s.bal_save is not null and not p.banned
  order by coalesce((s.bal_save->>'rep')::int, 0) desc,
           coalesce((s.bal_save->>'level')::int, 0) desc
  limit least(lim, 100);
$$;

create or replace function leaderboard_ml(lim int default 50)
returns table (player_id text, name text, club text, season int, trophies int, budget numeric, squad_n int)
language sql stable security definer set search_path = public as $$
  select p.player_id, p.name,
         coalesce(s.ml_save->>'clubName', '?') as club,
         coalesce((s.ml_save->>'season')::int, 0) as season,
         coalesce(jsonb_array_length(s.ml_save->'trophies'), 0) as trophies,
         coalesce((s.ml_save->>'budget')::numeric, 0) as budget,
         coalesce(jsonb_array_length(s.ml_save->'squad'), 0) as squad_n
  from saves s join profiles p on p.uid = s.uid
  where s.ml_save is not null and not p.banned
  order by coalesce(jsonb_array_length(s.ml_save->'trophies'), 0) desc,
           coalesce((s.ml_save->>'season')::int, 0) desc
  limit least(lim, 100);
$$;

-- allow anonymous + signed-in clients to call them
grant execute on function leaderboard_bal(int) to anon, authenticated;
grant execute on function leaderboard_ml(int) to anon, authenticated;
