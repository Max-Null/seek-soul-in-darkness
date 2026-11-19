# start-dev.ps1 - THE entry point for verifying plugin / shell behaviour in SSiD.
#
# Runs the UNPACKAGED dev shell: the checkout's electron.exe on <checkout>\apps\desktop.
# app.isPackaged === false, so the window title carries the DEV badge and the shell code
# comes from the current source tree rather than from a release artifact.
#
# Why this script exists instead of `pnpm run dev:desktop` / dev.ts:
#   dev.ts hard-codes the Electron arguments and carries neither --no-sandbox nor
#   SSID_PLUGIN_SET_DIR. Without the latter the shell resolves process.resourcesPath
#   (Electron's own resources dir, which holds no plugin set), logs
#   `plugin set: no usable ssid-plugins.json`, and mounts ZERO SSiD plugins while still
#   opening a window - which looks exactly like a broken plugin. dev.ts also has no slot
#   for extra Chromium switches, and ELECTRON_EXTRA_LAUNCH_ARGS does not work
#   (measured 2026-09-30). So this script starts Electron itself with dev.ts's env plus
#   the two missing pieces.
#
# Isolation (missing any one of the first three collides with the production instance):
#   DSH_HOME                                 -> home-100 (profile, storages, sessions-ssid-dev)
#   --user-data-dir                          -> dev electron-user-data (the single-instance lock lives here)
#   web port 19488                           -> home-100\cordis.patch.yml overrides the hard-coded 19388
#   SSID_NOTIFY_CONFIG / SSID_SCREENSHOT_CONFIG -> separate files, so the global hotkeys are not fought over
#   SSID_MCP_CG_WS                           -> empty dir, skips the codegraph first-run dialog
#
# dev and the packaged-instance entry (start-pkg.ps1) share home-100 and port 19488, so
# exactly one of them can run at a time.
#
# Why --no-sandbox is on by default: on this machine the Chromium sandbox failed to
# initialise (renderer died with 0x80000003 STATUS_BREAKPOINT before any JS ran). The
# root cause found on 2026-10-24 was a `Low Mandatory Level` label on the checkout's
# electron\dist tree; it was repaired with
#   icacls "<checkout>\node_modules\.pnpm\electron@*\node_modules\electron\dist" /setintegritylevel "(OI)(CI)M" /T
# and the sandbox then started fine. The flag stays on by default because a broken
# renderer is indistinguishable from a broken plugin; pass -WithSandbox to test the
# hardened path. If the renderer crash comes back, re-check that icacls label first.
#
# Usage:
#   pwsh -NoProfile -File .\start-dev.ps1                  # launch with the existing build output
#   pwsh -NoProfile -File .\start-dev.ps1 -Build           # build:artifacts + build:desktop first
#   pwsh -NoProfile -File .\start-dev.ps1 -KillStale       # kill a previous isolated instance first
#   pwsh -NoProfile -File .\start-dev.ps1 -WithSandbox     # do not pass --no-sandbox
#   pwsh -NoProfile -File .\start-dev.ps1 -Capture         # also log stdout (hangs headless callers)
#   pwsh -NoProfile -File .\stop-dev.ps1                   # stop
#
# ASCII comments and output only: PowerShell 5.1 decodes a BOM-less .ps1 by the ANSI code
# page, so non-ASCII text would turn into mojibake there.

param(
  [switch]$Build,
  [switch]$KillStale,
  [switch]$WithSandbox,
  [switch]$NoWait,
  # Redirect the shell's stdout/stderr into logs\dev.out.log / dev.err.log.
  # Caveat: with a redirection the calling `pwsh -File ...` does not return until the shell
  # exits, because the child inherits the caller's console handles. That is fine in a
  # terminal you sit in front of, but it hangs a headless caller (a DSH pwsh call). Plain
  # GUI launches work headless; diagnosis beyond that reads home-100\logs\host.log and
  # %APPDATA%\ssid-shell\logs\ instead.
  [switch]$Capture
)

$ErrorActionPreference = 'Stop'

# Entry points live in this repository; runtime data stays in the workspace-level data
# directory below. Keep the two apart: data must not enter version control.
$scriptDir = $PSScriptRoot
$iso      = 'H:\MaxNull\WorkStation\.ssid-iso-test'
$checkout = 'H:\MaxNull\WorkStation\.ssid-build\checkout'
$appRoot  = Join-Path $checkout 'apps\desktop'
$isoHome  = Join-Path $iso 'home-100'
$logDir   = Join-Path $iso 'logs'
$webPort  = 19488
$cdpPort  = 9222

function Fail([string]$Message) {
  Write-Output "ERROR: $Message"
  exit 1
}

# --- prerequisites ----------------------------------------------------------
if (-not (Test-Path $appRoot)) { Fail "checkout apps\desktop not found: $appRoot" }
if (-not (Test-Path (Join-Path $isoHome 'cordis.patch.yml'))) {
  Fail "missing home patch (the web port would stay 19388 and collide with production): $isoHome\cordis.patch.yml"
}

$electron = Get-ChildItem (Join-Path $checkout 'node_modules\.pnpm') -Directory -Filter 'electron@*' -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($null -eq $electron) { Fail "no electron package under $checkout\node_modules\.pnpm" }
$electronExe = Join-Path $electron.FullName 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electronExe)) { Fail "electron.exe not found: $electronExe" }

$projectDir = Join-Path $appRoot '.desktop-build\development\project'
$runtimeDir = Join-Path $appRoot '.desktop-build\targets\win-x64\runtime\primary-runtime'
if (-not (Test-Path $projectDir) -or -not (Test-Path $runtimeDir)) {
  Fail "dev artefacts missing ($projectDir / $runtimeDir) - run with -Build, or once: pnpm run build:artifacts then pnpm run build:desktop"
}

# --- optional build ---------------------------------------------------------
if ($Build) {
  Write-Output 'building artifacts + desktop bundle in the checkout (a few minutes) ...'
  Push-Location $checkout
  try {
    & pnpm run build:artifacts
    if ($LASTEXITCODE -ne 0) { Fail "build:artifacts failed with exit code $LASTEXITCODE" }
    & pnpm run build:desktop
    if ($LASTEXITCODE -ne 0) { Fail "build:desktop failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

# --- port guards ------------------------------------------------------------
foreach ($port in $webPort, $cdpPort) {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $listener) { continue }
  if ($KillStale) {
    Write-Output "port $port is in use - stopping the isolated instance first (-KillStale)"
    & (Join-Path $scriptDir 'stop-dev.ps1') | Out-Null
    & (Join-Path $scriptDir 'stop-pkg.ps1') | Out-Null
    Start-Sleep -Seconds 3
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) { Fail "port $port is still held by pid $($listener.OwningProcess) - stop that process first" }
  } else {
    Fail "port $port is in use (pid $($listener.OwningProcess)). If it is the packaged isolated instance, run .\stop-pkg.ps1; re-run with -KillStale to do it automatically."
  }
}

# --- runtime record version guard -------------------------------------------
# The About screen's kernel version comes from <project>\desktop-runtime.json
# (release.version), and only dev.ts writes that record. This script bypasses dev.ts on
# purpose, so a kernel bump (merging a new rc) leaves the record stale: the window would
# keep showing the previous release while the kernel actually loads the new one (the
# @deepseek-ai/dsh entry is a junction into the checkout, so it always follows the tree).
# Rebuild the record here instead of asking the operator to remember. Safe at this point:
# the port guards above already proved no isolated instance is running.
$runtimeRecord = Join-Path $projectDir 'desktop-runtime.json'
$wantVersion = (Get-Content (Join-Path $checkout 'package.json') -Raw | ConvertFrom-Json).version
$haveVersion = $null
if (Test-Path $runtimeRecord) {
  try { $haveVersion = (Get-Content $runtimeRecord -Raw | ConvertFrom-Json).release.version } catch { $haveVersion = $null }
}
if ($haveVersion -ne $wantVersion) {
  Write-Output "dev runtime record is stale ($haveVersion -> $wantVersion); rebuilding the dev project ..."
  Push-Location $checkout
  try {
    & pnpm exec tsx (Join-Path $scriptDir 'sync-dev-runtime.mjs')
    if ($LASTEXITCODE -ne 0) { Fail "sync-dev-runtime.mjs failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

# --- environment ------------------------------------------------------------
# These four leak in from the DSH session that spawns us: ELECTRON_RUN_AS_NODE makes
# Electron start as plain Node (it then rejects --user-data-dir as a bad option),
# NODE_OPTIONS poisons child processes, DSH_CHECKOUT hijacks kernel resolution, and
# SSID_DEV_DEPLOY would "really deploy" into a linked profile and pierce the isolation.
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Remove-Item Env:\NODE_OPTIONS -ErrorAction SilentlyContinue
Remove-Item Env:\DSH_CHECKOUT -ErrorAction SilentlyContinue
Remove-Item Env:\SSID_DEV_DEPLOY -ErrorAction SilentlyContinue

$userData = Join-Path $appRoot '.desktop-build\development\electron-user-data'
New-Item -ItemType Directory -Force -Path $userData | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $iso 'empty-cg') | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$env:DSH_HOME                        = $isoHome
$env:DSH_DESKTOP_PRIMARY_RUNTIME_DIR = $runtimeDir
$env:DSH_DESKTOP_HOST_INSPECT_PORT   = '9230'
$env:DSH_DESKTOP_OPEN_DEVTOOLS       = '0'
$env:SSID_PROFILE_NAME               = 'ssid-dev'
# Without this the shell mounts zero plugins (see the header).
$env:SSID_PLUGIN_SET_DIR             = Join-Path $iso 'ssid-plugins-dev'
$env:SSID_MCP_CG_WS                  = Join-Path $iso 'empty-cg'
$env:SSID_NOTIFY_CONFIG              = Join-Path $isoHome 'notify-dev.json'
$env:SSID_SCREENSHOT_CONFIG          = Join-Path $isoHome 'screenshot-dev.json'

# Not `$args`: that is a PowerShell automatic variable.
$electronArgs = @("--remote-debugging-port=$cdpPort", "--user-data-dir=$userData")
if (-not $WithSandbox) { $electronArgs += '--no-sandbox' }
$electronArgs += $appRoot

$outLog = Join-Path $logDir 'dev.out.log'
$errLog = Join-Path $logDir 'dev.err.log'

$hostLog = Join-Path $isoHome 'logs\host.log'
# The log is appended across runs, and every run prints its own token. Remember the line
# already there so the wait below cannot hand back the PREVIOUS instance's address.
$previousAddress = $null
if (Test-Path $hostLog) {
  $previous = Get-Content $hostLog -Tail 300 -ErrorAction SilentlyContinue |
    Select-String -Pattern 'dsh web: http' | Select-Object -Last 1
  if ($previous) { $previousAddress = $previous.Line }
}

if ($Capture) {
  Start-Process -FilePath $electronExe -ArgumentList $electronArgs -WorkingDirectory $appRoot `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog
} else {
  Start-Process -FilePath $electronExe -ArgumentList $electronArgs -WorkingDirectory $appRoot
}

Write-Output "dev shell launched: $electronExe"
Write-Output "  DEV badge in the title bar; CDP on $cdpPort; web on $webPort"

if ($NoWait) { exit 0 }

# --- wait for the host web port, then print the address ---------------------
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
  Fail "the shell did not report a web address within 90s - see $isoHome\logs\host.log and $env:APPDATA\ssid-shell\logs"
}

Write-Output "GUI web address: $url"
Write-Output 'In-page UI is served over dsh-app:// and cannot be opened with Playwright; use CDP on the port above, or this http address.'
Write-Output 'Stop with: pwsh -NoProfile -File .\stop-dev.ps1'
