@echo off
chcp 65001 > nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0_launcher.ps1"
if %ERRORLEVEL% neq 0 pause
