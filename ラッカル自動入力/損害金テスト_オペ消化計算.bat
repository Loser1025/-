@echo off
chcp 65001 > nul
cd /d "%~dp0"
python rakkar_ope.py "C:\Users\弁護士法人響\Downloads\損害金計算テスト - 抽出.csv" 22
pause
