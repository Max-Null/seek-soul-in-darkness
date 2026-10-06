' backup-storages-hidden.vbs -- hidden launcher for the scheduled task
' "SSiD-storages-backup".
'
' The task runs as InteractiveToken, so starting node.exe directly allocates a
' console window that flashes on the desktop on every hourly trigger. Running
' node through wscript.exe avoids that: wscript is a GUI-subsystem host and has
' no console of its own, and Run's second argument (0) hides the child window.
' The child's exit code is forwarded, so Task Scheduler still records real
' failures in "Last Run Result".
'
' ASCII ONLY. wscript decodes .vbs using the system ANSI code page, so non-ASCII
' bytes here become mojibake, and a BOM makes the script fail to parse.

Option Explicit

Dim shell, command, exitCode
Set shell = CreateObject("WScript.Shell")

command = """C:\Program Files\nodejs\node.exe"" """ & _
          "H:\MaxNull\WorkStation\seek-soul-in-darkness\shell\scripts\backup-storages.mjs"""

exitCode = shell.Run(command, 0, True)

' shell.Run returns the child's exit code, or -1 when the child was killed.
' Either way it is worth reporting unchanged.
WScript.Quit exitCode
