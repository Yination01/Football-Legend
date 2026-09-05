# Ghost PvP — region brackets + region-change requests

**Status:** DESIGN ONLY. Do not implement until the owner picks the options below.
**Locks:** $0 · never-rig odds · Friend Match stays challenge-codes · Ghost first · real-time PvP later · no 3D.

Region is already a first-class identity on both careers (`S.region` / `M.region`, 8 pools in `Engine.REGIONS`). It currently only seeds names, starter clubs, and which galaxy league you climb. Ghost PvP is a **global** list ordered by trophies.

## Why brackets

A 55-str club in Campeonato Nacional vs an 88-str British dynasty is an honest mismatch, but it is a *bad queue*. Brackets by **home region** (the league you founded in) keep Ghost closer to “play someone in your world” without touching the engine. Displayed odds stay `winProbs()` of the two sealed strengths. No hidden matchmaking rubber-band.

## Ghost brackets (in-game)

**UI:** Ghost screen gets a chip row, same pattern as Global Rankings seasons.

| Chip | Filter |
|---|---|
| **MY REGION** (default) | `ghost.region === myML.region` (fallback: BaL region if no ML save) |
| **WORLD** | current global list (trophies desc) |

Each row already shows club / str / mentality / style. Add the region flag + league short name (`E.REGION_LEAGUES`). Empty MY REGION copy: “No clubs from your region online yet — play WORLD, or wait for neighbours to sync.”

**SQL** (`leaderboard_ghosts`, still re-runnable):

- Add `region text` from `coalesce(s.ml_save->>'region', '')`.
- Optional arg `p_region text default null`. When non-null, `where region = p_region` **before** the limit. If that returns `< 5` rows, the client (not the RPC) offers WORLD — never silently pad with other regions (that would look like rigged matchmaking).
- Still never return squad JSON.

**Honesty:** home lift, mentality, style duel stay exactly as today. Region is a *list filter*, not a strength modifier.

**Not in v1 of this feature**

- Strength bands (e.g. 60–70 only) — ask later if MY REGION is still a slaughter.
- Ranked Ghost seasons per region — can piggyback `season_ranks` later.
- Real-time PvP — still deferred until revenue.

## Region-change request (future, admin-approved)

Changing region after founding is an exploit surface: hop to a thinner/weaker Ghost bracket, or re-roll name pools / league identity. So it is **never** a self-serve toggle.

**Proposed flow (not built):**

1. Settings → Account → “Request region change”. Pick target region + 1-line reason. One open ticket at a time.
2. Client calls a new edge fn `region-request` (signed-in only). Inserts `region_requests(uid, from_region, to_region, reason, status='pending')`.
3. Admin console → new **Requests** tab: approve / deny. Deny sends an inbox note. Approve writes `profiles.region` (new column) **and** a one-shot inbox gift flag `{region: newId}` so the next `sync-save` pull can rewrite `M.region` / `S.region` locally.
4. Cooldown: 30 days after an approval. A second request while pending or cooling is rejected server-side.
5. What approval does **not** do: move your club to another galaxy league mid-season, wipe fixtures, or restat players. It only changes the Ghost/leaderboard bracket + future generated names. League identity stays the club you founded. (If the owner wants a full league transplant, that is a different, more dangerous feature — ask.)

**Schema sketch** (do not apply yet):

```sql
create table if not exists region_requests (
  id bigserial primary key,
  uid uuid not null references profiles(uid),
  from_region text not null,
  to_region text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
```

Admin-only writes; the player can `select` their own rows.

## Owner decisions (pick before any code)

1. **Default Ghost list:** MY REGION only, or MY REGION default + WORLD chip (recommended).
2. **Thin regions:** if MY REGION has &lt;5 ghosts — show WORLD as a chip, auto-fall to WORLD, or keep empty.
3. **Region-change:** 30-day cooldown after admin approve (recommended), one free change ever, or tickets with no cooldown.
4. **On approve:** change Ghost bracket only (recommended), or also transplant the ML club into that region’s league (disruptive).

## Implementation order (after sign-off)

1. SQL: add `region` to `leaderboard_ghosts` + optional filter. Owner re-runs `leaderboard.sql`.
2. Cloud: `fetchGhosts({ region })`.
3. Ghost screen chips + flag on rows.
4. Tests: RPC shape, filter honesty (odds unchanged), empty-state copy.
5. **Later:** `region_requests` + admin tab. Not in the same drop as (1–4).
