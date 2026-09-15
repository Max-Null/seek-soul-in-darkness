# 上游 issue 草稿：普通子进程间歇性 `spawn EPERM`

> 状态：**待提交**（目标仓库 `deepseek-harness`）。落成本文件是为了让措辞与证据可复核；
> 提交后本文件仍是提交时的快照，不再跟随 issue 讨论更新。
> 关联：`docs/排查/2026-09-14-pwsh工具间歇性spawn-EPERM-排查记录.md`（现象与取证）、
> `docs/决策/2026-09-15-pwsh-spawn-EPERM-重试插件决定.md`（SSiD 侧缓解）。

## 建议标题

**区分 `CreateProcessW` 与其后 Job 分配/恢复：普通子进程在 Electron 宿主下间歇性 `spawn EPERM`**

标题刻意不写成「CreateProcessW 失败」——原因见下方「映射层的推断性质」。

## 现象

在 Windows 上，普通子进程（复现载体：`tool-pwsh` 的 pwsh 调用）间歇性失败，工具调用返回：

```text
Error: spawn EPERM
```

- **与命令内容无关**：最简的 `Write-Output "ok"` 与 `1+1` 同样失败。
- **间歇且可自愈**：同一会话内累计失败 4 次、恢复 4 次，从未持久失败；等待或取消正在运行的后台任务后恢复。
- **首次出现**：DSH `0.1.2-rc.1` → `0.1.5-rc.2` 升级后的首个会话。旧版 `dsh-subprocess-local` 直接走 `child_process.spawn`，没有这条 runner 路径。
- 失败均发生在短窗口内存在多个 spawn 的时段，但单个后台下载运行期间也曾成功，**无法用单一条件解释**。

## 环境

| 项 | 值 |
|---|---|
| OS | Windows 11 26200 |
| 宿主 | Electron 桌面壳（无控制台），内核由壳启动 |
| DSH | `0.1.5-rc.2`（本地 checkout 亦为 tag `dsh-v0.1.5-rc.2`） |
| 受影响工具 | `tool-pwsh` → `dsh-pwsh-local` → `dsh-subprocess-local` |
| 创建路径 | runner 进程 + Koffi + Win32 Job Object |
| 权限预设 | `danger-full-access`（**不是** restricted-token / ACL 沙箱路径） |

实测差异：终端宿主下 DSH 自身拥有控制台；Electron 宿主下内核无控制台，`conhost.exe` 由内核的子进程链隐式新建。

## 代码事实

调用链（`packages/subprocess/` 下）：

1. `subprocess-local/src/windows-job.ts:134` — 用 Node `child_process.spawn` 启动 runner 进程；`:189` 发送 `{ type: 'start' }`。
2. `subprocess-local/src/spawn-runner.ts:306` — runner 侧 `spawnCurrentTokenJobProcess()`。
3. `win32-process/src/process.ts:527-539` — `CreateProcessW(applicationName, commandLine, null, null, 1, CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT, env, cwd, startupInfo, processInfo)`。
4. `win32-process/src/process.ts:435` — `created === 0` 时**立即** `api.getLastError()`；`:450` `throwWin32(api, 'CreateProcessW', createFailureCode, ...)`。
5. `spawn-runner.ts:74` — `WINDOWS_SPAWN_ERROR_CODES` 的 `[5, 'EPERM']`；`:94` `asSpawnError()`；`:321` 发布门控 `this.jobHandle === undefined && error instanceof Win32Error && error.api === 'CreateProcessW'`。

创建参数：`STARTUPINFO` 的 `dwFlags = 0x100`（`STARTF_USESTDHANDLES`，`process.ts:426-432`），`lpDesktop = null`，不设 `STARTF_USESHOWWINDOW` / `STARTF_USEWINDOWPOS`；Job 由 `createKillOnCloseJob()`（`:333`、`:407`）在 create 之前建立，进程挂起创建 → `AssignProcessToJobObject`（`:470`）→ `ResumeThread`（`:478`），失败与成功路径都关闭 Job。`windows-job.ts:56 probeWindowsJob()` 每次 spawn 都建/关一个探针 Job。

## 关键：映射层的推断性质（本报告最需要确认的一点）

`asSpawnError` 的门控条件是 `jobHandle === undefined`。而 `spawnJobProcess()` 中 `this.jobHandle` 只在 `spawnCurrentTokenJobProcess()` **成功返回之后**才被赋值（`spawn-runner.ts:314-315`）。这意味着：

- `CreateProcessW` 失败（`process.ts:450`）时 `jobHandle === undefined`；
- **`AssignProcessToJobObject`（`:470-477`）与 `ResumeThread`（`:478-484`）失败时 `jobHandle` 同样仍是 `undefined`**，它们的 `win32Code` 若为 5，也会进入同一分支并渲染成完全相同的 `spawn EPERM`。

因此，当前只有现象、没有 Procmon/Sysmon 级证据时，**「失败点 = `CreateProcessW` 返回 `ERROR_ACCESS_DENIED`」是推断而非观测**。请把本 issue 读作「`CreateProcessW` 或紧随其后的 Job 分配/恢复被拒」。若上游需要精确归因，建议先按「修复方向 2」把三个系统调用区分开。

## 已排除（附判据）

| 项 | 判据 |
|---|---|
| 命令内容 / 语法 / 路径 | 最简命令同样失败 |
| pwsh 可执行文件解析到不可启动路径 | 曾怀疑 Store 执行别名被 ACL 拒绝，已推翻：同一别名可被 Node/.NET 正常启动 |
| ACL 沙箱 restricted token | 本机 `danger-full-access`，失败在 ordinary runner 路径；与仓库中已知的 sandbox `EPERM` 现象**同名不同路径** |
| 宿主 spawn 能力整体失效 | 从代码路径推断：报出 `spawn EPERM` 意味着 runner 进程本身已被 Node 成功 spawn（`windows-job.ts:134`），失败发生在 runner 内部的下一次创建 |
| 进程/句柄配额耗尽 | 同上：失败发生在句柄极少的 runner 进程内，而刚成功的 Node spawn 在同一时刻 |
| Win32 错误码被后续调用覆盖成 5 | `process.ts:435` 在 `finally` 清理（`freeNative` / `setHandleInformation`）之前就捕获了 `GetLastError`，时序上不成立 |
| 容器化本身是回归 | 新架构是有意改进（进程树清理、减少停止后残留、隐藏控制台窗口），本 issue 只报告「某些时刻会失败」 |

## 复现与取证建议（按成本排序）

用户可在会话内自跑：

- 后台循环每 300 ms 记录时间戳 + `Get-Process pwsh,node` 的 `Handles` + `Get-CimInstance Win32_Process -Filter "Name='conhost.exe'"` 的 `ProcessId/ParentProcessId`，失败后回看该时刻是否有 conhost 或挂起进程异常增长。
- 起后台任务 → 取消 → 立刻连发 5 次最简 pwsh 调用，观察是否必现。

需要额外工具或人工操作：

- **Procmon/Sysmon**：抓取失败瞬间 `CreateProcess` 的 Result 是否为 `ACCESS DENIED`（这是把本 issue 从推断升级为证据的唯一直接手段）。
- **handle.exe / Process Explorer**：确认内核 node 与 runner 是否身处某个 Job 内（Job 嵌套假设）。
- **宿主 A/B**：同一 DSH 版本下，唯一变量为「宿主有无控制台」——终端里直接起 DSH 跑同样并发组合，对照 Electron 宿主。若不复现，控制台/窗口站方向权重上升。

**当前状态：无 Sysmon/Procmon 级证据，触发条件未确证。**

## 修复方向（按上游接受难度递增）

1. **失败上下文上报（最容易被接受）** — `spawn-runner.ts:321` 一带在发布错误时附带 Win32 错误文本（`FormatMessageW` 已有绑定，`ffi.ts:261`）与 `applicationName`、`cwd`、是否 Store 别名。零行为变化、纯诊断，同时能让下一位报告者一条日志定位。
2. **区分三个系统调用的错误回传** — 让 `AssignProcessToJobObject` / `ResumeThread` 的失败携带各自的 `api` 名（而不是落进 `CreateProcessW` 门控），`asSpawnError` 相应分流。直接消除本 issue 的归因歧义。
3. **`STARTF_USESHOWWINDOW` + `SW_HIDE`** — `process.ts:426-432` 目前只编码 `STARTF_USESTDHANDLES`；补编码可一并消除非终端宿主的控制台窗口闪烁。上游此前刻意避开 `CREATE_NO_WINDOW` / `CREATE_NEW_CONSOLE`（受限令牌下会导致 `STATUS_DLL_INIT_FAILED`），本项不动创建标志，风险低。
4. **对 `win32Code === 5` 内部重试一次** — 故障可自愈，重试成本低；但会掩盖根因，建议放在 1、2 之后。

## English summary

On Windows 11 the ordinary subprocess path (reproduced via `tool-pwsh`) intermittently fails with `spawn EPERM`, independent of the command, self-healing, gone after cancelling a background task. It first appeared after upgrading DSH 0.1.2-rc.1 → 0.1.5-rc.2, when ordinary spawns moved to a runner process plus Koffi and a Win32 Job Object. The host is an Electron shell without a console; the kernel's children get an implicitly created console. The failing call is `CreateProcessW` at `win32-process/src/process.ts:527`, whose error 5 is mapped to `EPERM` by `spawn-runner.ts:74`. Caveat: the `jobHandle === undefined` gate at `spawn-runner.ts:321` also captures error 5 from `AssignProcessToJobObject` and `ResumeThread`, so `CreateProcessW` is an inference, not an observation. No Procmon/Sysmon evidence, no proven trigger. Suggest error-context reporting first.
