# Standing Rules for Football Legend

These are project rules and laws for AI agents and maintainers working on Football Legend.

## Core Principles & Non-Negotiables

1. **The Simulation Is Never Rigged**: Displayed odds MUST be the simulation engine's true mathematical odds (enforced strictly by `game/test-fairness.js`).
2. **Global Identity**: Fictional, realistic player and club names across all global regions (no hyper-focus on a single nation).
3. **Losses Never Deduct Coins/GP**: In Master League, the financial model is gate-receipt based.
4. **Never Start a Build Without a Human-Named Build Number**: When dispatching GitHub Actions APK workflows, the build number must be explicitly provided.
5. **Never Claim Done Without Running Audits**: Always run `npm run test:all` and ensure 0 failures across all test suites before completing work.

## Project Structure

```
game/       The web game (HTML, CSS, Canvas, engine.js, app.js, ml.js, cloud.js, test suites).
app/        Capacitor Android wrapper project (builds the native Android APK/AAB).
docs/       Architecture specs, build guides, release checklists, and developer notes.
scripts/    PowerShell and Bash build scripts (build-apk.ps1, build-apk.sh, build-release.sh).
.audit/     Full test suite & audit orchestrator (suite.cjs, syntax.cjs, unshipped.cjs).
releases/   Built APKs and Play Store AAB bundles.
```

## Everyday Commands

- **Run all audits & simulation checks:** `npm run test:all`
- **Sync game to Capacitor Android:** `npm run sync`
- **Build local APK (PowerShell):** `.\scripts\build-apk.ps1`
- **Build local APK (Bash):** `./scripts/build-apk.sh`
