# stop-pkg.ps1 - stop the isolated PACKAGED instance started by start-pkg.ps1.
#
# Selection is by executable path (the installed shell root) plus the isolated
# --user-data-dir, so the production instance - which shares the same exe but runs with a
# different user-data-dir - is never touched. See the note in stop-dev.ps1 about why the
# selection lives in this file instead of the caller's command line.
#
# ASCII comments and output only (PowerShell 5.1 decodes a BOM-less .ps1 as ANSI).

$ErrorActionPreference = 'SilentlyContinue'

$shellRoot = 'C:\Users\MaxNull\AppData\Local\Programs\ssid-shell'
$iso       = 'H:\MaxNull\WorkStation\.ssid-iso-test'

function Get-PkgProcesses {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ExecutablePath -like "$shellRoot\*" -and
      $_.ExecutablePath -notlike '*elevate.exe' -and
      $_.CommandLine -like "*$iso\user-data-100*"
    }
}

$stale = @(Get-PkgProcesses)
Write-Output "packaged isolated processes before: $($stale.Count)"
foreach ($p in $stale) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3

$left = @(Get-PkgProcesses)
Write-Output "packaged isolated processes after: $($left.Count)"
$listener = Get-NetTCPConnection -LocalPort 19488 -State Listen -ErrorAction SilentlyContinue
Write-Output ("19488: {0}" -f $(if ($listener) { "still listening (pid $($listener.OwningProcess))" } else { 'free' }))
