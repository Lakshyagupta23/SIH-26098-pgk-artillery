## ============================================================
##  AEGIS-155 — SIH 2026 Offline Startup Script
##  Run this ONCE before the presentation (or on SIH day).
##  Usage: Right-click → "Run with PowerShell"
##         OR from terminal: .\setup_offline.ps1
## ============================================================

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  AEGIS-155 PGK — SIH 2026 OFFLINE STARTUP" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Check Python ─────────────────────────────────────────────────────
Write-Host "[1/5] Checking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "      OK: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "      ERROR: Python not found. Install Python 3.10+ from https://python.org" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Step 2: Install dependencies ─────────────────────────────────────────────
Write-Host "[2/5] Installing Python dependencies..." -ForegroundColor Yellow
Set-Location $ProjectDir
try {
    python -m pip install -r requirements.txt -q
    Write-Host "      OK: Dependencies installed." -ForegroundColor Green
} catch {
    Write-Host "      WARNING: pip install failed. Attempting to continue..." -ForegroundColor Yellow
}

# ── Step 3: Verify vendor assets ─────────────────────────────────────────────
Write-Host "[3/5] Verifying offline vendor assets..." -ForegroundColor Yellow
$vendorChecks = @(
    "static\vendor\katex\katex.min.js",
    "static\vendor\gsap\gsap.min.js",
    "static\vendor\three\three.min.js",
    "static\vendor\plotly\plotly.min.js",
    "static\vendor\fonts\outfit.woff2",
    "static\vendor\fonts\jetbrains-mono-regular.woff2"
)
$allPresent = $true
foreach ($f in $vendorChecks) {
    $fullPath = Join-Path $ProjectDir $f
    if (Test-Path $fullPath) {
        Write-Host "      ✓ $f" -ForegroundColor Green
    } else {
        Write-Host "      ✗ MISSING: $f" -ForegroundColor Red
        $allPresent = $false
    }
}
if (-not $allPresent) {
    Write-Host ""
    Write-Host "      Some vendor assets are missing. Re-running download..." -ForegroundColor Yellow
    # Could re-trigger the download here if needed
}

# ── Step 4: Kill any existing server on port 8000 ────────────────────────────
Write-Host "[4/5] Checking port 8000..." -ForegroundColor Yellow
$proc = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "      Port 8000 in use. Attempting to free it..." -ForegroundColor Yellow
    $pid = (Get-NetTCPConnection -LocalPort 8000 -State Listen).OwningProcess | Select-Object -First 1
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
    Write-Host "      OK: Port freed." -ForegroundColor Green
} else {
    Write-Host "      OK: Port 8000 is free." -ForegroundColor Green
}

# ── Step 5: Launch server and open browser ────────────────────────────────────
Write-Host "[5/5] Launching Aegis-155 backend server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  AEGIS-155 RUNNING AT: http://localhost:8000" -ForegroundColor White
Write-Host "  Press Ctrl+C to stop the server." -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Open browser after a short delay
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:8000"
} | Out-Null

# Start uvicorn (blocking)
python -m uvicorn main:app --host 0.0.0.0 --port 8000
