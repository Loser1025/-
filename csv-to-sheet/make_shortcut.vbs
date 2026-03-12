Set wsh = CreateObject("WScript.Shell")
desktop = wsh.SpecialFolders("Desktop")
lnkPath = desktop & "\" & ChrW(20108) & ChrW(32771) & ChrW(36578) & ChrW(35352) & ".lnk"
batPath = wsh.CurrentDirectory & "\run_today.bat"
Set lnk = wsh.CreateShortcut(lnkPath)
lnk.TargetPath = batPath
lnk.WorkingDirectory = wsh.CurrentDirectory
lnk.WindowStyle = 1
lnk.Hotkey = "Ctrl+Alt+B"
lnk.Save
MsgBox "Shortcut created! Hotkey: Ctrl+Alt+B", 64, "Done"
