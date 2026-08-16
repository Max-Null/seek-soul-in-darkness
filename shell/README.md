# SSiD 壳（思灵）—— Electron 补丁层

> 状态：骨架代码（第一个字节），**待跑通验证**
> 定位：boot DSH 官方 web UI + 外挂侧栏（第四列）+ IPC 读 host memory

## ⚠️ 关键结论（2026-08-16 实测）

**独立 npm 依赖 DSH 包不可行**：`npm install` 报 ERESOLVE——`dsh-app-boot@0.1.0-rc.6` 的 peer 依赖要求 `dsh-home-paths@^0.1.0-rc.6`，但 npm 上 home-paths 只有 `0.0.1-rc.3`。DSH 是 monorepo，npm 发布版本不同步，独立拼装会断 peer 链。

**正确路径**：壳代码迁进 DSH workspace（`deepseek-harness-fork`），用 tsx 启动（同 `dsh web` 的 `node --import tsx/esm` 方式），同 anywhere-labs 的 submodule 做法。本目录的 `main.ts`/`preload.cjs`/`side-rail` 代码本身可用，只是要换个宿主（workspace 而非独立 npm）。

## 这是什么

```
Electron 窗口
├── BrowserView A：DSH 官方 loopback UI（内核，零改动）
└── BrowserView B：SSiD 侧栏（记忆面板，读 host ctx.memory）
```

## 文件

| 文件 | 作用 |
|---|---|
| `main.ts` | Electron bootstrap + boot DSH web profile + 双 BrowserView + IPC |
| `preload.cjs` | IPC 桥（侧栏 → main） |
| `side-rail/index.html` + `memory-panel.js` | 侧栏记忆面板（列表/搜索/确认/删除） |
| `package.json` | Electron + DSH boot 依赖 |

## 怎么跑（待验证）

```sh
cd shell
npm install        # 装 Electron + DSH 包（Electron 下载二进制，可能较慢）
npm start          # electron .  → boot DSH → 窗口出现官方 UI + 侧栏
```

## 待验证 / 待确认点（诚实清单）

1. **`main.ts` 是 TS，Electron 直接跑不了 TS**——需 `tsc` 编译成 `dist/main.js`，或加 tsx/esbuild 启动钩子。当前 `package.json` 的 `start` 是 `electron .`，`main` 指向 `main.ts`，需对齐。
2. **`loadProfile('web', ...)` 的 `installAnchor`**：当前用本包目录，bundle 解析需本包 `node_modules` 里有 `@deepseek-ai/dsh-web-app`/`dsh-base`。
3. **`webServer.port`**：boot 后从 `ctx.webServer.port` 取 loopback 端口，需确认类型（`ctx` 的类型里 webServer 是否可见）。
4. **memory 服务**：`ctx.get('memory')` 依赖 dsh-memory 装在 web profile 的 patch 里（已装），需确认侧栏能读到。
5. **preload 的 sandbox**：`sandbox: true` 下 preload 只能 `require('electron')` 的有限子集，`contextBridge`/`ipcRenderer` 可用，但需实测。

## 下一步（跑通后）

- 侧栏从"纯记忆列表"扩展为「记忆/状态/计划」三个 tab（对应 fractal 的增强面板）。
- 加 `ctx.desktop` 服务（notify/activateWindow 等，见 `../docs/设计/SSiD-壳级能力设计.md`）。
- 品牌：窗口标题/图标换成思灵（Si 瞳孔 logo）。
