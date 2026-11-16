' Scheduled-task entry: wscript is a GUI subsystem host, so no console window flashes at logon.
Dim shell, fso, scriptPath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "start-analytics.ps1")
WScript.Quit shell.Run("powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & scriptPath & """", 0, True)
