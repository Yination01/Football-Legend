<#
.SYNOPSIS
  Builds an installable Football Legend APK.

.DESCRIPTION
  Runs the full test & audit suite, copies game assets to Capacitor www/,
  syncs into the Android project, and compiles an installable APK using Gradle.

  Default is a debug APK (-BuildType debug) which is pre-signed with the
  standard debug keystore and immediately sideloadable onto any Android device.

  -BuildType release builds a release APK (requires keystore.properties).

.EXAMPLE
  .\scripts\build-apk.ps1
  .\scripts\build-apk.ps1 -BuildType debug
  .\scripts\build-apk.ps1 -BuildType release
  .\scripts\build-apk.ps1 -SkipTests
#>
[CmdletBinding()]
param(
  [ValidateSet('debug', 'release')]
  [string]$BuildType = 'debug',

  [switch]$SkipTests
)

# Continue on native warnings (like npm/npx notices) and check $LASTEXITCODE
$ErrorActionPreference = 'Continue'

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  !   $msg" -ForegroundColor Yellow }
function Die($msg)  { Write-Host "  X   $msg" -ForegroundColor Red; exit 1 }

# Always run from the repo root
Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host "Football Legend APK build - type '$BuildType'" -ForegroundColor White

# ---------------------------------------------------------------- pre-flight
Step 'Pre-flight checks'

if (-not (Test-Path 'app/capacitor.config.json')) { Die 'app/capacitor.config.json not found - are you in repo root?' }
if (-not (Test-Path 'app/android/gradlew.bat'))   { Die 'app/android/gradlew.bat not found - Android project missing?' }

# Node & npm dependencies
if (-not (Test-Path 'node_modules')) {
  Warn 'Root node_modules missing - running npm install'
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Die 'Root npm install failed' }
}
if (-not (Test-Path 'app/node_modules')) {
  Warn 'App node_modules missing - running npm install in app/'
  npm --prefix app install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Die 'App npm install failed' }
}
Ok 'Node dependencies present'

# Java 17 Check
$javaOut = ''
try { $javaOut = (& java -version 2>&1 | Out-String) } catch { $javaOut = '' }
if ($javaOut -match 'version "(\d+)') {
  $major = [int]$Matches[1]
  if ($major -lt 17) {
    Die "Local Gradle build needs JDK 17+, found Java $major. Install Temurin 17 or run build on GitHub Actions."
  }
  Ok "JDK $major detected"
} else {
  Warn 'Could not detect Java version - continuing'
}

# Android SDK check
if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT -and -not (Test-Path 'app/android/local.properties')) {
  Die 'ANDROID_HOME is not set and app/android/local.properties is missing. Set ANDROID_HOME or install Android SDK.'
}
Ok 'Android SDK configuration found'

# ---------------------------------------------------------------- the audits
if (-not $SkipTests) {
  Step 'Audits & Verification'
  npm run test:all
  if ($LASTEXITCODE -ne 0) { Die 'Audit suite failed - fix errors before building APK.' }
  Ok 'All audits and simulation checks green'
} else {
  Warn 'Audits skipped (-SkipTests)'
}

# ---------------------------------------------------------------- Capacitor sync
Step 'Sync Game to Capacitor Android'
npm run sync
if ($LASTEXITCODE -ne 0) { Die 'Capacitor sync failed' }
Ok 'Game synced to Android assets'

# ---------------------------------------------------------------- Gradle build
Step "Gradle compilation ($BuildType)"

Set-Location 'app/android'

$gradleTask = if ($BuildType -eq 'release') { 'assembleRelease' } else { 'assembleDebug' }
& .\gradlew.bat $gradleTask --no-daemon

if ($LASTEXITCODE -ne 0) {
  Set-Location (Split-Path $PSScriptRoot -Parent)
  Die 'Gradle build failed'
}

Set-Location (Split-Path $PSScriptRoot -Parent)

$builtApk = if ($BuildType -eq 'release') {
  Get-ChildItem -Path 'app/android/app/build/outputs/apk/release/*.apk' -ErrorAction SilentlyContinue | Select-Object -First 1
} else {
  Get-ChildItem -Path 'app/android/app/build/outputs/apk/debug/*.apk' -ErrorAction SilentlyContinue | Select-Object -First 1
}

if (-not $builtApk -or -not (Test-Path $builtApk.FullName)) {
  Die 'APK was not found in outputs directory.'
}

Copy-Item -Path $builtApk.FullName -Destination 'football-legend.apk' -Force
Ok "Built football-legend.apk ($([math]::Round($builtApk.Length / 1MB, 2)) MB)"

# ---------------------------------------------------------------- Next steps
Step 'Next'
Write-Host @'
  1. Transfer football-legend.apk to your Android phone (via USB, Drive, or messaging).
  2. Android will prompt to allow installation from unknown sources:
     Settings -> Apps -> Special access -> Install unknown apps (enable for your file browser).
  3. Tap Install to run or update Football Legend.
'@ -ForegroundColor Gray
