# 排查记录：内置 DSH 的 pwsh 工具间歇性 `spawn EPERM`

> 2026-09-14 · 状态：**根因已收敛到「新版 runner 架构 + Electron 无控制台宿主」两条线，触发条件未确证** · 来源：本人环境实测（非他人反馈）
> 环境：SSiD 0.3.0（runtime `0.3.0-0.1.5-rc.2-48c210cf`）· DSH 上游 `0.1.5-rc.2` · Windows 11 26200 · shell 以 High Integrity Level（管理员）运行

## 一、现象

内置 DSH 会话的工具调用返回：

```text
Error: spawn EPERM
```

- **与命令内容无关**：最简的 `Write-Output "ok"` 与 `1+1` 同样失败（实测），排除命令语法/路径因素。
- **可自愈**：等待或取消正在运行的后台任务后即恢复；本次排查期间累计失败 4 次、恢复 4 次，**从未持久失败**，未破坏会话数据。
- **首次出现**：2026-09-14 09:36，即 SSiD 0.2.1→0.3.0（DSH `0.1.2-rc.1`→`0.1.5-rc.2`）升级后的**首个会话**。

### ⚠️ 重要区分：本 EPERM 不是 SSiD 既有语境里的那个 EPERM

SSiD 历史文档中的 EPERM **全部属于文件占用 / rename / 撞锁**：

| 既有记录 | 当时的 EPERM 语义 |
|---|---|
| `release-notes-v0.1.6.md` L15/L35 | 部署遇**文件占用**（EPERM）→ 已做检测提示 + rename 交换自愈 |
| `插件中心0.2.1发布与归档覆盖机制复盘.md` L32 | SSiD 运行时 **node-pty 等被占用**会 EPERM，需先关思灵 |
| `2026-08-23-会话隔离与插件更新-交付清单.md` L21 | **撞锁**（EPERM/EBUSY/rename）分流：`SSID_PENDING_CONSUMER=1` |
| `2026-08-17-安装卡死关闭失败-步骤可视化.md` L87 | **子进程句柄**未及时关闭导致 spawnSync 超时 |

本次是 **进程创建**失败：`CreateProcessW` 返回 `ERROR_ACCESS_DENIED`(5)，再由 `dsh-subprocess-local` 映射成 Node 风格的 `spawn EPERM`。**两者根因不同，请勿套用既有「文件占用」结论。**

## 二、失败点定位（已确证）

调用链与映射位置：

| 环节 | 位置 |
|---|---|
| 映射表 `[5, "EPERM"]` | `@deepseek-ai/dsh-subprocess-local/lib/runner.js` |
| `asSpawnError()` 生成 `spawn EPERM` | 同文件，条件为 `error.api === "CreateProcessW" && jobHandle === undefined` |
| 实际创建调用 | `@deepseek-ai/dsh-win32-process/lib/index.js` → `spawnCurrentTokenJobProcess()` |
| 走哪条 spawn 路径 | `dsh-subprocess-local` 的 **windows-job** runner（实测 pwsh 的父进程是 `node.exe` + `dsh-subprocess-local/...` runner，非 DSH 内核直连） |

`spawnCurrentTokenJobProcess` 的创建参数（`dsh-win32-process/lib/index.js` L612-615）：

```js
api.createProcessW(options.applicationName, commandLine, null, null, 1,
    1028,            // dwCreationFlags = 0x404 = CREATE_UNICODE_ENVIRONMENT | CREATE_SUSPENDED
    environment, options.cwd, startupInfo, processInfo)
```

配套的 `STARTUPINFO` 编码（同文件 `spawnJobProcess`，L533-540）：

```js
encodeStartupInfo(startupInfo, {
    cb: 104,
    dwFlags: 256,    // = 0x100 = STARTF_USESTDHANDLES（仅此一个）
    hStdInput / hStdOutput / hStdError: ...
});
```

**要点：`dwCreationFlags` 不含任何控制台标志，`dwFlags` 也不含 `STARTF_USESHOWWINDOW`/`SW_HIDE`。**

## 三、决定性证据：新旧版起进程方式是两个物种

对比基准来自本机 profile 快照（升级前 `package.json`/`pnpm-lock.yaml` 备份）与 npm 上的旧版包。

| 实现维度 | 旧版 `0.1.2-rc.1` | 新版 `0.1.5-rc.2` |
|---|---|---|
| 起进程方式 | **直接 `Node child_process.spawn`**（`lib/index.js` 唯一调用点 L848） | 先起 **runner 进程** → Koffi FFI 调 `CreateProcessW` + Win32 Job Object |
| `runner.js` / `runner-launch-*.js` | **不存在** | `13001` + `60094` 字节（新增） |
| `windows-job.d.ts` / `linux-scope` / `linux-execve` / `managed-owner` / `runner-protocol` / `bin` | **不存在** | 均为新增 |
| `windows-job` 命中数 | 0 处 | 2 处 |
| `spawnCurrentTokenJobProcess` | 0 处 | 3 处 |
| `loadWin32ProcessBindings` | 0 处 | 5 处 |
| 本报告失败点所在路径 | **不存在该代码** | **正是这条** |

> 结论：`spawn EPERM` 的失败点**只存在于新架构**，旧版没有这条会失败的代码路径。这把「与新版有关」从猜测变成了可核对的事实。
> 需同时说明：新架构是**有意的改进**（进程树清理、减少停止后残留、隐藏控制台窗口），不是低级失误；它只是在本机环境下某些时刻会失败。

## 四、与「DSH 运行在 SSiD（Electron）壳内」的关系（已实测）

SSiD 是 **Electron（GUI）宿主，本身没有控制台**；而 DSH 官方的主要形态是在**终端**（有控制台）里运行。实测证据：

| 实测项 | 结果 | 含义 |
|---|---|---|
| 共享当前控制台的进程（共 15 个） | 含 DSH 内核 node、各 MCP 服务器、pwsh、codegraph；**不含 `思灵.exe`** | 该控制台**不是从 Electron 继承**的 |
| `conhost.exe` PID 14216 | **PPID = 25984（DSH 内核）** | 控制台由 **DSH 的子进程链隐式新建** |
| 另两个 `conhost.exe` | 同样 PPID，命令行带 `--headless` | 那是 ConPTY（node-pty 终端路径） |
| `cmd.exe` PID 22604 | `cmd /d /s /c "D:\tools\bin\nacos-backend.cmd"`，PPID=25984 | DSH 启 MCP 时开的，同样依赖该控制台 |
| 当前 pwsh 的 `GetConsoleWindow()` | 非 0（有控制台句柄），`MainWindowHandle = 0`，输出重定向 | 控制台存在但不显示窗口 |

因此两种宿主的差别是：

| | 终端宿主（官方主要形态） | SSiD / Electron 宿主 |
|---|---|---|
| 父进程控制台 | 有 | **无** |
| 子进程控制台来源 | **继承宿主** | **Windows 隐式新建**（多一层依赖） |
| 控制台窗口 | 天然共享，无额外窗口 | 需 `SW_HIDE` 才不闪窗——而当前未编码 |

## 五、已排查并排除的路径

| 路径 | 结论 |
|---|---|
| 命令内容/语法/路径 | 最简命令同样失败，与内容无关 |
| pwsh 可执行文件解析 | 曾怀疑解析到 Store 执行别名被 ACL 拒绝，**已推翻**：别名实测可被 Node/.NET/DSH 自身正常启动 |
| `pwshPath` 配置 | 曾以为「加 `shell.pwshPath` 修好了」，**已推翻**：真实机制是**触发重新解析**（`PwshLocalExecutor` 构造时解析一次并缓存 `resolvedPwshPath`，仅当 settings 的 `pwshPath` **值变化**才重算，`onChange` 有 early-return） |
| 沙箱受限令牌 | 本机 `permission.defaultPreset = danger-full-access`；`dsh-pwsh-sandbox` 在该模式直接走 `super.run` 不 confine。**失败在 local runner 路径，不是 ACL restricted-token 沙箱路径** |
| 命名管道受限 | 该限制只在 read-only / workspace-write 两种受限模式生效，本机非受限 |
| spawn 能力整体失效 | MCP 子进程（stdio）工作正常；后台任务也能启动 |
| 升级部署损坏 | 本次启动日志 `runtime deployed` 干净成功；`node_modules` mtime 停在当日 05:08，升级未动它。日志中的 `rename node_modules EPERM` 属**更早一次**升级，且已有重试自愈 |

## 六、复现观测（失败 / 成功对照）

故障**间歇**出现，以下是完整观测：

| # | 并发状态 | 前台 pwsh 调用结果 |
|---|---|---|
| 1 | 后台 `Start-Sleep 25` 运行中 | ✅ 成功（2 个并发前台） |
| 2 | 后台 `Invoke-WebRequest` 下载（已跑 637 s）运行中 | ❌ 失败 ×2 |
| 3 | 后台 `curl` 下载 + 另一后台任务并存 | ❌ 失败 |
| 4 | 后台 `Start-Sleep 45` 运行中 | ✅ 成功 |
| 5 | 后台 `curl` 下载运行中（单独） | ✅ 成功 |
| 6 | 无后台任务 | ✅ 成功（多次） |

**共性观察**：失败均发生在「短窗口内存在多个 spawn 压力」时；但单个后台下载运行期间又成功过，故**无法用单一条件解释**。

## 七、触发条件（未定论）

- 未能找到稳定复现条件；猜测与**并发 spawn 的竞态**有关，但证据不足。
- 失败后**等待或取消后台任务即恢复**，从未持久失败。
- 结合第四节的「隐式控制台新建」，怀疑「Windows 为子进程新建控制台」这一步在某些资源/时序条件下失败，但**没有直接证据**把 EPERM 钉在控制台分配上。

## 八、关联既有上游信息（已查证）

| 信息 | 来源 |
|---|---|
| 「Windows sandbox spawn EPERM」是官方仓库里**有名字的已知现象** | deepseek-harness Discussion #3193（`dsh-failure-lens`） |
| 另一条讨论标题即「**sandbox EPERM causes repeated retries**」 | Discussion #1048 |
| Windows 进程创建有两条路径，且受限令牌下某些创建标志会导致 `STATUS_DLL_INIT_FAILED (0xC0000142)`，官方因此刻意避开 `CREATE_NO_WINDOW`/`CREATE_NEW_CONSOLE` | 社区 handbook `windows-console-window-flash.md`（引官方 #3460） |
| 同一文档指出：`STARTUPINFO` 结构里已有 `wShowWindow`，但**当前只编码了 `STARTF_USESTDHANDLES`**，属未修项 | 同上 |
| `0.1.5` release notes 含「Windows 上本地非终端子进程不再弹出控制台窗口」「改善 Windows/部分 Linux 普通子进程的清理，减少任务停止后残留」 | GitHub release `dsh-v0.1.5-rc.1` |
| npm 上 `dsh-subprocess-local` 的 `next` 即 `0.1.5-rc.2`（**不存在 rc.3+**），`latest` 仍为 `0.1.5-rc.1` | npm dist-tags |

> 注：官方那几条讨论讲的是 **ACL 沙箱（restricted token）路径**；本机是 danger-full-access，失败在 **local runner 路径**。**现象同名，路径不同**——若向上游反馈，这是必须写清的关键区分。

## 九、候选修复 / 规避方向

| 方向 | 说明 | 状态 |
|---|---|---|
| A. 让 DSH 内核持有控制台 | 若 SSiD 启动 DSH 内核时使其拥有一个控制台（而非让子进程链隐式新建），子进程即可走「继承」路径，绕开隐式分配。与本报告第四节的差异对应 | **待验证假设**，需实机 A/B |
| B. 上报上游（推荐） | 本报告第二/三节的代码证据 + 「local runner 路径 ≠ ACL 沙箱路径」的区分，足够构成一份可行动的 issue | 待执行 |
| C. 失败自动重试 | 对用户透明地重试一次（故障可自愈，成本低） | 可选兜底 |
| D. 版本跟进 | 关注上游后续版本是否修复 runner/控制台处理 | 持续 |

## 十、决定性 A/B 实验（建议优先做）

**在同一台机器、同一 DSH 版本下，唯一变量是「宿主有没有控制台」**：

1. 在一个**有控制台的终端**里直接启动 DSH（`dsh --profile ssid`，或等价入口），新开一个会话；
2. 跑同样的 pwsh 调用（含并发/后台任务组合）；
3. 若不再出现 `spawn EPERM` → 坐实「与 Electron 无控制台宿主有关」；
4. 若仍复现 → 说明与宿主控制台无关，问题纯在 runner 架构。

## 十一、附：本次排查用到的取证手段

```powershell
# 1) 当前 pwsh 是否有控制台、由谁创建
Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();' -Name K32 -Namespace W
[W.K32]::GetConsoleWindow()

# 2) 列出共享该控制台的全部进程（看 Electron 是否在其中 → 判断继承 vs 新建）
Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint GetConsoleProcessList(uint[] l, uint c);' -Name K32b -Namespace W2
$b = New-Object uint32[] 64; [W2.K32b]::GetConsoleProcessList($b, 64)

# 3) conhost 的父进程 → 谁创建了控制台
Get-CimInstance Win32_Process -Filter "Name='conhost.exe'" | Select ProcessId,ParentProcessId,CommandLine

# 4) pwsh 的父进程 → 确认走 runner 路径
Get-CimInstance Win32_Process -Filter "Name='pwsh.exe'" | Select ProcessId,ParentProcessId
```

关键源码位置（本机 0.1.5-rc.2 安装）：

- `@deepseek-ai/dsh-subprocess-local/lib/runner.js` — `[5,"EPERM"]` 映射与 `asSpawnError`
- `@deepseek-ai/dsh-subprocess-local/lib/runner-launch-COYGu0Dl.js` — runner 启动、stdio 布局（fd3=`ipc` + fd4-6 carriers）
- `@deepseek-ai/dsh-win32-process/lib/index.js` — `spawnCurrentTokenJobProcess` / `spawnJobProcess`（创建标志 1028、`dwFlags` 256）
- `@deepseek-ai/dsh-pwsh-local/lib/index.js` — `resolvePwshPath` / `candidatePwshExists`（含「启动期解析一次并缓存」）

## 十二、一句话结论

**pwsh 的 `spawn EPERM` 落在 DSH 0.1.5 新引入的 runner 进程架构上（`CreateProcessW`→ACCESS_DENIED），而 SSiD 的 Electron 无控制台宿主恰好让这条路径多依赖一层「Windows 隐式分配控制台」；两者叠加构成本机故障画像。触发条件仍未确证，但失败点与两处环境差异都已有实测证据。**
