@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo playwrightをインストール中...
pip install playwright gspread google-auth-oauthlib
python -m playwright install chromium
echo.
python test_one.py
pause
