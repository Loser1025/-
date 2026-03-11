@echo off
chcp 65001 > nul
cd /d "%~dp0"
title NA Auto Tool

echo ================================================
echo  NA Auto Registration Tool - Setup
echo ================================================
echo.

echo [1/3] Installing packages...
pip install flask playwright -q
if %errorlevel% neq 0 (
    echo ERROR: pip not found. Please install Python first.
    pause
    exit /b 1
)

echo [2/3] Installing Playwright browser...
python -m playwright install chromium
echo.

echo [3/3] Starting server...
echo.
echo Open http://localhost:5000 in your browser
echo Do NOT close this window.
echo.

timeout /t 2 /nobreak > nul
start "" "http://localhost:5000"

python app.py

pause
