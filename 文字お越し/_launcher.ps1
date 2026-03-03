Add-Type -AssemblyName System.Windows.Forms

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = "Select ZOOM file"
$dialog.Filter = "Video/Audio (*.mp4;*.mp3;*.m4a)|*.mp4;*.mp3;*.m4a|All files (*.*)|*.*"

if ($dialog.ShowDialog() -ne "OK") {
    Write-Host "Cancelled."
    Read-Host "Press Enter to close"
    exit
}

$file = $dialog.FileName
Write-Host ""
Write-Host "File: $file"
Write-Host "Starting transcription..."
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

python transcribe_zoom.py $file

Write-Host ""
Write-Host "Done! Check zoom_transcript.txt in Downloads folder."
Read-Host "Press Enter to close"
