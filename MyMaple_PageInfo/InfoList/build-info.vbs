Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = fso.BuildPath(scriptDir, "build-info.bat")
If Not fso.FileExists(batPath) Then
  MsgBox "build-info.bat not found:" & vbCrLf & batPath, 16, "MyMaple Info Builder"
  WScript.Quit 1
End If
shell.Run Chr(34) & batPath & Chr(34), 1, False
