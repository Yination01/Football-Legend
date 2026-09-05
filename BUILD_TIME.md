# Fast & Zero-Cost Android APK Builds

## Why the build setup is designed this way

Building Android APKs on CI runners can take 15–20 minutes if dependencies and Gradle tasks are recompiled from scratch on every run. 

Football Legend uses the **Poise build architecture**, running builds on GitHub Actions' free Ubuntu runners with aggressive Gradle caching and multi-core parallelism.

### Key Optimization Principles

1. **Gradle Caching (`actions/cache@v4`)**:
   - `~/.gradle/caches` and `~/.gradle/wrapper` are cached across runs.
   - Cache key hashes `package-lock.json`, `app/package-lock.json`, and Gradle configuration files (`app/android/build.gradle`, `app/android/app/build.gradle`).
   - Fallback `restore-keys` ensure near-miss builds restore warm dependency caches rather than starting cold.

2. **Gradle Parallelism & Memory Tuning**:
   - `org.gradle.caching=true`: Reuses compiled task outputs.
   - `org.gradle.parallel=true`: Compiles independent Android modules simultaneously across multiple runner cores.
   - `org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g`: Prevents Out-Of-Memory errors during parallel compilation.

3. **Pre-Build Test Gate (`npm run test:all`)**:
   - All 590+ simulation fairness checks, Master League progression rules, position skills, and syntax tests run in under 2 seconds.
   - Any failure halts the pipeline before Gradle runs, preventing broken builds.

4. **Zero Cloud Quota Cost**:
   - Instead of paid cloud build services, the APK is compiled directly on GitHub Actions Linux runners and published as a GitHub Prerelease (`preview-<n>`).

5. **Post-Build Bytecode Verification**:
   - The workflow extracts `assets/public/app.js` directly from the compiled APK and compares it byte-for-byte with `game/app.js`, ensuring no stale assets ship.
