@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ========================================
echo  ラッカル自動入力 - 初回セットアップ
echo ========================================
echo.
echo [1/2] ライブラリをインストールしています...
pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo [ERROR] pip install に失敗しました
    pause
    exit /b 1
)
echo.
echo [2/2] Playwrightのブラウザをインストールしています...
python -m playwright install chromium
if errorlevel 1 (
    echo.
    echo [ERROR] playwright install に失敗しました
    pause
    exit /b 1
)
echo.
echo ========================================
echo  セットアップ完了！
echo.
echo 次のステップ:
echo  1. credentials.json をこのフォルダに置く
echo     （Google Cloud Console でOAuthクライアントを
echo       「デスクトップアプリ」として作成してDL）
echo  2. 「実行.bat」をダブルクリック
echo ========================================
pause
