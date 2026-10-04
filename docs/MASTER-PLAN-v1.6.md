# Football Legend — Master Plan (v1.6 "Master Planning" build)

**Decision of record:** the owner approved **Option A for all 18 items**.
This document is the single source of truth for what each Option A means, the order it gets built
in, and the test that proves it. It lives in the repo so every agent/maintainer works from the same
spec.

---

## 0. Standing guardrails (non-negotiable)

1. **The simulation is never rigged** — every number the player sees (win %, shot %, duel %, drop
   rates, penalties) is the engine's true probability, enforced by `game/test-fairness.js`.
2. **$0 budget** — no new paid services, no new runtime dependencies; Supabase free tier, GitHub
   Actions runners, canvas + synthesized audio only.
3. **Losses never deduct currency** in Master League (gate-receipt finance model).
4. **No work is "done" until `npm run test:all` is green** and the new behaviour has its own checks.
5. **APK builds only via the Actions "Preview APK" workflow** with a human-supplied, digits-only
   build number → tag `preview-<n>`; `.build-state.json` updated at dispatch time.
6. **Save migrations**: every new save field ships with a default-on-load migration in
   `ML.enter()` / `flBootScreen()` paths so existing careers never break.

**Test gate today:** `npm run test:all` → **743 checks green** (config, syntax 9, fairness 21,
ML 364-368, ML-CT 27, BaL-CT 25, skills 100, v15 55, v1.6 suite 54, **wave-2 suite 75**).

---

## 1. Wave plan

| Wave | Items | Theme | Status |
|---|---|---|---|
| **W1** | 7, 8, 10, 14 | Tactics core, form arrows, the S2 bug, the refresh bug | **Implemented (in code, unreleased)** |
| **W2** | 1, 2, 3, 4, 5, 11 | Match-day experience + defender decision matrix | **Implemented (in code, unreleased)** |
| **W3** | 6, 9, 12, 13, 15, 16, 17 | Career, economy, shop, awards, divisions | Planned |
| **W4** | 18 | Cloud leaderboard hardening (owner-assisted) | Planned (owner tasks listed) |

---

## 2. Wave 1 — delivered in code

### ✅ #8 PES 5-Tier Form Arrows (`ml.js`, `style.css`)
- Form stays an honest integer `-2..+2`, worth **1.5 OVR per step** in `effOvr()` — the arrow is a
  *display of engine input*, never a cosmetic.
- Classic PES set: **⬆ Excellent / ↗ Good / ➡ Normal / ↘ Poor / ⬇ Terrible**, colour-coded, with
  tooltip showing the exact OVR delta.
- Drift is now **seeded** (`seed + ":form:s<season>:md<matchday>"`): 45 % hold, else up/down with
  55 % (XI) / 45 % (bench) up-chance, −7 pp for players 33+, legendary cards keep a form floor of 0.
- A legend row sits above the squad list; tests prove markup, mapping, 1.5 OVR/step and determinism.

### ✅ #7 Game Plan Tactical Counter System (`ml.js`)
- The rock-paper-scissors ring was already in `ML_STYLES`; W1 makes it **visible and provable**:
  a full 4×4 **counter matrix** on the Tactics screen (your row starred, opponent column marked,
  `+1 / 0 / −1` shown with the exact strength bonus), plus `mlCounterDuel()` used by the preview.
- Tests prove the matrix is total, antisymmetric, a proper ring (each style beats exactly one and
  loses to exactly one) and **identical to the numbers baked into the displayed match odds**.

### ✅ #10 Season-2 Transition — full end-of-season pipeline (`ml.js`)
Root cause (three bugs in one): every summer the game re-generated a **brand new** national league
(`E.makeWorld`) and then bolted the galaxy's fixture list onto it — so from S2 on the table,
the opponents and the galaxy tables described different clubs; a **promoted** club kept writing
Super-League results into a national league and froze that league's simulation; and awards/settle
read the *next* season's club index.
- Tier-0 world is now **bound to the galaxy league itself** (one club array, one fixture list,
  one table) via `mlAttachNational(preferIdx)`; the club keeps its slot so continental entry lists
  stay valid.
- Promotion to the Continental Super League **vacates** the national slot (`mlVacateNational`,
  remembers `M.nationalIdx` for the way back); the national league keeps simulating on its own
  (`galaxySimMD` skip = `M.tier === 0 ? M.leagueIdx : -1`).
- Tier 1 qualifies for the Champions Trophy on a top-4 Super League finish; national-league
  qualification still runs through the galaxy.
- New **Season Review** panel (finish, pts, goals, clean sheets, board target, settlement, most
  improved, retirements, promotion/relegation/qualification) built by `mlSeasonAwards()` — honest,
  from stored results only, computed before the world rebuild.
- Tests drive **three real seasons** (promote, away-season, relegate) and assert world identity,
  fixture lists, ghost-club absence, career/trophy logs, review numbers and that the national
  league never stops simulating.

### ✅ #14 Auto-Refresh on Click — native storage race + mid-match reloads (`app.js`, `cloud.js`, `ml.js`)
- `flInMatch()` (BaL `S.mdLock` + new `ML.inMatch()`) and `flSafeReload()` mean a reload can never
  fire while a match is live — it is deferred to after the whistle.
- Boot no longer re-reads storage *after* first paint and reboots: the native-mirror and
  Documents-backup restores are **hydrated in place** (`flHydrateFromStorage` +
  `flRepaintAfterRestore`) — no page reload, no race.
- Cloud restores call `window.flApplyCloudRestore()` (in-place swap) instead of reloading; the old
  reload paths survive only as guarded fallbacks.
- Exactly one raw `location.reload();` remains in the app and it lives inside the guard, asserted
  by tests plus a sandboxed behavioural test of the guard itself.

---

## 3. Wave 2 — delivered in code

**Status:** all six items implemented, `npm run test:all` green (743 checks), suite `game/test-wave2.js`
(75 checks). Deviations from the original sketch are listed honestly at the end of this section.



### #1 Mid-Match Pause & Subs — *Full Pause Modal & Tactics Drawer*
- Pause button on both match screens; pausing stops the minute ticker (engine state is preserved,
  no re-rolls on resume — the seeded RNG stream continues).
- Modal: score/clock/momentum, **Substitutions** (up to `mlSubsAllowed(fx)`; BaL stays single-player
  and gets mentality only), **mentality quick-switch**, **playing-style switch** (ML), "RESUME",
  "ABANDON" (already-resolved abandonment pipeline in both modes).
- Subs consume the matchday cap; fitness/condition of the benched player swaps in immediately;
  `engine.setStrengths()` is the only lever, so the drawn odds always equal the true odds.

### #2 Half-Time Break — *Interactive Locker Room Screen*
- Automatic pause at 45' with a locker-room screen: first-half possession/shots/saves/rating from
  the real event log, plus a **team talk** (PRAISE / CALM / FOCUS) that applies an honest,
  one-half morale modifier shown numerically before you pick it.
- Substitutions available at HT (count against the match cap); ML shows bench fitness.
- Never more than one HT screen per match; skipped entirely for abandoned/simulated fixtures.

### #3 Cup Final & Knockout Ties — *Full Extra Time + Interactive Shootout*
- Knockout fixtures (`fx.cup`, CT KO) that are level after 90' go to **120'** (two 15' halves at a
  reduced chance rate, extra stamina drain, no golden goal).
- Still level → **interactive penalty shootout**: BaL picks aim/keeper dives with honest per-kick
  odds; ML auto-resolves with the same engine odds per taker (keeper skill, taker SHO/PHY,
  pressure index), shown kick by kick.
- Removes the remaining random tie-breaks in `balResolveAbandoned` / CT KO paths.

### #4 2D Pitch Live Highlights — *Key Highlights Mode (deterministic cuts)*
- The 2D view renders **only key moments** (goals, big saves, cards, subs, HT/FT) with cut timing
  derived deterministically from the match seed; the ticker keeps scrolling between cuts.
- Controls: SKIP (jump to FT), REPLAY (last highlight), and a HIGHLIGHTS/ALL toggle.
- Acceptance: same seed → identical highlight timeline (unit-tested); no `Math.random()` in the
  render path; no long frames on low-end devices.

### #5 Defender Match Decisions — *Authentic Defensive Decision Matrix*
- New engine decision type when the opponent attacks and your player is CB/LB/RB/DMF (and BaL
  defenders): scenarios — winger 1v1, through ball, cross incoming, 2v2 counter, set-piece marking.
- Choices: **JOCKEY / TACKLE / DROP OFF / STEP UP**, odds computed from DEF/PHY/PAC + the existing
  role modifiers (`tackleFreq`, `tackleAdj` in `ROLES`) + skills; outcomes: clean win, foul (card
  risk), beaten (chance conceded), interception.
- Runs through the same matrix for AI-resolved ML matches; ratings/momentum feed the same
  MOTM pipeline as #17. Tests: shown % == engine roll, foul/card rates inside realistic bands,
  fairness suite unchanged.

### #11 Match Screen De-Cluttering — *Segmented HUD + Sliding Tactics Drawer*
- HUD segmented into SCORE | CLOCK | MOMENTUM | SUBS LEFT; everything else moves into a slide-up
  **tactics drawer** (SQUAD · TACTICS · SUBS · SPEED · EXIT) with remembered open state.
- One-handed reach layout, ≥44 px touch targets, no more than 4 persistent controls on the pitch.

---


### Wave 2 implementation notes (what actually shipped vs. the sketch)

- **#1 Pause** — BaL: `#pausbtn` opens a full modal (minute/score/stamina/role) with RESUME,
  *Open tactics drawer*, *Substitute me off* and *Auto-play remainder*; `setPaused(true)` clears the
  minute interval, so no engine step happens while paused and the seeded RNG stream simply continues
  on resume. ML: the existing tactical window (mentality + subs) is now reachable any time from
  `#mlpaus`. *Deviation:* no "ABANDON" button inside the modal — the abandonment pipeline already
  resolves a quit-mid-match, and a button that silently simulates the rest can never be undone by a
  mis-tap.
- **#1/#11 Drawer** — role switching uses `Engine.setRole()`: the same `ROLES` profile the engine
  already applies (involvement, tackle frequency/adj, GK blunder multiplier, stamina risk) and it
  persists for the season. Nothing cosmetic, nothing hidden.
- **#2 Half-time** — the clock halts the moment `match.state.min === 45` with nothing pending; the
  locker room shows real first-half numbers, an honest gaffer line derived from those numbers, and the
  role choice. *Deviation:* the sketched "PRAISE/CALM/FOCUS morale modifier" was replaced by the role
  choice because inventing a new hidden morale multiplier would violate guardrail #1 without an
  engine-backed number to show.
- **#3 Knockouts** — `createMatch({ ko: true })` plays a full 120' (chance rate dips to 0.6 in ET);
  `result()` reports `et`/`level`; the caller runs `Engine.penaltyShootout()` and reuses that exact
  kick list downstream (`r.penWinner`, `r.penScore`) so the summary, rewards and CT record can never
  disagree with the shootout the player watched. All six former coin flips are gone (BaL cup/CT
  sims, abandoned-match resume, `mlFinish` cup + CT, `ctSimKORound` AI-vs-AI).
- **#4 Highlights** — "Key Highlights" (default) skips in-play replays and stores every real shot
  event; the post-match reel replays each stored cut with its minute and outcome. "Full Commentary"
  replays every shot live. Toggle in the HUD and in Settings (`longCommentary`).
- **#5 Defender matrix** — four options (tackle / jockey / step up / drop off) across five
  scenarios; `defChoiceOdds()` is the single source for both the shown % and the roll, with
  `decisionOdds().def` as the exact mirror (fairness-tested at ≈ 2900 measured duels, ±5pp).
- **#11 HUD** — scoreboard sub-line (role · mode · knockout tag), a three-button control strip
  (TACTICS / mode / PAUSE), a bottom speed+sub bar, and a sliding drawer that never stops the clock.

---

## 4. Wave 3 — career, economy, content

### #6 Skill Learning — *Multi-Week Training + Real Mathematical Engine Formulas*
- Deterministic weekly progression with a published formula:
  `ΔXP = drillXP × ageCurve(age) × headroom(pot − stat) × coachLevel × minutesFactor`, where
  `ageCurve` peaks 18-23, holds to 29, decays 30+; `headroom` tapers to 0 at potential.
- Skills have **week costs**; the calendar shows a live ETA (honest, recalculated weekly);
  injuries pause the plan; results are unit-tested against the documented formula.

### #9 BAL Training (Auto vs Max) — *Balanced Growth vs Archetype OVR Push*
- **AUTO** = balanced curve (spread across the position's weighted stat profile);
- **MAX** = archetype push (all XP into the archetype's key stats — fast OVR, soft-capped support
  stats) with the same XP budget, so it is a real trade-off, never a free upgrade.
- Both options preview their projected OVR before you commit, using the #6 formula.

### #12 Master League Shop — *Club Infrastructure Hub*
- Four upgradable trees: **Stadium** (capacity → gate receipts), **Staff** (medical `medLvl`,
  fitness `fitLvl`, scouting, coaching), **Academy** (youth intake quality/potential), **Facilities**
  (recovery rate, trainer drops).
- Every level shows its exact engine effect and price (GP + LC); upkeep scales with wages; all
  effects already exist in the engine or are added with tests (no hidden numbers).

### #13 Transfer Club Info Dossier — *Comprehensive Club Profile Modal*
- One modal used by market, transfer offers and scout lists: league + table position, squad
  strength vs yours, playing style, manager, budget tier, recent form, star players, honours.
- Honest scouting: unknown clubs show only what your scouting staff can see (#12 tiers unlock data).

### #15 eFootball AI Divisions — *10-Game Campaign Phases (D10 → D1)*
- Side ladder mode: 10 matches per division against escalating AI squads (rostered, honest engine);
  win-threshold promotes, loss-threshold relegates; checkpoint rewards per division; uses your ML
  squad (or a loaned XI on first entry).
- Every match shows true odds; record stored per division, lifetime best tracked.

### #16 Economy, Cards & Matchday Limits — *Two-Currency System + Packs + Caps*
- GP = gate receipts (stadium-scaled) + prizes; LC = objectives, awards, milestones, rank rewards.
- Card packs display **published drop rates** (per-tier %), gated by LC; duplicate conversion stays.
- **Matchday consumable caps**: a per-matchday limit on fitness/medical trainers to protect the
  economy; a ledger screen lists every source and sink so the model is auditable.

### #17 MOTM & Awards — *Post-Match MOTM + Annual Awards Gala*
- MOTM computed from the real event log (goals, assists, saves, tackles, rating, minutes) —
  deterministic, ties broken by rating then minutes.
- Season-end **Awards Gala**: Player of the Season, Golden Boot (real tracked scorers), Best XI,
  Manager of the Season; stored in club/player history and shown in the #10 review pipeline.

---

## 5. Wave 4 — cloud

### #18 Supabase Leaderboard Sync — *RLS Fix + Auto-Sync on Match Finish*
- **Owner tasks (5 min):** run `game/supabase/leaderboard.sql`; add redirect URLs
  (`https://yination01.github.io/Football-Legend/game/` and `com.footballlegend.game://callback`);
  grant yourself admin; revoke the old PAT.
- Code: verified RLS (select-only for anon, writes only through `sync-save`/service role), plus
  **auto-push after every finished match** (debounced, offline-queued, retried on next session).
- Leaderboards read server-computed values from validated saves only; banned players excluded.

---

## 6. Definition of done (every item)

1. Spec above implemented behind the existing save keys with migrations.
2. New `check()`s in the matching test file (`test-ml*.js` / `test-v16.js` / next `test-v17.js`),
   including an honesty assertion wherever a number is shown.
3. `npm run test:all` fully green.
4. `node scripts/sync-assets.js` run (plain + cache-busted twins verified identical — the APK build
   compares them byte-for-byte).
5. Docs updated (`docs/ROADMAP.md`, this file's status table, `README.md` if player-facing).
6. Commit with a message explaining the *why*; APK only via Actions with a human-named build number,
   then `.build-state.json` updated at dispatch.
