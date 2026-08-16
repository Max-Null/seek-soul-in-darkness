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
| `kernel.ts` | 复用官方 `runProfile` boot DSH（ssid profile）+ 安装 resolve hook |
| `module-resolution.ts` | registerHooks：loader 的 bare specifier 改写到 profile 目录 |
| `boot-smoke.ts` | 冒烟验证：boot 后 fetch `/` 应得 200（不依赖 electron） |
| `preload.cjs` | IPC 桥（侧栏 → main） |
| `side-rail/index.html` + `memory-panel.js` | 侧栏记忆面板 |
| `tsconfig.json` | extends DSH base 的 paths（tsx 运行时解析），typecheck 边界对齐 vendor 宽松配置 |

## 怎么跑

```sh
cd shell
npm install        # 只装 Electron（43.3.0）+ tsx/typescript
npm run smoke      # 先验证内核链路：boot DSH → fetch 200
npm start          # electron . → 窗口出现官方 UI + 侧栏
```

> Electron 二进制下载慢时，可手动解压缓存：`$LOCALAPPDATA/electron/Cache/*/electron-v43.3.0-win32-x64.zip`
> → `node_modules/electron/dist/`，并写 `node_modules/electron/path.txt`（内容 `electron.exe`）。

## 待办 / 诚实清单

1. **memory 数据通道**：IPC 已接 `kernel.get('memory')`，但 ssid profile 还没装
   dsh-memory 插件，返回空。M1：把 dsh-memory 装进 ssid profile 的 patch 层。
2. **侧栏从"纯记忆列表"扩展**为「记忆/状态/计划」三 tab（对应 fractal 的增强面板）。
3. **`ctx.desktop` 服务**：notify/activateWindow 等壳级能力（见 `../docs/设计/SSiD-壳级能力设计.md`）。
   单进程下可以直接 `hostCtx.provide('desktopRuntime', ...)` 注入（anywhere-labs 的做法）。
4. **品牌**：窗口图标换成思灵（Si 瞳孔 logo）。
5. **打包分发**：现在靠源码 + 系统 node 跑，未做 electron-builder 打包。

## 历史记录

早期结论（已过时，保留存档）：独立 npm 依赖 DSH 包会断 peer 链（npm 版本未同步）。
最终方案改为「tsconfig paths 引用相邻 DSH checkout 源码 + tsx 运行」，不改 DSH 一行代码。
