# SSiD Desktop Fork — 对上游的改动清单

**基线**：`deepseek-harness` tag `dsh-v0.1.7-rc.2`
**上游坐标**：`apps/desktop`（Electron 壳）+ `apps/desktop-host`（Host 进程）
**原则**：SSiD 的实现全部收进 `src/ssid/`，上游文件里只留调用点。每条改动登记在此，含文件、行、原因。

---

## 关键发现（2026-09-25，动手前）

**官方在 Windows 上已经是无边框窗口。** `apps/desktop/src/main.ts:209-213`：

```ts
...(process.platform === 'win32' && primary ? {
  titleBarStyle: 'hidden' as const,
  titleBarOverlay: { height: WINDOWS_TITLEBAR_HEIGHT, color: chromeFallbackFill(),
    symbolColor: nativeTheme.shouldUseDarkColors ? '#f9fafb' : '#0f1115' },
} : {}),
```

即：**隐藏原生标题栏 + 40-DIP 自绘 caption + `titleBarOverlay` 提供的原生风格窗口控件**（最小化/最大化/关闭由 Electron 画）。macOS 侧走 `titleBarStyle: 'hiddenInset'` + 交通灯定位（`main.ts:216-224`）。

**思灵壳的做法**是 `frame: false` + 独立的 `titleBar.html` BrowserView，控件完全自绘，并通过 `ssid:title:*` 系列 IPC 与主进程通信（`shell/main.mjs:1295-1302`）。

**两者差异只在「窗口控件是否自绘」**，不在「有没有边框」。这直接缩小了 B 的范围：
- 若接受原生控件 → **标题栏这一项几乎不需要改**
- 若需要自绘控件（例如要往标题栏放插件按钮、需要 `float-state` 这类自定义状态）→ 需把 `titleBarOverlay` 换成自绘，才是真正要改 `main.ts` 的地方

**待定**：这一项等用户确认「要不要自绘控件」后再动手，不先做无谓改动。

---

## 改动登记

### 改动 1：品牌

| 文件 | 位置 | 改动 |
| --- | --- | --- |
| `apps/desktop/scripts/electron-builder-config.mjs` | `:109` | `productName: 'DeepSeek Harness'` → `'思灵'` |

影响：打包产物名、`app.name`（进而 Electron userData 目录名 `%APPDATA%\思灵`）、窗口标题、Windows 安装器文案。

### 改动 2：窗口形态（自绘标题栏）

采用**页面注入**而非独立 BrowserView：官方窗口内容已是 `WebContentsView` 布局，再叠一层会与它的 40-DIP caption 预留打架；注入 DOM 天然复用同一层，且不需要额外 preload 与 IPC 白名单。`preload-windows.ts:13` 已经把 `--dsh-windows-titlebar-height: 40px` 写进页面 CSS，注入条正好填进那个位置。

| 文件 | 性质 | 改动 |
| --- | --- | --- |
| `apps/desktop/src/ssid/titlebar.ts` | **新增** | `installSsidTitlebar(window, productName)`：注册三个控件 IPC（幂等，`ipcMain.handle` 重复注册会抛错）、在 `did-finish-load` 注入 40px 标题栏 DOM（`-webkit-app-region: drag` + 三个自绘控件按钮），页面重载后自动补回 |
| `apps/desktop/src/main.ts` | 改 3 处 | `:1` import 从 `WINDOWS_TITLEBAR_HEIGHT` 换成 `installSsidTitlebar`（前者因此在本文件内变为未使用）；`:209-211` 删掉 `titleBarOverlay` 两行、保留 `titleBarStyle: 'hidden'`；`:239` 加一行调用 |

**注意**：`frame` 无需改动——官方本来就是 `titleBarStyle: 'hidden'`（无边框）。这一项的实质是**把原生控件换成自绘**，不是「加无边框」。


### 改动 3：Windows 通知三场景

**Host 侧（已完成）**

| 文件 | 性质 | 改动 |
| --- | --- | --- |
| `apps/desktop-host/src/ssid-notify.ts` | **新增** | 37 行实现 + 注释：`installSsidNotifyPublisher(ctx, publish)`。`ctx.on('session/event')` 订阅 `turn/start` / `turn/end`（仅 `reason.kind === 'completed'`）/ `approval/asked`；`ctx.inject(['userQuestions'])` 包装 `ask()` 上报提问场景。范式完全照上游 `platform-session.ts`。 |
| `apps/desktop-host/src/index.ts` | 改 2 处 | `:16` 加一行 import；`:103-105` 加 3 行挂载（`installSsidNotifyPublisher(ctx, event => process.send?.({ type: 'ssid-notify', ...event }))`） |

**Electron 侧（待做）**：`host-process.ts` 的 union 加成员与校验、新增 `src/ssid/notify.ts` 投递逻辑、`main.ts` 一处调用。预计与 Host 侧同量级。


---

## 改动之外的约束（不构成 diff，但影响 fork 形态）

1. **构建依赖 monorepo**：`apps/desktop/tsconfig.host.json` 的 `references` 指向 `../../packages/boot/app-boot` 等 7 个包，`tsdown.config.ts` 还 import 了 `../../scripts/client-build-environment.ts`。**fork 副本无法脱离 `deepseek-harness` 的 packages 独立构建。** 因此验证路径要么用 git worktree（独立工作树、不动主 checkout），要么在产物层验证（解包 asar 改 `lib/main.js`）。
2. **协议是版本化的**：`apps/desktop/src/host-protocol.ts` 的 `DESKTOP_HOST_PROTOCOL_VERSION = 4` 写在发布元数据里、启动校验。壳与 Host 在本 fork 内始终同版本发布，因此新增一类 IPC 消息不需要版本协商（但若将来要与官方壳交叉使用，必须升版本）。
3. **`appId` 必须由环境变量提供**（`resolveDesktopAppId(env)` 强制 reverse-DNS 格式），打包时须提供，例如 `com.maxnull.ssid`。

---

## diff 面积实数（2026-09-25 最终测定）

用 `git diff --no-index --numstat` 对比本 fork 与 `deepseek-harness` tag `dsh-v0.1.7-rc.2` 的对应路径。

### 自有代码（新增，全部收在 `ssid/` 下）

| 文件 | 行数 |
| --- | --- |
| `apps/desktop/src/ssid/notify.ts` | 115 |
| `apps/desktop/src/ssid/titlebar.ts` | 126 |
| `apps/desktop-host/src/ssid-notify.ts` | 60 |
| **合计** | **301 行 / 3 个新文件** |

### 上游侵入（修改既有文件）

| 文件 | 增 | 删 | 改了什么 |
| --- | --- | --- | --- |
| `apps/desktop/src/host-process.ts` | 21 | 1 | union 加成员、`SsidNotifyEvent` 接口、类型守卫分支、constructor 参数、JSDoc、消息分发 |
| `apps/desktop/src/main.ts` | 6 | 4 | import 换、`titleBarOverlay` 两行删、注释+调用、constructor 第 10 个参数 |
| `apps/desktop-host/src/index.ts` | 4 | 0 | import（1）、挂载（3） |
| `apps/desktop-host/package.json` | 3 | 0 | `dependencies` 加 `dsh-session` / `dsh-user-approval` / `dsh-user-questions` |
| `apps/desktop-host/tsconfig.json` | 3 | 0 | `references` 加对应三个包路径 |
| `apps/desktop/scripts/electron-builder-config.mjs` | 1 | 1 | `productName` |
| **合计** | **38** | **6** | **44 行 / 6 个文件** |

### 结论

- **上游侵入 44 行，自有代码 301 行**，比例约 **1 : 6.8** —— 薄 diff 纪律成立。
- 侵入最重的仍是 `host-process.ts`（22 行），且**几乎全部是「扩展 IPC 协议」的固有成本**（union 成员 + 类型守卫 + 参数 + 分发），不是可以设计掉的耦合。
- `main.ts` 只碰了两处：窗口创建的一个属性、`DesktopHostProcess` 的一个尾参。**没有触碰它的启动流程、菜单、托盘、更新逻辑。**
- **编译验证额外增加了 6 行侵入**（`package.json` 与 `tsconfig.json` 各 3 行）——这是 declaration merging 的代价，属于**首次接入 API 的一次性成本**，后续加事件不再需要。

### 验证状态（最终）

| 项 | 结果 |
| --- | --- |
| `tsc -b apps/desktop + apps/desktop-host` | **exit 0**（3.4 秒，已含全部 references） |
| `pnpm run build:lib:host`（全量 host 面） | **exit 0**（1.7 分钟） |
| 产物含 SSiD 代码 | `apps/desktop/lib/main.js` 4 处命中、`apps/desktop-host/lib/index.js` 4 处命中 |
| `lib/main.js` 体积 | 472,871 字节（上游 463,186，**+9,685 字节**即本次改动内联后的体积） |
| 运行验证 | **未做**（需要构建出安装包并实机启动，本轮止于「产物可构建」） |
| 红线（思灵/生产 profile/`deepseek-harness`） | 全程零变化，见下 |

**验证环境**：独立 `git clone` 到 `.ssid-build/checkout`（未用 worktree，因此 `deepseek-harness/.git/worktrees` 不存在）。红线复核：思灵进程 7（基线 7）、生产内核 `0.1.5-rc.2`、生产 `node_modules` 490 条目、`deepseek-harness` 已跟踪文件改动为空、HEAD 仍为 `477b4f4205 (tag: dsh-v0.1.7-rc.2)`。

---

## 实机启动验证（2026-09-25）

**结果：fork 版成功启动，自绘标题栏在真实渲染进程里生效。**

启动命令（`apps/desktop` 下，隔离环境）：

```powershell
# 清 SSID_*（否则污染 fork 的环境判断）
Get-ChildItem env: | Where-Object { $_.Name -like 'SSID_*' } | ForEach-Object { Remove-Item "env:$($_.Name)" }
$env:DSH_HOME = 'H:\MaxNull\WorkStation\.ssid-build\dev-home'              # 必须显式设！
$env:DSH_DESKTOP_USER_DATA_DIR = 'H:\MaxNull\WorkStation\.ssid-build\dev-userdata'
$env:DSH_DESKTOP_OPEN_DEVTOOLS = '0'
pnpm run dev --skip-build
```

启动成功的标志（stdout）：

```
Office runtime versions and document round trips passed.
desktop development: DSH_HOME=H:\MaxNull\WorkStation\.ssid-build\dev-home
desktop development: userData=H:\MaxNull\WorkStation\.ssid-build\dev-userdata
desktop development: inspectors main=9229, renderer=9222, host=9230
dsh web: http://127.0.0.1:19387/?token=…
```

### 自绘标题栏的实机证据

通过 CDP 连渲染进程（`http://127.0.0.1:9222` → `dsh-app://app/`）读到注入节点：

```html
<div id="ssid-shell-titlebar" data-plugin="ssid-shell-titlebar"
     style="position:fixed; top:0; left:0; right:0; height:40px; z-index:2147483646;
            display:flex; align-items:center; justify-content:space-between;
            …; app-region: drag; user-select: none;">
  <span style="letter-spacing:2px; opacity:.92; pointer-events:none;">@deepseek-ai/dsh-desktop</span>
  <div style="display:flex; app-region:no-drag;">
    <button type="button" data-ssid-control="minimize" aria-label="minimize">─</button>
    <button type="button" data-ssid-control="maximize" aria-label="maximize">□</button>
    <button type="button" data-ssid-control="close"    aria-label="close">✕</button>
  </div>
</div>
```

实测 `getBoundingClientRect()`：**`{x:0, y:0, w:1280, h:40}`** —— 正好填满窗口宽度、高度与官方 `WINDOWS_TITLEBAR_HEIGHT` 一致。三个控件按钮与拖拽区（`app-region: drag` 已生效）都在。

**注意**：标题栏文字此时是 `@deepseek-ai/dsh-desktop` 而非「思灵」，因为 **dev 模式下 `app.name` 取 `package.json` 的 `name`，`productName` 只在打包时写入产物**。所以**品牌那一项要打包后才能验证**，dev 模式看不到。

### 实机验证抓出的三个运行时问题（编译期都发现不了）

| # | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| 1 | 主进程抛 `TypeError: Titlebar overlay is not enabled` | 上游 `main.ts:1001` 在 `dsh-desktop:windows-appearance` IPC 里调 `mainWindow.setTitleBarOverlay(...)`，而删掉 `titleBarOverlay` 后该 API 会抛错 | 删掉那次调用与不再需要的 `validColor`，参数改 `_color`/`_symbolColor` |
| 2 | Host 启动失败 `listen EADDRINUSE 127.0.0.1:19387` | `desktop-host` 的端口是**写死的** `--port 19387`，与测试中的官方桌面端实例冲突（与我这次改动无关，但会拦住任何并行启动） | 终止测试实例释放端口 |
| 3 | 56 个插件 `failed to import`（几乎全是 `dsh-client-*`），2 个 required 未激活导致 Host 失败 | 只跑了 `build:lib:host`，**没跑 `build:lib:client`** —— 客户端 `lib/` 产物不存在 | 跑完整 `pnpm run build`（含 client 面与 Web 前端，2.1 分钟，产出 343 个 client 产物） |

**教训（第 3 条对 fork 维护最关键）**：`--skip-build` 只在**完整构建过一次之后**才能用。`build:lib:host` ≠ 完整构建，client 侧插件全部依赖 `build:lib:client` 的产物。

### 隔离的教训（我自己的操作失误）

第一次启动时我只清了 `SSID_*`，**漏了 `DSH_HOME`** —— 而 `dev.ts` 读 `process.env.DSH_HOME ?? 默认隔离路径`，于是它用了**生产的 `C:\Users\MaxNull\.dsh`**。所幸它在 Host 启动阶段就失败了，审计后确认：`profiles/*` 最近 30 分钟零修改、生产 `profiles/ssid` 全部指标与基线一致。**结论：对 fork 的任何启动都必须显式设 `DSH_HOME` 与 `DSH_DESKTOP_USER_DATA_DIR`，不能依赖默认值。**

### 未能验证的

- **品牌名（`productName`）**：dev 模式不生效，需 `package:win:x64` 出安装包
- **Windows 通知三场景**：代码路径已构建进产物（`desktop-host/lib/index.js` 含 `ssid-notify`），但触发需要真实会话回合，未做端到端触发验证

---

## 改动 4：托盘菜单（待做，已登记）

思灵托盘共 **8 项**（`shell/main.mjs:1840-1877` 的 `buildTrayMenu`）。拆开看：**5 项官方已有等价实现**（只是位置不同），**3 项要新写**。实质是「换位置 + 补缺项」。

| # | 托盘项 | 思灵实现 | 官方壳现状 | 搬迁量 |
| --- | --- | --- | --- | --- |
| 1 | 显示思灵 | `win.show()` + `focus()` | **已有**：托盘 Open DeepSeek Harness | 0 |
| 2 | 退出 | `app.quit()` | **已有**：托盘 Quit | 0 |
| 3 | 重启思灵 | `relaunchShell()` | **已有**：dev 菜单 Restart App and Host（需挪到托盘、去掉 dev 限制） | 低 |
| 4 | 以纯净模式重启 | `restartDsh(!safeMode)`，带 `SSID_SAFE_MODE` | **已有等价**：崩溃恢复对话框「禁用第三方插件、备份 profile patch 并重启」 | 低～中（挪位 + 参数化 + 加常态开关状态） |
| 5 | 刷新 web 页面 | `mainView.webContents.reload()` | **已有但只在 dev 菜单** | 低（1 行） |
| 6 | 显示/解除执行中遮罩 | `toggleMask()`：注入页面 DOM、带口令分支、托盘项文案随状态切换（`syncMaskTray`） | 无 | **中**（注入模式已用 titlebar 跑通） |
| 7 | 重启 DSH 内核 | `restartDsh()`：只换内核，窗口与托盘不重建 | 无（官方的 Restart 是连壳一起） | **中高** |
| 8 | 截图引用 | `startScreenshotCapture()`：全屏冻结帧 → 逐屏框选浮层 → 裁剪 → 派发 CustomEvent 给 DSH UI | 无 | **高**（`main.mjs:1879` 起约 270 行） |

### 两处非显然的差异（决定实现方式）

- **第 7 项是思灵独有的分档，不是「官方已有换个位置」。** 思灵把重启分成「只换内核」（快，`restartDsh`）与「整壳重建」（`relaunchShell`）两项并列；官方只有一种 Restart App and Host。要做第 7 项，必须让壳能**停掉 Host 再起一个新的、而 Electron 与窗口不动** —— 那是 `apps/desktop/src/backend-controller.ts` 里 `DesktopHostProcess` 的职责，需先确认它能否被安全地单独停/起。
- **第 4 项在官方那边是恢复流程的一部分，非常态入口。** 官方只在崩溃恢复对话框里提供「禁用第三方插件」，思灵把纯净模式做成托盘常驻开关且能反向切回。搬迁需让恢复函数可被正常调用（不限崩溃场景），并加一个「当前是否纯净模式」状态驱动文案。**另有一处语义差异必须记住**：官方这个操作是**破坏性**的（备份 `cordis.patch.yml` 并清空，恢复需人工），思灵 `SSID_SAFE_MODE` 是**非破坏性**的（不动 profile、只少加载层，去掉环境变量即恢复）。本轮先接官方语义，菜单文案如实沿用上游的「禁用第三方插件、备份 profile patch 并重启」。

## fork 与官方版的端口互斥（已解决）

`apps/desktop-host/src/index.ts` 的 Host 启动参数原本是**写死的** `args: ['--no-open', '--port', '19387']`，与官方桌面端默认端口相同。后果：

- fork 与官方桌面端**不能同时运行** —— 后启动的那个会 `listen EADDRINUSE 127.0.0.1:19387`，Host 只报 `2 required plugins did not activate`（其中 `webserver` 是 required），然后弹「应用无法启动或已意外停止」。
- **实测（2026-09-25）**：一个官方桌面端实例（crash 报告 `app: @deepseek-ai/dsh-desktop 0.1.7-rc.1.20260924.1`、logs 落在 `%APPDATA%\@deepseek-ai\dsh-desktop`）在 fork dev 占用 19387 期间启动失败。它的 **Host 挂了但 Electron 主进程没退出**，于是系统托盘里留下**第二个鲸鱼图标**——用户从托盘看到两个图标，正是这么来的。（fork 用的是官方图标资源 `resources/tray-windows.ico`，两者外观一致。）

**修复**：

| 文件 | 改动 |
| --- | --- |
| `apps/desktop-host/src/index.ts` | `args: ['--no-open', '--port', '19387']` → `'19388'`，附注释说明为何不能用官方端口 |

**只有这一处** —— `grep 19387` 在 `apps/` 下另有的 4 处命中全在 `tests/`（crash 报告字符串与 fixture URL），不是运行时代码；壳侧的 Host URL 来自 ready 消息里的 `url` 字段，不硬编码端口。

**验证**：重建后产物 `desktop-host/lib/index.js` 含 `19388` 1 处、`19387` 0 处；重启后 fork dev 的 Host 监听 **19388**，19387 空出，两实例并存且无 crash。



### 建议推进顺序

1. **低风险五项**（1/2/3/4/5）—— 把官方的重启/刷新从 dev 菜单搬到托盘，接上纯净模式；一轮内可启动可回归
2. **遮罩**（6）—— 注入模式已在 titlebar 上验证过，同一套做法
3. **内核重启**（7）—— 先摸清 `DesktopBackendController` 的生命周期控制
4. **截图引用**（8）—— 最重，单独一轮

**每轮都保持「可启动 + 红线复核」的中间状态**，不攒大改动。




---

## 编译验证与修复（2026-09-25）

在独立 clone（`.ssid-build/checkout`，tag `dsh-v0.1.7-rc.2`）上应用全部改动后跑 `pnpm exec tsc -b apps/desktop/tsconfig.json apps/desktop-host/tsconfig.json`。

### 第一轮：6 个错误，全在 `apps/desktop-host/src/ssid-notify.ts`

`apps/desktop` 侧 **0 错误**（Electron 侧的 `host-process.ts` / `main.ts` / `ssid/*.ts` 类型全对）。

| 错误 | 原因 |
| --- | --- |
| `Property 'turn' / 'reason' / 'toolName' does not exist on type …` ×4 | `turn/end`、`approval/asked` 的事件类型**未被声明合并进来** |
| `'"…" and "approval/asked" have no overlap'` ×1 | 同上，`event.type` 的联合里根本没有这两个成员 |
| `Property 'userQuestions' does not exist on type 'Context'` ×1 | `ctx.userQuestions` 是 declaration merging 声明的，未 import 相应包 |

**根因**：DSH 的 `SessionEventMap` 与 `Context` 服务都靠 **declaration merging** —— 每个包在自己的源码里 `declare module`，**只有 import 了那个包，类型才可见**。我按思灵壳的 JS 代码（`kernel.get('userQuestions')`、`event?.type === 'turn/end'`）直译成 TS，运行时语义对，类型语义缺 import。

**修复**（3 个文件）：

| 文件 | 改动 |
| --- | --- |
| `apps/desktop-host/src/ssid-notify.ts` | 加 3 个 `import type {} from …`：`dsh-session`（`turn/start`/`turn/end`）、`dsh-user-approval`（`approval/asked`）、`dsh-user-questions`（`ctx.userQuestions`） |
| `apps/desktop-host/package.json` | `dependencies` 加对应 3 个 `workspace:*` |
| `apps/desktop-host/tsconfig.json` | `references` 加对应 3 个包路径（否则报 `TS6059/TS6307`：文件不在 rootDir 下） |

### 第二轮：4 个错误，同一根因

```
Property 'turn' does not exist on type 'UserMessage | { turn: number; reason: TurnEndReason; } | …'
```

**根因是我的写法**：我把 `event.type` 与 `event.data` **提前解构成局部变量**，于是 `event.data` 退化成「所有事件 data 的并集」，`if (type === 'turn/end')` 无法收窄它。

**上游的写法**是对 `event` 本身判断（例：`packages/compaction/compaction-basic/src/region.ts:588` 用 `if (event.type === 'turn/start')`，`packages/session-query/session-query/src/extraction.ts:31` 用 `switch (event.type)`）。

**修复**：`ssid-notify.ts` 改为逐分支判断 `event.type`，在分支内访问 `event.data.*`。

### 第三轮：通过

```
pnpm exec tsc -b apps/desktop/tsconfig.json apps/desktop-host/tsconfig.json
tsc exit=0   用时 3.4 秒
```

### 构建（tsdown）与一条上游次序约束

直接跑 `apps/desktop` 的 `bundle` 会失败，5 个错误全部是：

```
desktop bundle: lib\types\paths.js imports @deepseek-ai/dsh-home-paths, which the packaged application does not ship.
… anything else must be bundled, which requires its lib/ output to exist before this bundle runs (pnpm run build:lib:host).
```

**与本次改动无关** —— 报错文件（`paths` / `project-manager` / `keyboard` / `platform-view`）全是上游文件。原因是 `apps/desktop` 的 main bundle 会把 workspace 依赖**内联**进去，因此必须先有它们的 `lib/` 产物。上游的根脚本 `build:lib:host` 已经把次序串好：

```
tsc -b tsconfig.host.json && tsdown --env.DSH_BUILD_FACE host && pnpm --filter @deepseek-ai/dsh-desktop run bundle
```

**教训（对 fork 维护有用）**：`apps/desktop` 不能单独构建，任何改壳的验证都必须走 `pnpm run build:lib:host`。

### 更新后的 diff 计数

编译修复又增加了 2 个上游文件的改动（`apps/desktop-host/package.json` 与 `tsconfig.json`），详见文末「diff 面积实数」节的修订。

## 改动 5：自绘标题栏的四个缺陷（2026-09-25，用户实机反馈后修复）

用户实机截图报「标题栏有 bug」。逐项查明是**四个独立缺陷**，全部集中在自绘标题栏这一处：

| # | 现象 | 证据 | 根因 |
|---|---|---|---|
| 1 | 标题文字几乎看不见 | 计算值 `color: rgb(230,237,246)`、`background: transparent`，露出的页面底色 `rgb(249,250,251)` | 写了 `var(--dsh-text-primary,#e6edf6)`，而 **DSH 并没有这个变量**（页面样式表里 43 个 `--dsh-*` 变量不含它），于是永远落到照深色主题编的 fallback 上 → 白底白字，对比度 ≈ 1:1 |
| 2 | 侧栏「收起侧边栏」按钮点不动 | `document.elementFromPoint` 命中 `div#ssid-shell-titlebar`，判定 `clickable: false`；按钮位于 `x 12..40, y 6..34` | 注入层铺满整条 40px 且 `z-index: 2147483646`，把页面这个 `position:fixed` 的折叠按钮从命中测试里挤掉 |
| 3 | 三个窗口控件全是装饰 | 运行时 `typeof window.__ssidIpcInvoke === 'undefined'`；按钮存在（`buttonCount: 3`）但点击无反应 | `titlebar.ts` 调 `window.__ssidIpcInvoke?.(channel)`，但**没有任何 preload 暴露过这个名字**，可选链使失败完全静默 |
| 4 | 标题显示包名 `@deepseek-ai/dsh-desktop` | — | 传的是 `app.name`；dev 下它等于 package.json 的 `name`（包名），只有打包后的 `productName` 才是「思灵」 |

缺陷 3 最严重：最小化 / 最大化 / 关闭**全都点不动**，窗口只能靠任务栏操作。

### 修法

- **配色改用官方同源 token**：`--dsw-specific-sidebar-fill`（底）与 `--dsw-alias-label-primary`（字）——正是 `preload-windows.ts` 计算 caption 配色所用的同两个变量，同样过一遍 canvas 像素拿确定值（当前 Chromium 会把 `oklch()` 等新语法原样返回）。变量缺席时按 `data-ds-dark-theme` 退回近似色。
- **接回官方已有的颜色回传通道**：页面本来就通过 `dsh-desktop:windows-appearance` IPC 把**实测调色板**发给主进程（上游用它更新原生 `titleBarOverlay`）。删掉 overlay 后这段代码成了空转，现在改调 `applySsidTitlebarTheme()` 刷新自绘层——用户切主题或换皮肤时标题栏会跟着变，不必猜。
- **左侧 48px 完全让位**：注入节点根层 `pointer-events:none`；左段 48px 无背景、无事件（点击穿透到折叠按钮），右段承担底色、拖拽与标题文字。48 与侧栏品牌名同起点，标题因此与侧栏标题垂直对齐。
- **补 IPC 转发口**：新增不依赖 Electron 的 `ssid/titlebar-channels.ts` 作为主进程注册与 preload 转发的**共用白名单**（两边共一份名单才不会各自漂移）；`preload-app.ts` 暴露 `__ssidIpcInvoke`，只放行 `ssid:title:` 三条通道。
- **产品名固定**：新增 `ssid/product.ts` 的 `SSID_PRODUCT_NAME`（= 思灵），标题栏与 Windows 通知共用；`app.name` 保持不动（Electron 由它派生默认 userData 目录，`main.ts` 有注释说明）。

### 实机验证（修复后，2026-09-25）

| 项 | 实测值 |
|---|---|
| 配色 | `mainBg: rgb(249,250,251)` + `mainColor: rgb(15,17,21)` — 浅底深字 |
| 让位 | `gutter.width=48`、`pointerEvents:none`、`toggleClickable: true`（命中测试落到页面折叠按钮内部的 svg，不再是本注入层） |
| 转发口 | `typeof window.__ssidIpcInvoke === 'function'` |
| 产品名 | 标题栏文字 = `思灵` |
| 拖拽 | `-webkit-app-region: drag` 在主段上 |
| **控件可用** | 直接调 `__ssidIpcInvoke('ssid:title:toggle-maximize')` → `resolved`，窗口 `1296×828 → 2560×1392`；随后**点按钮** → `2560×1392 → 1296×828`（还原），`clickError: null` |

转发口返回 `ipcRenderer.invoke` 的 Promise（而非用 `void` 丢弃），调用方因此能感知失败。**注意**：先前用 `void` 丢弃 Promise 的那一版，点击后窗口毫无反应、日志也没有任何线索（无「handler 未注册」报错，因为 invoke 确实发出且 handler 存在）——是本次排查卡住的主因。该版本产物已被后续构建覆盖，未能回溯定位差异；保留返回 Promise 的写法，它既是更正确的实现，也让这类静默失败不再可能。

## 改动 6：标题栏完整迁移 + 思灵插件集接入（2026-09-25）

### 背景

用户实机截图又问了三件事：全屏图标不对、dev / DSH 版本信息不见了、自定义按钮全无。查明是**两层缺失**：

1. **壳侧**：自绘标题栏只是最小骨架（产品名 + 3 个窗口控件），原壳其余内容一条没搬。
2. **环境侧**：fork dev 的 `desktop` profile 只装了 `dsh-base` + `dsh-web-app`，**一个思灵插件都没有** —— 即使画出按钮也没有接收方。

### 壳侧：按原壳清单逐项还原

| 原壳内容 | fork 实现 |
|---|---|
| 思灵标记 + `思灵` 字样 | 沿用原壳同一份 base64 资源 |
| `shell-mode` DEV 徽章 | `shellMode` 选项，仅 `!app.isPackaged` 时传入，正式版不出现 |
| `dsh-ver` 胶囊 | 优先读页面 `[class*="buildVersion"]`（本地构建带 commit，更准），退回 `app.getVersion()` |
| 会话管理 / 插件中心 / 底栏 / 侧栏 | 4 个按钮，`data-ssid-action` 标记，图标与顺序照抄原壳 |
| 悬浮球开关 | 第 5 个按钮，开启时图标点亮为 `#4FC3F7` |
| 最大化 / 还原双图标 | `resize` 事件里按 `outerWidth/outerHeight` 与屏幕可用区比对 |
| `window.__SSID_SHELL__` | `dom-ready` 时注入；quick-toolbar 按它决定壳适配（隐藏被标题栏接管的原按钮、悬浮球受控） |

**接线方式改了**：原壳标题栏是独立 BrowserView，按钮必须 `IPC → 主进程 → 往页面 dispatchEvent` 绕一圈；fork 的标题栏是注入进页面的 DOM，**与插件同处一个上下文**，直接 `window.dispatchEvent(new CustomEvent('ssid:titlebar', { detail }))` 即可。派发的 detail 与 `dsh-quick-toolbar` 的监听表逐一对齐（`session-manager` / `plugin-center` / `bottom` / `sidebar` / `quick-toolbar-toggle` / `open-sea-skin`）。

悬浮球状态也不再走 IPC 下发，改读 quick-toolbar 的 host 状态接口 `/quick-toolbar/api/state` —— 该插件已把持久态从页面 localStorage 迁到 host（动态端口下 localStorage 跨重启必丢）。

### 环境侧：插件集零拷贝接入

思灵插件集**早已适配 0.1.7**，就在 `.ssid-iso-test/profiles/ssid-dev`（19 个 `file:./vendor/*` 依赖 + 24 个 bundles + 362 行版本 pin）。接入即把 desktop profile 的配置对齐过去，实体走 junction：

| 文件 | 处理 |
|---|---|
| `package.json` | 采用 ssid-dev 的 56 个依赖与 24 个 bundles；`name` 保持 `dsh-profile-desktop` |
| `cordis.patch.yml` | 官方 4 条 + 思灵 1 条合并（思灵在后，同 id 时后者生效） |
| `pnpm-workspace.yaml` | 直接复制（含把 DSH 全家 pin 到 `0.1.7-rc.2` 的 overrides，是隔离环境能跑起来的关键） |
| `pnpm-lock.yaml` / `.npmrc` | 一并复制，避免 DSH 判定未安装而触发重装（那会写进 junction 目标） |
| `vendor` / `node_modules` | **junction** 指向 ssid-dev，零拷贝共用实体 |

官方原配置备份在 `desktop/_backup-official/`，随时可还原。两个源 profile（`ssid-dev`、生产 `ssid`）均未被修改。接入脚本：`.ssid-build/link-ssid-plugins.mjs`。

### 实机验证（接入后）

| 项 | 实测值 |
|---|---|
| 壳标记 | `window.__SSID_SHELL__ === true` |
| 品牌区 | `["img(思灵标记)", "span:思灵", "span:DEV", "span:DSH 0.1.7-rc.2"]` |
| 自定义按钮 | 5 个全部就位（`session-manager` / `plugin-center` / `bottom` / `sidebar` / `qt-float`） |
| 窗口控件 | 3 个；最大化图标随窗口状态切换（还原态实测为 `true`） |
| 布局 | 标题栏 40px、左侧让位 48px；底色 `rgb(249,250,251)`、文字 `rgb(15,17,21)` |
| 插件加载 | 24 个 bundles 全部生效：日志有 `[genui] client active`、`[dsh-sidebar-qa] applied`、`registered 2 tabs in DSH's own right sidebar`，加载列表含 `dsh-quick-toolbar` / `dsh-memory` / `dsh-better-sidebar` 等 |
| **按钮真的能用** | 点「插件中心」派发 `ssid:titlebar [plugin-center]`；面板浮层 `.pc-overlay` 出现/消失双向验证通过，面板显示「已安装 207 · 有更新 0 · 失效 0」 |

两个源 profile 的时间戳在接入前后未变（生产 `09-25 22:17:25`、`ssid-dev` `09-25 21:55:18`），确认接入只动了 fork 那份。

**两处待微调**：

1. 品牌胶囊显示 `DSH 0.1.7-rc.2`（取自主进程 `app.getVersion()`），而页面侧栏标的是本地构建的完整版本 `0.1.7-rc.2-477b4f4-dirty`。注入脚本里读页面 `[class*="buildVersion"]` 的兜底没命中 —— 该类名或出现时机与假设不符，待对齐。
2. `dsh-better-sidebar` 有一条 `agent-opens connection failed; stopping reconnect loop` 警告；功能未受影响，待查是否与 fork 缺少壳侧桥接有关。

## 改动 7：profile 名可配 + 会话根跟随（2026-09-25）

### 为什么

自建壳的 profile 是 `ssid`（目录 `$DSH_HOME/profiles/ssid`、会话根 `sessions-ssid`），官方桌面端固定 `desktop`。两者读不到对方的数据 —— 直接换壳的话，用户现有会话、设置与插件配置会全部「消失」。

### 改了什么

| 文件 | 改动 |
|---|---|
| `apps/desktop/src/ssid/profile-name.ts` | 新增 `resolveProfileName()`（默认 `ssid`；`SSID_PROFILE_NAME` 可覆盖；拒绝路径分隔符与 `.` / `..` / `node_modules`）与 `sessionsRootDirName()` |
| `apps/desktop/src/paths.ts` | `resolveDesktopPaths()` 用解析结果替代硬编码 `'desktop'`（官方两处硬编码之一） |
| `apps/desktop-host/src/profile-name.ts` | 新增 Host 侧副本 —— 两个包之间没有依赖边，拿不到同一份实现，注释已标明必须与 Shell 侧逐字同步 |
| `apps/desktop-host/src/index.ts` | `runProfile({ profile })` 用解析结果（官方两处硬编码之二） |
| profile `cordis.patch.yml` | 追加 `session-persistence-jsonl` 的 `root: !!js dshHomePath('sessions-ssid')` |

**会话根为什么要单独配**：DSH 把它写死在 `packages/bundle/base/cordis.patch.yml:133`（`dshHomePath('sessions')`，**不带 profile 后缀**），并不跟随 profile 名。自建壳是在 profile patch 里覆盖成 `sessions-ssid` 的，这里沿用同一手法。校验规则与自建壳 `shell/lib/profile-name.mjs` 同源。

### 已知限制

- `dsh-ssid-panels` 的「会话存储隔离」开关依赖 `SHARED_ROOT` / `ISOLATED_ROOT` 常量与壳层重启通道（`ctx.get('ssid.shell.restart')`，由自建壳 `main.mjs` 注入）。fork 侧两者都还没有，该面板的开关与「载入原 DSH 会话」按钮**可能不可用** —— 待实测。
- 会话根目前写死 `sessions-ssid`：改 `SSID_PROFILE_NAME` 时 profile 目录会跟随，会话根不会。若将来需要完全跟随，得让 patch 里的 `!!js` 读环境变量（可行性未验证）。

## 改动 8：第一批迁移（2026-09-25）

用户实机反馈后定了「先列清单、再定目标、一次验收」的做法。清单分两批，第一批是外壳行为类五项：

| 项 | 实现 | 验证方法 |
|---|---|---|
| profile 名可配、默认 `ssid` | 见改动 7 | 启动后看是否读到 `~/.dsh/profiles/ssid` |
| 会话根跟随 profile 名 | profile patch 覆盖 `session-persistence-jsonl.root` | dev 实测：`sessions-ssid` 已被 DSH 写入 `session.v4.jsonl.zstd` |
| 安全模式改为非破坏 | Host 按**层**过滤（只留 `@deepseek-ai/`）+ 托盘项换成「以纯净模式重启」 | 重启后 `cordis.patch.yml` 仍在、数据不动 |
| 托盘：重启 DSH 内核 | `backend.stop()` + `reconcileBackend()`（不重启 Electron 壳） | 点菜单后内核 PID 变化、页面重新加载 |
| 屏幕遮罩 + 全局快捷键 | 新增 `apps/desktop/src/ssid/mask.ts`，与自建壳同语义 | 按 `Ctrl+Alt+M` 或点托盘项；长按 2 秒解除 |

### 三处关键实现细节

- **安全模式的层过滤不能逐行做**（沿用思灵 `kernel.ts` 的结论）：用户 patch 可能只是改官方行的 config，那种坏配置照样生效，必须整层丢。
- **遮罩必须在同一页面内注入**：能真正模糊到下层内容的只有同页面 `backdrop-filter`，跨窗口一律无效（自建壳已实测排除 Windows acrylic、透明窗口、独立窗口三条路）。代价是依附页面，所以页面重载后按状态补回、解除信号走 `console-message` 回传。
- **官方那一版破坏性的「禁用第三方插件」保留**，现在只由崩溃恢复对话框使用；托盘换成非破坏的纯净模式重启（备份并清空 patch 的语义仍在，只是不再由托盘触发）。

### 实机验证（第一批）

| 项 | 实测 |
|---|---|
| profile 名 | `dev-home/profiles/ssid` 被读取（原名 `desktop` 已改名） |
| 会话根 | `dev-home/sessions-ssid` 已被 DSH 写入 `session.v4.jsonl.zstd` —— patch 生效 |
| 安全模式 | 编译通过；重启路径见托盘项（`--ssid-safe-mode`） |
| 重启内核 | 编译通过；`backend.stop()` + `reconcileBackend()` |
| **遮罩 + 热键** | 发 `Ctrl+Alt+Shift+M` → 页面出现 `#ssid-shell-mask`（`z-index 2147483647`、`backdrop-filter: blur(18px)`、文案与长按按钮齐全、`window.__ssidMaskPrompt` 为 function）；再按一次 → 节点消失 |

**顺带发现并被兜底覆盖**：默认热键 `Ctrl+Alt+M` 与正在运行的思灵冲突，注册失败。代码只警告、保留托盘入口，没有崩 —— 兜底路径得到了真实验证。

**安全模式实测**（`SSID_SAFE_MODE=1` 启动）：

```
ssid: 纯净模式（SSID_SAFE_MODE=1）：24 层中保留官方 2 层，丢弃 22 层第三方与 6 条 profile patch
```

按层过滤生效（24 → 官方 2 层），且 `cordis.patch.yml` 原样保留（1121 字节）—— **非破坏性得到实证**；日志里也不再出现第三方插件的加载行。

**新增一处产品改进**：`ssidNotifyConfigPath()` 支持 `SSID_NOTIFY_CONFIG` 覆盖配置路径。并行实例（隔离测试）因此能指向独立配置，免得与正在运行的思灵抢同一份开关与全局热键。dev 环境现用 `.ssid-build/dev-ssid-config/notify.json`。

## 改动 9：截图引用（2026-09-25，第二批）

用户在清单里点名要这一项（自建壳里约 270 行主进程代码 + 624 行浮层页面）。

### 一个关键发现省掉了大半工作

**「插进输入框」那一步不需要移植**：自建壳是确认后派发 `ssid:screenshot` 事件，由 `dsh-capture` 插件监听并插入 composer —— 而那个插件已经在 fork 的 profile 里加载了。所以本模块只负责到「派发事件」为止，插件一行都不用改。

### 落地的文件

| 文件 | 来源与改动 |
|---|---|
| `apps/desktop/resources/screenshot.html` | 从自建壳原样复制（624 行，自包含，无外部引用） |
| `apps/desktop/src/preload-screenshot.ts` | 新建：照抄自建壳 `screenshot-preload.cjs` 的三个方法，桥名仍为 `ssidCapture` |
| `apps/desktop/src/ssid/screenshot.ts` | 新建：移植 188 行主进程逻辑，TypeScript 化并改用依赖注入式的主窗口取值器 |
| `tsdown.config.ts` | preload 列表加 `preload-screenshot`；`onSuccess` 里把 `resources/screenshot.html` 复制进 `lib/` |
| `scripts/electron-builder-config.mjs` | `files` 加 `lib/screenshot.html` 与 `lib/preload-screenshot.cjs` |
| `apps/desktop/src/main.ts` | 主窗口创建时装配；`Control+Shift+A` 注册为全局热键 |

### 沿用的三条实测结论（别当成可化简的细节）

1. **逐屏单独请求抓帧**：`desktopCapturer` 单次调用的 `thumbnailSize` 作用于全部源，两屏会被各自缩放变形，所以每屏按自身物理分辨率请求一次。
2. **全屏覆盖不用 `fullscreen`**：它与构造尺寸互相覆盖，inner 会出现怪异尺寸导致坐标错位；改用普通窗口 + 创建后 `setBounds` 二次钉位 + `alwaysOnTop('screen-saver')`。
3. **先摘 `session` 再逐个 destroy**：destroy 会同步触发 `closed` 事件重入本模块，若 `session` 仍挂着，递归层会把它置空、外层再访问就抛异常（自建壳 2026-08-23 实测：confirm 后崩溃导致截图进不了输入框）。

配置沿用 `~/.ssid/screenshot.json`（`hideWindow` / `hotkey`），与现装思灵共用一份。`SSID_SCREENSHOT_CONFIG` 可覆盖路径（与通知配置同模式），供并行实例避让全局热键。

### 实机验证（端到端）

发 `Ctrl+Shift+Alt+A` → 两块屏各出现一个 overlay（CDP target 从 1 个变 3 个，两个 `screenshot.html`）→ 在 overlay 上模拟拖拽框选 → Enter 确认 → 主窗口收到事件：

```
eventCount: 1
uid: shot-1790359549347-4dund5b6
sourceLength: 375430          ← 375 KB 的真实 PNG
annotatedLength: 0            ← 只框选未标注，符合「空标注不传编辑图」
sourcePrefix: data:image/png;base64,iV
dataImages: 3                 ← 图已进输入框
```

**这一步顺带验证了「不移植插件」的判断**：壳只负责派发 `ssid:screenshot`，图由已在 profile 里的 `dsh-capture` 插件插入 composer —— 插件一行都没改。

## 改动 10：自动更新改指思灵发布源（2026-09-25）

### 为什么必须改

官方 feed 指向 DeepSeek 自己的更新通道 —— 原样保留的话，某次自动更新会把思灵**整个换成官方桌面端**（壳、品牌、插件全部被覆盖）。

### 调研结论

| 环节 | 官方做法 | 思灵可用什么 |
|---|---|---|
| provider | `generic`（写死） | 改 `github`，或自备 HTTPS 静态目录继续用 `generic` |
| 发布源 URL | 环境变量 `DOWNLOAD_TEST_ORIGIN`（test）/ 写死 `fixedOrigin`（production） | GitHub Releases（`Max-Null/seek-soul-in-darkness`） |
| 上传 | 腾讯 COS SDK + `secretId`/`secretKey` | GitHub Release 资产，`electron-builder` 自动产出 `latest.yml` 与安装包 |
| 签名 | EV 证书，私钥在官方 CI（`DSH_DESKTOP_WINDOWS_CER_FILE`） | **不可复用**：签名意味着「持有私钥者签」，且主体名会是 DeepSeek 而非思灵 |
| macOS feed 校验 | `macos-app-update-config.mjs` 强制要求 `generic` + `nightly` | **未处理**：打 macOS 包会在那里明确失败；思灵当前只做 Windows |

### 改动

`scripts/electron-builder-config.mjs` 的 `publish`：**没配 COS 时用 github provider**（思灵构建），配了 COS 时保持 generic（官方自身流程）。同时保留 `update === undefined ? null` 之外的分支 —— 原来没 COS 就是 `publish: null`（完全不配更新），现在改为指向思灵的 GitHub Releases。

**签名决定（用户 2026-09-25 拍板）**：不买证书，接受 SmartScreen 拦截。理由是不收费项目自贴证书不划算；`publisherName` 在无证书时为 `undefined`，更新流程应当仍能走通（**未实测**）。

### 未验证的部分

- **完整的更新闭环**（打包 → 发布 → 旧版检测到新版 → 下载 → 安装）需要真实发布一版并装旧版，成本过高，本轮未做。
- **未签名包能否通过 `electron-updater` 的 NSIS 校验**：代码里 `publisherName` 为 `undefined` 时应当跳过校验，但**没有实测证据**。

## 改动 11：品牌收尾（2026-09-25）

用户看到任务栏/开始菜单仍显示「DeepSeek Harness」与 DSH 图标，问「这些为啥没变」。查证后是**两件不同的事**：

### 一、那两处不是 fork（不用改）

```
DeepSeek Harness.lnk  ->  H:\MaxNull\WorkStation\.dsh-desktop-test\install\DeepSeek Harness.exe
思灵.lnk              ->  C:\Users\MaxNull\AppData\Local\Programs\ssid-shell\思灵.exe
```

第一条是**验证「官方桌面端承载思灵插件」时装的隔离测试副本**（见 `docs/决策/2026-09-25-官方桌面端承载思灵插件实测.md`）。它是一个**独立安装的应用**，换 fork 的代码不会影响它 —— 就像改 VS Code 源码不会让已装的 VS Code 变样。

### 二、fork 自己的品牌确实没做完（本次补齐）

| 项 | 之前 | 现在 |
|---|---|---|
| `resources/icon.png` | DSH 图标（1104×1104） | 思灵图标（512×512） |
| `resources/icon-windows.png` | DSH 图标（1024×1024） | 思灵图标（512×512） |
| `resources/tray-windows.ico` | DSH 的（15 KB） | 思灵的 `icon.ico`（270 KB，多尺寸） |
| `src/locale.ts` 应用名文案 | 「DeepSeek Harness」26 处 | 全部换成「思灵」 |
| `main.ts` 关于面板 | `applicationName: 'DeepSeek Harness'` | `SSID_PRODUCT_NAME` |
| `electron-builder-config.mjs` 协议名 | `protocols: [{ name: 'DeepSeek Harness' }]` | `{ name: '思灵', schemes: ['dsh'] }` |
| **产物名（4 个打包脚本）** | 硬编码 `'DeepSeek Harness.app'/'.exe'` | **改为从 `DESKTOP_PRODUCT_NAME` 单一来源取** |

**产物名那几处是必须改的**（不只是好看）：`smoke-packaged-runtime.ts`、`package-target.ts`、`package-macos.ts`、`development-app.ts` 都按名字去拼产物路径，`productName` 改成「思灵」后它们会**找不到文件**。因此把产品名抽成 `electron-builder-config.mjs` 导出的 `DESKTOP_PRODUCT_NAME`，四处全部 import 它 —— 以后改名只改一处。

**`appId` 无需改代码**：它来自构建时环境变量 `DSH_DESKTOP_APP_ID`（`resolveDesktopAppId(env)`），思灵打包时传 `com.maxnull.ssid` 即可。

### 仍未做

- **`resources/icon-macos.png` 还是 DSH 的**：思灵 `shell/assets/` 下只有 `icon.ico` / `icon.png` / `tray.png`，没有 macOS 版图标。思灵当前只做 Windows，先留着。
- **dev 模式不注册到系统**：`pnpm run dev` 是源码裸跑，任务栏/开始菜单里的条目来自**已安装的应用**。要让系统显示「思灵」，必须走 `package:win:x64` 打包安装 —— 这正是遗留项 ②。

### 一次自己做出来又自己修掉的回归：托盘图标

换图标时我把思灵的 `shell/assets/icon.ico` 直接复制成了 fork 的 `tray-windows.ico` —— **托盘图标变成空白**。用 Electron 实测：

```
icon-windows.png     isEmpty=false  512x512    ← 能加载
tray-windows.ico     isEmpty=true   0x0        ← 加载失败
icon-macos.png       isEmpty=false  1024x1024
```

**思灵的 `icon.ico` 是单尺寸 256×256（270400 字节，约等于未压缩的 256×256×4 BMP），Electron 读不了它**；而 DSH 原来的 `tray-windows.ico` 只有 15 KB、多尺寸 —— 那才是托盘该有的形态。思灵另有 `tray.png`（32×32），那才是它的托盘图标。

**修法**：用 Electron 的 `nativeImage.resize()` 从 `tray.png` 生成多尺寸 ICO（16/24/32/48/64/128/256，内嵌 PNG），回读校验 `isEmpty=false`。生成脚本一次性的，放在 `.ssid-build/gen-tray-ico.cjs`。

**教训**：**换图标不能只看文件存不存在，要用 `nativeImage.createFromPath().isEmpty()` 验一遍** —— 加载失败时 Electron 不报错，只是画一片空白。

## 改动 12：macOS 侧对齐（2026-09-25，用户提醒后补）

用户提醒「mac 端在 GitHub 上会自动打包」—— 这是一条硬约束：思灵有 `build-mac.yml`（`macos-latest`，arm64 + x64），fork 迟早要接上同一条链。检查后发现两处会直接卡住 mac 打包。

### 一、`macos-app-update-config.mjs` 会拒绝 github provider

这是**改动 10 的直接后果**：我把 `publish` 改成 github provider 时留了一句话「macOS 侧的 feed 校验目前只认 generic，打 macOS 包会在那里失败」—— 用户提醒后把它落实了。

该文件原本强制 `provider === 'generic' && channel === 'nightly'`，现在改成支持两种来源（discriminated union）：

- `generic`（官方自身）：`{ provider, publicUrl }` → 写 `url` + `channel: nightly`
- `github`（思灵）：`{ provider, owner, repo }` → 写 `owner` + `repo`

四个导出（`resolveMacOSAppUpdateFeed` / `createMacOSAppUpdateConfig` / `writeMacOSAppUpdateConfig` / `verifyMacOSAppUpdateConfig`）签名不变，调用方零改动；`verifyMacOSAppUpdateConfig` 按 provider 分支比对。

**连带改动**：`macos-app-update-config.d.mts` 的两个 interface 改成 union type；`tests/macos-app-update-config.spec.ts` 里原本断言「github provider 应抛错」的用例必须调整（否则测试红），并新增一条 GitHub provider 的端到端用例（解析 → 写盘 → 校验）。

**验证**：`pnpm exec vitest run apps/desktop/tests/macos-app-update-config.spec.ts` → **7 tests passed**。

### 二、mac 图标

`resources/icon-macos.png` 原来还是 DSH 的。思灵的 mac 图标在 `shell/assets/mac-icon.iconset/`（10 个尺寸），取其中的 `icon_512x512@2x.png`（1024×1024）换上。**fork 的四个图标至此全部是思灵的**。

### 三、签名：回退 ad-hoc

`electron-builder-config.mjs` 的 `mac.identity` 原本是 `macOSSigning?.signingIdentity`，没配签名环境时是 `undefined`，而同一段里还有 `forceCodeSigning: true` —— 可能直接失败。改为 `?? '-'`，即**没配证书时退回 ad-hoc 签名**，与自建壳 mac 打包的做法一致：本地与 CI 都不需要 Apple 开发者账号也能出包，只是分发时会被 Gatekeeper 拦。这与用户对 Windows 侧的取舍一致（不买证书、接受拦截）。

### 仍未做

- **fork 没有 CI 配置**：`ssid-shell-fork` 里没有 `.github/workflows/`。思灵现成的 `build-mac.yml` 将来要改指向 fork 的构建路径（它现在钉的是 `dsh-v0.1.2-rc.1`，也要跟着升）。
- **ad-hoc + `hardenedRuntime: true` 未实测**：两者能否共存、mac 包能否真正产出，都要跑一次 mac 打包才知道 —— 而本机是 Windows，做不了，得等 CI。

## 改动 13：让位宽度改为动态测量（2026-09-25，用户提问引出）

### 用户的两个问题

1. **收起侧栏后整个侧边栏都没了**，是 DSH 桌面端的设计吗？
2. **DSH 有自己的「标题栏」和功能**，我们做了自己的标题栏，原来的怎么处理？直接屏蔽不合适（可能缺功能，DSH 更新后新增功能也不会知道）。

### 实测答案

**问题 1**：是 DSH 的原生行为。收起后 `sidebarCol` 的 `width` 变成 `0px`、`overflow: hidden`，内容整体归零。用户图 1 里那个「窄图标列」是 **DSH 0.1.5-rc.2（生产思灵）** 的样子，我在 fork（0.1.7-rc.2）里没能复现出同样的窄栏 —— 两者差异来自 DSH 版本还是插件，**我没有查到确证**。

**问题 2 挖出了一个真缺陷**：探测 caption 区（顶部 40px）时发现，属于页面的可交互元素**不止一个**：

| 元素 | 位置 | 何时出现 |
|---|---|---|
| 收起/打开侧边栏按钮（`hHd-Xa_toggle`） | x=12..40 | 始终 |
| **新建会话按钮（`hHd-Xa_newSession`）** | **x=48..76** | **侧栏收起时** |
| 一个空容器 | x=84..182 | 始终（无内容、非交互） |

而我原来的让位宽度**写死 48px** —— 侧栏展开时够用（那时只有第一个按钮），**侧栏收起时就会盖住「新建会话」**。这正是用户担心的那类问题：**壳写死假设，DSH 一变就出错**。

### 修法：动态测量而非写死

注入脚本改为**测量 caption 区内页面可交互元素的最右边界**，让位 = `max(48, 最右 + 8)`：

- 只认 `button, a, input, select, textarea, [role="button"], [tabindex]` —— 那个空容器不算
- `MutationObserver` 监听 DOM 变化后重测（侧栏收起/展开会把按钮挪进挪出）+ `requestAnimationFrame` 防抖
- 下限 48 保证一个页面元素都没有时也留出折叠按钮的空间

**这样 DSH 以后往 caption 区加按钮也不会被盖住** —— 这是对「更新后新增功能不知道」那条担忧的正面回答：不靠记清单，靠测量。

### 关于「DSH 的标题栏功能」这件事的完整回答

- **`titleBarOverlay` 本身只提供**：原生窗口按钮（右上角三个）+ 可拖拽区。**它没有别的「功能」**，所以自绘替换它不会丢东西 —— 拖拽由我的注入层补上（`-webkit-app-region: drag`），窗口控件由 `ssid:title:*` 三条 IPC 补上。
- **真正的功能在页面里**（caption 区的元素）—— 已发现两个，且都通过让位保留，没有被屏蔽。
- **判断依据**：凡是「页面自己画的」就保留、让位；凡是「原生提供的」才由我们替换。这条界线在 `titlebar.ts` 的文件头注释里写明了。

### 关键运维教训：fork 是开发副本，checkout 才是运行副本

**本次弯路的根因**：一直在改 `ssid-shell-fork/`，而 `pnpm run dev` 实际运行的入口是 `.ssid-build\checkout\apps\desktop`：

```
electron.exe ... --user-data-dir=...\.ssid-build\dev-userdata H:\...\.ssid-build\checkout\apps\desktop
```

两份是**独立副本、非链接**（`Get-Item` 的 `LinkType` 为空），改 fork 不影响运行中的实例。

- 查两边差异：`git diff --no-index --stat <fork>\apps\desktop\src <checkout>\apps\desktop\src`
- 查运行的是哪一份：看 electron 进程命令行末尾的入口路径
- **改完必须把改动文件复制到 checkout 再重建**：Electron 入口是 `apps/desktop/package.json` 的 `main = lib/main.js`，因此 `dev --skip-build` 不会替你编译，漏了这一步就会对着旧代码反复调试

### 另一个操作坑：按命令行关键词批量杀进程会自杀

用 `Where CommandLine -like '*ssid-build\checkout*'` 定位要杀的进程时，**过滤模式本身就在执行这条命令的进程命令行里**，于是匹配到自己 → runner 被杀，报 `subprocess-local: Windows Job runner exited with exit code 4294967295`。定位目标进程应改用「记录 PID」或父进程链，不要用会出现在自身命令行里的模式字面量。同理，`node.exe` 里既有本环境进程也有**思灵本体**的子进程（`ssid-shell\resources\node` + `.dsh\profiles\ssid`），关键词匹配极易误伤，杀之前务必逐个核对完整命令行。

## 改动 14：测试跟进 + 两个真实缺陷（2026-09-25）

改完品牌（改动 11）与动态让位宽度（改动 13）后跑全量测试：`apps/desktop/tests/` 一度
**112 个失败**，最终收敛到**全绿**（111 文件 / 1279 用例通过、29 skipped）。过程中暴露的
两个问题**不是测试问题，是产品缺陷**。

### 一、112 个超时的真凶：`installSsidTitlebar` 读了 mock 没有的 `webContents.isLoading`

**现象**：`main-startup.spec.ts` 整个文件 5s 超时，全部卡在 `await harness.preparing.promise`。

**定位方法（值得记牢）**：`main.ts:1399` 有一条**内建诊断通道** —— 只要设了
`DSH_DESKTOP_DIAGNOSTIC_FILE`，`main()` 抛错时会把堆栈写进那个文件。设上环境变量再跑一次
测试，一次拿到：

```
TypeError: window.webContents.isLoading is not a function
    at installSsidTitlebar (src/ssid/titlebar.ts:449:27)
    at createWindow (src/main.ts:289:5)
    at createMainWindow (src/main.ts:1127:20)
    at main (src/main.ts:1341:16)
```

**根因**：`main()` 的 catch 吞掉异常后走 `reportFatal`，而 `reconcileBackend()`
（`preparing.resolve()` 所在、`main.ts:1384`）**排在它之后** —— 于是一处抛错，所有等
`preparing` 的用例一起超时。**112 个失败只有一个根因**。

**修法**：给测试的 FakeWindow 补 `isLoading` 与 `executeJavaScript`。**不是**改生产代码 ——
两个都是真实 Electron API，`installSsidTitlebar` 用它们是正确的（`isLoading()` 决定要不要
立刻注入，否则只能干等 `did-finish-load`）；穷举式的 electron mock 该跟上。
`main-startup.spec.ts` 与 `welcome-startup.spec.ts` **各有一份 FakeWindow**，都要补。

同一轮还补了 `main-startup.spec.ts` 的 `globalShortcut` mock、把 `titleBarOverlay` 的断言
改成"不该有该属性"、把 `setTitleBarOverlay` 的断言换成 `executeJavaScript`（自绘标题栏靠注入
脚本跟随调色板），并清掉因此悬空的 `WINDOWS_TITLEBAR_HEIGHT` import。

### 二、`disableThirdPartyPlugins` 一条文案服务两个相反语义

`locale.ts` 的这个 key 被两处消费，而这两处的操作**语义相反**：

| 消费方 | 操作 | 语义 |
|---|---|---|
| `fatal-recovery.ts:83` | `main.ts` 的 `disableThirdPartyPlugins()` | **破坏性**：备份并清空 profile patch，恢复要人工处理 |
| `tray.ts:64` | `main.ts` 的 `restartInSafeMode()` | **非破坏性**：只少加载第三方层，数据一律不动 |

改动 8 把托盘项换成非破坏的 `restartInSafeMode` 后，我顺手把这条文案改成「以纯净模式重启
（数据不动）」—— 于是**崩溃恢复对话框也说数据不动，但它实际上会清空 patch**。这是会误导用户
的错配，不是文案偏好问题。

**修法**：拆成两个 key。`disableThirdPartyPlugins` 恢复原文案（`禁用第三方插件、备份 profile
patch 并重启`）给恢复对话框，新增 `restartInSafeMode` 给托盘，`tray.ts` 换过去。
`main-startup.spec.ts` 那条 "offers all recovery choices" 的断言本来就期望原文案，于是自然恢复。

### 三、全局快捷键不该能拖死启动

`globalShortcut.register(...)` 原来裸写在 `main()` 里。它抛错（或键位被占、或配置读不出来）会
**直接中断启动** —— 而快捷键只是便利功能，托盘里每一项都有等价入口。

**修法**：整段包进 try/catch，失败只 `console.warn` 降级。这是刻意选择的**宽进**：快捷键不是
启动前提，不该按"配置错误要响亮失败"处理。

### 四、有意的行为偏离：未签名构建也写更新 feed

官方的 `macos-signature.spec.ts` 断言未签名 Windows 构建 `publish: null`（不携带更新元数据）。
思灵不买签名证书、构建恒为 unsigned，若沿用它就没有 `app-update.yml`，**自动更新整条链失效**。

因此改为未签名分支也写 github provider，并**同步改了那条断言**（测试名也跟着改：
`isolates unsigned Windows artifacts and still points them at the GitHub release feed`）。

**代价说明白**：更新包没有签名校验。这是「不签名」这一决定本身的既有代价，不是本次新增的 ——
用户已知情并接受 SmartScreen / Gatekeeper 拦截。产物依旧隔离在 `unsigned-artifacts` 目录，
不会混进正式产物。

### 五、修正改动 10 里一句写错的结论

改动 10 把 `publish` 改对了，但**注释和记录都写错了原因**：当时写成「没配 COS 时用 github
provider」。实际上 `resolveDesktopAutoUpdateConfig` **从不返回 undefined**
（`desktop-auto-update-environment.mjs:130-157`），所以 `update === undefined` 只有一个来源
—— `unsigned === true`（`electron-builder-config.mjs:71,103`）。真实语义是「**未签名构建**
改走 github」。代码注释已改对，改动 10 那段描述以本节为准。

### 附：清掉一处误生成的编译产物

`packages/interaction/user-questions/src/` 下出现过 `index.js` / `index.d.ts` / `.map` 共 8 个
文件。该包 tsconfig 的 `outDir` 是 `lib/types`（`tsconfig.json`），这些是某次构建误落进 `src`
的，且**没有被 gitignore**（`git check-ignore` 无输出）——会污染 `git status`。
已删除，`src/` 现在只剩 `index.ts` / `types.ts`。

### 测试最终状态

```
Test Files  111 passed | 4 skipped (115)
     Tests  1279 passed | 29 skipped (1308)
```

品牌类快照（`about-panel.json`、`application-menu-*.json`、`update-restart-darwin-*.json`、
`fatal-dialog-*.txt`、`welcome/*.expected.txt`）已用 `-u` 更新，并逐条 `git diff` 复核过
——**确认只有品牌串变化，没有夹带其它改动**。

## 改动 15：窗口标题的品牌（2026-09-25，实测发现）

全量测试转绿、重启 dev 实例做冒烟验证时，用 CDP 列 target 顺手看到页面 `title` 仍是
`DeepSeek Harness` —— 顺着查窗口标题，发现一处此前漏掉的品牌点。

### 问题：任务栏与 Alt+Tab 显示的是窗口标题，不是页面里那行字

页面 DOM 的 `<title>` 是 `DeepSeek Harness`，而 Electron 的窗口标题默认由它派生
（`page-title-updated`）；Windows 的任务栏悬停、Alt+Tab、缩略图读的**就是**这个窗口标题。
于是自绘标题栏写着「思灵」，任务栏写着「DeepSeek Harness」。官方看不出来，是因为
`app.name` / `productName` / 页面 title 全是同一个名字；改动 11 只改了壳自绘的部分，
**没覆盖这条由页面反向流到窗口的路径**。

### 定位：CDP 看到的 title 是 DOM 的，不等于窗口标题

`http://127.0.0.1:9222/json/list` 里 page target 的 `title` 是 **DOM title**，不能当窗口标题用；
dev 模式下 `MainWindowTitle` 又被 DevTools 窗口占着（`Developer Tools - dsh-app://app/`），
两条路都读不到。最后用 Win32 `EnumWindows` 枚举该进程全部可见窗口，拿到确证：

```
[Developer Tools - dsh-app://app/]
[DeepSeek Harness]      ← 主窗口，任务栏显示的就是它
```

（顺带留下 `.ssid-build/probe-run.mjs`：通用 CDP 探针执行器，
`node probe-run.mjs <port> <表达式文件> [target过滤]`，页面与主进程 inspector 都能用。
主进程侧注意 `Runtime.evaluate` **不支持动态 `import()`**，而 `lib/main.js` 是 ESM，
所以主进程探针走不通 —— 窗口标题这类问题直接用 `EnumWindows` 更省事。）

### 修法

`main.ts` 的 `createWindow`：主窗口给初值 `title: SSID_PRODUCT_NAME`，再监听
`page-title-updated`，**阻止覆盖但保留页面标题的能力** —— 只把品牌串换掉：

```ts
window.on('page-title-updated', (event, title) => {
  event.preventDefault()
  const branded = title.replaceAll(DSH_PRODUCT_NAME, SSID_PRODUCT_NAME)
  window.setTitle(branded === '' ? SSID_PRODUCT_NAME : branded)
})
```

**为什么不是简单全部阻止**（官方在 `policy-test-auth.ts:93` 正是那么做的）：DSH 以后可能用
标题显示会话名之类，全阻止等于把页面这项能力吃掉 —— 那正是用户此前提过的担忧
（「更新了新功能我也无法知道」）。`replaceAll` 只在标题含品牌串时改动，其余原样传递。
新增常量 `DSH_PRODUCT_NAME`（`ssid/product.ts`），与 `SSID_PRODUCT_NAME` 放在一起。

### 实机验证

重启 dev 实例加载新 lib 后重新枚举：

```
[Developer Tools - dsh-app://app/]
[思灵]                  ← 主窗口
```

### 顺带复验的既有修复（同一轮 CDP 探针）

| 项 | 实测值 |
|---|---|
| 标题栏调色板 | 填充 `rgb(249, 250, 251)` / 符号 `rgb(15, 17, 21)`（不再是白字白底） |
| 让位宽度 | **48**，`pointer-events: none` |
| 收起侧边栏按钮 | x=12..40，**`toggleClickable: true`**（没被自绘层盖住） |
| 桥接 | `__ssidIpcInvoke` / `ssidTitlebarControl` 均为 function，**3** 个控件按钮 |
| 产品标签 | `思灵` |
| 栏高 / 拖拽 | 40px（与 `WINDOWS_TITLEBAR_HEIGHT` 一致）/ `-webkit-app-region: drag` |

### 测试

`apps/desktop/tests/` 111 文件 / **1282 passed | 29 skipped**，`pnpm run typecheck` **EXIT=0**。

## 改动 16：接管 DSH 的 caption 按钮（2026-09-25，用户要求）

用户看图后要求：DSH 在 caption 区那两个按钮（`▯` 侧边栏切换、`⊕` 新建会话）**hide 掉，
功能收进我们自己的工具栏**。此前是「只读让位」—— 量它们多宽就留多宽，不碰它们。

### 落地的做法

`ssid/titlebar.ts`：新增 `CAPTURED_ACTIONS`（两个接管项），工具栏最左侧多两个按钮；
注入脚本里 `syncCaptured` 把页面原件 `display: none !important`，我们的按钮点击时**转调
原件的 `.click()`**（`display:none` 的元素照样响应 `.click()`，它直接派发事件、不检查可见性）
—— 这样行为与用户点原按钮 100% 一致，也不必复刻 DSH 的内部调用。

**识别判据**（这条是重点，踩了三次）：

| 判据 | 稳定性 | 角色 |
|---|---|---|
| 类名语义后缀（`_toggle` / `_newSession`） | 后缀是开发者写的语义名 | **首选**，且**不做几何过滤** |
| `aria-keyshortcuts`（`Control+B` / `Control+N`） | 标准属性 | 次选，**必须落在 caption 带内** |
| `hHd-Xa_` 前缀 | **构建期哈希，每次构建都可能变** | **刻意不碰** |

找不到原件时**不隐藏、也不停用我们的按钮** —— 点击时再查一次，仍未命中就退回它自己声明的
快捷键。宁可退回「并排」，也不做出「藏了但点不动」的死按钮。

### 我自己踩的三个坑（都值得记住）

1. **模板字符串里的反引号**。`buildTitlebarScript` 返回的是模板字符串，我在其中的注释里写了
   `` `syncCaptured` ``，直接把字符串提前终止 → `[PARSE_ERROR]` → `main()` 加载即失败，
   **112 个用例一起挂**。这类「代码生成器」的注释里不能出现反引号或 `${`。已在代码里留了提醒。

2. **几何过滤与「隐藏它」自相矛盾**。第一版 `findCaptionButton` 用 `getBoundingClientRect()`
   过滤 caption 带，而我们接管的动作恰恰是把它 `display:none` —— **隐藏后 rect 全是 0**，
   于是每次同步都认不出自己藏起来的那个，误判成「DSH 改了结构」把按钮停掉；点我们的按钮
   落入快捷键兜底，而 DSH 不响应合成的 `keydown`，表现为**点了没反应**。
   实测对照：把原件恢复显示后直接 `.click()` → 侧栏 280 → 0（有效）；点我们的按钮 → 无效。

3. **`aria-keyshortcuts` 在页面别处也有**。候选兜底取第一个匹配，而侧栏里那个宽版「新建会话」
   （`hHd-Xa_brand hHd-Xa_wide`，x=12 y=54 w=256）**同样标了 `Control+N`** —— 当 caption 区那个
   `_newSession` 不在 DOM 时（侧栏展开时不渲染），兜底就选中了它，**把侧栏里的真按钮藏了**。
   修法是快捷键判据必须叠加 caption 带几何约束（此时几何是安全的：它只用来排除页面别处的同名快捷键）。

### 实机验证

```
toolbarActions:  sidebar-toggle, new-session, session-manager, plugin-center,
                 bottom, sidebar, qt-float          ← 7 个，接管项在最左
capturedButtons: 两个都 disabled:false、title 正确
pageCaptionButtons: hHd-Xa_toggle      display:none !important   ← 已接管
                    hHd-Xa_newSession  display:none !important   ← 已接管
                    hHd-Xa_brand       未被隐藏                   ← 误伤已消除
gutterWidth: 48                                                  ← 页面已无占位，让位自动收窄
点击验证: 侧栏 280 → 0 → 280，toggleWorks: true
```

**降级链实测有效**：找不到原件时页面按钮照常显示、照常可用，不会出现死按钮。

### 对照模式（已实施，用户选定切换式）

用户要一个「对照组」看 DSH 原样，并问「二者不可并存吗」。三件事要分清：

| 「官方」指哪个 | 能否并存 | 原因 |
|---|---|---|
| DSH 页面的 caption 按钮 | 本来就在并存 | 我们让位避开 —— 现已改为接管隐藏 |
| 官方窗口按钮（`titleBarOverlay`） | **不能** | 固定画在客户区右上角，与我们那组按钮同一位置 |
| 完整原生标题栏（`titleBarStyle: 'default'`） | **能**，放在我们上面 | 它是非客户区、我们是客户区内容；代价是多占约 32px + 纯 Windows 外观 |

另外查到 `setTitleBarOverlay` 的文档原话是「On a Window with Window Controls Overlay
**already enabled**, this method **updates the style**」，参数里也没有开关字段 —— **运行时启用不了**，
所以任何「切回官方标题栏」都只能重启生效。

**落地的是切换式**：托盘新增「对照模式（看 DSH 原样）」。页面侧一个 `window.__ssidContrast(on?)`
开关做两件事 —— 收起自绘层、把被接管的页面原件放回去，纯显示态、不动 `titleBarStyle`。
对照期间没有窗口按钮与拖拽区，用托盘同一项切回。

**实测**：

| 阶段 | 我们这层 | 页面原件 |
|---|---|---|
| 初始 | `flex` | `none`（已接管） |
| 切到对照 | `none` | `flex`，28px —— DSH 原样 |
| 切回 | `flex` | `none` |

**又一个自己踩的坑**：第一版恢复时写的是 `bar.style.display = ''`，那会清掉 inline 的
`display:flex`、退回 CSS 默认的 `block` —— 而 `main` 的 `flex:1` 依赖它，一来一回标题栏就散架。
修法是记下原值再显式还原。探针实测抓到（`afterContrastOff: "block"`）。

## 改动 17：接管后的两处视觉返工（2026-09-25，用户看图指出）

### 一、左上角那条说不清来历的空白

用户截图圈出标题栏最左一段空白。它是 `MIN_LEADING_GUTTER = 48` 撑出来的 —— 那个下限写于
「页面按钮还在、必须让位」的年代；改动 16 把两个按钮接管隐藏后，`measureGutter` 已经量到 0，
却仍被 48 的下限顶住，于是成了一条纯空白。

改法：下限归零，且**量到 0 时连间隙也不给**（`GUTTER_GAP` 只在真有页面元素时才加）。
品牌区自带 `padding: 0 10px`，贴左不显挤。接管一旦失效，测量值自然把它们算回来 ——
这层降级不需要额外分支。

实测：`gutterWidth: 0`（此前 48）。

### 二、接管来的两个图标与旁边那组不同规格

用户指出「左侧栏图标和右侧栏图标风格不统一」。对照原壳那五个图标的写法就看得出来了：

| | 矩形 | 圆角 | 线条范围 |
|---|---|---|---|
| 原壳 `sidebar` / `bottom` | `12×12` @ y=2 | `rx=1` | 撑满 12 单位，无 `linecap` |
| 先前我的 `sidebar-toggle` | `12×10` @ y=3 | `rx=1.5` | 10 单位 + `linecap=round` |
| 先前我的 `new-session` | — | — | 加号只有 9 单位 |

改成照原壳规格重画：`12×12 rx=1` + 撑满 12 单位的线条，去掉 `linecap=round`
（原壳的 `sidebar` / `bottom` 都没用）；加号从 9 单位放到 12 单位。

**教训**：往一组现成图标里补新图标时，**照着邻居的坐标规格抄**（矩形尺寸、圆角、
线条跨度），别凭手感另写一套 —— 单看都「没毛病」，并排一眼就露馅。

## 改动 18：品牌区的盒子对齐（2026-09-25，用户看图指出）

用户问「标题栏左侧这些元素是不是没有水平对齐」。CDP 量每个子元素的 rect：

| 元素 | 盒子 | 高度 | line-height |
|---|---|---|---|
| logo | y=13..28 | 15 | — |
| 思灵 | y=14..26 | **12** | 12px |
| DEV | y=13..28 | 15 | 13px |
| DSH 版本 | **y=11..29** | **18** | **16px** |

**`centerY` 全是 20** —— `align-items: center` 是生效的，但它对齐的是**盒子中心**；
四个盒子高度 15 / 12 / 15 / 18 各不相同，中心对齐照样看着参差（上下边缘差 3px）。

改法：把四个盒子统一到 **15px** —— logo 本来就是 15；产品名补 `line-height:15px`；
版本胶囊的 `line-height` 从 16px 收到 13px（加 2px 边框正好 15）。

实测（改后）：四个元素全部 `y=13, h=15`，上下边缘齐平。

**教训**：`align-items: center` 只保证中心对齐，不保证边缘齐 —— 要让一组高度不一的元素
「看起来齐」，得先把盒子高度统一。

（两个徽章的形状不同是有意的，沿用原壳：`DEV` 是 3px 圆角矩形、版本是 999px 胶囊。）

### 另一条：侧栏「插件」行**没有**遮挡（实测否定）

用户同时问「左侧边栏的 logo 下侧是不是有遮挡」。查了三件事，都指向「没有」：

- **几何**：`logoRow` y=46..86、`panelList` y=86..122、`regionArea` y=130.. —— 相邻不重叠；
  「插件」文字 y=93..115 在 36px 的行内居中。
- **命中测试**：在「插件」的上/中/下三点（y=95 / 104 / 113）各做一次 `elementFromPoint`，
  **三点都命中它自己**，`inTitlebar` 全为 false —— 我们那层没盖住它。
- **放大截图**：`shot-clip` 截该区域 3 倍放大，`思灵` 与 `插件` 两行都完整、居中。

顺带留下 `.ssid-build/shot-clip.mjs`（通用区域截图：`node shot-clip.mjs <wsUrl> <out> <x> <y> <w> <h> [scale]`），
比「整窗截图再脑补」靠谱。

## 改动 19：logo 图形本身偏心（2026-09-25，用户找到根因）

用户指出 `H:\MaxNull\Pictures\新建文件夹\下载.png` **左边和上边有透明边缘、右侧和下边没有** ——
他找对了根因。像素采样（`nativeImage.toBitmap()` 读 BGRA 逐点取 alpha）：

| 位置 | 原始图（96×96 与 24×24 两张都是这样） | 修后 |
|---|---|---|
| 四角 | alpha 0（透明） | 0 |
| **上 / 左边中点** | **alpha 127**（半透明渐隐） | 160 |
| **下 / 右边中点** | **alpha 255**（硬边） | 202 |
| 右下角 | alpha 6（残留） | 0 |

即：**图形的右/下边界正好压在画布边上，左/上却留了半个像素的渐隐** —— 图形整体偏右下 0.25px。
缩到 15px / 24px 显示后，这个不对称被放大到肉眼可辨。

**修法**：放大到 16 倍 → 整数像素级左移上移 `SCALE/4`（= 0.25 个原图像素）→ 缩回原尺寸重新编码。
不对称度从差 128（≈0.5px）降到差 42（≈0.08px），显示时约 0.05px。

**改了两处**（同一个 logo 的两份来源）：

| 位置 | 用途 |
|---|---|
| `apps/desktop/src/ssid/titlebar.ts` 的 `BRAND_MARK`（24×24） | 壳自绘标题栏左侧 |
| `seek-soul-in-darkness/plugins/dsh-ssid-panels/src/client/icon-data.ts` 的 `SSID_ICON_DATA_URL`（96×96） | 侧栏 logo（24×24 显示）+ 欢迎页装饰（`pXSMma_fish`，34×34） |

插件那份同步改了 `profile-template/vendor/dsh-ssid-panels` 的源码副本，并 `pnpm run build` 重建了插件的
`lib/client.js`（dev 实例加载的就是它）。

**⚠️ 发版注意**：`profile-template/vendor/dsh-ssid-panels/lib/` 里仍是 **9/21 的旧构建**、含旧 base64。
那是发版基准快照，**没有在这里重建**（重建会连带引入 9/21 之后的全部改动）。下次 prepare-runtime
归档时必须重建，否则发出去的包还是偏心图标。

**教训（本次最有价值的一条）**：`getBoundingClientRect()` 给的是**盒子**，读不出**图片内容**在盒子里
偏没偏。上一轮我只把盒子高度统一到 15px 就以为解决了，真因在像素里 —— **图片类的视觉对齐问题必须读
像素**。另一条：**同一张 logo 往往在多处各存一份**（壳内嵌 base64、插件源码、发版基准），改之前先
grep 那张图的 base64 头（前 40 字符足够）；第三方包里的搜不到时，用页面探针列出所有 `img` 的 src 头
与自然尺寸来定位来源。

工具留在 `.ssid-build/`：`probe-logo-alpha.cjs`（量不透明边界）、`probe-logo-pixels.cjs`（采样指定像素）、
`fix-brand-mark.cjs` / `center-ssid-icon.cjs`（重采样居中并写回）、`shot-clip.mjs`（任意区域放大截图）。

## 改动 20：侧栏品牌区底部那 1px 裁切（2026-09-25，用户定位）

用户**最早**问过「左侧边栏 logo 下侧是不是有遮挡」，我当时做了三点命中测试、都命中元素自己，于是判断
「没有遮挡」—— **那个判断是错的**。后来用户翻 DSH 样式，指出 Y 轴的 `translateY(1px)` 才是原因。

**几何链条**（CDP 逐级量祖先）：

| 元素 | 盒子 | overflow | transform |
|---|---|---|---|
| `hHd-Xa_brandIdentity` | **55..79** | visible | `matrix(1,0,0,1,0,1)` = translateY(1px) |
| `hHd-Xa_brand` | 54..78（h=24px） | **hidden** | none |

被下移 1px 后底部 79 > 容器 78 —— **超出 1px，被 `.brand` 的 `overflow: hidden` 裁掉**。

`.brand` 的 `overflow: hidden` 配 `min-width: 0` 是**有意设计**（flex 里裁切过长品牌名，不让它撑破侧栏），
所以**不能放开裁切**；正确做法是把位移压回去。

**修法**：壳注入一条样式覆盖（`titlebar.ts` 的注入脚本里）：

```
[data-windows-titlebar] [class*="brandIdentity"]{transform:none !important}
```

选择器用语义后缀而不是 `hHd-Xa_` 前缀（后者是构建期哈希，会随 DSH 版本变）。

**实测**：`transform` 从 `matrix(1,0,0,1,0,1)` → `none`，盒子 55..78 → **54..78**，底部溢出量 **1 → 0**。

**为什么第一轮查错了**：`elementFromPoint` 在元素上/中/下三点都命中它自己 —— 但**裁切不改变命中测试结果**：
元素仍在原位、仍可命中，只是**画不出来**。命中测试查遮挡有效，**查裁切无效**。
这类问题要反过来查：**逐级向上找第一个 `overflow !== visible` 的祖先，比它和元素的 rect**。

**教训**：`translateY/translateX` 这类 1px 微调，很容易和「高度正好等于内容、又开了 `overflow: hidden`」的
容器凑成裁切 —— **两条规则各自都没错，凑在一起才出问题**。定位这类问题时，先假设「有东西没画出来」而不是
「有东西盖住了」。

## 改动 21：dev profile 与 iso-test 解耦（2026-09-26）

**背景**：`.ssid-build/dev-home/profiles/ssid` 的 `node_modules` 与 `vendor` 原本是指向
`.ssid-iso-test/profiles/ssid-dev/` 的 junction，目的是省一份依赖实体。这个布局在 `pnpm install`
时**必然失败**：

```
[ERR_PNPM_UNSAFE_MODULES_DIR] Refusing to remove the modules directory at
"...\.ssid-iso-test\profiles\ssid-dev\node_modules" because its resolved target
is not a strict subdirectory of the project root at "...\.ssid-build\dev-home\profiles\ssid".
```

pnpm 11 的安全护栏：删 modules 目录前先确认解析后的目标仍在项目根内，junction 指出去即拒。
这不是可绕过的配置问题——**项目根之外的 node_modules 一律不碰**。

**做法**（`H:\.pnpm-store\v11` 与项目同卷，所以用硬链接复制，零额外磁盘占用）：

```
cmd /c rmdir "<dev>\node_modules"          # 只摘链接；不要用 Remove-Item -Recurse，那会顺着 junction 删掉 iso-test 的真货
robocopy "<iso>\node_modules" "<dev>\node_modules" /E /SL /NFL /NDL /NJH /NP /R:1 /W:1
```

实测：39,572 个文件 725 MB，32 秒复制完，0 失败。`vendor` 同法（21 个目录 266 文件，3.2 MB）。

**取舍**：dev 从此不再与 iso-test 共享依赖实体，磁盘换隔离。两侧都要各自 `pnpm install`
—— 与「dev 是安全试验田」这个目的相比，代价划算。

**pnpm 的两道额外坎**（都踩过）：

1. `CI=true` 会让 pnpm 默认开 `--frozen-lockfile`，手写 package.json 与 lock 不同步时直接报
   `ERR_PNPM_OUTDATED_LOCKFILE` —— 而且**此时 node_modules 已经被删掉了**，是最坏的中止点。
   正确组合是 `CI=true`（跳过 purge 确认）+ `--no-frozen-lockfile`（允许更新 lock）。
2. 不加 `CI=true` 会因无 TTY 报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`。

最终一次跑通：`pnpm install --no-frozen-lockfile --prefer-offline` → 898 个包，reused 884、
仅下载 4，20 秒完成。

## 改动 22：dev 装入 8 个第三方插件（2026-09-26）

目标：让 dev 具备与安装版同级的第三方插件集，且都取 npm 最新。

| 插件 | 装入版本 | 备注 |
|---|---|---|
| `dsh-session-manager` | 0.5.2 | 安装版是 0.5.1 |
| `dsh-dream-skin` | 9.23.0 | 安装版是 9.16.0 |
| `dsh-context` | 0.56.2 | 安装版是 0.54.0 |
| `ds-harness-remote` | 0.4.17 | 安装版是 0.4.14 |
| `dsh-pocket` | 2.10.6 | 与安装版同版 |
| `dsh-wechat` | 0.9.6 | 与安装版同版 |
| `dsh-excel-panel` | 0.6.1 | 与安装版同版 |
| `dsh-video-preview` | 0.1.4 | 与安装版同版 |

8/8 实体版本校验通过；`dsh.profile.bundles` 同步补齐（deps 56 → 64，bundles 24 → 32）。

**加载验证**：启动日志里 8 个插件的 `client.js` 全部出现在客户端 bundle 清单中，页面探针
`rootChildren=1`、`errorBanners` 为空、无白屏。

### 判定「某版本装不装得上」的**真实判据**

`@deepseek-ai/dsh-app-boot/lib/index.js` 的 `evaluatePluginCompatibility()`（0.1.7 版约 286–313 行）：

- **只校验** `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 这两类 peer（第 294 行）；`react`、`cordis`
  等**完全不检**；
- 比较对象是**运行时内核版本号**，不是「node_modules 里有没有那个包」；
- 用 `semver.satisfies(runtime, range, { includePrerelease: true })`；
- 不兼容**不静默**——有 `compatibility.json` 豁免机制可显式放行（第 326–369 行）。

**一个被推翻的判据**：先前以为「peer 目标包在 node_modules 里缺失」就会挡住插件，**不成立** ——
dev 的 `@deepseek-ai/dsh-client-ui-primitives`、`-client-store`、`-client-runtime`、
`-client-ui-slots` 四个包**在任何位置都不存在**（连 `.pnpm` 都没有），可 dev 里 sidebar-qa、
genui 照常运行。真实门槛是**版本号比对**。

两个副产物（脚本 `probe-compat-gate.mjs` 留在 `.ssid-build/`，复刻判据逐包验过）：

- `includePrerelease: true` 让 `^0.1.0-rc.6` **能**匹配 `0.1.7-rc.2`（同 `major.minor.patch`
  内的预发布参与区间判定）。所以 peer 写得很旧的插件在新内核上**不会**被判死。
- 真正被挡的是**内核太旧**那一侧：`ds-harness-remote` 0.4.15 起要
  `@deepseek-ai/dsh-client-ui-plugin-manager >= 0.1.6-alpha.1`（0.1.5 内核上无此包），
  `dsh-better-sidebar` 0.21.1 要 `^0.1.7-rc.1`。**同两个插件在 dev 的 0.1.7-rc.2 上全通过。**

### 观察到的降级（都不是加载失败）

- `[dsh-dream-skin] host class names drifted` —— DSH 侧类名哈希变了，若干「材质精修」样式
  不再命中；作者已自行降级为无害提示；
- `[dsh-excel-panel] v0.5.0 loaded` —— 包内版本字符串，非实体版本（实体是 0.6.1）；
- `[dsh-sidebar-qa] no settings namespace registration` —— dsh-settings ≥ 0.1.7 改从插件
  Config 推导可编辑字段，该命名空间跳过、用默认值；
- `[dsh-sidebar-qa] this DSH has no right sidebar` —— 探测式降级，右侧栏 tab 不注册；
- `ds-harness-remote: status event stream unavailable, polling` —— 事件流不可用改用轮询；
- `[dsh-better-sidebar] agent-opens connection failed` —— `lib/client.js` 第 4100/14674 行用
  `location.origin` 构造 WS URL，在 `dsh-app://app` 下得到 `ws://app/…`；**这正是 PR #768 修的问题**。

### 「会话管理」按钮不可见：不是加载失败

`dsh-session-manager` 的 footer 按钮在 DOM 里，但 `rect` 全 0：

| 元素 | 内联样式 | 高度 |
|---|---|---|
| `button.sm-footerBtn.sm-footerBtn-wide` | `display: none;` | 0 |
| `div.sm-footer.sm-footer-wide`（父） | `min-height:0; height:0; padding:0; margin:0; overflow:visible` | 0 |

**反证**：临时把父容器撑到 `36px`、按钮 `display:inline-flex !important` 后，按钮立刻
`126×36` 出现在 `(142,726)`，且同级容器里只有它一个 —— 说明它本来就该在那儿、尺寸也正常；
还原后重新隐藏。所以是**收起态设计**，不是插件故障。

**教训**：`display:none` 会让 `getBoundingClientRect()` 全 0，光看 rect 分不清
「没注册」「被父级裁掉」「自己隐藏」。判可见性必须同时读 `getComputedStyle(el).display`
和**元素自身的 `style` 属性**（内联样式优先级最高，在 CSS 文件里搜不到它）。
另外 `el.click()` 走不到 React 的合成事件层，模拟真实点击要派发
`pointerdown → mousedown → pointerup → mouseup → click` 五连。

## 改动 23：插件设置槽位迁移到 `plugins.bundle.config`（2026-09-26，用户拍板为开发规范）

**背景**：DSH 0.1.7 **删除了 `settings.plugin.item`**。判据是官方
`packages/client/ui-plugin-manager/src/client/config-ledger.ts:40` 的
`const SLOTS = ['plugins.item', 'plugins.bundle.config', 'plugins.row.config']`——
**`settings.plugin.item` 已不在清单里**（交叉印证：官方 `dsh-cordis-client-runner` 注册了
全部七个 `plugins.*` 槽，独缺此项）。`settings.section` **仍然有效**，未受影响。

**用户决定**：插件设置统一走 `plugins.bundle.config`，并写进 `SSiD开发手册` 作为 DSH 插件开发规范。
这**反转了 draft-polish 早前的一条定稿**（原注释：「用户定稿：设置只走左栏入口，不入官方
『插件配置』tab 聚合卡片」）。

**落地三处**：

| 插件 | 改动 | 实机验证 |
|---|---|---|
| `@max-null/dsh-capture` | 槽 `settings.plugin.item` → `plugins.bundle.config`（key = 包名）；host `Config` 两个字段补 `.volatile()`；卡片改默认展开 | 卡在插件详情页**正常渲染**（「截图 / 截图行为设置——隐藏思灵窗口与全局快捷键」）；de 下 body 为空是**预期**（见下） |
| `@max-null/dsh-draft-polish` | 删 `settings.section` 注册 + 整套 nav-icon 机制（齿轮换 sparkles，专为左栏行服务，随之成为死码）+ `settingsNav` 文案；改注册 `plugins.bundle.config` | **5 个输入框带真实值**（provider 空 / model `deepseek-v4-flash` / recent `4` / temp `0.3` / timeout `30000`）+ 保存按钮 |
| `@max-null/dsh-node-appearance` | 卡片 `useState(false)` → `true`（默认展开） | 默认展开，13 个颜色 + 思考过程开关 + 工具色覆盖 + 恢复初始 |

**迁移的两个必要前提**（缺一即不渲染）：

1. 插件自身必须是 bundle：`package.json` 声明 `dsh.bundle.patch`（三个插件都有）。
2. **`key` 必须等于 bundle 的包名**。判据链：`PluginManagerPage.tsx:1298` 的
   `configured={ledger.bundles.has(openPkg.name)}` → `config-ledger.ts:51` 的
   `keysOf()` 直接取 `entry.options.key`。用 NS（如 `'dsh-capture'`）或行 id 都不匹配。
   （按行挂配置才用 `plugins.row.config`，key = `包名#行id`。）
3. host 侧 `Config` 的可变字段**必须标 `.volatile()`**——`settings/src/schema.ts` 的
   `isVolatilePath` 只承认「祖先节点标了 volatile」，非 volatile 路径在
   `settings/src/index.ts:406` 直接抛错；漏标会让该插件的 settings namespace 不被 Host serve。
   注意：**不能写 `z<Config>` 显式泛型**（`.volatile()` 会改 schema Mode，显式泛型报类型不匹配）。

**默认展开的判据**（本次新定）：卡片是该插件在「插件」页上唯一的设置入口，折叠态会让用户以为
「设置不见了」——`node-appearance` 与 `dsh-capture` 都曾因折叠而看起来「设置消失」。除非有明确理由，
初始 `open = true`。

**`dsh-capture` 在 dev 里 body 为空，是预期行为**：它的两行设置（隐藏窗口开关 / 全局快捷键）
在 `shellAvailable === false` 时 `return null`（`ScreenshotSettings.tsx:141` 等）——截图依赖 SSiD
自有壳的 `ssid.shell.screenshot` 服务，而 dev 跑在官方 DSH 壳基座上，没有该服务。
API 本身是通的：`POST /api/ssid/screenshot/get` 实测 **200**
（`{"ok":true,"value":{"hideWindow":true,"hotkey":"Control+Shift+A","shellAvailable":false}}`）。

**排查手法**（含一条我自己的错判）：判断某个 slot 有没有注册成功，**不能只看页面文本**
（折叠内容的 `innerText` 可能为空）。第一手判据是 `document.querySelector('section[data-plugin-config]')`
是否存在 + 卡片 header 的 `aria-expanded`；`dsh-capture` 的卡片 header **没有 `aria-label`**
（只有 `aria-expanded`），所以按 aria 找「展开」按钮会找不到，要用 class 选择器。

**工具**（都在 `.ssid-build/`）：`scan-settings-slots.mjs`（扫所有已打包插件的 client.js，
列出注册的 settings 相关 slot 并标出已删除的）、`sync-plugin-to-dev.mjs`
（源码仓库 `lib/` → dev 的 vendor + node_modules 两处，robocopy `/MIR`）。

**顺带发现的既有问题（未修）**：`dsh-capture` 的 `npx tsc --noEmit` 从来就不通过——
它 import 了**内核已删除**的 `@deepseek-ai/dsh-client-runtime/client`（`src/client/index.ts:18`）
与 `@deepseek-ai/dsh-client-connection`（`src/index.ts:19`）；其 `node_modules` 也曾是
指向 `dsh-chat-rail` 的 junction（已断开并重建为实体）。该插件的 L1 门槛（typecheck 全绿）
因此一直是欠账，需要单独一轮补齐。

## 改动 24：shell 功能移植缺口补全——① 截图服务跨进程接线（2026-09-26）

**背景**：`.ssid-build/checkout` 的 dev 壳跑在**官方 DSH 桌面基座**上（Shell 主进程 +
Host 子进程），而自建壳 `shell/main.mjs` 是**单进程**。截图浮层、抓帧、全局热键都在
Shell 主进程（`apps/desktop/src/ssid/screenshot.ts` 已移植），但 `dsh-capture` 的 host 半
在 **Host 子进程**里 —— 两边没有共享内存，自建壳那句
`hostCtx.provide(SSID_SHELL_SCREENSHOT_KEY, opts.screenshot)`（`shell/kernel.ts:696`）
在分进程架构下**没有等价物**。表现：`/api/ssid/screenshot/get` 返回
`shellAvailable: false`，设置卡的两行（隐藏窗口开关 / 全局快捷键）被 `return null` 掉，
看起来像「设置没了」。

**这不是「预期行为」，是移植缺口** —— 用户指出：目标就是把 DSH 壳改造成思灵的壳，
不存在「等切到我们自己的壳就出现」的场景。

**做法**（照 `quit-inspection` 的 `{requestId}` 请求-响应模板，不新造机制）：

| 方向 | 消息 | 落点 |
|---|---|---|
| 壳 → Host | `{ type: 'screenshot', action: 'trigger' \| 'apply', requestId }` | `apps/desktop/src/host-process.ts` 的 `control()` |
| Host → 壳 | `{ type: 'screenshot-result', requestId, ok, error? }` | 同上 `isDesktopHostEvent` 校验 |

- **Shell 侧**：`SsidScreenshot` 新增 `trigger()`（开浮层）与 `apply()`（重注册热键），
  `start()` 由 `Promise<void>` 改成 `Promise<boolean>` 以便区分「真的开始了 / 忽略或失败」；
  全局热键注册收进 `registerHotkeyAtStartup()`。
- **Host 侧**：新建 `apps/desktop-host/src/ssid-screenshot.ts` 的
  `installSsidScreenshotService(ctx, request)`，`ctx.provide('ssid.shell.screenshot', { trigger, apply })`
  —— 服务与自建壳**同名同义**，所以 `dsh-capture` **一行都没改**。
- `DesktopHostProcess` 构造新增可选 `onScreenshot` 回调（第 10 个参数），`main.ts` 传入。

**设计取舍（值得记下）**：
1. **`trigger` 是单向的**。截图结果由 Shell 主进程直接派发页面事件
   （`window.dispatchEvent(new CustomEvent('ssid:screenshot', …))`，
   `screenshot.ts:deliver`），而 `dsh-capture` 的 client 半早就在监听它。所以 Host 不需要
   「截完了」的信号——结果已经在页面里了。只有 `apply` 需要回传（插件把它当同步成功位）。
2. **`apply` 必须先注销后注册**。Electron 对**已注册的**键位返回 false，直接
   `globalShortcut.register` 会让用户每次点「保存」都看到「保存失败」。所以
   `SsidScreenshot` 用 `registeredHotkey` 记账，先 `unregister` 再 `register`——
   记账还避免了这条路径误伤遮罩的键位。
3. **`desktop-host` 的构建顺序是 `tsc` → `tsdown`**：`tsdown.config.ts` 的 entry 是
   `lib/types/index.js`（tsc 的中间产物），所以只跑 `tsc --noEmit` 不产出它，
   直接 `tsdown` 打出来的还是旧代码（实测：`lib/index.js` 从 17.37 kB 变成 21.67 kB 才是真的重建）。

**实测**（dev，重启后）：
- `/api/ssid/screenshot/get` → `shellAvailable` **false → true**
- `dsh-capture` 设置卡：默认展开、两行齐全、快捷键输入框值 `Control+Shift+A`
- `POST /api/ssid/screenshot/trigger` → **200**，且 Host 存活（`19388` 持续 LISTEN、日志无 `invalid IPC event`）

### 端到端验证排出的三个问题（第一个才是元凶）

**① dev 壳跑的是 bundle 产物，不是 src** —— 这条最贵，它让前面所有「改了没生效」都说不通。

`apps/desktop/package.json` 的 `main` = `lib/main.js`，那是 **tsdown 的 bundle**；而 `dev` 脚本是
`tsx scripts/dev.ts`，加 `--skip-build` 就跳过构建。所以**改壳代码（`main.ts` / `host-process.ts` /
`ssid/*.ts`）必须手动 `pnpm run build`（= `tsc -b && bundle`）**，否则跑的还是旧 bundle。

这与 kernel 的模式不同（kernel 用 tsx 直接跑 src，改完即生效），我按 kernel 的习惯改了壳却一直
没构建，于是所有壳侧改动都没生效 —— 表现为「校验器明明加了新消息类型，却仍报 invalid event」。

**判据**：`Select-String lib\main.js -Pattern '<你新加的标志>'`，命中才算真的进了产物。
（`apps/desktop-host` 同理，且它是**两步**：`tsc` 产出 `lib/types/index.js` → `tsdown` 从它打 bundle，
只跑 `tsc --noEmit` 不会产出中间产物。）

**② 服务的实现不要 `ctx.get` 自己** —— 会导致无限递归。

Host 侧我一开始写成 `screenshotRequest = () => ctx.get(KEY).trigger()`，而那个服务的 `trigger`
又回头调 `request`，于是「取服务 → 调 trigger → 再取服务」自循环，
症状是路由返回 500 `Maximum call stack size exceeded`。
正确做法是服务方法只做一件事：把动作转成 IPC 发给壳。

**③ IPC 消息的方向与类型名必须两端一致，单向消息不要回执**。

| 方向 | 类型名 | 是否带 `requestId` |
|---|---|---|
| Host → 壳 | `screenshot-request` | `apply` 带、`trigger` 不带 |
| 壳 → Host | `screenshot-result` | 必带 |

踩到的两个坑：
- 我把 Host→壳 的消息误写成 `screenshot`，壳的 `isDesktopHostEvent` 不认 → **`fail()` 直接 kill 掉
  整个 Host 子进程**（日志：`dsh desktop host sent an invalid IPC event` + `connection lost, retry #N`）。
- 壳对单向的 `trigger` 也回执，而 `requestId` 缺省 → `Number.isSafeInteger(undefined)` 为假 →
  **同样触发 kill**。所以 `answerScreenshot` 在 `requestId === undefined` 时直接返回。

**教训**：这条 IPC 的校验器是**严格白名单**，一条不认识的消息就杀进程 —— 加新消息类型时，
两端类型名、字段形状、该不该回执，三处都要对齐；改完先确认产物已更新（见 ①），再实机验。

---

## 改动 25：② 保活 keep-awake 跨进程接线（2026-09-26）

**背景**：自建壳是单进程，`createKeepAwake` 可直接订阅内核 `session/event`；分进程后
「此刻有没有 turn 在跑」只有 **Host 子进程**知道，而要调的 `powerSaveBlocker` 只在
**Shell 主进程**里存在。缺这条线，用户在长任务里屏幕照样黑。

**做法**（与截图同一条 `{requestId}` 之外的**单向**上报范式）：

| 方向 | 消息 | 落点 |
|---|---|---|
| Host → 壳 | `{ type: 'ssid-keep-awake', phase: 'turnStart' \| 'turnEnd' }` | `apps/desktop-host/src/ssid-keep-awake.ts` |
| 壳侧状态机 | 收 `turnStart`/`turnEnd` → 管 `powerSaveBlocker` | `apps/desktop/src/ssid/keep-awake.ts`（自建壳 `lib/keep-awake.mjs` 的 TS 直译） |

- **Host**：`installSsidKeepAwakePublisher(ctx, publish)` 订阅 `session/event`，
  `turn/start` → `turnStart`；`turn/end` → **无条件** `turnEnd`。
- **壳**：`createKeepAwake({ start: () => powerSaveBlocker.start('prevent-display-sleep'),
  stop, readConfig: readKeepAwakeConfig, log })`；`SsidMask` 构造新增第 2 个参数
  `onActiveChange`，把「遮罩挂着」也算一种持有来源。
- 配置与通知**共用** `~/.ssid/notify.json`（`keepAwake` / `keepAwakeTailMs`），
  路径解析复用 `ssidNotifyConfigPath()`，因此 `SSID_NOTIFY_CONFIG` 的隔离覆盖对两者同时生效。

**关键取舍：turnEnd 不能与通知合流。** `ssid-notify.ts` 只在 `reason.kind === 'completed'`
时播报（「回完了」才值得提醒），但保活**任何**结束都要递减计数——中断、报错、取消都算。
合成一个「turn 结束了」的信号，被打断的回合就漏减一次，计数只增不减，
`held()` 永远为真，**屏幕再也不会息**。所以这是一条独立通道。

**实测**（dev，真实 turn，非构造事件）：

```
ssid: keep-awake ON id=0 turns=1 mask=false     ← turn/start
ssid: keep-awake off id=0                        ← 尾巴 60s 到期后释放
```

- `turns=1` 证明是**真 turn** 唤起的（不是遮罩路径）；`id=0` 是 `powerSaveBlocker` 返回的持有号。
- **判据是「ON 与 off 都要出现」**：只看到 ON 有两种可能——状态机坏了（计数不递减）
  或尾巴还没到期。中间那次我一度以为没释放，实际只是 60s 尾巴没走完；
  日志文案本身也是线索（`ON` 大写、`off` 小写，两处字面量不同）。

---

## 改动 26：④ 预制 MCP —— 配置条目与运行时 env 必须成对落地（2026-09-26）

**背景**：dev profile 里没有任何 MCP，模型看不到 `mcp__*` 工具。自建壳的 MCP 预置是
「profile patch 条目 + 壳注入 env」两半，**只补一半等于没补**。

| 半 | 落点 | 内容 |
|---|---|---|
| 配置 | `profiles/ssid/cordis.patch.yml`（+ `package.json` 的 dependencies） | 3 条 `@deepseek-ai/dsh-mcp-client`：`mcp-playwright-headless` / `mcp-playwright-headed` / `mcp-codegraph`；两个 CLI 依赖 `@playwright/mcp@0.0.82`、`@astudioplus/codegraph-mcp@0.20.1` |
| 运行时 | `apps/desktop/src/ssid/mcp-env.ts` | `installSsidMcpEnv()` 注入 `SSID_MCP_NODE` / `SSID_MCP_PW_CLI` / `SSID_MCP_CG_CLI` / `SSID_MCP_CG_WS` / `SSID_MCP_CG_ENABLE` |

**三条不能化简的设计**：

1. **`env 缺失即 disabled`**——patch 条目的 `disabled: !!js '!process.env.SSID_MCP_PW_CLI'`。
   理由不是「优雅降级」，是**硬约束**：条目 `args[0]` 取自 `SSID_MCP_PW_CLI`，缺失时求值为
   `null`，而 `dsh-mcp-client` 的 schema 要求 `string[]` —— 会让**整棵插件树加载失败、内核起不来**。
   所以「机器上没装 CLI」必须表现为「这条 MCP 停用」，而不是启动崩溃。
2. **node 候选链刻意不含 `process.execPath`**：Electron 的 ABI 与标准 Node 不匹配，
   拿它跑 MCP 的 JS 会失败（自建壳踩过）。打包版优先 `resources/node/`，其次 Homebrew/NVM，最后裸名。
3. **注入必须在 `new DesktopHostProcess(...)` 之前 await 完**：Host 子进程继承 `process.env`，
   在 `host.start()` 之前写不进去（`main.ts` 的 `start: async () => {}` 里）。

**实测**（dev，与安装版同形态）：

- 启动日志：`ssid: mcp ready (playwright=true codegraph=true ws=H:\MaxNull\WorkStation enabled=1)`
- 进程：3 个 MCP 子进程挂在 dev Host 之下，命令行分别指向 dev profile 的 `@playwright/mcp/cli.js`（headless + headed 各一）与 `@astudioplus/codegraph-mcp/bin/codegraph-mcp.js`
- 端到端：dev 会话里问「你可用的 MCP 工具名前缀」，模型答 **`codegraph, playwright-headed, playwright-headless`**

**已知瑕疵（不影响功能，但日志会误导）**：`resolveMcpNode()` 候选链的最后一项
`existsSync(bare)`（裸名 `node.exe`）**恒为假**——裸名要靠 PATH 解析，不是相对文件。
于是 dev 里明明能用，日志却报 `ssid: mcp node: none found; MCP entries fall back to "node" on PATH`。
实际回退路径是 patch 里的 `process.env.SSID_MCP_NODE || "node"`，结果正确。
（dev 里最终跑起来的是安装版随包的 `resources\node\node.exe`。）

---

## 改动 27：⑤ CodeGraph 索引目录适配（2026-09-26）

`apps/desktop/src/ssid/codegraph-adapt.ts` —— 自建壳 `shell/lib/codegraph-adapt.mjs` 的 TS 直译，
解析优先级 `env → ~/.ssid/codegraph.json → 最近会话探测 → 首次引导`。

**移植时修掉的一个真缺陷**：`listArtifacts` 只认 `session.jsonl.zstd`（写死 v0 名字），
而 dev 的会话全是 **`session.v4.jsonl.zstd`** —— 探测恒返回 `null`，于是
`resolveCodeGraphWorkspace` 落到 `'none'`、**误弹首次引导窗**。改为模式匹配
`/^session(\.[^.]+)?\.jsonl\.zstd$/`，跟随内核的格式版本演进。

**实测**：日志 `mcp codegraph workspace=H:\MaxNull\WorkStation source=detected cli=present enabled=1`
—— `source=detected` 且**没有弹框**，说明修复生效（若正则没改，这里会是 `source=none` + 弹窗）。

---

## 改动 28：③ profile-merge —— **结论是不移植**（2026-09-26）

**这条的结论是「不需要做」，理由必须写清楚，否则下次还会被当成缺口。**

`shell/lib/profile-merge.mjs`（升级时保留用户层）解决的问题有**前提**：
自建壳 `deployRuntime` 用归档对 profile 根**整体覆盖**——`node_modules` 整体替换，
`package.json` / `cordis.patch.yml` / `pnpm-lock.yaml` / `vendor/` 逐个「rmSync + rename」覆盖
（见 `docs/决策/2026-09-07-升级部署覆盖用户层修复.md:10`）。有覆盖，才需要合并保留。

**fork 版没有这个前提**，两条独立证据：

1. **fork 壳里没有任何归档部署代码**：在 `.ssid-build/checkout` 全仓搜 `dsh-runtime.tar.gz`
   / `deployRuntime` / `profile-template`，命中的全是 `dsh-runtimes/dsh-primary-runtime`
   （那是 python/node/pnpm 工具链，与 profile 无关）。
2. **官方基座的 profile 初始化是纯增量、不覆盖**：`apps/desktop/src/project-manager.ts`
   每次启动调 `createPluginProfile()` → `initProfile(profileDir, WEB_PROFILE.bundles)`，
   而 `packages/boot/app-boot/src/profile.ts:236-262` 的注释与实现都写着
   *“Existing files are never touched, so re-running is a no-op on an initialized profile.”*
   —— 三个文件（`package.json` / `cordis.patch.yml` / `pnpm-workspace.yaml`）各自
   `if (!existsSync(...))` 才写。用户层天然被保留。

**但这次核查揪出一个真问题（不在本轮范围内，先登记）**：`initProfile` 写的是
`dependencies: {}` + `WEB_PROFILE.bundles`（= `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`），
且**不跑包管理器**。而自建壳的 profile 内容（含 `@max-null/*` 全家桶与第三方插件）
原本靠 `dsh-runtime.tar.gz` 交付。fork 版的打包配置
（`electron-builder-config.mjs` 的 `extraResources`）**只带 `runtime`（primary-runtime）与图标**，
不带 profile 归档 —— 所以「新装机如何得到思灵的插件集」在 fork 链路里**还没有答案**。
这是交付链的设计决策，需要单独立项，不要顺手当成 ③ 的一部分做掉。

---

## 附：fork 副本与运行副本的同步（2026-09-26）

`ssid-shell-fork/`（交付源码副本，非 git 仓库）在改动 24 之后**落后于**
`.ssid-build/checkout`（运行副本）：本轮与上轮共 6 个文件有差异、5 个新文件只在 checkout。

已按 `src`/`scripts` 逐文件哈希核对并回灌，11 个文件哈希全等（`apps/desktop/lib`、
`apps/desktop-host/lib` **除外**——那是构建产物，fork 里那份是历史构建，以 checkout
构建为准，不要拿它判断改动是否落地）。

**教训**：改动**只在 checkout 发生**时，fork 副本不会自己跟上。收尾要跑一次
逐文件哈希比对（`Get-FileHash` 逐目录比，不要用 `git diff --no-index` 递归整个 `apps/`
—— checkout 里 `.desktop-build/development/project/node_modules` 的深路径会超 Windows 上限）。

---

## 改动 29：思灵插件集交付链 —— A′ 形态（2026-09-26）

**背景**：官方基座的 profile 由 `initProfile()` 建骨架（**只写三个文件、不装包**），
而自建壳那份 profile 内容（含 `@max-null/*` 全家桶与预制的第三方插件）原本靠
`dsh-runtime.tar.gz` 归档整体覆盖铺入 —— fork 的打包链不带该归档，于是**新装机拿不到插件集**。

### 一、先证伪了「插件放进随包闭包就行」（三次对照实验）

**契约的适用范围比看起来窄**：`packages/boot/app-boot/src/profile.ts:617-640` 的
「安装锚点优先」只决定 **bundle 的 `cordis.patch.yml` 从哪读**。插件**本体**与它的
**client 半**走的是运行时解析表（同文件 `:436-462`）：

```
entries = installation scope（installAnchor 的依赖图 BFS）
        + profile scope（profile 的 manifest 声明 + node_modules 里的链接）
```

而 installAnchor 是 `~/.dsh/dsh-runtimes/dsh-primary-runtime/node_modules/@deepseek-ai/dsh/package.json`
（`apps/desktop-host/src/index.ts:26`）—— **官方 npm 包的依赖图里不可能有 `@max-null/*`**。

四组实测（同一台 dev，每次都重启，用**两份内容相同但标记不同**的副本判别加载来源）：

| # | 插件实体放哪 | profile 里有没有 | 结果 |
|---|---|---|---|
| 0 | profile 的 node_modules | 有实体 | 加载 ✓ / client 清单 ✓（基线） |
| 1 | 安装锚点（`.pnpm` mirror 源） | 藏起来 | bundle **解析**命中锚点（`[ANCHOR]`），但**本体未加载**、client 消失、**且零报错** |
| 2 | 锚点 + profile 各一份、各带标记 | 有一份 | 只有 **profile 那份**被加载 |
| 3 | installAnchor 的解析链（`checkout/node_modules`） | 藏起来 | **三个标记全未出现** —— 完全没加载 |
| 4 | profile 之外的任意真实目录 | **junction 指过去** | **加载 ✓ / client 清单 ✓**，日志里的 URL 就是链接目标 |

**同一条链上还有一个对任何交付方案都成立的风险**：插件解析不到时内核**完全静默**——
应用照常启动，`Failed to load plugins` 一次都不出现，只有渲染进程的 client 清单里少一行。
装错了根本看不出来（这条促成了 seed 的 `missing` 自检）。

### 二、A′ 的做法

实体留在随包插件集目录（**一份，不复制**），profile 里只放**目录链接** ——
这正好落在 `RuntimeResolution.linkedRoots` 这条既有通道上（`linkedProfileRoots()`
会把 profile 的 `node_modules` 下指向外部的链接收进解析表）。

| 文件 | 性质 | 内容 |
|---|---|---|
| `apps/desktop/src/ssid/profile-seed.ts` | **新增** | `seedSsidProfile()`：读插件集自述 `ssid-plugins.json` → 为每个包建目录链接（缺失才建）→ 补 `dsh.profile.bundles` → 写 `link:` 声明 |
| `apps/desktop/src/main.ts` | 改 2 处 | 加 `resolvePluginSetRoot()` / `seedProfilePlugins(profileDir)`；在 `manager.applyRelease()` 之后调用 |

三条设计取舍：

1. **链接缺席才建，已存在一律不动** —— 用户自装或自改的那份优先；`lstat` 而不是
   `existsSync` 判在不在，否则断链会被当成「不存在」而被我们覆盖掉（那是用户的痕迹）。
2. **`dependencies` 写 `link:<绝对路径>`**，与链接语义一致 —— 用户日后跑
   `pnpm install`（插件中心就会跑）也不会把条目换成 registry 上的另一份。
3. **`bundles` 只追加不清洗** —— 用户自己的 bundle 必须留下。

插件集根目录：打包版是 `resources/ssid-plugins`，开发期用 `SSID_PLUGIN_SET_DIR` 覆盖。

### 三、顺带修掉一个真缺陷：首次引导把启动**卡死**

`installSsidMcpEnv({ promptWorkspace })` 原本在启动路径上 `await` 一个 CodeGraph 目录对话框。
触发条件很平常：**全新 `DSH_HOME`（没有会话可供探测）+ `~/.ssid/codegraph.json` 缺席**。
实测现象：日志停在 `ssid: mcp codegraph cli missing` 之后不再前进，**没有报错、没有超时**，
进程活着但 Host 永不 spawn —— 界面上只剩一个等待点击的对话框。**无人值守启动会永久挂住。**

**处置**：引导从启动路径上摘下来，挪到 Host 就绪、窗口可见之后，**调用方 `void` 不 await**，
结果写进配置、**下次启动生效**。抽成 `apps/desktop/src/ssid/codegraph-guide.ts`
（`shouldGuideCodeGraph()` 纯判据 + `recordCodeGraphDecision()` 落盘，弹窗留在 `main.ts`），
`mcp-env.ts` 删掉 `promptWorkspace` 参数与那段写配置的代码 —— 它现在只解析、不交互。
窗口不可见时干脆不问：那正是无人值守场景。

### 四、实测（全新 `DSH_HOME`，即「新装机首启」）

| 判据 | 结果 |
|---|---|
| seed 日志 | `ssid: plugin set: linked=30 kept=0 missing=0 bundlesAdded=30` |
| profile 落地 | `node_modules` 12 个顶层条目、`@max-null` 下 19 个，抽样是 Junction |
| 清单 | `bundles` 32 项（2 个官方 + 30 个思灵）、`dependencies` 30 条全为 `link:` |
| **修复前卡死的那一步** | `ssid: mcp ready (...)` 出现，Host 9230 与 web 19388 都 LISTEN ✓ |
| 目录未定时的行为 | `ws=(none) enabled=0` —— codegraph 条目停用，**不阻塞** |
| client 清单 | 26 项，与 dev-home 基线**逐项相同**（零差异） |
| **幂等（第二次启动）** | `linked=0 kept=30 missing=0 bundlesAdded=0`，`package.json` **哈希逐字节未变** |

### 五、单测抓到的一个真 bug

`apps/desktop/tests/ssid-profile-seed.spec.ts` 第一次跑就红了一条：**清单声明了、却没随包的包，
仍然被写进了 `dsh.profile.bundles`**。后果正是这条交付链最该避免的形态 —— 声明了却解析不到，
内核**静默跳过**（只有 client 清单少一行），而 `missing` 只在启动日志里出现一次。修法：只把
**真的随包了**的写进声明，缺失的交给 `missing` 单独报。

值得记的是**它是单测抓的、不是实机**：实机用的插件集恰好完整（30 个包齐全），
「声明多于实体」那条路径根本没被走到 —— 而它正是**升级场景的常态**（新版减掉一个插件，
老 profile 的声明还在）。实机验证只能证明「这一台机器上是对的」。

同批补的 `ssid-codegraph-guide.spec.ts`（8 例）覆盖的全是**不该问**的分支：已表态、
env 指定、配置已有、**会话探测命中**（这个误弹 2026-09-26 之前真实发生过）。
写它时踩到一个小坑：`shouldGuideCodeGraph` 默认读 `process.env`，而开发会话的环境里
恰好带着 `SSID_MCP_CG_WS` —— 测试不能依赖外部环境，显式传 `env: {}` 才可重复。

### 六、待做：打包链（**需拍板**）

壳侧已落地并验证，但「插件集怎么进安装包」属于发版链改动，尚未动手：

1. `electron-builder-config.mjs` 的 `extraResources` 加 `{ from: <插件集产物>, to: 'ssid-plugins' }`；
2. 新增一个打包步骤产出插件集目录与 `ssid-plugins.json`（来源：已发布到 npm 的
   `@max-null/*` 与第三方插件，加上 7 个不发 npm、只存在于 `vendor/` 的内置专属插件）；
3. 打包版的链接目标可用 —— 闭包 `dsh` 被显式放到 `resources/app.asar.unpacked/dsh`
   （`electron-builder-config.mjs:191`，**真实目录**），不是 asar 内的虚拟路径。

---

## 改动 30：插件集交付链落地 —— 实测撞出的三个真问题（2026-09-26）

改动 29 定下了 A′ 的形态（实体随包 + profile 放链接）。真正跑起来的过程里，**三次崩溃**逐个
逼出三个问题，每一个都**静默**、不看日志根本发现不了。已全部修掉并复验。

### 1. 插件集的包**必须放在 `node_modules/` 下**，不能平铺在根目录

插件加载时 Node 从它的**真实路径**（目录链接会被 realpath 解析）逐级向上找依赖，而插件的
**传递依赖**（`ws` / `yaml` / `mermaid` 这类）不在它自己目录里、只平铺在插件集那一层。
平铺在根下时那个位置上没有 `node_modules`，于是这些 `import` 全部失败，**插件树静默不加载**。

症状：`web boot: 3 entries did not activate` —— `dsh-video-preview` / `dsh-excel-panel` /
`@huanlin/…-office` 全在 `pending (waiting for service: betterSidebar)`，而 `dsh-better-sidebar`
自己**一行日志都没有**（没加载，也没报错）。

**这条工作区早有记录**（手册坑 #42：往 profile 装第三方插件时，链接目标所在链路必须有
`node_modules`）—— 我撞上去才认出来是同一件事。修法：插件集产出为
`<插件集>/node_modules/<包>` + 根下 `ssid-plugins.json`；`profile-seed.ts` 的
`pluginSetModules()` 与 `listPluginPackages()` 都按这个布局读。

### 2. 插件集**不能带内核包** —— 带了会盖掉安装锚点那份

第一轮我按「插件 peer 里的 `@deepseek-ai/*` 也装进来」做，结果是**内核自己崩**：

```
Failed plugins (26):
  llm       Package: @deepseek-ai/dsh-llm       failed to import
  settings  Package: @deepseek-ai/dsh-settings  TypeError: this.load is not a function
      at [cordis.init] (…/ssid-plugins-real/@deepseek-ai/dsh-settings/lib/index.js:251:27)
```

崩溃栈里的路径就是插件集 —— **profile scope 的内核包盖掉了 installation scope 的**（锚点）。
而锚点是有效的：Electron Host 的 `runtimeDir` 由壳经 argv 传（`apps/desktop-host/src/index.ts:23`），
dev 下就是 `.desktop-build/development/project`，里面 **325 个 `@deepseek-ai` 包**、含全部内核包。

**顺带纠正我自己的一个误判**：我一度以为锚点是 `<DSH_HOME>/dsh-runtimes/dsh-primary-runtime`
（于是判定「dev 的锚点不存在」）—— 那是 `load_workspace_dependencies` 工具的产物目录，不是
Host 的锚点。**判据是 `apps/desktop-host/src/index.ts:23` 那行 `process.argv[2]`**。

### 3. 不能把内核版本号套到所有 `@deepseek-ai/*` 上

补装内核 peer 时我一度用「内核版本」（`0.1.7-rc.2`）作统一版本，连撞两次
`ERR_PNPM_NO_MATCHING_VERSION`：`@deepseek-ai/cordis` 走 **4.x** 自己的线、
`@deepseek-ai/dsh-client-runtime` 走 **0.1.1-rc.x**，只有 `dsh-tools` / `dsh-settings` 那批
才与 `@deepseek-ai/dsh` 同版。**内核包的版本线并不统一** —— 这正是自建壳 profile 里那
**313 条 overrides** 在解决的事，而 A′ 想绕过它就会撞上。（最终形态改成「插件集不带内核包」，
这条只剩记录价值。）

### 实测（dev，全新 `DSH_HOME`）

| 判据 | 结果 |
|---|---|
| seed | `ssid: plugin set: linked=584 kept=0 missing=0 bundlesAdded=32` |
| MCP CLI 交付 | `ssid: mcp ready (playwright=true codegraph=true …)` —— 之前一直是 `false` |
| 链接形态 | 336 个顶层条目、584 个包全为 Junction |
| 插件集产出 | `32 bundles / 584 packages`，含 7 个不发 npm 的 vendor 包与 codegraph 引擎 |
| 崩溃条目 | **3 → 1**（`failed to import` 归零） |

**剩下的 1 个是内容问题、不是机制问题**：`@max-null/dsh-node-appearance` 等 `settingsScope`。
见下节。

### 遗留：发版基准落后于 dev 已验证的状态

`settingsScope` 在 **dev 内核源码里零命中**（`packages/*/*/src` 全仓搜索），却存在于**安装版的**
`@deepseek-ai/dsh-client-ui-settings-plugins`（0.1.5 线）—— 所以 **npm 上的
`dsh-node-appearance@0.5.0` 是适配 0.1.5 的旧适配**；dev profile 的 vendor 那份**版本号同样是
0.5.0**，用的却是 0.1.7 的 `dsh-client-ui-plugin-manager`。

**同版本号、不同内容** —— 根因是 `shell/profile-template`（发版基准）落后于 dev profile 的
已验证状态：**template 的 vendor 只有 7 个包，dev profile 的 vendor 有 21 个**；同名包的版本
（`dsh-better-sidebar` 0.19.1 vs 0.21.1、`dsh-dream-skin` 9.16.0 vs 9.23.0、
`dsh-context` 0.54.0 vs 0.56.2 等）也整体落后。

**处置（2026-09-26，含一次做错又回退）**

我先按「以 dev 为准」把 template 回填了一遍（vendor 补 13 个包、7 个版本对齐、13 条依赖改成
`file:./vendor/…`），**复验确实通过**（全新 `DSH_HOME`、零崩溃零 pending）。**但形态是错的，已如实回退。**

**错在哪** —— `check:rules` 三门报红后查清了发版基准的正规形态。对比**安装版运行时 profile**
（自建壳部署出来的那一份）的声明：

| 包类型 | 正规声明 |
|---|---|
| 不发 npm 的（`dsh-capture`、`dsh-ssid-panels`、`dsh-context-doctor`…） | `file:./vendor/…` |
| **发 npm 的**（`dsh-achievements` `0.1.2`、`dsh-memory` `0.12.1`、`dsh-node-appearance` `0.5.0`…） | **npm 版本号** |

我把 13 个**发 npm 的包**也改成了 `file:` —— 那是 **dev profile 的手工形态**，不是发版形态。
`plugin-peers` 那门报得更直接：template 的 `pnpm-workspace.yaml` 目标内核仍是 **0.1.5-rc.2**，
而 dev 那份 vendor 是为 **0.1.7-rc.2** 编的（peer 写 `^0.1.7-rc.2`），套进旧基座必然不覆盖。

**回退**：从 `.ssid-build/template-backup-20260926-225631/` 整目录还原；`git diff
shell/profile-template` 只剩 `dsh-ssid-panels/src/client/icon-data.ts` 一行**既有**改动。
`plugin-peers` 随即转绿。

**正确的路径（待拍板）**：这类包的问题不是「声明形态」，而是 **npm 上那份是旧适配**
（要 0.1.5 的 `settingsScope`），**dev vendor 里的新适配还没发布**。所以要让 A′ 装机可用，
得**把这些包的新版本发布到 npm**（F2A：用户手动 `npm publish`），再提 template 的版本号。
**在那之前，从 template 装出来的插件集必然带旧适配。**

**复验（用已发布的真实版本，2026-09-26）**：用户发布 `@max-null/dsh-node-appearance@0.6.0`
（npm 上拿到的那份 inject 已由 `dsh-client-ui-settings-plugins` 换成 `dsh-client-ui-plugin-manager`
—— 正是 0.1.7 那套）。用一份**临时 template**（只把该包指向 0.6.0，**不碰发版基准**）重新产出
插件集，全新 `DSH_HOME` 首启复验：

| 判据 | 结果 |
|---|---|
| 插件集里的 node-appearance | `0.6.0`，inject = `plugin-manager` ✓ |
| `plugin set` | `linked=584 kept=0 missing=0 bundlesAdded=32` |
| `did not activate` / `waiting for service` / `failed to import` | 全 **false** ✓ |
| Host 9230 / web 19388 | 都 LISTEN ✓ |
| 崩溃报告 | **无** ✓ |
| client 清单（9 批合并后） | 含 better-sidebar / node-appearance / ssid-panels / plugin-center / dsh-memory ✓ |

**A′ 至此在真实交付链上成立** —— 不再依赖 dev vendor 里那份手工同步的实体。

**顺带核准的事实**：13 个 `@max-null/*` 里只有 `dsh-node-appearance` 的「源码 / vendor / npm」
三者版本不一致（源码 0.6.0、另两处 0.5.0），其余 12 个**三者完全一致**（`dsh-memory` 0.12.1、
`dsh-chat-rail` 0.6.4、`dsh-plugin-center` 0.4.1…）。所以「template 写版本号、dev 写 `file:`」
只说明**声明形态**不同，**内容**是一样的 —— 需要发布的只有一个包。

**时序约束（重要）**：`profile-template` 里该包**仍写 `0.5.0`**，这是有意的。0.6.0 的 peer 全是
`^0.1.7-rc.2`，而**安装版此刻的内核还是 `0.1.5-rc.2`**。**template 的版本号提升必须与「安装版
内核升级到 0.1.7」绑在一起**：先改 template 的话，下次部署会把 0.6.0 装进 0.1.5 内核 —— peer
不覆盖、`dsh-client-ui-plugin-manager` 服务不存在，直接崩。在此之前，fork 版靠临时 template
（或等内核升级）来用 0.6.0。

**门的状态（回退后，供对照）**：`plugin-peers` ✓ / `bom` ✓ / `legacy-names` ✓ /
`loader-external` ✓ / `dsh-clean` ✓；`vendor-sync` ✗（`dsh-ssid-panels` 四份指纹漂移）、
`profile-sync` ✗（`dsh-plugin-zhihu-search` 只在运行时、未进 template）—— **两条都是既有红，
不是本轮引入的**。

**精确差异清单**（template → dev 已验证状态，只看插件侧）：

| 类别 | 项 |
|---|---|
| **template 用 npm 版本、dev 用 vendor**（13 个，**同版本号不同内容的风险就在这类**） | `@max-null/dsh-{achievements, allostasis, chat-rail, chinese-thinking, draft-polish, guardian, habit, memory, node-appearance, plugin-center, skill-mcp-center, skills, tone-layer}` |
| **版本落后**（7 个） | `dsh-better-sidebar` 0.19.1→0.21.1、`dsh-dream-skin` 9.16.0→9.23.0、`dsh-context` 0.54.0→0.56.2、`ds-harness-remote` 0.4.14→0.4.17、`dsh-session-manager` 0.5.1→0.5.2、`dsh-sidebar-qa` 1.0.0→1.0.2、`@changfenhuang/dsh-genui` 0.11.0→0.11.1 |
| **vendor 副本缺失**（14 个，template 7 个 / dev 21 个） | 上表 13 个 + `dsh-pet-bridge` |
| **template 有、dev 没有**（需决定去留） | `@huanlin/dsh-plugin-better-sidebar-plugin-office` 0.2.0、`dsh-context-doctor`（`file:./vendor/`） |

注意最后一行：`@huanlin/…-office` 与 `dsh-context-doctor` 只在 template 的 bundles 里
（dev 的 32 项里没有）—— 前者正是第一次崩到 `pending betterSidebar` 的三个插件之一。

---

## 改动 31：Windows 打包链打通 ——「跑不通」到「产物可用」（2026-09-26）

改动 29 末尾列的三项「待做：打包链」已全部落地并**跑出可用产物**。首次真正执行
`package:win:x64:dir:unsigned` 连撞四个问题，其中三个是链上的真缺陷。

### 1. 直连 GitHub 拉 Electron 会**挂死**，且什么都不报

`prepare-runtime.ts:36` 用 `@electron/get` 下载 Electron win-x64（150 MB）。国内直连
`github.com/electron/electron/releases` 时它卡死在半路：日志停在 `$ tsx scripts/prepare-runtime.ts`、
`events.jsonl` 末条是 `stage-start download:electron` 而**没有配对的 `stage-end`**、进程活着、
**25 秒内 CPU 与读写字节三个数一起不动**，socket 却仍在（`Established` 到 `185.199.110.133:443`）。
它没有超时也没有重试 —— 白等 20 分钟。**处置**：进程环境变量
`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`（`@electron/get` 的
`dist/artifact-utils.js` 里 `mirrorVar` 读的就是它，`customDir` 默认取版本号）。实测镜像
**12 MB/s**，整个 `prepare:runtime`（Electron 下载 + 解压 + pnpm + primary runtime + smoke）
**81 秒**跑完。**两个坑中坑**：① **不能写进 `.env.windows`** ——
`desktop-package-environment.mjs:47-52` 对该文件每个键做白名单校验，非白名单键直接抛
`unsupported setting`，会把打包当场打死；② **`downloads` 缓存不保留 Electron 的 zip**
（那目录只有 primary runtime 的 python / node / 4 个 wheel，合计 90.8 MB），所以每次打包
都要重下这 150 MB —— 镜像不是「可选加速」，是必要前置。

### 2. `prepare:dsh` 连崩两次，两次原因完全不同

**第一次** `ERR_MODULE_NOT_FOUND`（`…/targets/win-x64/dsh/node_modules/@deepseek-ai/dsh/lib/profile-…`）。
定位到 **tarball 里没有实体 JS**：`deepseek-ai-dsh-0.1.7-rc.2.tgz` 只有 13 条（8 个 `.d.ts` +
README + LICENSE），而它的 `package.json` 写着 `files: ["lib/*.js", "lib/types/*.d.ts"]`、
`bin: { dsh: "lib/bin.js" }`。**排除过程**：单独跑 `build:lib:host` → `apps/cli/lib/bin.js`
**正常产出**（11 KB，连同 `profile-boot.js` 等共 7 个）；再依次跑 `build:lib:client`、
全量 `tsdown`、`tsdown --env.DSH_BUILD_FACE client`、三步连跑 —— **产物全程保留，一次未复现**。
对照同批 tarball：`dsh-tools`（2 个 js）、`dsh-subprocess-local`（4 个）、
**`dsh-experimental-webworker-packer`（3 个，含 `lib/bin.js`）** 都正常，**只有 `apps/cli` 缺**。
**重建 `apps/cli/lib` 后重跑，该问题不再出现** —— 根因**未完全定位**，记此备查（可疑方向：
上一轮构建留下的 `lib/types` 与 `tsconfig.tsbuildinfo` 和 tsdown 产物不同步）。
**第二次** `PostQueuedCompletionStatus: (6)` + `pnpm exited with 2147483651`（`0x80000003`）：
是我自己挂的探针干的 —— 它每 20 秒跑一次 `Get-CimInstance Win32_Process` 读所有 node 进程的
命令行（要访问目标进程 PEB），恰好在 pnpm spawn 子进程时打断它。**去掉探针后同一步一次通过**。
**判据**：**诊断手段本身会改变被诊断对象** —— 在这类重并发 spawn 的链路上，别用 WMI 轮询
做长时监控。

### 3. `extraResources` 丢掉源目录**顶层**的 `node_modules`，且一个字都不报

包**打出来了**、退出码 0、smoke 全过、`resources/ssid-plugins/` 目录也建了 —— 但里面
**只有那个 14.8 KB 的 manifest，819 MB 的插件实体一个没进去**：一份写着 `bundles: 32 /
packages: 584` 的清单配着一个空目录，壳照着它建链接只会指向空气。**根因**：electron-builder
对源目录**顶层**的 `node_modules` 走另一套依赖收集逻辑、最终丢掉；**嵌套的不受影响** ——
同一份产物里 `resources/runtime/pnpm/dist/node_modules` 完好无损就是反证。**正解**：**单独
再挂一条，让 `from` 指向 `node_modules` 的*内容***（`{ from: …/ssid-plugins/node_modules,
to: 'ssid-plugins/node_modules', filter: ['**/*'] }`）。**这个坑上游早就踩过**：
`electron-builder-config.mjs` 处理 dsh 依赖的那段就写着
`// electron-builder excludes a source directory's root node_modules.` 并配了完全相同的第二条 ——
我加插件集条目时只抄了「带上这一目录」，没抄这条配套。**判据**：`extraResources` 复制完要
**核对源与产物两侧的顶层条目**，不能只看目标目录在不在（我这次就是先看到目录存在便以为成了，
直到量体积 —— 0 MB vs 819 MB —— 才认出问题）。

### 实测产物（`package:win:x64:dir:unsigned`，exit=0，02:30:15 → 02:41:22）

| 项 | 值 |
|---|---|
| 整包 | **1826.7 MB**，`思灵.exe` 在 |
| `resources/ssid-plugins/` | `ssid-plugins.json`（`bundles: 32` / `packages: 584`）+ `node_modules` **336 顶层条目 / 702 实体包 / 819.7 MB** |
| 抽查插件 | `dsh-quick-toolbar`、`dsh-memory`、`dsh-ssid-panels`、`dsh-achievements`、`@astudioplus/codegraph-mcp` 全部在 |
| 其余资源 | `resources/runtime`（含 `primary-runtime`）、`resources/app.asar.unpacked/dsh` 齐 |
| 链路自检 | `desktop runtime: DOCX, XLSX, PPTX to PDF and skill CLI discovery passed` |

**本轮改动**（提交 `f2f34265d8`，`ssid-desktop-fork` 分支）：`electron-builder-config.mjs`
补 `ssid-plugins/node_modules` 的 `extraResources` 条目；`package.json` 补
`package:win:x64:dir:unsigned`（已有的两个脚本各带一半 flag，组合不存在）。

**未做**：装机首启的**实机验证**（新装一台跑起来，看 profile 建链接与插件加载）——
需要隔离环境起第二个实例，尚未执行。

### 首启实机验证（隔离环境，2026-09-27）

**第一次跑：崩了。** `web boot: 1 entry did not activate` —— `@max-null/dsh-node-appearance:
pending (waiting for service: settingsScope)`。这正是坑 #48 的现场：**打包用的发版基准
template 对该包声明 npm `0.5.0`，而 npm 上的 0.5.0 是 0.1.5 内核适配**
（`dsh.client.inject` 要 `dsh-client-ui-settings-plugins`、host 半调 `ctx.settingsScope`），
**0.6.0 才是 0.1.7 适配**（要 `dsh-client-ui-plugin-manager`，09-26 23:43 已发到 npm，
`dist-tags.latest` 就是它）。**交付链本身一处不差** —— profile 里 32 个 `link:` 全部指向
打包实体、`bundles` 34 项、`node_modules` 336 条目；**错的是喂进去的插件内容**。

**处置**：把 template 的 `0.5.0` 改成 `0.6.0` 后门立刻报红（`profile-sync`：「B 落后于 A……
**部署后会按 A 补上**」）。**我的第一反应是回退** —— 以为这一改会把 0.6.0 装进内核仍是
0.1.5 的安装版，而**那个反应是错的**：一旦确认安装版已冻结、不会再接受部署，「B 落后于 A」
就是**稳态**而非「欠一次部署」，门报红只说明它默认 B 会被重新部署。**正解**是照改，并给
`check-profile-sync` 加一个豁免类别 `exemptFrozenInB`、把撤销条件写进登记理由（手册坑 #54）。
改完门 **7/7 绿**，且豁免理由会被门原样打印（不静默）。

**第二次跑（临时副本装的 0.6.0）：通过了。**

| 验证项 | 结果 |
|---|---|
| 产物里的 node-appearance | **0.6.0**，`inject=[…ui-settings, …ui-plugin-manager]`，`client.js` 哈希与本地源码 0.6.0 **完全一致**（`46FF8C61…`） |
| 窗口标题 | **`思灵`**（首轮崩溃时是「应用无法启动或已意外停止」） |
| 进程树 | 5 个直接子进程（正常 Electron 结构），52 线程 / 194 MB |
| 监听端口 | **19388**（Host HTTP）+ 3083 |
| profile 落盘 | 32 依赖 / 34 bundles / `node_modules` 336 条目 / 无崩溃日志 |
| 红线 | 安装版 6 进程、内核宿主 53640 与 web 版 56160 全程存活 |

**结论**：A′ 交付链**端到端可用**。**唯一未决的是插件内容** —— 本次靠临时 template 验证，
**正解仍是「13 个 `@max-null/*` 包补发 npm + template 目标内核从 0.1.5 升到 0.1.7」**，
且必须与内核升级绑在一起走。

**另记一条次生现象**：两个实例共用同一个单实例锁目录（`--user-data-dir` 没能绕开它），
杀掉隔离实例后立刻重启会撞 `Another DSH instance is running` —— 那不是独立故障，
是杀进程后锁未释放导致的。


