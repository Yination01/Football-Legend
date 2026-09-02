# SPEC v4 — "Football Legend" (working title)
**Type:** Football career/management game — card-based meta + simulated matches (no 3D)
**Inspirations:** eFootball (card economy), PES Become a Legend / Master League, Top Eleven (spectate sim)
**Status:** v4 — APPROVED (v3) + de-localization change request
**Budget:** $0 — web/PWA, fictional GLOBAL player universe (no license costs)
**Change (post-approval):** all Nigeria-centric branding/names removed — global identity

## 1. Vision
Rise from lower-league trials to the top of world football. eFootball-style card
collection and progression, PES-style career depth — matches simulated and
spectated, never 3D-rendered. National League start → fictional continental leagues.

## 2. Modes (build order)
1. **Become a Legend (v1 — this spec):** create ONE player card; sim matches around
   him; grow stats via performances/training; transfers upward (National League →
   fictional continental leagues); chase legend status.
2. **Master League (v2 — later):** full squad of cards, transfers, season/cup.
Both share the same match engine, card system, and spectate view.

## 3. Card system (prototype scope)
- **Your player card:** name, position, portrait (generated), OVR + 6 stats
  (PAC/SHO/PAS/DRI/DEF/PHY), form, morale, level/XP
- **Card types (eFootball-style, adapted to career mode):**
  - **Standard** — base card, default frame
  - **Trending** — awarded after a high-rated performance streak (form-boosted
    stats for a match window; silver/pulse frame)
  - **Show Time** — earned via standout single performances (hat-trick, MOTM in a
    derby/final); temporary big stat boost + animated frame
  - **Big Time** — season-milestone card (e.g. league Best XI, top scorer);
    permanent stat floor raise + premium dark/gold frame
  - **Legendary** — end-of-arc card for career-defining achievements; unique frame
  - Card type upgrades are EARNED in BaL v1; purchasable card-type draws arrive
    with Master League packs (v2)
- **Progression:** match ratings → XP → stat points; training drills (daily, free)

## 3b. Dual currency economy
- **GP (free currency):** earned from match ratings, wins, streaks, achievements,
  daily login; spent on training boosts, recovery, basic customization
- **Legend Coins (LC, premium currency):** hard-earned in small amounts (season milestones,
  rare achievements) — in v1 there is NO real-money purchase (rails come at launch:
  Play Billing / regional payment providers); spent on card frame cosmetics,
  training accelerators, Show Time draw entries (v2)
- **Design rules:** nothing competitive is premium-EXCLUSIVE (pay accelerates,
  never gates); prices tuned so free players progress meaningfully every session
- Rewarded ads (watch ad → GP top-up) planned as the primary $0 revenue at launch

## 4. Match engine (the core)
- Probabilistic event sim driven by: your card stats, teammate/opponent team
  ratings, your pre-match role, tactics, form/morale, home/away
- Simulates a full match as a timeline of events (chances, goals, cards, subs)
- Your player gets involvement events weighted by position + stats; performance
  → match rating (4.0–10.0) → XP and reputation
- Deterministic seed per match (replayable/debuggable)
- **FAIRNESS RULE (hard constraint): the sim is never rigged.** Win probability
  is computed honestly from team strength + form + venue and the displayed odds
  are the SAME numbers the engine actually rolls against. No hidden scripting,
  no "drama" overrides, no fixing results to force purchases. Upsets happen only
  because probability allows them. (Unit tests: long-run outcome frequencies must
  converge to displayed probabilities.)

## 4b. Pre-match overview (match preview screen)
Shown before every kickoff, eFootball/broadcast style:
- **Head-to-head:** last 5 meetings (W/D/L strip), aggregate goals, last result
- **Win chances:** honest engine probabilities displayed as Home % / Draw % / Away %
- **Form guide:** both teams' last 5 results; league positions
- **Key player watch:** opponent's danger man vs YOUR card (stat comparison)
- **Venue/context:** home/away, derby/cup-final flags (affects morale inputs)
- H2H history is generated once per save and persists (results accumulate as
  seasons play out, so the rivalry record becomes YOUR save's real history)

## 5. Spectate + game plan (hybrid)
- **Default view:** commentary ticker + live momentum bar + mini score/clock HUD
- **Big moments:** view switches to 2D top-down pitch — animated dot-players play
  out the chance/goal (canvas, ~8–12s clips), then back to ticker
- **Game plan (BaL scope):** pre-match — team formation context, YOUR role/position,
  personal instructions (e.g. "make runs in behind", "drop deep"); in-match —
  request position tweak, press conference-free (cut)
- Sim speed controls: 1x / 2x / skip-to-next-event

## 6. Career structure (v1)
- Start: trial match → sign for a National League club (fictional: e.g. "Oakfield Rovers")
- Season: league fixtures + one cup; table simulated for all clubs
- Reputation system → transfer offers at season milestones; move up leagues
  (National League → fictional continental second tier → top flight)
- **Authenticity requirement — names must FEEL real (but stay fictional/legal):**
  - Players: curated real-world name pools spanning regions (English, Spanish,
    Portuguese, French, German/Nordic, Italian, pan-African, Eastern European)
    combined so results read like real footballers ("Diego Herrera",
    "Callum Whitfield", "Thiago Marinho") — never joke names
  - Clubs: real naming conventions per country (United/City/Rovers/Athletic for
    England-style; Real/Deportivo for Spain-style) with
    plausible city/state bases, realistic kits and 3-letter codes
  - Every club gets a realistic strength profile so league tables look believable

## 7. Presentation
- Mobile-first web app (portrait), installable PWA
- Card-centric UI: your player card is the home screen centerpiece
- Palette: deep green pitch base + gold accents for rarity/legend moments
- 2D pitch view: flat vertical pitch, kit-colored dots, ball trail, goal flash

## 8. Tech ($0)
- HTML/CSS/JS (single-page app), Canvas for the 2D moments, localStorage saves
- No backend in v1 (fully offline-capable) — server/accounts only if multiplayer later
- Distribution: itch.io + shareable link; Play Store ($25) deferred until revenue

## 9. Explicit cuts (v1)
- No 3D, no REAL player/club names (realistic fictional only), no online play,
  no Master League yet, no real-money purchase rails yet (premium currency exists
  but is earn-only until launch), no transfers OF other players (only offers FOR you)

## 10. Success criteria (fun-test)
- Does a matchday feel tense (preview screen → ticker → big-moment cutaway →
  rating reveal)?
- Does growing your card one stat point at a time feel compulsive?
- Do the generated names/clubs pass the "sounds like a real league" sniff test?
- Do displayed win chances match observed outcomes over many sims (fairness test)?
- After 3 seasons: do you care about the transfer offer? If yes → write v2 plan.

---

# v5 ADDENDUM — Master League (v2, shipped) + systems added since v4

## View modes (BaL matchday)
- 📻 Commentary (ticker) | 🎮 2D Live (event-driven 11v11 pitch: possession passing, pressing, momentum-synced turnovers, event sequences + banners; freezes with match clock during decisions). 3D perspective cutscenes fire in both for shot outcomes only; variant choreography: penalty (run-up/keeper dive/panenka float), free kick (3-man jumping wall, curve by technique), open play (passing move).
- Speeds: 🐢 ½x · 1x · 2x · 🤖 AUTO. SUB button (stamina preservation, honest tradeoffs).

## Honest-odds tuning (FIFA-style curves)
- Set pieces scale on (stat/100)²: elite premium. FK CURL @99 SHO ≈ 85% fresh; PEN place @99 ≈ 93%; panenka DRI-gated. Displayed = engine (verified 4k-kick sims, ±0.5%).
- HOLD: success locks possession to your team (3-min window), guarantees a follow-up chance ×1.3 quality, 100% involvement; UI shows before/after odds. Dispossession → opponent counter window (narrative coherence, 0 violations in 1.5k-match test).

## Master League (separate career save: footballLegendML_v1)
- Create: region + club (any of 10, strength visible). Budget 8.0M.
- Squad 18 gen players (GK2/DF6/MF6/FW4), OVR/potential/age/fitness/value/wage. Auto best-XI by formation.
- Tactics: 4-4-2 / 4-3-3 / 4-2-3-1 / 5-3-2; mentality Defensive/Balanced/Attacking with honest, displayed strength modifiers (engine.setStrengths mid-match).
- Matchday: pre-match preview (true winProbs incl. tactics), live ticker + momentum, HARD-PAUSE windows at 45' (team talk) & 65' (tactical window): mentality switch + up to 3 subs (tired-off → fresh-on). FT manual continue.
- Economy: prize per result (W .6 / D .3 / L .1 M) minus real wage bill; season prize by final position; cup prizes per round (R16 .8 → FINAL 4.0).
- Market: 6-player pool refreshes each MD; sell at 85% value (min squad 15, max 24). ⭐ BaL export: your Become a Legend player appears in the ML market (card bonus included, premium price), buyable once.
- Card draws: Standard 4M (OVR 62–74) | Star 12M (74–84 + SHOW TIME/BIG TIME/LEGENDARY boost). Generation ranges displayed = actual.
- Season end: aging & growth (youth grow to potential, 31+ decline), position-vs-squad-strength sack check (finish 3+ places below squad rank = SACKED), promotion top-2 → Continental Super League, relegation back, career history log.
- Tests: test-ml.js — 335 headless checks (3 full seasons, cup, promotion, finances, fitness, screens render).
