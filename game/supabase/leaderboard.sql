-- Football Legend — Leaderboards + Ghosts + Seasons
-- Run AFTER schema.sql, in Supabase SQL Editor (paste ALL → Run).
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

-- Ghost PvP cards: sanitized strength + tactics derived from validated ML saves.
-- Strength ≈ average OVR of the XI (or whole squad if xi missing), clamped 45–92.
-- Never returns full squad JSON — just enough to run an honest spectated match.
create or replace function leaderboard_ghosts(lim int default 40)
returns table (
  player_id text, name text, club text, season int, trophies int,
  str numeric, mentality text, style text, formation text
)
language sql stable security definer set search_path = public as $$
  with base as (
    select p.player_id, p.name,
           coalesce(s.ml_save->>'clubName', '?') as club,
           coalesce((s.ml_save->>'season')::int, 0) as season,
           coalesce(jsonb_array_length(s.ml_save->'trophies'), 0) as trophies,
           coalesce(s.ml_save->>'mentality', 'balanced') as mentality,
           coalesce(s.ml_save->>'style', 'possession') as style,
           coalesce(s.ml_save->>'formation', '4-4-2') as formation,
           s.ml_save as ms
    from saves s join profiles p on p.uid = s.uid
    where s.ml_save is not null and not p.banned
      and jsonb_array_length(coalesce(s.ml_save->'squad', '[]'::jsonb)) >= 11
  ),
  scored as (
    select b.*,
      least(92, greatest(45,
        coalesce((
          select avg((pl->>'ovr')::numeric)
          from jsonb_array_elements(b.ms->'squad') pl
          where (b.ms->'xi') is null
             or jsonb_array_length(coalesce(b.ms->'xi','[]'::jsonb)) = 0
             or (pl->>'id') in (select jsonb_array_elements_text(b.ms->'xi'))
        ), 60)
      )) as str
    from base b
  )
  select player_id, name, club, season, trophies, round(str, 1) as str,
         mentality, style, formation
  from scored
  order by trophies desc, season desc, str desc
  limit least(lim, 100);
$$;

-- ============ SEASONS (monthly snapshots + top-rank rewards) ============
create table if not exists seasons (
  id text primary key,                          -- e.g. 2026-09
  label text not null,                          -- e.g. "September 2026"
  starts_at date not null,
  ends_at date not null,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists season_ranks (
  season_id text not null references seasons(id) on delete cascade,
  mode text not null check (mode in ('bal','ml')),
  rank int not null,
  player_id text not null,
  name text not null,
  detail jsonb not null default '{}',           -- score fields snapshot
  primary key (season_id, mode, rank)
);
create index if not exists season_ranks_pid on season_ranks(player_id);

alter table seasons enable row level security;
alter table season_ranks enable row level security;
drop policy if exists p_seasons_all_r on seasons;
drop policy if exists p_seasons_admin_w on seasons;
drop policy if exists p_season_ranks_all_r on season_ranks;
drop policy if exists p_season_ranks_admin_w on season_ranks;
create policy p_seasons_all_r on seasons for select using (true);
create policy p_seasons_admin_w on seasons for all using (is_admin()) with check (is_admin());
create policy p_season_ranks_all_r on season_ranks for select using (true);
create policy p_season_ranks_admin_w on season_ranks for all using (is_admin()) with check (is_admin());

-- Snapshot current live boards into a season row. Admin-only (or service role).
-- Rewards: top 3 get inbox gifts (LC / ML LC). Idempotent per (season, mode).
create or replace function season_close(p_id text, p_label text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sid text := p_id;
  lab text := coalesce(p_label, p_id);
  n_bal int := 0; n_ml int := 0;
  r record;
  reward jsonb;
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  insert into seasons(id, label, starts_at, ends_at, closed)
  values (sid, lab, date_trunc('month', current_date)::date, current_date, true)
  on conflict (id) do update set closed = true, ends_at = current_date, label = excluded.label;

  delete from season_ranks where season_id = sid;

  -- BaL snapshot
  for r in select * from leaderboard_bal(50) loop
    n_bal := n_bal + 1;
    insert into season_ranks(season_id, mode, rank, player_id, name, detail)
    values (sid, 'bal', n_bal, r.player_id, r.name,
            jsonb_build_object('pname', r.pname, 'pos', r.pos, 'rep', r.rep, 'level', r.level,
                               'goals', r.goals, 'apps', r.apps, 'season', r.season));
    if n_bal <= 3 then
      reward := case n_bal
        when 1 then jsonb_build_object('lc', 100, 'mllc', 50, 'title', 'Season ' || lab || ' · #1 Legend', 'note', 'Season reward')
        when 2 then jsonb_build_object('lc', 60,  'mllc', 30, 'title', 'Season ' || lab || ' · #2 Legend', 'note', 'Season reward')
        else        jsonb_build_object('lc', 30,  'mllc', 15, 'title', 'Season ' || lab || ' · #3 Legend', 'note', 'Season reward')
      end;
      insert into inbox(uid, gift)
      select p.uid, reward from profiles p where p.player_id = r.player_id and not p.banned;
    end if;
  end loop;

  -- ML snapshot
  for r in select * from leaderboard_ml(50) loop
    n_ml := n_ml + 1;
    insert into season_ranks(season_id, mode, rank, player_id, name, detail)
    values (sid, 'ml', n_ml, r.player_id, r.name,
            jsonb_build_object('club', r.club, 'trophies', r.trophies, 'budget', r.budget,
                               'squad_n', r.squad_n, 'season', r.season));
    if n_ml <= 3 then
      reward := case n_ml
        when 1 then jsonb_build_object('mllc', 80, 'mlgp', 20, 'title', 'Season ' || lab || ' · #1 Club', 'note', 'Season reward')
        when 2 then jsonb_build_object('mllc', 40, 'mlgp', 10, 'title', 'Season ' || lab || ' · #2 Club', 'note', 'Season reward')
        else        jsonb_build_object('mllc', 20, 'mlgp', 5,  'title', 'Season ' || lab || ' · #3 Club', 'note', 'Season reward')
      end;
      insert into inbox(uid, gift)
      select p.uid, reward from profiles p where p.player_id = r.player_id and not p.banned;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'season', sid, 'bal', n_bal, 'ml', n_ml);
end $$;

-- Read a season board (or live board when season_id is null / 'live')
create or replace function leaderboard_season(mode text, season_id text default null, lim int default 50)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  sid text := season_id;
  out jsonb;
begin
  if sid is null or sid = '' or sid = 'live' then
    if mode = 'ml' then
      select coalesce(jsonb_agg(to_jsonb(t) order by t.trophies desc), '[]'::jsonb)
        into out from leaderboard_ml(lim) t;
    else
      select coalesce(jsonb_agg(to_jsonb(t) order by t.rep desc), '[]'::jsonb)
        into out from leaderboard_bal(lim) t;
    end if;
    return jsonb_build_object('season', 'live', 'rows', out);
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'rank', r.rank, 'player_id', r.player_id, 'name', r.name
           ) || r.detail order by r.rank
         ), '[]'::jsonb)
    into out
  from season_ranks r
  where r.season_id = sid and r.mode = mode and r.rank <= least(lim, 100);

  return jsonb_build_object('season', sid, 'rows', out);
end $$;

grant execute on function leaderboard_bal(int) to anon, authenticated;
grant execute on function leaderboard_ml(int) to anon, authenticated;
grant execute on function leaderboard_ghosts(int) to anon, authenticated;
grant execute on function leaderboard_season(text, text, int) to anon, authenticated;
grant execute on function season_close(text, text) to authenticated;
