# start-pkg.ps1 - the isolated PACKAGED instance: acceptance of shipped artifacts only.
#
# Runs the installed shell (isPackaged = true, no DEV badge) with the isolation triple.
# Use it when what you are verifying is a release artifact (the installer, or a plugin
# build copied into resources\ssid-plugins). For plugin or shell BEHAVIOUR use
# start-dev.ps1 - the packaged shell contains released code, so a source change can never
# show up here, and "I changed it but nothing happened" is the usual conclusion.
#
# Isolation (missing any one of these collides with the production instance):
#   --user-data-dir                 -> user-data-100 (the single-instance lock lives here)
#   DSH_HOME                        -> home-100 (profile, storages, sessions-ssid-dev, separate logs)
#   SSID_NOTIFY_CONFIG / SSID_SCREENSHOT_CONFIG -> separate files, so the global hotkeys are not fought over
#   SSID_MCP_CG_WS                  -> empty dir, skips the codegraph first-run dialog
#   web port 19488                  -> home-100\cordis.patch.yml overrides the hard-coded 19388
#
# Shares home-100 and port 19488 with the dev shell (start-dev.ps1): exactly one at a time.
#
# Usage:
#   pwsh -NoProfile -File .\start-pkg.ps1                # launch
#   pwsh -NoProfile -File .\start-pkg.ps1 -KillStale     # kill a previous isolated instance first
#   pwsh -NoProfile -File .\stop-pkg.ps1                 # stop
#
# ASCII comments and output only (PowerShell 5.1 decodes a BOM-less .ps1 as ANSI).

param(
  [switch]$KillStale,
  [switch]$NoWait
)

$ErrorActionPreference = 'Stop'

# Entry points live in this repository; runtime data stays in the workspace-level data
# directory below. Keep the two apart: data must not enter version control.
$scriptDir  = $PSScriptRoot
$iso       = 'H:\MaxNull\WorkStation\.ssid-iso-test'
$shellRoot = 'C:\Users\MaxNull\AppData\Local\Programs\ssid-shell'
$isoHome   = Join-Path $iso 'home-100'
$logDir    = Join-Path $iso 'logs'
$webPort   = 19488

function Fail([string]$Message) {
  Write-Output "ERROR: $Message"
  exit 1
}

if (-not (Test-Path $shellRoot)) { Fail "installed shell not found: $shellRoot" }
if (-not (Test-Path (Join-Path $isoHome 'cordis.patch.yml'))) {
  Fail "missing home patch (the web port would stay 19388 and collide with production): $isoHome\cordis.patch.yml"
}

# The product exe name is non-ASCII, so pick it by elimination instead of spelling it.
$exe = Get-ChildItem (Join-Path $shellRoot '*.exe') -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -ne 'elevate.exe' } | Select-Object -First 1
if ($null -eq $exe) { Fail "no product exe under $shellRoot (expected one besides elevate.exe)" }

$listener = Get-NetTCPConnection -LocalPort $webPort -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  if ($KillStale) {
    Write-Output "port $webPort is in use - stopping the isolated instance first (-KillStale)"
    & (Join-Path $scriptDir 'stop-dev.ps1') | Out-Null
    & (Join-Path $scriptDir 'stop-pkg.ps1') | Out-Null
    Start-Sleep -Seconds 3
    $listener = Get-NetTCPConnection -LocalPort $webPort -State Listen -ErrorAction SilentlyContinue
    if ($listener) { Fail "port $webPort is still held by pid $($listener.OwningProcess) - stop that process first" }
  } else {
    Fail "port $webPort is in use (pid $($listener.OwningProcess)). If it is the dev shell, run .\stop-dev.ps1; re-run with -KillStale to do it automatically."
  }
}

Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Remove-Item Env:\NODE_OPTIONS -ErrorAction SilentlyContinue
Remove-Item Env:\DSH_CHECKOUT -ErrorAction SilentlyContinue
Remove-Item Env:\SSID_DEV_DEPLOY -ErrorAction SilentlyContinue

$userData = Join-Path $iso 'user-data-100'
New-Item -ItemType Directory -Force -Path $userData | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $iso 'empty-cg') | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$env:DSH_HOME               = $isoHome
$env:SSID_PROFILE_NAME      = 'ssid-dev'
$env:SSID_MCP_CG_WS         = Join-Path $iso 'empty-cg'
$env:SSID_NOTIFY_CONFIG     = Join-Path $isoHome 'notify.json'
$env:SSID_SCREENSHOT_CONFIG = Join-Path $isoHome 'screenshot.json'

$hostLog = Join-Path $isoHome 'logs\host.log'
# The log is appended across runs, and every run prints its own token. Remember the line
# already there so the wait below cannot hand back the PREVIOUS instance's address.
$previousAddress = $null
if (Test-Path $hostLog) {
  $previous = Get-Content $hostLog -Tail 300 -ErrorAction SilentlyContinue |
    Select-String -Pattern 'dsh web: http' | Select-Object -Last 1
  if ($previous) { $previousAddress = $previous.Line }
}

Start-Process -FilePath $exe.FullName -ArgumentList "--user-data-dir=$userData"

Write-Output "packaged isolated instance launched: $($exe.FullName)"
Write-Output "  no DEV badge; web on $webPort"

if ($NoWait) { exit 0 }

Write-Output 'waiting for the host web port (up to 90s) ...'
$url = $null
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 2
  $listener = Get-NetTCPConnection -LocalPort $webPort -State Listen -ErrorAction SilentlyContinue
  if (-not $listener) { continue }
  if (Test-Path $hostLog) {
    $line = Get-Content $hostLog -Tail 300 -ErrorAction SilentlyContinue |
      Select-String -Pattern 'dsh web: http' | Select-Object -Last 1
    if ($line -and $line.Line -ne $previousAddress) {
      $url = ($line.Line -replace '^.*(dsh web: )', '')
      break
    }
  }
}
if ($null -eq $url) {
  Fail "the shell did not report a web address within 90s - see $isoHome\logs\host.log"
}

Write-Output "GUI web address: $url"
Write-Output 'Stop with: pwsh -NoProfile -File .\stop-pkg.ps1'
