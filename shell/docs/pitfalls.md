# 踩坑记录（Electron 壳 + DSH）

> 本文件记录 SSiD（思灵）开发中踩过的坑、根因、修复与验证方法，供后续迭代参考。
> 每节独立可读，按「现象 → 根因 → 修复 → 验证」组织。

---

## 1. electron-builder 打包：NSIS "Error while loading icon ... can't open file"

**日期**：2026-08-17（v0.1.1 首次打包）

**现象**：`npm run pack` 在 NSIS 编译阶段失败：

```
Error while loading icon from "...dist-electron\.icon-ico\icon.ico": can't open file
Error in macro MUI_INTERFACE on macroline 87
!include: error in script: "assistedInstaller.nsh" on line 70
```

**根因**：`win.icon` 配置为 PNG（`assets/icon.png`）时，electron-builder 每次打包把 PNG 转 ICO 到 `output/.icon-ico/icon.ico`，**转换完成立即启动 makensis 编译**。若杀毒软件（Defender 等）恰好锁定刚生成的 icon.ico，NSIS 读不到即报错。成功日志里出现过 `output file is locked for writing (maybe by virus scanner) => waiting for unlock...` 证实锁定存在。electron-builder 只对 OutFile 做了 `ensureNotBusy`（防锁等待），**icon 文件无保护**（issue #5005 同类）。

**修复**：直接提供 ICO（`assets/icon.ico`），`build.win.icon` 指向 `.ico`——electron-builder 检测到同格式直接使用，跳过转换，消除转换-编译竞态。

**验证**：连续多次打包稳定成功；手动 makensis 编译含 MUI_ICON 的最小脚本确认 icon 可读。

---

## 2. electron-builder 不复制 node_modules 目录（issue #3104）

**日期**：2026-08-17（内置 dsh-runtime 打包）

**现象**：`extraResources: [{ from: ".", to: "", filter: ["dsh-runtime/**"] }]` 打包后，安装目录里 `resources/dsh-runtime/dsh-runtime/` **嵌套**且 `node_modules` 内容为空（只剩目录壳）。运行时 boot 失败。

**根因**：electron-builder 20.15.2+ **默认不复制任何名为 `node_modules` 的目录内容**（防误打包依赖，`filter` 也逃不过）。`from:"."` 会把源目录名带进 `to` 造成嵌套。

**修复**（当前方案，`scripts/after-pack.cjs`）：
- `extraResources` 改 `[{ from: "dsh-runtime", to: "dsh-runtime" }]`（去嵌套）
- `build.afterPack` 钩子用 `fs.cpSync(dsh-runtime/node_modules, appOutDir/resources/dsh-runtime/node_modules, { recursive: true, force: true, dereference: true })` 手动复制（afterPack 在打包完成后、签名前执行）

**验证**：打包日志出现 `[after-pack]` 且 win-unpacked 内文件数/体积与源一致（59365 文件 / 603MB）。

---

## 3. DSH 目录选择器：Electron 进程内 koffi.view 必崩（V8 memory cage）

**日期**：2026-08-17（v0.1.1 安装版实测）

**现象**：打包版选择工作区报 `directory picker failed: ... win32 folder dialog worker exited before reporting a result`。日志显示子进程 `FATAL ERROR: Error::New napi_get_last_error_info`，exit code 134（SIGABRT），崩溃栈在 `readUtf16 ← resultPath ← runFolderDialog`（**选完路径取字符串时崩**）。

**根因链**（三层）：
1. DSH host（`dsh-host-directory-picker-native`）用 `process.execPath` spawn 子进程执行 `worker.cjs`（koffi FFI 调 COM 弹文件夹对话框）。打包版下 `process.execPath = 思灵.exe` → 子进程加载 asar 的 main.mjs → `requestSingleInstanceLock()` 失败 → `app.quit()` 秒退 → host 收不到任何消息 → 报上述错误。（dev 模式 electron.exe 直跑无此问题）
2. 绕过单例锁（`ELECTRON_RUN_AS_NODE=1` 让子进程纯 Node 执行）后，对话框能弹出，但**选完路径取返回值时崩溃**：worker 的 `readUtf16 = Buffer.from(koffi.view(address, 32768))`，而 **Electron 21+（V8 memory cage 默认开启）永久禁止 external buffers**，`koffi.view()` 在 Electron 进程内调用必 FATAL（koffi 官方文档注明 "Some runtimes (such as Electron) forbid the use of external buffers"；electron#36626；ffi-napi#225）。koffi 3.1.1 和 3.1.5 实测都崩。
3. 作者设计假设 `process.execPath = node`（源码注释 "Built consumers launch the bundled CJS entry under plain node"），思灵是第一个 Electron 壳，dev 下没人真走到选目录那步。

**修复**：
- `scripts/after-pack.cjs`：内置纯 `node.exe`（NVM_HOME 优先）到 `resources/node/node.exe`
- `main.mjs` worker 分支（启动最前、单例锁之前）：`argv` 以 `worker.cjs` 结尾 → `spawn(内置node.exe, [workerScript], { stdio: ['ignore','pipe','pipe','ipc'] })`，孙进程 IPC 消息原样 `process.send` 转发给 DSH host，退出码透传。env 默认继承（`DSH_DIALOG_TITLE` 自然传递）

**验证**：
- 模拟 host spawn：`思灵.exe worker.cjs` + `DSH_DIALOG_TITLE` → 收到 `{"kind":"showing","threadId":...}` 对话框弹出
- koffi `alloc/address/view` 探针：Electron 进程内 view FATAL；纯 node.exe（22.12.0/22.22.2）全部 OK
- 用户实测：选工作区 → 弹窗 → 选目录 → 进入对话，全部正常

### 3.1 用户反馈复现排查 + worker 分支加固（2026-08-19）

**现象**：用户再次反馈选择工作区报 `directory picker failed: ... win32 folder dialog worker exited before reporting a result`。

**排查结论（本机实测链路健康）**：
- 模拟 host spawn（`scripts/probes/probe-worker-packaged.mjs`，假 worker 只走 IPC 不发消息）：
  `win-unpacked\思灵.exe worker.cjs` → `[worker] script=...` → `[worker] node=...\resources\node\node.exe`（内置 node）
  → showing/done 消息原样转发回 host → **链路完整，无报错**。
- ssid.log 历史三种失败现场（均已在此前版本修复）：
  1. 无 worker 分支时代：koffi.view 在 Electron 内 FATAL（exit 134）；
  2. 修复后早期：`[worker:err] DSH_DIALOG_TITLE is required`（exit 1）——**host 旧版未传该环境变量**；
  3. `single-instance lock FAILED` 秒退（exit 0）——argv 未命中 worker.cjs 时走普通启动。
- 结论：**当前源码与 win-unpacked 交付物（0.1.5）链路均正常**；用户报错大概率来自**旧版本安装包**
  （`dist-electron` 现存安装包为 0.1.3，更早的 0.1.0/0.1.1 无完整修复）或特定环境（杀软拦截 node.exe 等）。

**加固（main.mjs，2026-08-19，已并入 0.1.5 重新打包分发）**：
- worker 分支从 `start()` 内**上移到顶层**、tsx/kernel 加载之前——worker 进程不再加载整个
  `kernel.bundle.mjs`（6146 行 + 依赖），消除 bundle 顶层副作用拖垮 worker 的隐患；
  同时**修正残留 `void start()` 导致的 worker 进程误走单例锁**（排查时实测发现并修复，详见第 9.1 节）。
- **node 不可用 / spawn 失败时向 host 发 `{kind:'error'}` 消息携带真实原因**，host 显示
  `win32 folder dialog failed: <原因>`，替代笼统的 worker exited。
- **DSH_DIALOG_TITLE 兜底**：env 缺失时补默认标题，兼容旧版 host。
- **无 IPC 通道时记录被丢弃的消息**，便于定位 host 收不到结果的场景。

**验证**：`scripts/probes/probe-worker-source.mjs`（dev electron 直跑源码 main.mjs + 假 worker）
→ showing/done 全量转发成功、无单例锁误触；`node --check main.mjs` 通过；
`scripts/probes/verify-pack.mjs` 对 **0.1.5 新打包产物**（`dist-electron-016`）实测全链路 SUCCESS
（`[worker] script=…` → `[worker] node=内置 node.exe` → showing/done 转发）。

---

## 4. DSH boot 对 Node 版本有硬门槛（≥22.18）

**日期**：2026-08-17（内置 runtime 冒烟）

**现象**：内置闭包（dsh-runtime）boot 失败，报 `loader entries failed to apply`：

```
@deepseek-ai/dsh-session-persistence-jsonl: The requested module 'node:zlib'
does not provide an export named 'createZstdDecompress'      # 需 Node ≥22.13
@deepseek-ai/dsh-code-runtime-worker-thread: The requested module 'node:module'
does not provide an export named 'stripTypeScriptTypes'      # 需 Node ≥22.18
```

**根因**：系统 node 22.12.0 太老；DSH 依赖 Node 22.18+ 的 `stripTypeScriptTypes` / Node 22.13+ 的 `createZstdDecompress`。**Electron 43.3.0 内置 Node = 24.18.1，满足要求**，所以打包版本身无此问题；仅独立 node 冒烟脚本踩到。

**教训**：Electron 内置 Node 版本随 Electron 大版本升级，查版本用 `process.versions.node`；DSH 相关脚本统一用 `D:\Program Files\nvm\v22.22.2\node.exe`（≥22.18）。

---

## 5. DSH_CHECKOUT 环境变量是"幽灵依赖"

**日期**：2026-08-17

**现象**：打包版在终端启动正常，双击启动却报"无法定位 DeepSeek Harness 运行时"；排查许久发现进程在跑但 boot 失败。

**根因**：User 级环境变量 `DSH_CHECKOUT=D:\Project\deepseek-harness` 存在，但**只有新开的进程（explorer 派生的双击）继承**；旧终端、非交互 shell 等老进程不继承后来设置的 User 变量。boot 成功与否取决于"进程从哪里来"，行为不可控。

**修复**：kernel.ts 加内置 runtime 三级回退（DSH_CHECKOUT → 并列目录 checkout → 内置 dsh-runtime），思灵不再依赖环境变量（提交 5bed46b）。

**教训**：桌面应用**绝不依赖用户环境变量**做核心路径决策；排查"我的环境正常"类问题时，先确认两个会话的 `$env:` 差异。

---

## 6. pnpm 11 不自动安装 peer dependencies

**日期**：2026-08-17（prepare-runtime 开发）

**现象**：`pnpm install` 后 `@deepseek-ai/dsh-app-boot` 的 24 个 peer 依赖缺失（`dsh-fs`、`dsh-shell`、`cordis` 等），boot 时 `ERR_MODULE_NOT_FOUND`。

**根因**：pnpm 11 不再自动装 peer 依赖（`auto-install-peers` 失效），需显式 `pnpm add`。

**修复**：`scripts/prepare-runtime.mjs` 在 install 后显式 `pnpm add` 全部 MISSING_PEERS（24 个包，版本与 @deepseek-ai/dsh 对齐 0.1.0-rc.6）。

---

## 7. electron-builder 不复制 pnpm symlink 节点

**日期**：2026-08-17（prepare-runtime 开发）

**现象**：默认 pnpm 布局（symlink）打包后 node_modules 全空。

**根因**：electron-builder 26 不复制 pnpm 的 symlink 结构（同坑 #2 的机制）。

**修复**：dsh-runtime 里写 `.npmrc` `node-linker=hoisted`，pnpm 装出扁平布局（顶层实体 + `.pnpm` 硬链接），`cpSync` 时 `dereference: true` 解引用硬链接。

---

## 8. 应用内插件中心更新报 store/virtual store 不匹配

**日期**：2026-08-18（0.1.4 发布前）

**现象**：安装版里插件中心点「更新」失败，报 `ERR_PNPM_UNEXPECTED_STORE` /
`ERR_PNPM_UNEXPECTED_VIRTUAL_STORE`。

**根因**：pnpm 在**项目 cwd** 创建临时文件做硬链接探测，跨盘（构建目录在 H 盘、
home 在 C 盘）时把 store 落到 cwd 盘符的 `.pnpm-store`；归档打包的
`node_modules/.modules.yaml` 携带构建机绝对路径（`storeDir=H:\.pnpm-store\v11`、
`virtualStoreDir=…\shell\dsh-runtime\node_modules\.pnpm`）。部署到本机 profile 后
两者都不成立，pnpm 校验失败。跨盘部署实验确认：只改 `.modules.yaml` 无效，
必须把 `storeDir` 改成本机默认 store（**保留 pnpm major 版本后缀 v11**）且
`virtualStoreDir` 改成部署目录的 `node_modules\.pnpm`，pnpm add 即恢复。

**修复**：`main.mjs` `deployRuntime` 落位后调用 `rewritePnpmMeta(profileDir)`，
按部署机路径重写上述两字段（store 后缀取自原值，随 pnpm 升级自适应）。

**验证**：解压新归档到临时目录 → 执行同一改写逻辑 → `pnpm add` exit 0；
跨盘（H 构建 → C 部署）最小实验复现通过。

---

## 9. 本次排查衍生的工程坑（2026-08-19）

> 3.1 节记录了目录选择器问题的排查本身；本节记录排查/修复过程中**顺带踩到或暴露**的工程坑，
> 按「现象 → 根因 → 修复 → 验证」组织，单节独立可读。

### 9.1 重构后残留调用点：worker 进程误走单例锁

**现象**：把 worker 分支从 `start()` 内上移到顶层 if/else 后，用 dev 版 electron 直跑源码验证时，
日志同时出现 `[worker] script=…` **和** `ssid: phase single-instance check → lock FAILED → quit`，
进程退出码 0，done 消息丢失——worker 链路看起来"半好半坏"。打包版（asar 旧代码）probe 却完全正常，
因此这个坑在改动初期很容易被漏掉。

**根因**：worker 分支上移后，`void start()` 被加进了 else 分支（worker 模式不执行），
但**文件末尾原本就有一行顶层 `void start()`**（改动前唯一入口），没有同步删除。
顶层代码执行顺序是：if 分支跑 `runWorkerMode` → 文件末尾残留的 `void start()` **无条件执行**
→ `start()` 里 `requestSingleInstanceLock()` 失败（主实例已持有锁）→ `app.quit()` 秒退。
worker 进程在孙进程回报结果前退出，host 自然报「worker exited before reporting a result」。

**修复**：删除文件末尾残留的 `void start()`（保留 else 分支内那处）。`grep "void start()"` 应恰好命中一处。

**验证**：`probe-worker-source.mjs` 复跑 → 只出现 `[worker]` 日志、无 single-instance 日志，
showing/done 全量转发成功。

**教训**：**把函数调用点从一处搬到另一处时，先 grep 旧调用点是否残留**。ESM 顶层 `void fn()`
与条件分支内的调用同名同形，肉眼 diff 很容易漏（本次就是靠"日志里出现互斥分支的痕迹"才抓到的）。

### 9.2 应用自身运行中重新打包：win-unpacked 文件被锁定

**现象**：`electron-builder --win nsis` 默认输出到 `dist-electron`，而当前正在运行的思灵
（本 GUI 所在会话）就是从 `dist-electron\win-unpacked\思灵.exe` 启动的——重新打包会尝试
删除/覆盖被占用文件，可能失败或产出残缺。

**根因**：Windows 对正在执行的 exe/dll 加文件锁，electron-builder 清空输出目录时删不掉。

**修复**：打包时用独立输出目录，不碰运行中的产物：
`npx electron-builder --win nsis --config.directories.output=dist-electron-016`。
验证脚本 `verify-pack.mjs` 支持传入 exe 路径，指向新输出目录即可。

**教训**：**桌面应用的打包产物目录不要与"正在运行的实例"共用**；开发机上 GUI 本身就是
待打包应用时，独立输出目录是默认姿势。顺带：独立目录会脱离 `dist-electron/` 的 gitignore
规则（精确目录名匹配），需同步补 `.gitignore`。

### 9.3 electron-builder 残留 `.tmp_probe/` 构建中间目录

**现象**：打包后工作区出现未跟踪的 `.tmp_probe/`（内容为 `probe.nsi` / `probe.exe` 等）。

**根因**：electron-builder 26 用 `.tmp_probe` 作为 NSIS 脚本编译（makensis）的临时工作目录，
打包结束后未清理（正常残留）。git status 会一直挂着这个脏目录。

**修复**：打包后删除即可（`Remove-Item .tmp_probe -Recurse -Force`）；也可在 `.gitignore` 里
补 `*.tmp_probe/` 防再犯。

### 9.4 已发布版本不要同名重发：升级感知会失效

**现象**：目录选择器修复先升 0.1.6 打包成功，后因版本管理要求改回 0.1.5 重打。

**根因/影响**：0.1.5 已有正式发布记录（release 收尾提交），若再分发同名 0.1.5 包：
① 用户无法从版本号区分新旧包（下载/缓存/校验都可能拿旧）；② 基于版本号的升级判断失效。
本场景 0.1.5 尚未对外铺开、且需保持单版本交付，改回 0.1.5 重打可接受，但属例外。

**修复**：版本号一经发布即不可复用；后续同类修复应升 0.1.6（或 0.1.5.1 补丁号）。

### 9.5 部署落位 EPERM：node_modules 被其他进程占用（2026-08-19 用户实测）

**现象**：安装/更新时内置运行环境部署失败，报
`EPERM: operation not permitted, rename '…\.dsh\profiles\ssid\.deploy.new\node_modules' -> '…\.dsh\profiles\ssid\node_modules'`。
关闭其他占用 node 的程序后重开即正常（占用方释放后 rename 成功）。

**根因**：Windows 文件锁——其他进程（用户自己跑的 node/electron、另一个思灵实例、
杀软扫描等）打开着 `node_modules` 内的文件句柄时，`renameSync` 抛 EPERM。
旧实现是"先 `rmSync` 删旧目录、再 rename 新目录"：占用时删除可能部分成功/失败，
旧环境被破坏且无法恢复，用户只能重装。

**修复**（main.mjs `deployRuntime`，v0.1.5）：
1. **rename 交换代替先删后改**：旧 `node_modules` 先 rename 到 `.deploy.old`，新目录
   rename 落位，全部成功后才删旧备份——全程原子操作，任何一步失败旧环境完好；
2. **自动重试**：rename 遇 EPERM/EBUSY 自动重试 5 次（间隔递增，共约 6 秒），短暂占用
   （杀软扫描、句柄释放）可自愈；
3. **失败回滚**：恢复旧目录 + 删除 `.runtime-version` 强制下次启动重新部署
   （版本不一致触发 `deployNeeded`），无需重装；
4. **可操作提示**：`buildDeployFailHint` 用 `tasklist` 检测占用进程
   （node/electron/思灵），错误面板提示"关闭以下进程后重新打开思灵，部署会自动继续"。

**验证**：`scripts/verify-deploy-rename.mjs` 模拟两种场景——
占用方短暂释放（重试后成功交换）/ 持续占用（重试失败、旧环境完好、回滚路径正确）。

**遗留**：若占用方持续不释放（如用户开着长驻 node 服务），部署仍会失败——此时提示
已列出占用进程，关闭后重开即可自动继续；是否需要"等待重试更久/自动跳过占用文件"
取决于后续用户反馈。

---

## 附：验证工具清单

| 用途 | 脚本 |
|---|---|
| 内置闭包 boot 冒烟 | `scripts/boot-bundled.mjs`（需 DSH_HOME 指向临时目录） |
| runtime 重建 | `scripts/prepare-runtime.mjs`（`npm run prepare-runtime`） |
| 打包后补 node_modules / node.exe | `scripts/after-pack.cjs`（afterPack 钩子） |
| 模拟 host spawn worker（打包版 asar 链路） | `scripts/probes/probe-worker-packaged.mjs`（配 `fake-worker.cjs`） |
| 模拟 host spawn worker（源码 main.mjs 链路） | `scripts/probes/probe-worker-source.mjs`（dev electron 直跑 main.mjs） |
| 部署落位 rename 占用场景验证 | `scripts/verify-deploy-rename.mjs`（临时目录模拟，不碰真实 profile） |
| 打包产物 worker 链路验收 | `scripts/probes/verify-pack.mjs`（默认 `dist-electron-016`，可传 exe 路径） |
| koffi view 崩溃对比探针 | `C:\Users\21030442\AppData\Local\Temp\opencode\probe2-view-electron.cjs` |
| 运行日志 | `~/.ssid/ssid.log`（SSID_LOG_FILE 可覆盖） |
| 存活心跳 | `~/.ssid/heartbeat.log`（5 秒间隔） |
