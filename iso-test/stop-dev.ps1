# stop-dev.ps1 - stop the isolated dev shell started by start-dev.ps1.
#
# Selection is by executable path, not by command line: the pwsh that runs this script
# is itself a DSH child process, so matching command-line keywords like "user-data-100"
# in a call-site command line can hit the caller (2026-09-28: it killed the session-HOSTING
# process once). Paths are ASCII and specific, so nothing else can match.
#
# ASCII comments and output only (PowerShell 5.1 decodes a BOM-less .ps1 as ANSI).

$ErrorActionPreference = 'SilentlyContinue'

$checkout = 'H:\MaxNull\WorkStation\.ssid-build\checkout'

function Get-DevProcesses {
  Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -like "$checkout\node_modules*" }
}

$stale = @(Get-DevProcesses)
Write-Output "dev shell processes before: $($stale.Count)"
foreach ($p in $stale) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3

$left = @(Get-DevProcesses)
Write-Output "dev shell processes after: $($left.Count)"
foreach ($port in 9222, 19488) {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  Write-Output ("{0}: {1}" -f $port, $(if ($listener) { "still listening (pid $($listener.OwningProcess))" } else { 'free' }))
}
