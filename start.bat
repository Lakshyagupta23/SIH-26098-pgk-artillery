@echo off
REM Startup script for Windows
REM Canonical Python target: 3.11.x (see .python-version and Dockerfile)

echo ======================================
echo  Starting Aegis-155 Backend (FastAPI) 
echo ======================================

set PORT=8000
set HOST=0.0.0.0

REM Check if Python 3.11 is installed
py -3.11 --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Python 3.11 is not installed or not in the system PATH.
    echo This project targets Python 3.11.x ^(see .python-version^).
    exit /b 1
)

REM Start uvicorn
echo Starting server on %HOST%:%PORT%...
if exist .env (
    py -3.11 -m uvicorn main:app --host %HOST% --port %PORT% --reload --env-file .env
) else (
    echo WARNING: .env not found. Using environment variables from shell.
    py -3.11 -m uvicorn main:app --host %HOST% --port %PORT% --reload
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Error: Failed to start uvicorn. Make sure dependencies are installed:
    echo   py -3.11 -m pip install -r requirements.txt
    pause
)
