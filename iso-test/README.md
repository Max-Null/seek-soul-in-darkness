# `iso-test/` —— 与生产并行的隔离实例（入口脚本）

生产实例（`思灵.exe`，web 19388）开着的时候，要另起一个实例验东西，从这里的**四个入口**起。

**脚本与数据分开放**：入口脚本在本目录（受 git 管理，改动能追溯、能回看）；运行时数据在 `H:\MaxNull\WorkStation\.ssid-iso-test\`（隔离 home、插件集、user-data、日志，以及 `archive/` 里的一次性脚本），**不进版本控制**。脚本里的 `$iso` 常量指的就是那个数据目录，`$scriptDir`（`$PSScriptRoot`）指本目录。

`.ssid-iso-test\` 下同名的四个脚本是**转发桩**：旧调用仍能跑，会打印一行提示指向这里。

## 先回答「我该跑哪个」

| 要验什么 | 跑哪个 |
|---|---|
| **插件行为、壳行为**（改了源码、要看到改动） | `pwsh -NoProfile -File .\start-dev.ps1` |
| 发出去的产物（安装包、或在装版 `resources\ssid-plugins` 里的插件构建） | `pwsh -NoProfile -File .\start-pkg.ps1` |
| 源码比构建产物新（改过 `apps/desktop` 或 kernel） | `start-dev.ps1 -Build` |
| 上一轮实例还占着 19488 / 9222 | 上面任一条加 `-KillStale` |
| 停 | `stop-dev.ps1` / `stop-pkg.ps1` |

判据只有一条：**装版壳里是已发布的代码，源码改动在它上面永远验不出来**——「我改了怎么没效果」十次里有九次是跑错入口。

## 四个入口

| 脚本 | 壳 | 端口 | 说明 |
|---|---|---|---|
| `start-dev.ps1` | checkout 的 `electron.exe`（`isPackaged=false`，标题栏带 **DEV**） | web 19488 · CDP 9222 | 唯一验插件/壳行为的路。默认用现有产物（不 build），`-Build` 先构建 |
| `start-pkg.ps1` | 装版 `思灵.exe`（`isPackaged=true`） | web 19488 | 只验装版产物 |
| `stop-dev.ps1` | — | — | 按 electron 的可执行文件路径停，不碰别的 |
| `stop-pkg.ps1` | — | — | 按装版路径 + 隔离 user-data-dir 停，**不碰生产实例** |

`start-dev.ps1` 默认带 `--no-sandbox`（见脚本头的来历），要验加固路径用 `-WithSandbox`。
两个 start 都会等到 19488 起监听、从 `home-100\logs\host.log` 里取带 token 的地址打印出来；`-NoWait` 可跳过等待。

## 为什么不能直接 `pnpm run dev:desktop`

四条，每条都踩过：

| 缺口 | 后果 |
|---|---|
| `dev.ts` 不带 `SSID_PLUGIN_SET_DIR` | 非打包壳的 `process.resourcesPath` 是 Electron 自带目录、里面没有插件集 → **零插件**，窗口却正常打开，看起来像插件坏了 |
| `dev.ts` 把 Electron 参数写死 | 没有注入口子；`ELECTRON_EXTRA_LAUNCH_ARGS` 实测无效（2026-09-30） |
| 前台 `& exe` 被后台 job 托管 | job 收尾切断 stdio → 主进程 `EPIPE`，弹「A JavaScript error occurred in the main process」 |
| 不带 `--user-data-dir` | 单实例锁在 userData 下 → 第二个实例 `single-instance lock FAILED -> quit`，窗口一闪就没 |

## 隔离项（缺一项会怎样）

| 项 | 不设的后果 |
|---|---|
| `--user-data-dir`（`user-data-100` / dev 的 `electron-user-data`） | 抢生产的单实例锁 → 直接退出 |
| `DSH_HOME=home-100` | profile / storages / 会话根写进生产 `~/.dsh` |
| `SSID_PROFILE_NAME=ssid-dev` | 会话根不是 `sessions-ssid-dev`，与生产混在一起 |
| home patch：`webserver.port=19488` | desktop-host 把 19388 **硬编码**在启动参数里 → `EADDRINUSE 127.0.0.1:19388` |
| `SSID_NOTIFY_CONFIG` / `SSID_SCREENSHOT_CONFIG` | 两个实例抢同一份全局热键 → 日志 `is already taken` |
| `SSID_MCP_CG_WS` 指空目录 | codegraph 首次引导弹框卡住无人值守启动 |
| 清 `ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS` / `DSH_CHECKOUT` | 从 DSH 会话派生的进程会继承它们 → `bad option: --user-data-dir=…`（看着像 exe 不认开关） |
| 不设 `SSID_DEV_DEPLOY` | 它会「真部署」打穿 junction 写进隔离 profile |

`19488` 只能有一个主人：**dev 与 pkg 共用 `home-100` 与这个端口，二者互斥**。生产 19388 不受影响。

## 常见报错对照

| 现象 | 大概率原因 | 解 |
|---|---|---|
| 窗口一闪就没，日志 `single-instance lock FAILED` | 没带 `--user-data-dir`，抢了生产的锁 | 用本目录脚本，别手敲 |
| 窗口起来了但插件全无 | 缺 `SSID_PLUGIN_SET_DIR`（走了 `dev.ts`），或 profile 的 bundle 解析不到 | 用 `start-dev.ps1`；查 `home-100\logs\host.log` 里 `skipping profile bundle` |
| `EADDRINUSE 127.0.0.1:19388` | home patch 没生效 | 确认 `home-100\cordis.patch.yml` 存在，且 `DSH_HOME` 指向它 |
| `bad option: --user-data-dir=…` | 继承 `ELECTRON_RUN_AS_NODE=1`，Electron 退化成纯 Node | 脚本已清；手敲命令要先 `Remove-Item Env:\ELECTRON_RUN_AS_NODE` |
| renderer 一启动就崩、无任何 JS 错误、退出码 `0x80000003` | `electron\dist` 被标了 `Low Mandatory Level`（2026-10-24 定位） | 见 `start-dev.ps1` 头部的 `icacls … /setintegritylevel` |
| 改了插件产物但页面没变 | 覆盖了错的一侧（隔离集是**实体**不是 junction），或 host 缓存了 `rev=` | 见下节；换产物后**重启实例** |

## 插件实体落在哪：先看清是实体还是链接

`node_modules\@max-null\<pkg>` 在这个工作区里**可能是实体目录，也可能是 junction**，结论会随 `pnpm install` / 打包变化，别凭记忆判断：

```powershell
Get-Item -Force 'H:\MaxNull\WorkStation\.ssid-iso-test\ssid-plugins-dev\node_modules\@max-null\dsh-node-appearance' |
  Select-Object Name, LinkType, Target
```

- **实体**：覆盖这里只影响隔离实例
- **junction → `resources\ssid-plugins`**：覆盖这里等于改装版，生产重启后也变

验插件产物时**两侧都覆盖**最省心；`2026-11-20` 那轮就是因为只看了一侧，第一次 A/B 测出「改了没生效」。

## 工具（不是实例入口）

这些**还在数据目录** `.ssid-iso-test\` 下（它们直接操作隔离数据，跟数据放一起）：

| 脚本 | 用途 |
|---|---|
| `装插件.ps1` | 往隔离 profile 装一个插件（幂等） |
| `升级dev插件.ps1` | 更新隔离插件集里的某个插件实体 |
| `package-unsigned.ps1` | 打 win-x64 unsigned 安装包（带三道前置检查） |

## `archive/` 里是什么

34 个一次性验证脚本，在**数据目录** `.ssid-iso-test\archive\` 下，名字保持原样，**只作备查，不要当入口跑**。它们当时各自验一件事（截图、附件、navicon、端口冲突、`--inspect-brk` 冷启动、打包实验…），当年的结论已写进 `seek-soul-in-darkness/docs/` 对应文档。

大致对应关系：

| 旧名 | 现在用 |
|---|---|
| `launch-dev-with-pluginset.ps1`、`launch-dev-nosandbox.ps1`、`launch-dev-verify.ps1`、`launch-dev-ci*.ps1`、`launch-dev-direct.ps1` | `start-dev.ps1` |
| `启动-dev-源码.ps1`（前台阻塞）、`启动-dev-源码-detached.ps1`（缺 pluginset） | `start-dev.ps1` |
| `启动-ssid-dev-build.ps1`（缺 pluginset） | `start-dev.ps1 -Build` |
| `启动-ssid-dev-detached.ps1`、`启动-ssid-dev.ps1`、`启动-pkg-验收.ps1`、`launch-ssid-dev-100-logged.ps1` | `start-pkg.ps1` |
| `stop-ssid-dev.ps1` | `stop-pkg.ps1` |
| `launch-iso-brk.ps1`、`launch-iso-probe.ps1`、`launch-minimal.ps1`、`launch-pkg-debug.ps1`、`启动-iso-110.ps1`、`启动-iso-wsprobe.ps1` | 一次性调试，需要时从 `archive/` 取 |
| `package-env*.ps1`、`package-rebrand.ps1` | 一次性打包实验 |
| `watch-and-repair.ps1` | 一次性修被污染会话日志 |

## 相关文档

- `seek-soul-in-darkness/docs/插件测试操作手册.md` —— 改插件后怎么验（本目录是它的入口部分）
- `seek-soul-in-darkness/docs/SSiD开发手册.md` §3 —— 环境流转与隔离三件套
- 数据目录 `.ssid-iso-test\` 下的清单：`logs/`（各实例日志）、`home-100/`（隔离 DSH_HOME）、`ssid-plugins-dev/`（隔离插件集）、`user-data-100/`、`profiles/`
