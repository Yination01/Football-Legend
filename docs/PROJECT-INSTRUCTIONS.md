# Project Instructions & Working Agreements

These are the standing rules for anyone (human or AI assistant) working on Football Legend.
They were established by the project owner over the course of development. **Do not violate them.**

## Process rules ("skills")

1. **Brainstorm before coding.** No implementation until the design is discussed and approved by the owner. Present the approach first, get sign-off, then build.
2. **Ask before design forks.** If a decision could go multiple ways or could ruin something, ask the owner first — as a short questionnaire with concrete options. (History: a pass-and-play PvP design was built without asking and rejected outright. Never repeat that.)
3. **Verification before completion.** Never claim something works without fresh verification evidence: syntax checks, test suite runs, headless harness runs, and (for APKs) byte-comparison of packaged files against source.
4. **Be concise; use technical jargon.** Explain the logic before showing code; wrap code in markdown blocks.
5. **Cross-check against previous errors** before repeating an approach (see docs/DEV-NOTES.md for the error log).
6. **Frontend taste matters.** Prioritize clean, modern, mobile-first UI design.

## Hard product constraints

- **Budget is $0.** No paid assets, engines, or licenses. Only deferred cost allowed: the $25 Google Play fee, paid from game revenue.
- **The simulation must NEVER be rigged.** Displayed odds = the engine's true odds. This is enforced by `game/test-fairness.js` (decisionOdds is an exact mirror of the resolve math — any probability change must update both and keep tests green).
- **No 3D modelling.** Matches are simulated and spectated (text ticker + 2D live view + cutscene choreographies).
- **Global identity.** The game name and player names must NOT be centered on Nigeria or any single country. Names are realistic but fictional.
- **End goal = native app**, not a PWA. Browser build is for testing only.
- **Dual currency:** GP + Legend Coins. eFootball-style card types.

## Established game-design decisions (do not regress)

- Master League sits at top level (Home → Become a Legend / Master League / Friend Match), NOT inside BaL.
- ML = one save forever; no resets or multiple slots.
- ML finances: **a loss must never deduct money.** Gate-receipts model: budget += prize (W 0.6 / D 0.3 / L 0.1) + event GP; wages are never deducted.
- Friend Match = challenge codes (export/import squads). Pass-and-play was explicitly rejected. Ghost PvP is the agreed future extension; online PvP is deferred until revenue exists.
- Game plans must be position-appropriate and genuinely influence the match (test-proven, not cosmetic).
- Training screen must display overall-rating impact per position.
- HOLD decision: no pass/shoot text while held; successful hold guarantees a better follow-up; the boost is visible in the odds UI.
- After a match: manual continue/review — never auto-skip to the overview.
- Free-kick stats mirror real-life feel; a maxed legend free-kicker converts 80%+. GK curve: base 0.28 + (DEF/100)^1.5 × 0.62, capped at 0.85.
- 2D live: pauses during decisions, ~½× speed default, replays on goals, you-marker, zone drift, attack-state banner with arrows, momentum sparkline, danger edge tint.
- Shop/training clicks must not reset scroll position. Upgrade buttons show current/max level.
- Saves must survive uninstall → reinstall with a restore prompt (Documents backup file + Auto Backup, refreshed after every save).

## Testing doctrine

- `test-fairness.js` — odds honesty (21 checks). Must always pass.
- `test-ml.js` — ML integrity (350+ checks; count is data-dependent — judge by failures, not totals).
- Headless harnesses (Node, no browser) are used to verify UI/canvas code: boot stubs with Proxy-based `document`/canvas contexts, function-body slicing, manual rAF pumping. Recipes in docs/DEV-NOTES.md.
- Interactive-match test loops must auto-answer every decision type or they hang.
- GK balance changes: assert on concede ratios / shots-faced rates, never raw save counts (confounded).
