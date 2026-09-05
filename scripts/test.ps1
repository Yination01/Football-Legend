<#
    test.ps1 - Run every test and audit for Football Legend.

    Usage (from repo root):
        .\scripts\test.ps1

    Exits non-zero if anything fails, safe to chain:
        .\scripts\test.ps1; if ($LASTEXITCODE -eq 0) { .\scripts\build-apk.ps1 }
#>

Set-Location (Split-Path $PSScriptRoot -Parent)

$failedSteps = New-Object System.Collections.ArrayList
$startedAt   = Get-Date

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host ("=" * 62) -ForegroundColor DarkGray
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host ("=" * 62) -ForegroundColor DarkGray
}

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )
    Write-Host ""
    Write-Host "-> $Name" -ForegroundColor Yellow

    $global:LASTEXITCODE = 0
    & $Action
    $code = $LASTEXITCODE

    if ($code -ne 0) {
        Write-Host "   FAILED: $Name (exit $code)" -ForegroundColor Red
        [void]$failedSteps.Add($Name)
    }
    else {
        Write-Host "   ok" -ForegroundColor Green
    }
}

Write-Section "Environment"
Write-Host ("PowerShell : " + $PSVersionTable.PSVersion)
Write-Host ("node       : " + (node --version))
Write-Host ("npm        : " + (npm --version))

if (-not (Test-Path 'node_modules')) {
    Write-Host "node_modules missing - installing" -ForegroundColor Yellow
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Write-Host "npm install failed" -ForegroundColor Red
        exit 1
    }
}

Write-Section "Static Analysis & Audits"
Invoke-Step "Full Audit Suite"              { node .audit/suite.cjs }
Invoke-Step "JavaScript Syntax (node --check)" { node .audit/syntax.cjs }

Write-Section "Simulation & Gameplay Checks"
Invoke-Step "Simulation Fairness & Honesty"  { node game/test-fairness.js }
Invoke-Step "Master League Engine"           { node game/test-ml.js }
Invoke-Step "Position Skills Matrix"         { node game/test-position-skills.js }
Invoke-Step "Ghost PvP & v1.5 Capabilities"  { node game/test-v15.js }

Write-Section "Capacitor Project Sync"
Invoke-Step "Game copy & Capacitor sync"     { npm run sync }

Write-Section "Result"
$elapsed = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)

if ($failedSteps.Count -gt 0) {
    Write-Host "`nFAILED after $elapsed s:" -ForegroundColor Red
    foreach ($step in $failedSteps) {
        Write-Host "   x $step" -ForegroundColor Red
    }
    Write-Host "`nFix the above before building." -ForegroundColor Red
    exit 1
}

Write-Host "`nALL CHECKS PASSED ($elapsed s)" -ForegroundColor Green
Write-Host "Safe to build: .\scripts\build-apk.ps1" -ForegroundColor Green
exit 0
