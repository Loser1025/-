@echo off
chcp 65001 > nul
cd /d "%~dp0"
python rakkar_csv_v.py "C:\Users\弁護士法人響\Downloads\【ATOM】術後・クレーム管理SS - 抽出.csv"
pause
