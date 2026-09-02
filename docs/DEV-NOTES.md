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
