# デスクトップに備考転記のショートカットを作成し、Ctrl+Alt+Bを割り当てる
$batPath   = "$PSScriptRoot\run_today.bat"
$shortcut  = "$env:USERPROFILE\Desktop\備考転記.lnk"

$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut($shortcut)
$lnk.TargetPath      = $batPath
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.WindowStyle     = 1          # 通常ウィンドウ
$lnk.Hotkey          = 'Ctrl+Alt+B'
$lnk.Description     = '備考転記ツール'
$lnk.Save()

Write-Host "ショートカットを作成しました: $shortcut"
Write-Host "ホットキー: Ctrl + Alt + B"
