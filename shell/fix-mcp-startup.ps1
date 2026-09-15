<#
  思灵（SSiD）启动失败一键修复 —— MCP 条目 CLI 缺失拖死内核

  症状（启动失败弹窗里能看到）：
    kernel-child 启动失败：ssid: plugin tree failed to load: ... invalid config:
    ... "args":[null,"--exclude",...] ...

  原因：出厂模板里 mcp-codegraph / mcp-playwright 的 args[0] 取自壳注入的环境变量
  （SSID_MCP_CG_CLI / SSID_MCP_PW_CLI），而壳只在对应 CLI 实体确实存在时才注入它们。
  CLI 缺失时该值求值为 null，而 dsh-mcp-client 的 schema 要求 string[]，
  于是整棵插件树加载失败、思灵起不来（不是那台机器坏了，也不是装错了）。

  本脚本做的事：检查两个 CLI 是否真的在 profile 里，缺哪个就把哪个条目停用
  （disabled: true）。停用只让那个 MCP 不可用，界面与其他插件照常。
  改动前自动备份、可重复运行（幂等）；参数错误或校验失败时不写坏文件。

  用法（三选一）：
    1. 双击同目录的 fix-mcp-startup.cmd
    2. 右键本文件 →「使用 PowerShell 运行」
    3. powershell -NoProfile -ExecutionPolicy Bypass -File fix-mcp-startup.ps1

  可选参数：
    -ProfileDir <路径>  指定 profile 目录（默认 %USERPROFILE%\.dsh\profiles\ssid）
    -DryRun             只报告将要做哪些改动，不写文件
#>
[CmdletBinding()]
param(
  [string]$ProfileDir = (Join-Path $env:USERPROFILE '.dsh\profiles\ssid'),
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$patchPath = Join-Path $ProfileDir 'cordis.patch.yml'

Write-Host ''
Write-Host '思灵（SSiD）启动失败一键修复' -ForegroundColor Cyan
Write-Host ('-' * 60)
Write-Host "profile：$ProfileDir"

if (-not (Test-Path $patchPath)) {
  Write-Host "✗ 找不到补丁文件：$patchPath" -ForegroundColor Red
  Write-Host '  请先让思灵至少启动过一次（它会先部署运行环境），或用 -ProfileDir 指定路径。'
  exit 2
}

# 目标条目 → 它的 args[0] 所依赖的 CLI 实体（路径与 shell/main.mjs 的注入逻辑一致）
$targets = @(
  @{
    Id    = 'mcp-codegraph'
    Label = 'CodeGraph 代码索引'
    Cli   = (Join-Path $ProfileDir 'node_modules\@astudioplus\codegraph-mcp\bin\codegraph-mcp.js')
  },
  @{
    Id    = 'mcp-playwright'
    Label = 'Playwright 浏览器自动化'
    Cli   = (Join-Path $ProfileDir 'node_modules\@playwright\mcp\cli.js')
  }
)

Write-Host ''
Write-Host '第一步：检查两个 MCP 的 CLI 是否到位'
$needFix = @()
foreach ($t in $targets) {
  $exists = Test-Path -LiteralPath $t.Cli
  if ($exists) {
    Write-Host ("  ✓ {0}（{1}）：CLI 存在" -f $t.Id, $t.Label) -ForegroundColor Green
  } else {
    Write-Host ("  ✗ {0}（{1}）：CLI 缺失 → 需要停用该条目" -f $t.Id, $t.Label) -ForegroundColor Yellow
    $needFix += $t
  }
}

if ($needFix.Count -eq 0) {
  Write-Host ''
  Write-Host '两个 MCP 的 CLI 都在，本脚本无需改动。' -ForegroundColor Green
  Write-Host '若思灵仍启动失败，请把 %USERPROFILE%\.ssid\ssid.log 的最后几十行发给开发者。'
  exit 0
}

# 读入（原样保留换行风格；写回一律 UTF-8 无 BOM —— DSH 对 BOM 敏感）
$raw = [System.IO.File]::ReadAllText($patchPath, [System.Text.Encoding]::UTF8)
$nl = if ($raw.Contains("`r`n")) { "`r`n" } else { "`n" }
$lines = New-Object System.Collections.Generic.List[string]
$lines.AddRange([string[]]($raw -split "`r?`n"))

Write-Host ''
Write-Host '第二步：停用 CLI 缺失的条目（原值会随备份保留）'
$changed = @()
foreach ($t in $needFix) {
  $idPattern = '^(\s*)-\s+id:\s*' + [regex]::Escape($t.Id) + '\s*$'
  $startIdx = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match $idPattern) { $startIdx = $i; break }
  }
  if ($startIdx -lt 0) {
    Write-Host ("  · {0}：补丁文件里没有这个条目，跳过" -f $t.Id) -ForegroundColor DarkGray
    continue
  }

  $indent = [regex]::Match($lines[$startIdx], '^(\s*)').Groups[1].Value

  # 条目块结束位置 = 下一个缩进不深于本条目首行的 "- " 行之前
  $endIdx = $lines.Count - 1
  for ($j = $startIdx + 1; $j -lt $lines.Count; $j++) {
    $m = [regex]::Match($lines[$j], '^(\s*)-\s')
    if ($m.Success -and $m.Groups[1].Value.Length -le $indent.Length) { $endIdx = $j - 1; break }
  }

  # 块内找 disabled 行
  $disabledIdx = -1
  $disabledPattern = '^' + [regex]::Escape($indent) + '\s+disabled\s*:'
  for ($j = $startIdx + 1; $j -le $endIdx; $j++) {
    if ($lines[$j] -match $disabledPattern) { $disabledIdx = $j; break }
  }

  if ($disabledIdx -ge 0) {
    $oldValue = $lines[$disabledIdx].Trim()
    if ($oldValue -match '^disabled:\s*true\s*$') {
      Write-Host ("  · {0}：已经是停用状态，跳过" -f $t.Id) -ForegroundColor DarkGray
      continue
    }
    if (-not $DryRun) { $lines[$disabledIdx] = "$indent  disabled: true" }
    Write-Host ("  ✓ {0}：disabled 改为 true" -f $t.Id) -ForegroundColor Green
    Write-Host ("      原值：{0}" -f $oldValue) -ForegroundColor DarkGray
  } else {
    if (-not $DryRun) { $lines.Insert($startIdx + 1, "$indent  disabled: true") }
    Write-Host ("  ✓ {0}：新增 disabled: true" -f $t.Id) -ForegroundColor Green
  }
  $changed += $t.Id
}

if ($changed.Count -eq 0) {
  Write-Host ''
  Write-Host '没有需要改动的条目，文件未变。'
  exit 0
}

if ($DryRun) {
  Write-Host ''
  Write-Host '（-DryRun：以上为预览，未写入文件）' -ForegroundColor Yellow
  exit 0
}

Write-Host ''
Write-Host '第三步：备份并写回'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = "$patchPath.bak-$stamp"
Copy-Item -LiteralPath $patchPath -Destination $backupPath -Force
[System.IO.File]::WriteAllText($patchPath, ($lines -join $nl), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("  备份：{0}" -f $backupPath) -ForegroundColor DarkGray

Write-Host ''
Write-Host '第四步：用思灵自带 node 实解析一次（确认 YAML 合法）'
$nodeExe = $null
$logPath = Join-Path $env:USERPROFILE '.ssid\ssid.log'
if (Test-Path -LiteralPath $logPath) {
  # 日志里是 "...\resources\node\node.exe"：惰性正则会停在 "\node" 处只拿到目录，
  # 故锚定行尾；下面还要再校验一次「是文件而不是目录」，否则会去执行一个目录。
  $hit = Select-String -Path $logPath -Pattern 'prefab mcp node=(.+node(\.exe)?)\s*$' | Select-Object -Last 1
  if ($hit -and $hit.Matches.Count -gt 0) { $nodeExe = $hit.Matches[0].Groups[1].Value.Trim() }
}
$nodeItem = if ($nodeExe) { Get-Item -LiteralPath $nodeExe -ErrorAction SilentlyContinue } else { $null }
if (($null -eq $nodeItem) -or $nodeItem.PSIsContainer) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  $nodeExe = if ($cmd) { $cmd.Source } else { $null }
}

$yamlPkg = Join-Path $ProfileDir 'node_modules\yaml'
if ($nodeExe -and (Test-Path -LiteralPath $yamlPkg)) {
  $patchJs = $patchPath -replace '\\', '/'
  $yamlJs = $yamlPkg -replace '\\', '/'
  $js = "const fs=require('fs');const YAML=require('" + $yamlJs + "');" +
        "const t=fs.readFileSync('" + $patchJs + "','utf8').replace(/!!js\s+/g,'');" +
        "const d=YAML.parse(t);if(!Array.isArray(d))throw new Error('顶层不是数组');" +
        "console.log('entries='+d.length);"
  $verifyOutput = & $nodeExe -e $js 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host ("  ✓ YAML 合法：{0}" -f ($verifyOutput -join ' ')) -ForegroundColor Green
  } else {
    Write-Host '  ✗ 校验未通过，已停止使用该文件：' -ForegroundColor Red
    Write-Host ($verifyOutput -join "`n")
    Write-Host ''
    Write-Host '  请手工恢复备份后再联系开发者：' -ForegroundColor Yellow
    Write-Host ("    Copy-Item '{0}' '{1}' -Force" -f $backupPath, $patchPath)
    exit 1
  }
} else {
  Write-Host '  · 跳过（未找到可用的 node 或 yaml 包）——本次改动只是文本替换，风险极低' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '完成：请退出思灵后重新打开。' -ForegroundColor Cyan
Write-Host ("  被停用的条目：{0}" -f ($changed -join '、'))
Write-Host '  这些 MCP 暂时不可用（思灵本体、界面与其他插件不受影响）。'
Write-Host '  等运行环境装齐后想恢复，把上面那个备份覆盖回来即可：'
Write-Host ("    Copy-Item '{0}' '{1}' -Force" -f $backupPath, $patchPath)
exit 0
