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

## 附：验证工具清单

| 用途 | 脚本 |
|---|---|
| 内置闭包 boot 冒烟 | `scripts/boot-bundled.mjs`（需 DSH_HOME 指向临时目录） |
| runtime 重建 | `scripts/prepare-runtime.mjs`（`npm run prepare-runtime`） |
| 打包后补 node_modules / node.exe | `scripts/after-pack.cjs`（afterPack 钩子） |
| koffi view 崩溃对比探针 | `C:\Users\21030442\AppData\Local\Temp\opencode\probe2-view-electron.cjs` |
| 模拟 host spawn worker | `C:\Users\21030442\AppData\Local\Temp\opencode\test-worker-spawn.mjs` |
| 运行日志 | `~/.ssid/ssid.log`（SSID_LOG_FILE 可覆盖） |
| 存活心跳 | `~/.ssid/heartbeat.log`（5 秒间隔） |
