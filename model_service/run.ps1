# Starts the model service using this folder's venv, regardless of what `python` points at.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $here ".venv\Scripts\python.exe"

if (-not (Test-Path $py)) {
    Write-Host "venv missing at $py - creating it and installing requirements..." -ForegroundColor Yellow
    python -m venv (Join-Path $here ".venv")
    & $py -m pip install --upgrade pip
    & $py -m pip install -r (Join-Path $here "requirements.txt")
}

& $py (Join-Path $here "main.py")
