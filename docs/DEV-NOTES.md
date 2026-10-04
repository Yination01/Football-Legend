# Developer Notes (error log & proven recipes)

Hard-won knowledge from development. Check this before repeating an approach.

## Architecture map

- `game/engine.js` — pure match engine (no DOM). `createMatch()`, `step()` per minute, event emits (goal/save/miss/setpiece) with `scen` tags for choreography selection; set-piece events carry `via` instead (legitimately scen-less). `decisionOdds()` is an EXACT mirror of the resolve math — any probability change must hit both or fairness tests fail.
- `game/app.js` — all BaL UI + match screens + 2D live renderer + save system. Key regions: `flMirror`/`flFileBackup*`/`flFileRestoreCheck` (persistence layers, near top); `save()`; `playMoment()` (14 cutscene choreographies, SCEN_VARIANT map, failsafe timer); `initLive`/`drawLive` (2D canvas: players, ball, replays, you-ring, attack banner/arrows/danger tint); `matchScreen()` with `step()` loop, `updateAtkState()`, momentum ring buffer; `settingsScreen()` (backup codes, career deletion); boot hook runs `flRestoreFromNative()` then `flFileRestoreCheck()`.
- `game/ml.js` — Master League. Gate finance: budget += (W 0.6 | D 0.3 | L 0.1) + evGp; wages never deducted.
- `game/style.css` — mobile-first; `.atkstrip`, `.spark*` at EOF.
- `app/copy-game.js` — copies `game/` → `app/www/` before `npx cap sync`.

## Editing rules

- **Never freehand-edit app.js with fuzzy tools.** Use python assert-guarded exact-string replacement: `assert s.count(old)==1` before replacing. Grep anchors first.
- Em-dash/emoji in python scripts: use real `\uXXXX` escapes; on assert failure inspect with `cat -A`.
- Re-read rendered sentences after template edits — sloppy replacements have garbled prose before.
- Cross-file identifiers: bare ml.js identifiers referenced in app.js templates throw at parse time; only `window.ML`-guarded calls.
- Browser caching: re-mint versioned snapshots (see BUILD.md) after every base edit or the browser serves stale code.

## Headless testing recipes (Node, no browser)

**Boot stub:** `window=global`; Proxy-based `document` returning no-op elements; plain-object `localStorage`; stub `history/location/navigator`; `requestAnimationFrame` stub; `btoa/atob` via Buffer. app.js needs `global.Engine` (not `E`). Strip `"use strict"`, convert top-level `const|let` → `var`, run via `(0,eval)`.
- `global.$` stubs are useless — app.js redefines `$` at line ~3; route element lookups through the document proxy.
- Screens that draw in `setTimeout(draw)` look empty synchronously — flush timeout callbacks.
- Use the real `newSave()` for screen harnesses.

**Slice harness (for canvas/match internals):** extract function bodies with `src.indexOf(startMarker)`/`indexOf(endMarker)`, wrap in `new Function(...sandboxKeys, body + "return {…}")`. Canvas ctx = Proxy returning no-op fns, special-casing `createLinearGradient`/`createRadialGradient` → `{addColorStop(){}}` and `measureText` → `{width}`. Pump rAF manually with `now += 17`. Note: `liveEvent` is defined AFTER `syncView` — the live2D slice needs two segments. `viewMode` lives outside the live slice — inject it into the sandbox.

**Match-loop tests must auto-answer every decision type** (GK and outfield) or they hang forever.

## Known gotchas

- "84% scen-tag coverage" was a false alarm: the untagged 16% were penalty/FK events that carry `via` and don't need `scen`. Tests must exclude via-events.
- GK balance: never compare raw save counts (confounded by shots faced); assert concede ratios / faced-rates.
- `test-ml.js` check count is data-dependent; judge by failures only.
- Friend-code v2 adds `hstl`/`astl` fields; v1 replays get the `frDuel` default.
- bash heredocs: unquoted `====` after variables breaks parsing — quote echo args.

## Persistence details

- Pack format (backup codes AND Documents file): `{v:1, at:timestamp, bal, ml, set}` — `bal`/`ml`/`set` are the raw localStorage strings. Codes are base64 via `btoa(unescape(encodeURIComponent(JSON)))`.
- `flFileBackupSoon()` debounces 1.5s; writes `Documents/FootballLegend/backup.json` via Capacitor Filesystem.
- Android ≤10 needs READ/WRITE_EXTERNAL_STORAGE (manifest has them with maxSdkVersion caps) + a runtime prompt (`flFsPerm`, result cached). Android 11+ auto-grants app-scoped Documents access.
- Career deletion calls `flMirror(key,null)` + `flFileBackupSoon()` so deleted careers don't resurrect from the file.
- Debug keystore (`~/.android/debug.keystore`) must be preserved — APK updates require matching signatures.

## Verified quality gates (as of last commit)

- Fairness: 21/21. ML: 352 checks, 0 failures.
- Choreographies: 14/14 variants ≥60 headless frames, zero throws.
- Live2D: 11/11 (replay lifecycle, you-marker per position, GK-career marking, zone drift).
- Backup e2e: 10/10 (write→uninstall→restore, decline, corrupt file, no-plugin browser) + permission-handshake pass.
- Attack states: 16/16 (thresholds, team direction, heat spike/decay, 160 canvas frames all states).

## v1.5 notes

- `app/copy-game.js` must point at `../game` (was a stale `../naija-legend` path — broke every APK content sync).
- Owner key: NEVER re-introduce `FL_OWNER_HASH` into `app.js`. Verification is `Cloud.verifyOwner` → edge fn `verify-owner` using the same `hashSeed` as `engine.js` (FNV-ish with 1779033703 / 3432918353 — not the plain FNV-1a constants).
- Admin identity is unified: after Google sign-in, `Cloud.checkAdmin()` checks the RLS-protected `admins` table and unlocks the in-app Owner Panel for confirmed admins. Key verification remains an emergency fallback. Signing out removes an admin-derived unlock, but not a key-derived unlock.
- Native OAuth must process both `appUrlOpen` (warm return) and `App.getLaunchUrl()` (cold start). The callback is exactly `com.footballlegend.game://callback` and must be allowed in Supabase Authentication URL Configuration.
- Ghost PvP depends on `FR_MENTS` / `FR_STYLES` / `frDuel` being declared **above** the ghost block in `app.js`.
- `leaderboard.sql` is re-runnable (create or replace + drop policy if exists). Admins close seasons via `season_close` RPC; rewards land in `inbox` like any other gift.
- Headless v1.5 harness: `game/test-v15.js` (stubs `window.addEventListener`, loads full app.js).

## Position-conscious skills (v1.5.1)

- Single source of truth: `Engine.SKILL_POS` / `skillsFor(pos)` / `skillLegal` / `skillsActive`.
- BaL UI: `balSkillPool` → `E.skillsFor`. Boot + Skills screen strip illegal leftovers.
- ML packs: `mlGiveSkills` rolls from `E.skillsFor(mlRpos(p))`; `mlSanitizeSkills` on load.
- Match engine applies `skillsActive(skills, pos)` so a mis-saved Outside Curler on a GK never affects odds.
- GK skills: Reflexes, Penalty Saver, Command of Area, High Claim, GK Long Ball (+ Captaincy, Fighting Spirit).
- Tests: `game/test-position-skills.js`.

## BaL cards + Squad declutter (v1.5.2)

- BaL `playerCardHTML` always renders the 6-stat grid (home uses `.pcard.compact`). Dead `small && hide stats` path is gone.
- ML Squad: position sections + tap-to-expand TRAIN/SELL. Help kv rows removed. `_sqOpen` is UI-only (not persisted meaningfully; fine if it rides along in the save).
- Ghost region brackets: design in `docs/GHOST-REGIONS.md` — do not implement until owner picks the four options.

## Narrow-phone UI rules (v1.5.3)

- **Never inline-size `.kv` action buttons** (market / card draws / welcome gift / CLAIM): the CSS `.kv .btn` rule keeps them compact (width auto, min 88px) so player text keeps ~160px at 320w. Sizing them inline (or leaving `width:100%`) re-breaks the old squashed two-column layout on small phones.
- 3-up `.optrow` grids (Mentality, Playing Style, formations): use `flex:1 1 45%` (2+1 wrap), not `30%` — 30% columns clip their descriptions at ≤360w. `.opt { min-width:0 }` is required for wrap to work.
- Topbar chips: the logo must not wrap; keep chips `white-space:nowrap` + `flex-shrink:0`, and the ≤380px media query shrinks logo/chips. Verified no horizontal overflow at 320w on ML screens.
- Re-verified: 21/21 fairness, 356/356 ML, 50/50 v1.5, 27/27 ML-CT, 25/25 BaL-CT, 100/100 position-skills.

## v1.6 Wave 2 (match-day UX + knockout honesty)

- **Defensive decisions are a real engine branch, not a UI flavour.** `resolveDef()` rolls
  `defChoiceOdds()` (win / foul / beaten + a `convMul` on the follow-up chance) and
  `decisionOdds().def` mirrors it with the *same* inputs (`activeSk`, `dec.stam`, the role from
  `S.role`). Change one, change both, or `test-wave2.js` fairness (≈2.9k measured duels, ±5pp) fails.
  `decide("auto")` is only ever the engine's own weighted pick — used by AUTO speed, never for the player.
- **Knockout rules live in the engine contract:** `createMatch(..., { ko: true })` ends at 90' when the
  score differs, otherwise at 120' with `st.level = true`; `result()` exposes `et`/`level`/`minute`.
  The caller runs `Engine.penaltyShootout({ str })` once and passes back `r.penWinner` / `r.penScore`,
  so the summary, the CT record and the rewards all read the same kick list. Do not re-roll.
- **Never re-introduce a coin flip for a tie-break.** `game/test-wave2.js` asserts the exact old
  expressions (e.g. `E.mulberry32(E.hashSeed(M.seed + "ctpens"` and `Math.random() < 0.5) my++`) stay dead.
- **Half-time hook ordering:** check `match.state.min === 45` at the *top* of `step()`, before the next
  `match.step()` can push the minute to 46 (a decision at 45' resumes the clock, so the check must be
  on state, not on the returned minute).
- **Highlight capture:** `handleEvents()` describes events immediately, pushes non-cutscene shots to
  `hlQueue` (key mode) or replays them one by one (full mode). AUTO/SKIP (speed 3) intentionally
  captures nothing — the reel is a playback of what the ticker already showed.
- **DOM-hook integrity test:** `test-wave2.js` diffs every `$("#id")` in the match-screen regions of
  `app.js`/`ml.js` against the ids those regions render. Add a hook without markup and it fails.
- **Keeper penalty odds were approximated before v1.6 W2** (`(0.34+DEF*0.004)*penM*33+6` for dive,
  `0.72*penM*33+4` for stay) — those fudge constants ignored the 12% branch where the taker misses on
  his own, so the display understated the keeper's real chance by ~9pp. `decisionOdds` now mirrors
  `resolveGKPen` exactly: `kept(s) = s + (1-s)*0.12`, `(kept(match) + 2*kept(wrongGuess))/3`. The
  buttons now read "% kept out" (save OR taker miss), and `test-wave2.js` measures both branches.
- **The defensive matrix is not defenders-only:** the gate is `posInfo.defBias > 0`, so midfielders
  inherit it — measured duel decisions per match: CB 1.09, DMF 0.78, RB 0.66, LB 0.59, CMF 0.47,
  AMF 0.13, wingers 0.07-0.09; SS/CF are hard-zero (defBias 0) and GK uses its own `gk`/`gkpen`
  branch. Midfielders since v1.6 W2 also carry real defensive profiles - `mf_screen` (x0.8 duels,
  +10pp duel win, low stamina) and `mf_press` (x1.4 duels, more fouls), mirroring `df_hold`/`df_step`
  - and DMF joined the set-piece taker list (`["CF","SS","AMF","LWF","RWF","CMF","DMF"]`; GK and the
  back line still never take them). `test-position-skills.js` asserts the taker RULE (no GK, no
  CB/LB/RB, attackers+mids in) rather than a snapshot - do not put the hardcoded list back.
- **Recovery:** these edits are committed, so `git checkout HEAD -- game/<file>.js` restores a known
  good state; the wave-1 patchers (`/home/user/patch_v16_*.py`) must NOT be re-run.

## v1.6 Wave 3 notes (economy, infrastructure, dossier, divisions)

- **One currency path, by law.** `mlEco(gp, lc, label)` is the only place `M.budget` / `M.lc` are
  written; `M.ledger` rows must sum to the actual delta, and `test-wave3.js` drives a whole season
  and asserts both sums. If you add income, add a label - never touch `M.budget` directly.
- **Matchday caps** (`E.ECON.MD_TRAINER_CAP 3`, `MD_PACK_CAP 2`) reset from `M.mdReset`'s
  `M.matchday++` path. `mlCapLeft`/`mlCapUse` are the only way to spend them.
- **Published numbers must be generated, not typed.** Pack tiers render from `E.ECON.PACKS`, OVR
  bands from `E.ECON.packOvrRange`, gate scaling from `E.ECON.gateMult`, infrastructure prices from
  `E.ECON.infraCost`. The test forbids the old hand-written "TRENDING 32%" strings from returning.
- **Ladder rules live in the engine** (`E.ECON.DIV`): `MATCHES 10`, `PROMOTE_WINS 7`,
  `RELEGATE_LOSSES 7`, `aiStr(div) = 72 + (10-div)*1.8`, `next(div,w,l)`. A won phase is
  `w >= 7` **even at D1**, where there is nowhere left to climb - the D1 title is a trophy, not a
  promotion.
- **Divisions never touch the league calendar.** The ladder is its own fixture generator
  (`M.div`), so `M.matchday`, `M.results` and the table are untouched; the test asserts that.
- **Home/away comes from the fixture object** (`me.home`), never inferred from relative strength -
  that bug made the displayed scoreline disagree with the engine's own `gH/gA`.
- **`mlGenPlayer` takes position *buckets*** (`GK/DF/MF/FW` -> `ML_BUCKET_POS`), not precise roles.
  Passing `"CB"`/`"LWF"` throws. The loan XI uses buckets.
- **Dossier honesty:** AI clubs are modelled by squad strength only, so star players and honours for
  them are labelled "not tracked" - nothing is invented. Scouting depth = `mlInfraScout()` (Staff
  level): 1 style, 2 manager + form, 3 budget band + head-to-head, 4 star names, 5 honours.
- **Overlay hosts:** `ML_DOSSIER_HOSTS` maps a host name to its render function and
  `mlDossierWire()` is called from each host's `setTimeout` - add a host by registering it there,
  not by duplicating the modal.
- **Patchers are single-use.** `patch_v3_*.py` were applied once; re-running duplicates `const ECON`
  and breaks the file. Recovery is `git checkout HEAD -- game/<file>.js` + a fresh edit.

## v1.6 Wave 4 notes (#18 RLS fix + auto-sync)

- **The production bug was a policy that read its own table.** `p_profiles_own_u` had
  `with check (... banned = (select banned from profiles ...))`, which Postgres re-evaluates under
  the same policy: `42P17 infinite recursion detected in policy for relation profiles`. Owner
  profile writes (display name, `last_seen`) failed while the game kept working offline, so it was
  invisible. Ban state now comes from `fl_is_banned(uuid)` (SECURITY DEFINER, `set search_path`).
- **Select-only is enforced twice**: RLS (no write policy on `saves`) *and* privileges
  (`revoke insert/update/delete/truncate/references/trigger ... from anon, authenticated`, plus
  `alter default privileges` so new tables inherit it). Writes exist only in the edge functions'
  service-role client. `bump_stat` is revoked from players.
- **Auto-sync is a queue, not a throttle.** The old `push()` dropped anything inside a 90s cooldown
  (data could sit unsent until the next match, or forever if the app closed). Now every finished
  match marks its mode dirty; a debounce (`AUTO_DEBOUNCE` 6s) coalesces the burst, a quota gap
  (`AUTO_MIN_GAP` 45s) spaces uploads, and the queue lives in `localStorage`
  (`footballLegendAutoSync_v1` — modes + timestamps only, never save data) so it survives a kill.
- **Retry rules, in order of honesty:** 200 → clear, counter reset; 422 → clear once and log (the
  validator flagged it — retrying would loop); 401/5xx/network → keep queued, back off
  (`AUTO_BACKOFF` 30s/60s/120s/300s/900s, capped). Flush triggers: debounce, `online`, window
  `focus`, `visibilitychange` (hidden), sign-in, and boot.
- **`syncNow()` still exists for the manual button** and clears the auto queue it just satisfied.
- **Testing cloud code**: `test-wave4.js` stubs `setTimeout`/`Date.now` with a virtual clock and
  drives `advance(ms)` so debounce/backoff are asserted without sleeping. Notes for the next
  person: `window.S` must exist for mode `bal`, the ML payload comes from
  `localStorage["footballLegendML_v1"]`, and a missing payload clears the entry as `"empty"`.
- **`mlNewSave(region, club, seed)`** — pass a seed in tests. Without it the world (club strengths,
  squad, fixtures) is built from `Date.now()`, and any assertion that counts events (MOTM tally,
  scorers) will flake across runs.

