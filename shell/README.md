# SSiD 壳（思灵）—— Electron 补丁层

> 状态：**已跑通**（2026-08-16 实测：electron 窗口 + DSH 官方 UI + 侧栏）
> 定位：spawn 纯 node 子进程 boot DSH 官方 web profile，electron 外挂侧栏（第四列）

## 架构

```
electron 主进程（main.mjs，纯 ESM JS，不经转译）
├── spawn 纯 node 子进程（boot-child.ts，tsx 跑）
│   └── 复用官方 runProfile → boot DSH web profile（ssid profile）
│       └── 打印 SSID_READY port=<n>，保持运行
├── BrowserView A：DSH 官方 loopback UI（http://127.0.0.1:<port>/）
└── BrowserView B：SSiD 侧栏（记忆面板，preload.cjs + side-rail/）
```

## 两个关键实测结论（重要）

### 1. 内核必须在纯 node 子进程里 boot，不能进 electron 主进程

DSH 的 loader 依赖 native addon `node-addon-require-builtin` 探测**标准 Node 的
V8 embedder**，从而 `requireBuiltin('internal/modules/esm/loader')` 拿内部 loader，
用 profile 目录的 baseUrl 解析 bare-specifier 插件（如 out-of-tree bundle）。

electron 是**另一个 V8 embedder**（嵌了 Chromium），该探测必然失败：

```
node-addon-require-builtin unsupported: Unsupported/no-realm
(no compatible GetAlignedPointerFromEmbedderData symbol found)
```

所以 electron 主进程只 spawn 子进程，内核跑在标准 node 下（native addon 正常）。

### 2. Electron 版本必须 ≥ 40（内置 Node ≥ 22.19）

DSH 硬性要求 `node ^22.19 || >=24`（用了 Node 22 的 `node:zlib` zstd 和
`node:module` stripTypeScriptTypes API）。Electron 33 内置 Node 20.18，直接报
`node:zlib does not provide createZstdDecompress`。本壳锁定 Electron **43.3.0**
（内置 Node 24.18）。

## 文件

| 文件 | 作用 |
|---|---|
| `main.mjs` | Electron 入口：spawn 内核子进程 + 双 BrowserView + IPC |
| `kernel.ts` | 复用官方 `runProfile` boot DSH（ssid profile） |
| `boot-child.ts` | 内核子进程入口：boot 后打印 `SSID_READY port=<n>` 并保持运行 |
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

1. **memory 数据通道未接通**：侧栏的 `ssid:memory:*` IPC 现在返回空。设计上是 shell
   直接读子进程 host 的 `ctx.memory`（绕开 Typert remote），但子进程和 electron 是两个
   进程，需要跨进程桥（IPC/HTTP 端点）把 `ctx.memory` 数据喂给侧栏——这是 M1 的核心工作。
2. **侧栏从"纯记忆列表"扩展**为「记忆/状态/计划」三 tab（对应 fractal 的增强面板）。
3. **`ctx.desktop` 服务**：notify/activateWindow 等壳级能力（见 `../docs/设计/SSiD-壳级能力设计.md`）。
4. **品牌**：窗口图标换成思灵（Si 瞳孔 logo）。
5. **打包分发**：现在靠源码 + 系统 node 跑，未做 electron-builder 打包。

## 历史记录

早期结论（已过时，保留存档）：独立 npm 依赖 DSH 包会断 peer 链（npm 版本未同步）。
最终方案改为「tsconfig paths 引用相邻 DSH checkout 源码 + tsx 运行」，不改 DSH 一行代码。
