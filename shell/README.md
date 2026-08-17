# SSiD 壳（思灵）—— Electron 补丁层

> 状态：**已跑通**（2026-08-16 实测：electron 单进程 + DSH 官方 UI + 侧栏）
> 定位：electron 主进程直接 boot DSH 官方 web profile（学习 anywhere-labs），外挂侧栏（第四列）

## 架构

```
electron 主进程（main.mjs）
├── tsx register → kernel.ts → 复用官方 runProfile → boot DSH（ssid profile）
│   └── module-resolution.ts 的 registerHooks 补 bare specifier 解析
├── BrowserView A：DSH 官方 loopback UI（http://127.0.0.1:<port>/）
└── BrowserView B：SSiD 侧栏（记忆面板，preload.cjs + side-rail/）
```

**单进程**：DSH 内核和 electron 窗口同进程。侧栏的 memory 数据通道直接
`kernel.get('memory')` 同进程读 host 服务，不需要跨进程桥。

## 两个关键实测结论（重要）

### 1. 内核可以在 electron 主进程里 boot，但需要一个 registerHooks

DSH 的 loader 依赖 native addon `node-addon-require-builtin` 探测**标准 Node 的
V8 embedder**，从而拿 Node 内部 loader 用 profile 目录解析 bare-specifier 插件。
electron 是**另一个 V8 embedder**，该探测失败，loader 退化成从 tree.ts 位置
`import(name)`，bare specifier 找不到。

解法（学习 anywhere-labs 的 dsh-plugin-desktop）：用 Node 24 的纯 JS
`registerHooks` 把 loader 发出的 bare specifier 的 parentURL 改写到 profile
目录（`module-resolution.ts`，30 行）。实测 electron 43（Node 24.18）里
`registerHooks` 完全可用。

> 早先我误以为"必须 spawn 纯 node 子进程"，绕了远路。anywhere-labs 证明
> 单进程 + hook 更干净，且 memory 数据通道因此保持同进程。

### 2. Electron 版本必须 ≥ 40（内置 Node ≥ 22.19）

DSH 硬性要求 `node ^22.19 || >=24`（用了 Node 22 的 `node:zlib` zstd 和
`node:module` stripTypeScriptTypes API）。Electron 33 内置 Node 20.18，直接报
`node:zlib does not provide createZstdDecompress`。本壳锁定 Electron **43.3.0**
（内置 Node 24.18）。

## 文件

| 文件 | 作用 |
|---|---|
| `main.mjs` | Electron 入口：boot 内核 + 双 BrowserView + IPC（同进程读 host 服务） |
| `kernel.ts` | 复用官方 `runProfile` boot DSH（ssid profile）+ 运行环境三级回退（DSH_CHECKOUT → 相邻源码 → 内置 dsh-runtime） |
| `module-resolution.ts` | registerHooks：loader 的 bare specifier 改写到 profile 目录 |
| `boot-smoke.ts` | 冒烟验证：boot 后 fetch `/` 应得 200（不依赖 electron） |
| `scripts/prepare-runtime.mjs` | 生成 `dsh-runtime/`：profile-template + `@deepseek-ai/dsh` npm 闭包 + 20 个显式 peer，pnpm hoisted 扁平布局 |
| `scripts/boot-bundled.mjs` | 独立验证：纯 node 进程用 dsh-runtime 闭包 boot（无 electron、无源码） |
| `dsh-runtime/` | 内置运行环境（打包时经 extraResources 进安装包，`node_modules` 忽略提交） |
| `profile-template/` | 用户 profile 模板（package.json / pnpm-workspace.yaml / cordis.patch.yml / vendor/） |
| `preload.cjs` | IPC 桥（侧栏 → main） |
| `side-rail/index.html` + `memory-panel.js` | 侧栏记忆面板 |
| `tsconfig.json` | 289 条内联精确 paths（映射相邻 DSH 源码；**tsx 不支持通配符 paths 键**，故不 extends） |
| `docs/pitfalls.md` | 踩坑记录（electron-builder / koffi / pnpm 等，按「现象→根因→修复→验证」组织） |

## 一键安装机制

```
安装包（extraResources）
└── resources/dsh-runtime/     ← pnpm hoisted 扁平 node_modules（约 603MB）
       └── node_modules/@deepseek-ai/dsh  ← 官方聚合包（installAnchor + agent-presets）

首次启动（main.mjs ensureProfile）
├── profileReady？ 有 → skipped（老用户直接 boot）
├── 有 dsh-runtime → bundled：复制 package.json/vendor/… + node_modules（进度条显示 MB）
└── 都没有        → installed：在线 pnpm install（兜底）

boot（kernel.ts resolveDshRuntime 三级回退）
① $DSH_CHECKOUT（开发模式）→ ② 相邻 ../deepseek-harness 源码 → ③ 内置 dsh-runtime
```

- 闭包内 `cordis-plugin-group`、`dsh-fs`、`dsh-invariants` 等 **20 个 peer 由
  prepare-runtime.mjs 显式 `pnpm add`**（pnpm 11 不自动装 peer；npm 会因插件声明的
  旧 rc 版本范围触发 ERESOLVE 死循环，故不用 npm）。
- 布局必须 `node-linker=hoisted`：electron-builder 26 不复制 pnpm 默认 symlink 布局。

## 怎么跑

### 安装版（用户）

`npm run pack` 产物 `dist-electron/思灵 Setup 0.1.2.exe`，安装后双击即用，
**无需任何环境变量与前置安装**。

### 开发模式（开发者）

```sh
# 前置：相邻目录存在 DSH 源码 checkout（tsconfig paths 指向 ../deepseek-harness）
cd shell
npm install            # Electron（43.3.0）+ tsx/typescript
node ../deepseek-harness 下先 build:lib + build:web   # DSH 源码需有 lib/ 产物
npm run smoke          # 先验证内核链路：boot DSH → fetch 200
npm start              # electron . → 窗口出现官方 UI + 侧栏
```

> 注意：开发版与安装版共享 `%APPDATA%\SSiD` 单实例锁，**同一时间只能跑一个**；
> 切换前先 `taskkill /F /IM 思灵.exe` + `taskkill /F /IM electron.exe /T`。
> Electron 二进制下载慢时，可手动解压缓存：`$LOCALAPPDATA/electron/Cache/*/electron-v43.3.0-win32-x64.zip`
> → `node_modules/electron/dist/`，并写 `node_modules/electron/path.txt`（内容 `electron.exe`）。

## 打包

```sh
npm run pack    # bundle-kernel（esbuild 内联 DSH 源码）→ electron-builder NSIS
```

- `electronDist: node_modules/electron/dist` + `signAndEditExecutable: false`：
  跳过 electron zip / signtool 下载（国内网络）；Defender 锁文件导致 EPERM 时
  用 `ELECTRON_BUILDER_CACHE` 换缓存目录重试。
- `files` 排除 `dsh-runtime/`（进 extraResources 而非 asar），`electronLanguages`
  裁掉非中英语言包。

## 待办 / 诚实清单

1. **memory 数据通道**：IPC 已接 `kernel.get('memory')`，但 ssid profile 还没装
   dsh-memory 插件，返回空。M1：把 dsh-memory 装进 ssid profile 的 patch 层。
2. **侧栏从"纯记忆列表"扩展**为「记忆/状态/计划」三 tab（对应 fractal 的增强面板）。
3. **`ctx.desktop` 服务**：notify/activateWindow 等壳级能力（见 `../docs/设计/SSiD-壳级能力设计.md`）。
   单进程下可以直接 `hostCtx.provide('desktopRuntime', ...)` 注入（anywhere-labs 的做法）。
4. **品牌**：窗口图标换成思灵（Si 瞳孔 logo）。
5. ~~**打包分发**~~（v0.1.2 已完成：一键安装 + NSIS 安装器）。

## 历史记录

早期结论（已过时，保留存档）：独立 npm 依赖 DSH 包会断 peer 链（npm 版本未同步）。
最终方案改为「tsconfig paths 引用相邻 DSH checkout 源码 + tsx 运行」，不改 DSH 一行代码。
v0.1.2 起安装版改为内置 `@deepseek-ai/dsh` npm 闭包（见上「一键安装机制」），
开发模式仍走相邻源码。
