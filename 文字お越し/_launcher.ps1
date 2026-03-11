Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# --- モード選択 ---
$modeForm = New-Object System.Windows.Forms.Form
$modeForm.Text = "文字起こし モード選択"
$modeForm.Size = New-Object System.Drawing.Size(380, 220)
$modeForm.StartPosition = "CenterScreen"
$modeForm.FormBorderStyle = "FixedDialog"
$modeForm.MaximizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.Text = "文字起こしのモードを選択してください"
$label.Location = New-Object System.Drawing.Point(20, 20)
$label.Size = New-Object System.Drawing.Size(340, 20)
$modeForm.Controls.Add($label)

$btn1 = New-Object System.Windows.Forms.Button
$btn1.Text = "① ZOOM研修（講師 / 参加者）"
$btn1.Location = New-Object System.Drawing.Point(20, 55)
$btn1.Size = New-Object System.Drawing.Size(330, 35)
$btn1.Add_Click({ $modeForm.Tag = "zoom"; $modeForm.Close() })
$modeForm.Controls.Add($btn1)

$btn2 = New-Object System.Windows.Forms.Button
$btn2.Text = "② 電話相談（事務所 / お客様）"
$btn2.Location = New-Object System.Drawing.Point(20, 98)
$btn2.Size = New-Object System.Drawing.Size(330, 35)
$btn2.Add_Click({ $modeForm.Tag = "call"; $modeForm.Close() })
$modeForm.Controls.Add($btn2)

$btn3 = New-Object System.Windows.Forms.Button
$btn3.Text = "③ 生文字起こし（整形なし・高速）"
$btn3.Location = New-Object System.Drawing.Point(20, 141)
$btn3.Size = New-Object System.Drawing.Size(330, 35)
$btn3.Add_Click({ $modeForm.Tag = "raw"; $modeForm.Close() })
$modeForm.Controls.Add($btn3)

$modeForm.ShowDialog() | Out-Null

$mode = $modeForm.Tag
if (-not $mode) {
    Write-Host "キャンセルしました。"
    Read-Host "Press Enter to close"
    exit
}

# --- ファイル選択 ---
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = "文字起こしするファイルを選択"
$dialog.Filter = "Video/Audio (*.mp4;*.mp3;*.m4a)|*.mp4;*.mp3;*.m4a|All files (*.*)|*.*"

if ($dialog.ShowDialog() -ne "OK") {
    Write-Host "キャンセルしました。"
    Read-Host "Press Enter to close"
    exit
}

$file = $dialog.FileName
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host ""
Write-Host "File: $file"

switch ($mode) {
    "zoom" {
        Write-Host "Mode: ZOOM研修（講師/参加者）"
        Write-Host "Starting transcription..."
        Write-Host ""
        python transcribe_zoom.py $file
    }
    "call" {
        Write-Host "Mode: 電話相談（事務所/お客様）"
        Write-Host "Starting transcription..."
        Write-Host ""
        python transcribe.py $file
    }
    "raw" {
        Write-Host "Mode: 生文字起こし（整形なし）"
        Write-Host "Starting transcription..."
        Write-Host ""
        python transcribe_raw.py $file
    }
}

Write-Host ""
Write-Host "Done! 元ファイルと同じフォルダに .txt で保存されました。"
Read-Host "Press Enter to close"
