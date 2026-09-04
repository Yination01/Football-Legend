-- Football Legend cloud schema (Supabase / Postgres)
-- Run once in Supabase Dashboard > SQL Editor > New query > paste > Run.

-- ============ TABLES ============
create table if not exists profiles (
  uid uuid primary key references auth.users(id) on delete cascade,
  player_id text unique not null,          -- FL-XXXX-XXXX from the game
  name text not null default 'Legend',
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  banned boolean not null default false
);

create table if not exists saves (
  uid uuid primary key references auth.users(id) on delete cascade,
  bal_save jsonb,
  ml_save jsonb,
  bal_updated timestamptz,
  ml_updated timestamptz,
  flag_count int not null default 0        -- validation rejections, feeds admin "Flagged"
);

create table if not exists inbox (        -- server-issued gifts (admin grants, code payouts)
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  gift jsonb not null,                     -- {gp,lc,mlgp,mllc,pl:{name,pos,ovr,card}, note}
  created_at timestamptz not null default now(),
  claimed boolean not null default false,
  claimed_at timestamptz
);
create index if not exists inbox_uid_unclaimed on inbox(uid) where not claimed;

create table if not exists codes (         -- server-side redeem codes (globally single/multi-use)
  code text primary key,                   -- e.g. WELCOME26-AB12-NGLG
  payload jsonb not null,
  max_uses int not null default 1,
  uses int not null default 0,
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists code_redemptions (
  code text not null references codes(code) on delete cascade,
  uid uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, uid)
);

create table if not exists events (        -- live-ops gift events, editable without app updates
  id text primary key,
  title text not null,
  starts_at date not null,
  ends_at date not null,
  payload jsonb not null,                  -- same shape as in-game FL_GIFT_EVENTS entries
  active boolean not null default true
);

create table if not exists broadcasts (    -- admin -> all players messages (in-game news)
  id uuid primary key default gen_random_uuid(),
  message text not null,
  starts_at date not null default current_date,
  ends_at date not null,
  created_at timestamptz not null default now()
);

create table if not exists admins (uid uuid primary key references auth.users(id) on delete cascade);

create table if not exists flags (         -- anomaly log from save validation
  id uuid primary key default gen_random_uuid(),
  uid uuid not null,
  reason text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table if not exists stats_daily (
  day date primary key,
  dau int not null default 0,
  new_users int not null default 0,
  syncs int not null default 0
);

-- ============ HELPERS ============
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from admins where uid = auth.uid()) $$;

create or replace function bump_stat(col text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into stats_daily(day) values (current_date) on conflict (day) do nothing;
  execute format('update stats_daily set %I = %I + 1 where day = current_date', col, col);
end $$;

-- ============ ROW LEVEL SECURITY ============
alter table profiles enable row level security;
alter table saves enable row level security;
alter table inbox enable row level security;
alter table codes enable row level security;
alter table code_redemptions enable row level security;
alter table events enable row level security;
alter table broadcasts enable row level security;
alter table admins enable row level security;
alter table flags enable row level security;
alter table stats_daily enable row level security;

-- profiles: owner reads/creates/updates own row (not `banned`); admins read+write all
create policy p_profiles_own_r on profiles for select using (auth.uid() = uid or is_admin());
create policy p_profiles_own_i on profiles for insert with check (auth.uid() = uid and banned = false);
create policy p_profiles_own_u on profiles for update using (auth.uid() = uid)
  with check (auth.uid() = uid and banned = (select banned from profiles p where p.uid = auth.uid()));
create policy p_profiles_admin_u on profiles for update using (is_admin());

-- saves: owner READ ONLY (writes go through the sync-save edge function, which validates)
create policy p_saves_own_r on saves for select using (auth.uid() = uid or is_admin());

-- inbox: owner reads own; claiming handled by edge function; admins insert/read all
create policy p_inbox_own_r on inbox for select using (auth.uid() = uid or is_admin());
create policy p_inbox_admin_i on inbox for insert with check (is_admin());

-- codes: admins only (redemption is via edge function with service role)
create policy p_codes_admin on codes for all using (is_admin()) with check (is_admin());
create policy p_redemptions_admin_r on code_redemptions for select using (is_admin());

-- events/broadcasts: world-readable (game fetches with anon key); admins write
create policy p_events_all_r on events for select using (true);
create policy p_events_admin_w on events for all using (is_admin()) with check (is_admin());
create policy p_broadcasts_all_r on broadcasts for select using (true);
create policy p_broadcasts_admin_w on broadcasts for all using (is_admin()) with check (is_admin());

-- admins: members can see the list; only existing admins can add/remove
create policy p_admins_r on admins for select using (is_admin());
create policy p_admins_w on admins for all using (is_admin()) with check (is_admin());

-- flags/stats: admin read; writes come from edge functions (service role bypasses RLS)
create policy p_flags_admin_r on flags for select using (is_admin());
create policy p_stats_admin_r on stats_daily for select using (is_admin());
