# SSiD（思灵）开发手册

> 适用范围：在 `seek-soul-in-darkness`（SSiD 库）内做开发、升级、验证的完整手册。
> 配套仓库与工作区布局见下方「工作区布局」。
> 事实来源：2026-08-29 SSiD 升级（rc.2 → master 0.1.2-alpha.1）全过程实测记录（见 `docs/决策/2026-08-29-SSiD升级执行记录.md`）。

## 铁律速查（一页纸，2026-08-30 定稿）

| # | 铁律 | 详见 |
|---|---|---|
| 1 | 放置规则：自制插件→`max-null-plugins/`；第三方→`third-party-plugins/`；参考/学习→`references/`；旧项目→`old-project/`；生态同级→顶层 | 工作区规范 |
| 2 | **不弑主体**：当前会话在 web(3080) 时禁启停任何 DSH 实例；重启前先判断会话宿主 | 环境与流转 5 |
| 3 | 三环境流转：升级/测试谁，用另一半操作（医者不能自医） | 环境与流转 1–4 |
| 4 | dev 热更新，**发版才归档**；归档从模板（发版基准）构建 | §2 |
| 5 | 插件升级**双处声明**（profile + template）；JSON 一律 node 写（防 BOM） | §4 / §7 |
| 6 | **L1 门槛**：typecheck+test 全绿才能发版/进全家桶；新插件无测试不入库 | §9 |
| 7 | README **必须**有 `## 截图` 段 + `docs/shots/`（用户视角三覆盖） | §9 |
| 8 | 样式一致：DSH token + `data-slot`/aria-label 锚点；侧边栏插件耦合**不假设移除** | §9 |
| 9 | **npm 发版 F2A**：publish 由用户手动，开发会话只给指令 | §9 / 流转 5 |

## 文档体系（层级）

- **手册**（本文件）= 规范权威（准则/流程/坑/待办）
- **`docs/决策/`** = 历史决策与执行记录（来龙去脉；规范的引用来源）
- **跨会话记忆** = 索引与速查（memory_search；与手册保持一致，过时即更新）

## 变更记录

| 日期 | 章节 | 变更 | 来源 |
|---|---|---|---|
| 2026-08-29 | §0–§8 | 初版（升级经验 8 节） | web 3080 会话 |
| 2026-08-29 | 工作区布局（初版） | 升级链路与目录关系 | web 3080 会话 |
| 2026-08-30 | 工作区规范（布局+放置规则） | 工作区整理定稿（目录/README 体系） | web 3080 会话 + 用户拍板 |
| 2026-08-30 | 开发环境与测试流转 | 三套 DSH 环境 + 医者不能自医流转 | 用户原话整理 |
| 2026-08-30 | §2 归档时机 | dev 热更新 vs 发版才归档（三原因） | 用户原话整理 |
| 2026-08-30 | 本表 + 待办清单 | 文档工程化（变更记录/待办） | 协作模式升级 |
| 2026-08-30 | §9 插件开发与测试规范 | 分级门槛 L1/L2/L3 + 反馈环纪律 | 用户提议（测试补齐后门槛化） |
| 2026-08-30 | §7 坑速查 | 新增 #10「DSH 页面状态持久化 = host 化，禁 localStorage」（动态端口 origin 隔离坑——quick-toolbar 状态/panels seen 两次实踩）| 用户拍板（localStorage 问题多次出现）|
| 2026-09-07 | §7 坑速查 / §2 | 新增 #12「部署零保留覆盖用户层」（用户插件/MCP 升级丢失 + pending 回滚雷；v0.2.1 修复：快照+patch 合并+升级报告+pending 护栏+失败兜底）| 用户报 0.2.0 重大 bug（见 `docs/决策/2026-09-07-升级部署覆盖用户层修复.md`）|
| 2026-09-09 | §7 坑速查 / §3 | 新增 #13「预制 MCP 是 profile 级单例，索引目录不能跟随会话」+ CodeGraph 索引目录适配（`SSID_MCP_CG_WS`/`SSID_MCP_CG_ENABLE`）+ 升级合并升级为三方合并（同 id 子条目用户改动保留）| 用户报 CodeGraph 默认扫用户主目录（见 `docs/决策/2026-09-09-CodeGraph-MCP-默认索引目录修复.md`）|

## 工作区规范（布局 + 放置规则，2026-08-29 整理定稿）

### 布局（H:\MaxNull\WorkStation）

```
H:\MaxNull\WorkStation\
├── deepseek-harness                     ← DSH 官方库（upstream deepseek-ai；只引用不改）
├── seek-soul-in-darkness                ← SSiD 壳库（本手册主体）
├── max-null-plugins/                    ← ★插件全家桶★ SSiD 全家桶插件源码（每个插件一个独立 git 仓库 + README）
├── third-party-plugins/                 ← 预制/学习用第三方插件源码（含 fork，+ README 状态标注）
├── references/                          ← 参考项目与学习对象（上游项目/别家实现）
├── old-project/                         ← 旧项目归档（被替代/停更，可随时恢复）
├── awesome-dsh-plugin-pr                ← 插件市场项目（与 SSiD 同级的生态项目）
├── doc-edit                             ← 办公文档加工区（简历/PPT 等）
├── test                                 ← 测试区
└── .dsh / .playwright-mcp               ← 工作区记忆存储（隐藏）/ Playwright 数据
```

### 放置规则（新增东西放哪里 —— 判定流程）

| 新东西是什么 | 放哪 |
|---|---|
| **自制插件**（作者=Max-Null，含开发中） | `max-null-plugins/`（=「插件全家桶」，用户口头指代此处） |
| **第三方插件源码/fork**（非 Max-Null 原作，SSiD 预制或观察用） | `third-party-plugins/`（README 里标注「预制/研究对象」） |
| **参考项目/学习对象**（上游项目、别家实现、借鉴源码） | `references/` |
| **旧项目**（停更/被替代） | `old-project/` |
| **SSiD 生态同级项目**（如插件市场） | 顶层直挂（与 deepseek-harness、seek-soul-in-darkness 平级） |
| **办公文档** | `doc-edit/` |
| **DSH 官方内核相关** | 只用 `deepseek-harness`（不复制不 fork 到工作区别处） |

### 硬性约定

1. **每个目录保持独立 git 仓库**：移动=整目录搬移（git 元数据随迁）；不拆分/合并仓库。
2. **目录名 = 仓库名**（保持 git 仓库原名，不改名换皮）。
3. **每个分类目录维护 README**：新增成员必须更新该目录 README（名称/包名/版本/状态），删除成员同步移除。
4. **禁止**：顶层散落文件（归档到对应项目/doc-edit）；vendor 备份目录（`.bak-*` 放 profile 内或库外，防止进发版归档）。
5. **弃用**：本地删除即可（远端 GitHub 保留）；恢复用 `git clone` 拉回原位置。

> 注：`deepseek-harness-fork`（DSH 原生记忆官方化分支 feat/native-cross-session-memory）已于
> 2026-08-30 移除——官方不接受 PR（仅建议渠道），开发提交已归档至
> `https://github.com/Max-Null/deepseek-harness` 的 feat 分支。

## 开发环境与测试流转（三套 DSH 环境）

| 环境 | 位置 | 角色 |
|---|---|---|
| **DSH web 端**（原生 DSH） | 工作区 `deepseek-harness`（`bin.ts web`，3080；opencode 启动器管理） | 原生主环境：插件开发、生态演进验证 |
| **SSiD 开发环境** | 工作区 `seek-soul-in-darkness`（`shell` dev 裸跑） | **测试/操作副手**：验证他端变更，重启无痛 |
| **SSiD 安装版** | 工作区外（已安装的 NSIS 版） | 正式环境：发版验证/用户使用；变更只走发版流程 |

**核心原则——「医者不能自医」的推广：升级/测试谁，就用另一半操作**（被操作方重启/变更不影响操作者）：

1. **插件开发（在 web 端）**：开发完 → 用 **SSiD dev 测试**（web 端不重启；web 端自测会重启自身，医者不能自医）。
2. **DSH 大版本升级（web 端本体）**：由 **SSiD 开发环境操作**（第 1 阶段：SSiD 会话升级 web DSH + 插件适配测试）。
3. **SSiD 升级（回灌）**：web 端已达标后，由 **web 端会话操作**（第 2 阶段，2026-08-29 实测执行）。
4. **SSiD 安装版**：不做任何开发流变更；新版本通过发版流程（归档重建 → NSIS）到达。
5. **重启授权与防自杀（2026-08-30 用户拍板）**：开发会话**可自行重启 SSiD dev 自测**（不必等用户安排）；但**重启任何 DSH 前先判断当前会话宿主**——当前会话在 **web（3080）时禁止启停 web 实例**（宿主=自杀）；SSiD dev/安装版验证对象可操作。**npm 发版**已启用 F2A 验证：**发版动作由用户手动执行**，开发会话只给出指令（命令/版本/顺序）。

### 验证留痕（L2 证据链，2026-08-30）

L1 由测试留痕；**L2 环境实测必须留痕**（此前全凭口头确认，不可追溯）：

- **L2 checklist（一次实测）**：① 挂载点正确（按钮/面板出现位置）② 开关往返各一遍（无 no patch row）③ console 0 error ④ 实体版本 = 目标 ⑤ **顺手截图**（`docs/shots/`，README 用）⑥ 记一行（插件 release notes 或 `docs/验证记录.md`：日期/环境/结果/截图）。
- **追溯规则**：一次升级/适配 = 一份 L2 记录（进 release notes 即可）；未留痕视为未验证。

> 注意：web 端（3080）由 opencode 启动器管理（其生命周期/重启不在开发流控制内）；SSiD dev 的启动/关闭由用户手动执行，开发会话侧不启停任何 DSH 实例。

## 0. 快速开始（开发模式跑起来）

```powershell
# 前置：Node ≥22.13、pnpm 11.x、shell 目录已 npm install
cd H:\MaxNull\WorkStation\seek-soul-in-darkness\shell
npm start                # electron .（dev 裸跑，app.isPackaged=false）
```

- dev 裸跑 **不部署归档**（`devSkipDeploy`），启动即 boot；boot 日志在 `~/.ssid/ssid.log`。
- 无 electron 的内核冒烟验证：`npm run smoke`（`node --import tsx/esm boot-smoke.ts`）。

## 1. 架构与目录

```
seek-soul-in-darkness/
├── shell/                    # Electron 壳（main.mjs 主入口）
│   ├── kernel.ts             # DSH 内核启动（bootKernel；bundle 形态= kernel.bundle.mjs）
│   ├── main.mjs              # 窗口/BrowserView/托盘/IPC/归档部署（ensureProfile）
│   ├── titlebar.html/js      # 自绘标题栏（按钮组 → ssid:title:action IPC）
│   ├── prepare-runtime.mjs   # 归档构建（scripts/）：模板→pnpm install→tar → dsh-runtime.tar.gz
│   ├── profile-template/     # ★发版基准★：package.json(插件声明)/vendor/ 出厂技能
│   └── dsh-runtime.tar.gz    # 内置内核闭包（安装版部署源，~204MB @0.1.2-alpha.1）
├── plugins/                  # SSiD 自研插件源码（dsh-ssid-panels / dsh-ssid-zh-ui）
└── docs/决策/                # 执行记录与决策文档
```

- **插件同步链**：`plugins/<pkg>/`（源头，与 vendor 全等）→ 同步三处 vendor：`~/.dsh/profiles/{web,ssid}/vendor/<pkg>` + `shell/profile-template/vendor/<pkg>`（四份逐文件指纹一致是硬性要求，比对面按包声明；发版归档自动带模板 vendor）。dsh-quick-toolbar 是例外：源头在上游仓库、vendor 为精简副本，见 §10。
- **内核来源回退链**（`kernel.ts resolveDshRuntime` + `bootKernel`）：打包版强制闭包（preferBundled）→ dev：`DSH_CHECKOUT` 显式 → **并列源码 `../../deepseek-harness`** → 关闭时 profile `node_modules/@deepseek-ai/dsh`（部署锚点）优先于源码。
- **DSH 双实例**：DSH web 端（3080，opencode 启动器管理）与 SSiD 是不同类型（浏览器 web 进程 vs Electron 壳）；共享 `~/.dsh` 与源码 checkout——**验证 SSiD 时由用户手动启动/关闭；不要启停 web 实例**（opencode 管理其生命周期，轮换会让 web 会话工具调用显示 interrupted）。

## 2. 运行模式

| 维度 | dev 裸跑（开发/自测） | 安装版（正式） |
|---|---|---|
| 判定 | `app.isPackaged=false`（electron .） | NSIS 安装（app.isPackaged=true） |
| 归档 | 默认跳过部署（`devSkipDeploy`）；版本不一致时设 `SSID_DEV_DEPLOY=1` 强制部署（发版预演用） | 首启/升级自动部署（`.runtime-version` 对比驱动） |
| 内核 | 闭包锚点存在→闭包；否则并列源码（dev 常用） | 强制闭包 |
| 场景 | 改 kernel.ts/main.mjs/插件后即时验证 | 发版验证/用户使用 |

**发版预演**（常被误解为"dev 也要解压"）：`SSID_DEV_DEPLOY=1` 仅用于验证"归档部署→闭包 boot"这条安装版链路；日常 dev **不设**（秒级启动，无解压）。

### 归档时机 —— dev 热更新，发版才归档（2026-08-30 定稿）

- **dev 开发 = 热更新，绝不归档**：
  - 改壳代码（`main.mjs`/`kernel.ts`）→ 重启 dev 即生效（dev 直接加载源码）；
  - 改插件（vendor/plugins 源码）→ **同步运行时实体**（`node_modules/@max-null/<pkg>` 为 file: 拷贝物化，需手动拷贝或 `pnpm install`）→ 重启即生效；
  - 改内核源码（deepseek-harness）→ 源码模式（无锚点/DSH_CHECKOUT）直接生效。
- **只有 SSiD 版本收尾（发版）才统一归档**：`prepare-runtime.mjs` 重建 → 部署预演一次 → NSIS 打包。
- **三个原因**：
  1. 归档是**压缩**（安装包体积设计：204MB 归档 / 890MB 解压；安装版部署使用）；
  2. **命令行操作、慢、无进度可视化**（重建 2-5 分钟 + 部署解压更久，不便开发节奏）；
  3. 归档从 **`profile-template`（发版基准）** 构建——**反复归档会把 dev 中热更新的插件/配置整体回滚**（2026-08-29 实测：模板未同步时部署把 dsh-session-manager 等打回旧版）。**dev 改动 ≠ 归档内容**；要进归档的改动必须先同步模板（§4 双处声明）。

## 3. 环境变量与开关（shell 侧）

| 变量 | 作用 | 场景 |
|---|---|---|
| `SSID_DEV_DEPLOY=1` | 强制 dev 也部署归档（版本不一致时） | 发版预演（一次性） |
| `SSID_REGISTRY=http://127.0.0.1:4873` | prepare-runtime 闭包 install 用的 registry（写入闭包 .npmrc） | 本地发布（内核未上 npm）时构建；不设=官方源 |
| `SSID_LOG_FILE` | 覆盖日志路径（默认 `~/.ssid/ssid.log`） | 诊断 |
| `DSH_CHECKOUT` | 显式指定内核源码 | **用完即删**（pitfalls #5 幽灵依赖：User 级残留会劫持运行时） |
| `SSID_MCP_NODE`/`SSID_MCP_PW_CLI` | 预制 Playwright MCP 运行时 | main.mjs 自动注入；smoke 裸跑需手动设（否则 mcp 行 args 为 null 启动失败） |
| `SSID_MCP_CG_CLI`/`SSID_MCP_CG_WS`/`SSID_MCP_CG_ENABLE` | 预制 CodeGraph MCP：cli 路径 / 索引目录 / 是否启用 | main.mjs 自动解析注入（优先级：env → `~/.ssid/codegraph.json` → 最近会话探测 → 停用）；smoke 裸跑同样需手动设 `SSID_MCP_CG_CLI` |
| `DSH_HOME` | DSH 家目录（默认 `~/.dsh`） | 换机/测试隔离 |

## 4. 插件升级流程（本次教训：**双处声明**）

1. **改两处**：`~/.dsh/profiles/ssid/package.json`（运行时）+ **`shell/profile-template/package.json`（发版基准！）**——只改前者，归档会退回旧插件（2026-08-29 实测：部署后 profile 被归档包版本覆盖）。
2. **JSON 写入用 node**（`writeFileSync(p, JSON.stringify(o,null,2)+'\n','utf8')`）——PowerShell 5.1 `Set-Content -Encoding UTF8` 写 BOM，`readProfileManifest` 直接崩。
3. 版本**精确 pin（无 ^）**，与 web 端声明形态一致。
4. **原生/预编译 bundle 型插件**：master 的 client 模块表演进（`dsh-client-runtime`→`dsh-client-modules`）——旧 bundle 的裸 require 会挂 → 源码型插件重建；预编译型等上游发适配版（参见测试报告：context-doctor 0.6.2-master 本地构建、dream-skin PR#42 采纳后 npm 版）。
5. 升级验证：实体校验（读 node_modules/<pkg>/package.json version 对比目标表）。

## 5. 内核与归档升级

> **跨系列升级先看核对清单**：如 0.1.2 → 0.1.5 这类跨系列升级，先读 `docs/决策/2026-09-10-升级前置差异清单-0.1.2-rc.1到0.1.5-rc.1.md`（破坏性变更表 + 前置 checklist + 回滚要点）；同系列升级（如 alpha.2 → rc.1）套 `2026-09-06-SSiD内核升级执行指南-rc.1通用范本.md` 即可。

### 5.1 dev 源码模式（日常，不等 npm）
- 移出部署锚点即可回退并列源码：`node_modules/@deepseek-ai` → `.upgrade-backup/`（回滚=移回）。
- 源码模式下 profile 声明**不包含** `@deepseek-ai/dsh*` 内核族（从 checkout 解析；web 端同构）。

### 5.2 闭包归档（正式形态）
- **内核 npm 未发布时**（如 0.1.2-alpha.1）：本地构建 + 私有 registry 链路——
  1. `git worktree add <temp> HEAD`（**用干净 HEAD**：原工作区可能有调试残留探针/未提交改动）
  2. `pnpm install && pnpm run build`（tsc + tsdown，218+ 产物）
  3. verdaccio（本地 4873）+ `pnpm -r publish --registry=http://127.0.0.1:4873 --no-git-checks`（`pnpm publish` 自动把 `workspace:*` 转版本号；private 包自动跳过）
  4. `SSID_REGISTRY=http://127.0.0.1:4873 node scripts/prepare-runtime.mjs`（DSH_VERSION 自动读 DSH_CHECKOUT=deepseek-harness）
- **MISSING_PEERS 维护**（`prepare-runtime.mjs`）：master 把若干服务定义包改成了 **peer-only**（全树无 dependencies 提供者；`autoInstallPeers=false` 不自动装）：`dsh-settings`/`dsh-attachment`/`dsh-brand`/`dsh-credentials`/`dsh-jobs`/`dsh-session-persistence`/`dsh-session-query` + 20 个官方 core peer。**已删包不要加**（`dsh-client-runtime`/`dsh-host-apiproxy` 已在 master 移除，加了就 404）。
- **本地 registry 链路是临时能力**：verdaccio 存储默认在 `%LocalAppData%\Temp\verdaccio-storage`（**重启/清 Temp 即丢**）；构建 worktree（`dsh-build-clean`）为临时物（2026-08-30 已清）。需要重走本地构建时：`git worktree add` 干净 HEAD → install/build → verdaccio（**存到非 Temp 路径**，如 `H:\MaxNull\WorkStation\.build\verdaccio-storage`）→ publish → prepare-runtime。官方 npm 发布后此链路不再需要。
- 归档抽查（发版清单）：`.runtime-version = <SSiD>-<dsh>-<锁定指纹>`、`@deepseek-ai/dsh` 实体版本、插件实体、无 `.bak`/`open-sea-skin`/诊断探针污染、vendor 三处指纹。

### 5.3 部署验证
```
$env:SSID_DEV_DEPLOY='1'; npm start    # 发版预演：强制部署 → boot
# 成功链路（~/.ssid/ssid.log）：
#   runtime deploy needed (archive=... profile=...) → runtime deployed → initResult=bundled
#   → bootKernel ok port=<port> → loadURL ok → start() completed → [theme-observer] installed
# .runtime-version 应变为归档指纹；端口 HTTP / 返回 401（auth required = 服务就绪）
```

### 5.4 dev 源码模式构建正确姿势（2026-09-05 rc.1 适配实踩）

- **dev 的 web 壳 serve 根 = 源码树 `apps/web/dist`**：`@deepseek-ai/dsh-web-app` 经 tsconfig paths 映射到
  checkout 源码 → `require.resolve('@deepseek-ai/dsh-web-frontend/package.json')` 命中 monorepo workspace
  链接 → `apps/web`。**改 profile 的 `dsh-web-frontend/dist` 无效**（不读它）。
- **checkout 切换 tag 后必做 `pnpm run clean` 再全量 `pnpm run build`**：client 包 main 指向预编译 `lib/`，
  单跑 apps/web 的 `vite build` 会复用旧 lib；且 tsc 增量缓存（tsbuildinfo）在 tag 切换后产出与 src
  撕裂的 lib（报 `MISSING_EXPORT …`）。全量构建 ≈8 分钟。
- **判缺陷先 SHA256 对齐 serve 根**：先确认「服务端实际服务的是哪份 dist」（页面同源 fetch 资产对比
  磁盘 hash），再判 npm 包 / 源码树 / 构建链——不要先入为主（2026-09-05 曾误判 npm dist）。
- **alpha.1（及相邻 alpha）常见**：`apps/web/dist` 产物缺函数级导出（`FISH_LOGO_VIEWBOX` 等 7 项，
  seed.ts 静态表被 tree-shake）→ 页面 `#130 (sidebar.settings)` + `conversation: …reading 'height'`；
  **rc.1 源码全量构建产物完整**（与 npm 包 hash 一致），遇此现象优先对齐版本（alpha→rc.1）。

## 6. 壳-内核兼容契约（master 升级后重点）

| 契约点 | master（0.1.2-alpha.1）要求 | SSiD 侧实现 |
|---|---|---|
| `healProfilesModuleFallback` | **options 对象 + async**（旧双参签名失效） | `kernel.ts` 已适配（await + {installAnchor, home}） |
| `loadProfile`/`boot`/`provideCmdline`/`webServer` | 签名兼容（webServer 键名不变） | 无需改动 |
| **浏览器认证** | web 服务带 token（`connection.authenticatedUrl`）；裸 URL 401 | `kernel.ts` 产出 `kernel.url`（authenticated）/ main.mjs `loadURL(kernel.url)`——**无 token 则 splash 不替换**（2026-08-29 实测） |
| 壳标志注入 | `window.__SSID_SHELL__`（dsh-quick-toolbar 分支依据） | main.mjs 在 **dom-ready** 注入——**晚于插件 apply**！插件侧必须**兜底**（load 时复查/重算，见 quick-toolbar client.js） |
| `patchReload` | web=live；默认 live | profile/模板显式声明 `"live"` |
| `dsh-sidebar-qa ≥0.5.0` | 依赖 `remote.session`（master 提供；rc.2 无） | 升级到 0.5.0 需随 master |
| server 认证 401 | smoke 断言需接受 401 | `boot-smoke.ts` 已更新 |

## 7. 常见坑速查（全部来自实测）

1. **BOM**：改任何 profile/模板 JSON 用 node；PowerShell 写文件（Out-File utf8/patch）都带 BOM → git apply 失败、DSH 崩溃。
2. **PowerShell 5.1**：无 `??`/`?:`（PS7 语法）；管道传 git 输出会转码破坏字节流（用 node 中转）；`@playwright` MCP 等 `.cjs` 必须 node 显式执行（ShellExecute 假执行）。
3. **dev 模式部署**：默认 skip；只有 `SSID_DEV_DEPLOY=1` 才强制（发版预演；预演完恢复正常 dev 启动）。
4. **旧实例占锁**：boot 失败实例挂住（splash 等待）→ 占 single-instance 锁 → 新实例假退出；**先清进程再重启**。
5. **worktree 构建**：原 checkout 可能有进行中的调试（探针/修复/未提交改动）——构建/发布用 `git worktree add` 干净 HEAD + 有意合入的补丁。
6. **vendor 污染**：模板 vendor 下不要放备份目录（`.bak-*` 会被归档卷进且触发 vendor 副本修复）——备份放 profile 侧或库外。
7. **verify 校验脚本的基线**：web（源码模式）无内核族依赖；**部署后的 profile 含 28 内核族声明**——实体对比时内核族按 `@deepseek-ai/*@<内核版本>` 判定，勿按 web 基线误报。
8. **smoke 环境变量**：`SSID_MCP_NODE`/`SSID_MCP_PW_CLI` 缺失 → mcp-playwright 行 args=[null,…] 校验失败。
9. **插件改名（五处联动）**：① 声明 `dependencies` 的**键和 file: 路径值都要改**（2026-08-30 实踩：只改键 → pnpm `ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND`）② `bundles` 数组 ③ plugins 源 + 三处 vendor（目录+内容）④ main.mjs/kernel.ts 注释引用 ⑤ pnpm 状态文件（`pnpm-lock.yaml`/`node_modules/.modules.yaml`/`.package-map.json`）在 install 报旧路径时逐层替换，最后 `pnpm install` 重物化（否则下次 boot bundle 解析失败）。
10. **DSH 页面状态持久化 = host 化，禁 localStorage**（2026-08-30 用户拍板规则）：思灵内核 web 端口**动态**（每次重启变化）→ 页面 localStorage 按 origin（host:port）隔离，**跨重启必丢**（quick-toolbar 位置/钉住/折叠/壳开关、panels 更新日志 seen 均踩过同坑，2026-08-30/2026-08-28 两次实踩）。**任何需要跨重启的状态一律 host 化**：存 `~/.dsh/<pkg>.json`（host 半读写 + 客户端 API 桥——panels seen 标记先例）；页面 localStorage 只允许会话瞬时态。
11. **`#130 (sidebar.settings)` / `conversation: …reading 'height'`**（2026-09-05 rc.1 适配实踩）：**先对齐 serve 根与版本**——大概率是**源码树 `apps/web/dist` 的旧版本构建产物缺函数级导出**（alpha.1 树必现；rc.1 全量构建完整）。处置：`git -C deepseek-harness checkout dsh-v0.1.2-rc.1` → `pnpm run clean && pnpm run build` → 页面 reload。**不要**改 profile dist（serve 根不在 profile）。
12. **部署零保留覆盖用户层（v0.2.0 重大事故，2026-09-07 修复）**：`deployRuntime` 部署 = 归档模板**整体覆盖** profile 根的 package.json / cordis.patch.yml / pnpm-lock.yaml / node_modules——用户**自装插件声明与自装 MCP 注册（cordis.patch.yml insert 条目）零保留**（dev 与安装版共用 `~/.dsh/profiles/ssid` 更放大了它）；叠加 `~/.ssid/pending-plugin-updates/index.json` 陈旧条目（如 dsh-sidebar-qa@0.4.2）会在每次 boot 前把兼容插件**回滚**到不兼容旧版 → `Failed to load plugins` 白屏「无法启动」；部署失败（EPERM .deploy.old）且旧环境无闭包锚点时走「无法定位 DeepSeek Harness 运行时」崩溃。**v0.2.1 修复链**：部署前快照用户配置（`~/.ssid/profile-backups/`）→ 部署后 patch 条目级合并回写（MCP 自动保留；插件只进升级报告不自动重装——旧版插件×新内核会白屏）→ pending 消费护栏（版本 < 当前声明/声明缺失/非 registry 一律丢弃）→ 失败或取消时无闭包锚点则 splash 阻断提示。相关：`docs/决策/2026-09-07-升级部署覆盖用户层修复.md`；**发版预演（L2）需覆盖「用户插件+MCP 预置后部署」场景**（SSID_DEV_DEPLOY=1 或真机）。

13. **预制 MCP 是 profile 级单例，cwd 不能跟随会话**（2026-09-09 实踩，CodeGraph 扫用户主目录）：
    `dsh-mcp-client` 条目一个进程服务所有会话，`cwd` 在 spawn 时固定
    （`packages/mcp/mcp-client/src/transport.ts` 直传 `StdioClientTransport`）——
    「默认取当前会话工作目录」这类需求在架构上不成立；改成 agent-preset 级挂载则变成
    每会话一个引擎（700–900MB/索引，内存不可接受）。且 **`cwd: ''` 会让 spawn ENOENT**
    （空字符串不能当「不设」用），所以 MCP 条目的 cwd 必须有非空值。
    处置范式：**boot 前由壳解析一次**（`shell/lib/codegraph-adapt.mjs`），解析不到就
    `disabled: !!js` 停用条目（`!!js` 求值见 `vendor/loader/src/config/entry.ts:104`，
    insert 子条目同样适用），而不是给个「看起来能用」的错误默认值。
    相关：`docs/决策/2026-09-09-CodeGraph-MCP-默认索引目录修复.md`。

## 8. 文档索引

- 本手册（总览/流程/坑）
- `docs/决策/2026-08-29-SSiD升级执行指南.md`（升级执行方案——§1.1 版版本对照表仍在参考价值）
- `docs/决策/2026-08-29-SSiD升级执行记录.md`（本次升级全过程与修复记录）
- `docs/决策/2026-08-29-DSH-master插件适配测试报告.md`（插件 × master 适配矩阵、根因、PR 追踪）
- `docs/决策/2026-08-24-Playwright-MCP-预制-实施方案.md`、`docs/发版流程规范.md`（发版：归档抽查/NSIS/GitHub Release）
- `docs/决策/2026-09-07-升级部署覆盖用户层修复.md`（用户层保留）、`docs/决策/2026-09-09-CodeGraph-MCP-默认索引目录修复.md`（预制 MCP 索引目录适配 + 三方合并）
- `docs/决策/2026-09-10-官方桌面壳评估与方案B决策.md`（官方壳底座评估、cordis inject 语义实测、**§12 host 通信通道规范草案**）
- `docs/决策/2026-09-10-升级前置差异清单-0.1.2-rc.1到0.1.5-rc.1.md`（跨系列升级的破坏性变更核对 + 前置 checklist）
- `docs/决策/2026-09-10-DSH官方工程化范式调查.md`（Agent Notes / Skills / Gates 三套机制实测 + 可移植清单）
- `docs/决策/2026-09-10-DSH工程方法论学习笔记.md`（8 个 skill 的方法论提炼：八条核心原则 + 个人/工具双线可迁移清单）
- `docs/决策/2026-09-10-DSH作为AI中台内核的评估框架.md`（就绪观察信号五维 + 可替换用法的中间道路 + 季度评估节奏）
- `docs/决策/2026-09-10-DSH方法论精读原始报告存档.md`（8 个 skill 的原始精读报告：逐字引用 + 完整规则清单，供复核）
- `docs/决策/2026-09-10-SSiD-check-rules骨架建议.md`（**待办 #5 的骨架**：四项检查的判定契约 + 编排器取舍 + 首次体检实测）
- `docs/决策/2026-09-10-DSH官方Gates拆解原始报告-E-配对与配置门.md`、`...-F-run-gates编排.md`（上述骨架的原始依据，含逐行行号引用）

## 待办清单（2026-08-30 记）

| # | 待办 | 说明 | 状态 |
|---|---|---|---|
| 1 | `shell/scripts/sync-vendor.mjs` | ✅ **完成**（2026-09-12）。**文件名偏离**：手册原写 `.cjs`，实作改为 `.mjs` —— `shell/package.json` 声明了 `type: module`，且要复用 ESM 的 `lib/vendor-fingerprint.mjs`；`.cjs` 得改回 require 写法且无法直接 import ESM（该待办写在 `.mjs` 约定确立之前）。**与已落地的 `check-vendor-sync` 互为对偶**：同步与验证**共用** `lib/vendor-fingerprint.mjs` 的比对面与指纹实现，避免出现「验证说通过、同步完却仍不一致」这类自相矛盾；实测两者对同一处差异（web vendor 的 `release-notes.md`）结论完全一致。**只处理 manifest 里 `mode: full` 且有真实 source 的包**（当前 `dsh-ssid-panels`、`dsh-ssid-zh-ui`）；`vendor-only` 的包源头在 SSiD 仓库之外或不存在，由 check 的三处互比负责。**三个安全默认（本次决策，非上游既有约定）**：① 默认 **dry-run**，须 `--apply` 才写盘；② 默认**不同步 web** —— `~/.dsh/profiles/web` 是当前会话宿主实例，改它等于动运行中的环境（工作区铁律 2），须 `--web` 显式开启且输出显著标注；③ 默认**不删除**多余文件 —— profile 下的 vendor **没有 git 保护**，删了不可逆，须 `--prune`。用法（脚本头注释有完整说明）：`node scripts/sync-vendor.mjs` 报告差异／`--apply` 写入／`--apply --prune` 连带删除／`--web` 纳入 web／`--pkg=<名>` 只处理一个。挂载 `npm run sync:vendor`。自测 5 项只覆盖三条安全默认、**不触发写盘** | ✅ 完成 |
| 2 | `shell/scripts/verify-release.mjs` | ✅ **完成**（2026-09-12）。机械化 `docs/发版流程规范.md` §4 完整性检查与 §5 七条抽查清单（体积、`.runtime-version`、open-sea-skin 默认关闭、dsh-plugin-center 与 dsh-better-sidebar 版本、dsh-capture 功能标记、顶层 dependencies、vendor 版本与源一致）。用 `tar -tzf` ／ `tar -xzOf` **选择性读取**而非整包解包 —— 185 MB 全解包要几十秒且要临时空间，而抽查只需清单里那几个文件。**默认不做部署与 boot**：那两步会改变运行环境，规范 §6.2 把它们放在本机 dev 验证环节（重启思灵看日志 ／ `npm run smoke`），脚本只打印验证方式。这也是"skill 是流程清单、脚本是机械化工具"分工的落地。**两条由实测逼出来的实现纪律**：① **tar 列表要剥 CRLF** —— Windows 上 bsdtar 输出 CRLF，条目实为 `./package.json\r`，不剥则 `endsWith("package.json")` 永假，曾让 §5 的 7 条抽查**全部误报"归档内无此文件"**；② **「读不到」必须与「内容不符」区分** —— 实测 `tar -xzOf` 对 `./node_modules/@max-null/<pkg>/...` 返回 **0 字节**，而同一文件在 `./vendor/<pkg>/...` 下可正常读出（59128 字节、含标记）；把空结果当内容不符会报假违规，**§5-5 正是这样误报过一次「归档缺功能标记」**。故 `readOrNull()` 对空结果返回 null，调用方按两种事实分别处置（"读不到"记 info 提示人工核对，不计违规）。**首次实跑**（归档 223.8 MB ／ 72712 条目）：§5-1 `.runtime-version = 0.2.1-0.1.2-rc.1-7df053b3`、§5-3 dsh-plugin-center `0.2.19`、§5-4 dsh-better-sidebar `0.18.0`、§5-6 顶层 62 个依赖含 `@playwright/mcp`、§5-7 四个 vendor 包全部一致、§5-5 功能标记 ✓ → **0 违规**。挂载 `npm run verify:release` | ✅ 完成 |
| 3 | —（已完成） | 手册变更记录表 + 待办清单 | ✅ 本轮完成 |
| 4 | 全家桶 README 截图补全 | ✅ **完成**（2026-09-12）。**口径修正**：原记「6 个缺 + 3 个半规范」，实测**缺图 10 个**（原记漏了 dsh-node-appearance 等）。处理分三类：①**新截 5 个**（dsh-draft-polish / dsh-memory / dsh-plugin-center / dsh-skill-mcp-center / dsh-ssid-achievements）——连 SSiD dev（`npm start -- --remote-debugging-port=9222`，内核动态端口不碰 3080）经 `playwright-core` CDP 截设置页，**严格按设置对话框 boundingBox 裁剪**，避免带出私人会话/工作区内容；②**归位 2 个**（dsh-capture 7 张 `shot/` → `docs/shots/` 并语义化重命名；dsh-plugin-center 3 张 `assets/` → `docs/shots/`）；③**豁免 4 个**（dsh-chinese-thinking / dsh-guardian / dsh-habit / dsh-skills 无界面元素，改用行为效果说明，见 §9 新增第 5 条）。**顺带修复系统性缺陷**：6 个插件的 `package.json` `files` 字段缺 `docs/shots`，导致**截图根本没随 npm 包发布**（dsh-node-appearance 此前一直如此）。最终 **13/13 通过审计** | ✅ 完成 |
| 5 | **规范检查器**（合并 ①） | `check-rules`：profile vs template 声明逐键对比、BOM 扫描、旧名残留、vendor MD5 四份核——挂 pre-push / 发版前置（把文字规范变成机器强制）。**骨架已产出**（`docs/决策/2026-09-10-SSiD-check-rules骨架建议.md`：判定契约 + 编排器取舍 + 首次体检实测）。**组织方式参考官方 Gates**（一脚本一职责 + 每 gate 配自测 + 统一编排器 + 命名聚合）。**2026-09-12 进度（1/4 门）**：已落地 `shell/scripts/lib/gate-report.mjs`（报告契约：`文件:行` 定位 + 三类事实 + **非零退出** + 空语料 fail-loud）、`shell/scripts/check-bom.mjs`（6 项自测全绿、已显式登记进 `npm test`，全套 35 项通过）、`shell/scripts/check-rules.manifest.json`（比对面声明，字段值取自实测复核）。**首批实战即命中两处真问题并当场修复**：① `~/.dsh/profiles/web/cordis.patch.yml` 带 UTF-8 BOM（用 PowerShell 独立读前三字节复核确认后去 BOM，门转绿 exit 0）；② `verify-header-unify.cjs` 残骸仍留在 **web/ssid 两份运行时 vendor**（tpl 已于 09-10 清理而运行时未清，造成三份不一致）——确认无任何引用后清理，三处回到 4 文件一致；它同时是 `check-vendor-sync` 与 `check-legacy-names` 两门的首个真实命中。**09-12 追加（3/4 门）**：新增 `check-profile-sync.mjs`（A=profile-template vs B=运行时 profile，四条判定 + **方向区分**；构造期排除内核族 `@deepseek-ai/*` 与 `cordis` —— 实测 B 有 33 个内核族条目而 A 一个都没有）。**命中 1 处真失配**：`@max-null/dsh-skills` 只在 B 有（集成时漏改 template），方向为「**B 超前于 A**」即下次部署会被归档覆盖；因它在 B 是 `file:` 本地路径、而 A 现有依赖实测全是 npm 版本号（绝对路径进归档包在用户机必失效），故不能照搬，登记进 manifest 白名单（**门仍打印豁免项，不静默**）并从 A 排期。新增 `check-vendor-sync.mjs`（逐文件 sha256 + 三类差异 + 文本报**首处不同行号**；按包分 `full`/`vendor-only` —— 实测整目录比对会让 dsh-quick-toolbar 报 40 处假差异）。**命中 1 处真信号**：`dsh-ssid-panels/release-notes.md` 在 **web 运行时 vendor 落后一版**（v0.2.0，而源/tpl/ssid 均为 v0.2.1）；因 web 是当前会话宿主实例（**铁律 2**）**未自动修**，保留报红待人工决定。**剩余**：check-legacy-names / check-rules.mjs 编排器 + 各门自测 **09-12 收尾（4/4 门）**：新增 `check-legacy-names.mjs`（硬域用**结构化等值匹配**而非文本扫描：profile 声明的 dependencies 键与 bundles 项、`cordis.patch.yml` 的 id/name、plugins 与 vendor 的目录名；软域 `docs/决策/`、`docs/release-notes-*` 豁免——实测全仓 grep 旧名有 79 处合法历史叙述）与编排器 `check-rules.mjs`（单入口 + 白名单 mode 校验并回显合法值、门表数据化、逐门计时、失败时 error/exit/signal 三类事实互不遮蔽、任一失败 ⇒ exit 1）。**自测 11 项全绿**（bom 6 + legacy-names 5），已显式登记进 `npm test`。其中 legacy-names 的自测以**校准正例**为前提：门在真实仓库零命中，而零命中既可能是真干净、也可能是门根本没工作——故用例 1 造已知正例证明它**会**命中，用例 4 造「注释里的旧名」反例证明它**不**误报（后者正是骨架 §3.5 说的「变更探测器」边界）。**耗时**：四门合计约 320 ms（vendor 129 / profile 51 / bom 70 / legacy 73），串行足够，未引入并发与 fail-fast。**挂载**：`npm run check:rules`；四个门各有独立 script 便于单独复现与单独接钩子。**当前唯一红**：vendor-sync 报 web 运行时 vendor 的 `release-notes.md` 落后一版（铁律 2 未自动修，待人工决定）。 | ✅ 完成（4/4 门） |
| 6 | **host 通信通道规范升格** | 决策文档 §12 草案（host 侧端点一律用 `ctx.connection.fetch.register`，不用 `webServer`）——**升格前置①已具备**（0.1.5-rc.1 已于 09-10 发布为 npm latest，其 connection 与 alpha.2 零改动）；待周末实测后升格为 §9 正式规范 | 进行中 |
| 7 | **SSiD Agent Notes 状态机** | ✅ **主体完成**（2026-09-12）。原案「`docs/决策/` 改为 `{proposed,implemented,rejected,archived}` 四状态目录」**已被替代**——物理重组要移动 110 个历史文件、破坏既有互引路径，且状态每次流转都要再移动一次、git 历史碎片化；改用**零侵入的元数据投影**：`shell/scripts/build-decision-index.mjs` 构建器 + `docs/决策/index.html`（自包含单页，110 篇可全文检索、按状态/月份/标签浏览），状态用「原文 + 类别」双字段（不批量补写；67 篇无状态头者诚实标为「未标注」并由构建器点名）。**四段模板已生效**（Problem → Decision → **Alternatives considered（必填）** → Consequences），首个范例 `docs/决策/2026-09-12-决策记录知识库化.md`。**未做**：①归档现有决策文档一批；②67 篇「未标注」需人工逐篇补状态。重建命令 `node shell/scripts/build-decision-index.mjs`。参考 §3.B.1 | 主体完成，归档待做 |
| 8 | **CoT 泄漏探针（首批）** | ✅ **完成**（2026-09-12）：落地 `shell/scripts/check-cot-leakage.mjs`，探针**逐字**取自 `@max-null/dsh-skills` 的 `ssid-trim-cot-leakage/references/recall-batteries.md`（中文 4 组 + 英文 1 组，未改写）。**关键判断——做成报告型而非阻塞门**：探针集自己写明「每个命中都需要语义判断、按设计会过度匹配」，且其「已知假阳性家族」末条对自身语料有实测（扫 8 份 SKILL.md 命中 24 处、**真泄漏 0**）；若做成命中即失败，它会第一时间误杀自己的校准语料、随后被无视——那才是真的失效。故默认**恒 exit 0**，只给候选并标注该组的已知误报家族；`--strict` 才在命中时阻塞（供收窄范围后的 CI）。**范围只取代码**（.ts/.mjs/.cjs/.js），刻意不含任何 .md：代码注释是主要载体，而 .md 里的变更叙事多为**合法主场**（决策记录／release notes／规范文档本身就在陈述变更史）。**两次踩到同一个坑并修正**：脚本最初扫到它自己（体内含探针词表，命中率恒 100%），补排后自测文件又被扫——正是 recall-batteries 第 47 条预告的假阳性家族，最终按文件名前缀 `check-cot-leakage` 整体排除。**自测 5/5**：含**校准正例**（造泄漏代码，证明探针确实在工作）与**近失负例**（`this PR` 必须命中 `this PR adds`，却不得命中 `this project`／`this process`／`this provider`），两者都出自 recall-batteries 的校准纪律。**首次实测**：29 个代码文件、42 处候选待人工判断。挂载 `npm run check:cot`。**未挂 commit-msg 的理由**：本仓库当前**零 git hooks**，引 hook 需动 `core.hooksPath` 才随克隆传播；且提交信息本身就是变更叙事，用它查 CoT 泄漏属自相矛盾。改以独立 script + `--strict` 供 CI 调用 | ✅ 完成 |
| 9 | **深挖官方 Gates 实现** | 读 3–5 个 `verify-*` 脚本源码 + `run-gates.ts` 的依赖图与聚合编排，产出「SSiD `check-rules` 可借鉴的组织方式」。参考 `docs/决策/2026-09-10-DSH官方工程化范式调查.md` §4 | ✅ 本轮完成（7 个脚本 + 编排器；产出骨架建议 + 两份原始报告存档；顺带实测出 2 处残骸） |
| 10 | **探针脚本清理** | ✅ **完成**（2026-09-12，用 `ssid-test-reliability` 的判据做的首次实战）。实测修正了原记录口径：本目录共 **59 个 `.mjs`**（原记「66 个文件」是含 `.cjs`/`.ts` 的总数）。三项：①**28 个文件**补上 `SSID_CDP` 回退——改前 52 处硬编码 `127.0.0.1:9222` 字面量、其中 28 处无回退；改后 **52 个文件全部走回退、残留 0**；②**6 个文件**的硬编码 launch token 改从 `SSID_APP_URL` 读（**新增 `helpers/app-url.mjs`**，缺失时清晰报错 + `exit 2`）；③`rc1-clean-check.mjs` 硬编码的 chromium 绝对路径**与构建号**一并删除（改由 Playwright 自行解析，否则换机器必错）。**验证**：以 HEAD 版本（改动前原文）作已知正例校准 pattern → 命中；当前工作区 0 残留；6 个文件 `node --check` 全 OK；缺环境变量 `exit 2`、给了则走到网络层。**顺带查清**：rc1-clean 探针（3083）访问的是**另一个 profile 的独立实例**，与 CDP(9222) 连的不是同一个——所以 `findDshPage` 那套"从页面 URL 取 token"的办法**对它们不适用**，这正是它们需要独立环境变量的原因。相关记录：`docs/决策/2026-09-10-skill适配说明-01-测试可靠性.md` §3（该节即用此问题作判据价值的现场证明） | ✅ 完成 |
| 11 | **`@max-null/dsh-skills` 发布与集成** | ✅ **基本完成**（2026-09-12）。8 个 skill 已生成（SKILL.md + SOURCE.md，含 1 份带 Python 编码器），4 个不适配并记录理由；GitHub 仓库 `Max-Null/dsh-skills` 已建（PUBLIC）并推送。npm 发布**已执行**——重发返回 403「cannot publish over the previously published versions: 0.1.0」，证明该版本**已在主库**；但 registry 查询仍 404，疑为 CDN 同步延迟，待观察。SSiD 侧集成**已就位并验证到 Loader 层**：`ssid` profile 双处声明（暂用 `file:` 指向本地包）→ `pnpm install`（`+16 -68`，13 个关键包核对无缺失）→ **`dsh --profile ssid --dump-config` 的组合插件树里出现 `@max-null/dsh-skills`** → 从 profile 内加载读到全部 8 个 skill。**剩余**：npm 可见后把声明换成版本号 `0.1.0`。全过程见 `docs/决策/2026-09-10-dsh-skills发布与集成.md` | ✅ 完成（npm 可见性待观察） |

## 附录 A：开发会话行为清单（2026-08-30，agent 执行前自检）

1. **改 shell 代码** → 先 `npm run typecheck`（有测试先跑测试；能红再改——反馈环）
2. **改插件** → 先跑该插件 L1（typecheck+test）；改完必复跑
3. **改 vendor 插件** → sync-vendor（或手动三处+运行时实体同步）+ 重启 dev 验证（可自重启，先判宿主）
4. **改 profile/模板 JSON** → node 写（防 BOM）；**改插件声明** → 双处（profile + template）
5. **重启 DSH** → 先判宿主（web 3080 禁）；重启后查 ssid.log（bootKernel ok / deploy 链路）
6. **发版** → 给用户完整指令（包名/版本/顺序/回滚预案），F2A 由用户执行
7. **验证留痕** → L2 checklist + 记录一行；截图顺手入 docs/shots

## 9. 插件开发与测试规范（2026-08-30 定稿）

**背景**：早期插件开发漏了自动化测试，现已补齐——全家桶 11 个插件全部具备 `build/typecheck/test` 三件套 + `tests/`。本规范把现状**门槛化**，防止回退。

### 分级门槛（克制原则：不过度强制，只锁关键环）

| 级别 | 时机 | 要求 |
|---|---|---|
| **L1 仓库级** | 每次改动、发布 npm 前 | `pnpm typecheck && pnpm test` 全绿（插件仓库标配；标准 scripts：`build`/`typecheck`/`test`，可加 `prepublishOnly`） |
| **L2 环境级** | 同步进 SSiD（vendor）前 | 在 **DSH 环境实测**（按「三环境流转」：被挂载环境 ≠ 操作环境）——插件挂载点/开关往返/console 0 error |
| **L3 发版级** | 版本收尾 | `verify-release.mjs`（待办 2，服务 ssid-release skill）+ 全家桶全量 `pnpm test` |

### 配套约定

1. **新插件必须按标准模板**：`scripts:{build,typecheck,test}` + `tests/` 目录（包根，参照 DSH 官方惯例），**无测试不进 `max-null-plugins/`**。
2. **反馈环纪律**：先写/改测试 → **跑红**（确认能捕获）→ 改代码 → **跑绿**——「改完再测」是本轮升级踩坑的教训（验证总在最后 → 返工成串）。
3. **对齐 DSH 官方**：官方惯例为 lint/typecheck/test 三件套；插件库对标 **typecheck + test** 两门槛（lint 可选，不过度）。
4. 插件发版（npm publish）必过 L1；同步 vendor 进 SSiD 必过 L2；SSiD 发版整体走 L3。
5. **npm 发版（F2A 验证已启用，2026-08-30）**：`npm publish` 由**用户手动执行**（F2A 验证），开发会话只给指令（包名/版本/发布顺序/回滚预案）。

### README 截图演示规范（推广硬门槛，2026-08-30 定稿）

**背景**：市面插件普遍无截图，用户安装前看不到效果（"哎这里咋多了个按钮呢"）。标杆：**dsh-chat-rail**（`## 截图` 段 + `docs/shots/`）。

**标准**：
1. README **必须**有 `## 截图` 段——位置：简介/徽章之后、安装之前（用户第一眼看到效果）。
2. 截图存 **`docs/shots/`**，文件名语义化（`<feature>-<n>.png`，如 `rail-fav-1`）；README 用 **Markdown 表格多图并排**（每行 2–3 张）。
3. **用户视角原则**：截图必须能回答「装完会多出/变成什么」——至少覆盖：**新入口/按钮的挂载位置**、**核心面板/交互态**（开/关或前/后对比更佳）。
4. **版本纪律**：插件发大版本（UI 变化）后**必须重截**——防「截图与实物不符」。

**我的补充（工程化）**：
- 截图**随 L2 环境测试顺手生成**（测试时截，不单独开步骤）；
- 原始屏摄（`ScreenShot/` 等）与精选（`docs/shots/`）分开，README 只引用 `docs/shots/`；
- 交互强的插件可进阶用 GIF（chat-rail 目前 PNG 即可，动图不强制）。

**现状缺口（2026-08-30 清点）**：
- ✅ 达标：dsh-chat-rail、dsh-node-appearance
- ⚠️ 半规范（图未进 shots / 空段 / 散落）：dsh-capture、dsh-draft-polish、dsh-plugin-center
  - ✅ 上述三处已于 2026-09-12 补齐（dsh-capture 归位 7 张、dsh-draft-polish 填充空段、dsh-plugin-center 归位 3 张）。
5. **无 UI 插件豁免**（2026-09-12 补）：**行为/提示注入/Provider 类**插件（不新增任何按钮、面板或设置项）**不适用**第 3 条的「入口与面板」截图要求；改为在 `## 截图` 段用文字说明「装完会多出/变成什么」的行为效果，并注明本插件无界面元素。当前适用：dsh-chinese-thinking、dsh-guardian、dsh-habit、dsh-skills。
6. **标题允许双语**（2026-09-12 补）：`## 截图` 段标题可写作 `## Screenshots / 截图` 等**含「截图」**的形式（便于英文读者定位）；校验按「h2 标题含『截图』」判定，不强制纯中文。
7. **`files` 字段必须含 `docs/shots`**（2026-09-12 补）：截图目录移入 `docs/shots/` 后，若 `package.json` 的 `files` 未列入该路径，**截图不会随 npm 包发布**（README 在 npm 页面上会显示裂图）。这是易漏项，新增截图时一并检查。
- ❌ 缺：dsh-chinese-thinking、dsh-guardian、dsh-habit、dsh-memory、dsh-skill-mcp-center、dsh-ssid-achievements（dsh-assistant-center 开发中，README 待建）

### 样式与视觉一致性（DSH 风格对齐，2026-08-30）

- **插件 UI 必须与 DSH 风格一致**（当前插件基本已做优化；新插件以此为验收项）：用 DSH 设计 token / CSS 变量（`--dsw-alias-*`、`--dsw-*`）而非硬编码色值；不破坏官方布局。
- **样式锚点**：DSH 官方可寻址样式接缝是 `data-slot="<key>"`（渲染点外裹 display:contents div），插件样式定位应基于 data-slot 而非组件 class/hash（hash 随构建漂移——教训见记忆「dsh-navpatch」与「轮次导航 aria-label 锚点」）；aria-label 是可靠的文本锚点（多语言按"中/英双文案"匹配）。
- **不要用兄弟选择器猜布局**（slot 组件 DOM 与相邻控件非兄弟关系）；布局调整如 InputBar 顺序走插件 CSS flex order + data-slot 锚点。

### 侧边栏插件耦合边界（2026-08-30）

- 我们的插件与**侧边栏插件**（dsh-better-sidebar / dsh-sidebar-qa 等）**耦合度高**——**目前没有计划移除侧边栏插件**。
- 插件开发**勿假设侧边栏会被移除**（不做「无侧边栏退化」设计）；耦合点（如依赖 better-sidebar 的挂载/布局）属于稳定依赖。

### 插件设置卡片标准（「设置——插件」页，2026-09-06 定稿·开发标准）

**适用判定**：
- **参数少（单卡一屏能放下）→ 设置——插件页卡片**（本规范的默认做法，免自建独立设置页）；
- **有独立管理界面/复杂交互**（插件中心、记忆管理、侧边卡片等）→ 独立页面，**不在此列**。
- 先例：dsh-node-appearance（首个）；@max-null/dsh-chat-rail（对比模式开关）；dsh-capture（行为设置，迁移中）。

**三件套**（缺一即卡片不显示/不生效）：

1. **host**：`ctx.inject(['settings'])` → `settings.installSection(ctx, NS, Config, config, { setSource, onChange })`
   - `NS` = 设置 namespace（如 `'dsh-capture'`）；`Config` 用 **schemastery `z`**（`z.object({...})` + 默认值=配置缺省）；
   - `config` 传初值（host 现有配置读取）；`setSource` = 值落盘回调（**保持单一数据源**，如 screenshot.json）；
     `onChange` = 应用回调（如热键重注册）；
   - ⚠️ **installSection 是「served namespaces」的唯一声明**——缺失则列表不显示
     （官方 tab-store 渲染 = Host served namespaces ∩ 注册卡片 key 的交集）。
2. **client**：`settingsScope.bind<{...}>({ namespace: NS })`（官方 ui-settings 服务）+ 注册
   **`settings.plugin.item` keyed 卡片**（key = NS）：`ctx.slots.inject('settings.plugin.item' as never,
   () => ctx.slots.register({ name: 'settings.plugin.item', key: NS, inject: () => face }, Card))`；
   卡片读 scope（`useSyncExternalStore(scope.subscribe, () => scope.getSnapshot())`）、写 `scope.set`
   （持久化由官方 settings 服务处理——免自建 API）。
3. **卡片视觉**（官方 PluginCard chrome token——对齐 node-appearance `card.module.css`）：
   - 壳：`border:1px solid var(--dsw-alias-border-l2); border-radius:12px; background:var(--dsw-alias-bg-layer-3);`
     hover `border-color:var(--dsw-alias-label-dimmed)`；
   - header（button）：标题 15px/600 `--dsw-alias-label-primary` + 描述 13px 灰 `--dsw-alias-label-tertiary`
     + **官方 chevron**（`IconChevronDownOutline14` 同款 fill path，viewBox `0 0 14 14`——**勿自绘 stroke 箭头**）；
   - 展开态 `.xCardOpen`：`background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-label-dimmed)`；
   - body（`border-top` 分隔）：行 = rowLabel 13px/500 + hint 12px 灰 + 家族开关（40×22 胶囊，`.on` `#4FC3F7`）；
   - 文案中英双语；只用 DSH token（无硬编码色值）。

**依赖注意事项**：host peer `@deepseek-ai/dsh-settings`（**建议精确 pin `0.1.2-alpha.5`**——rc.1 的传递依赖
`dsh-invariants@">=0.1.2 <0.2.0-0"` 无匹配（官方发布链 bug：0.1.2-x 全 prerelease；且 pnpm 11 单包
`pnpm-workspace.yaml overrides` 不生效，只认多包 workspace root——chat-rail 以精确 peer pin 规避）；
`@deepseek-ai/schemastery`（`z`；dependencies）。

**排查清单**：卡片缺失 → ① host 有 installSection（served）？② 卡片 key 是否 = NS？③ console 有无
slot 冲突/界面错误；切换不生效 → scope 绑定/namespace 拼写；显示为裸行/无卡片壳 → 未用官方卡片
样式（检查上述视觉段）。

## 10. 内置专属插件规范（2026-08-30 定稿）

### 定位
- 内置插件 **dsh-ssid-panels / dsh-ssid-zh-ui**：**脱离 SSiD 生态无法独立使用** → **不单独建库、不发布 npm**。
- 源码在壳库 **`plugins/`**（源头）→ 三处 vendor 同步（`~/.dsh/profiles/{web,ssid}/vendor` + `shell/profile-template/vendor`），四份**逐文件**指纹一致（源与 vendor 为全等副本，连 `src/`、`tests/`、`docs/` 都同步；**不要**按"整目录摘要相等"比）。
- **dsh-quick-toolbar（原 dsh-header-unify）已于 2026-08-30 迁出独立**（仓库 `max-null-plugins/dsh-quick-toolbar`；独立化设计见该仓库 `doc/设计/2026-08-30-quick-toolbar-独立化设计方案.md`）；SSiD 侧仍 vendor 集成——同步链 = 独立仓库构建产物 → 三处 vendor（正式发布 npm 后切官方路径）。
  - 与另两个内置插件不同，它的 vendor 是**精简副本**：只收 `lib/` + `cordis.patch.yml` + `package.json`，源码/测试/截图/README/LICENSE 都不进 vendor。按"整目录相等"核会报出 39 处假差异。
  - `plugins/dsh-quick-toolbar` 副本已于 2026-09-10 清理（2026-08-30 迁出时未删净，停留在 0.1.0）。

### 打包注意（发版）
- 归档集成**只走 vendor**：`profile-template/vendor/<pkg>` + package.json `file:./vendor/<pkg>` 声明——**不存在 npm 安装路径**。
- **禁止对内置插件执行 npm publish**；发版前置检查：确认内置插件仅经 vendor 打包（无 npm 版残留路径）。
- vendor 清理：`plugins/open-sea-skin` 残留待删（已移出预制清单）。

### 演进记录（已执行）
- **dsh-header-unify → dsh-quick-toolbar（2026-08-30 改名完成）**：功能核心已是「快捷工具栏」，命名归正；`__SSID_SHELL__` 分支具备无壳独立运行潜质。
  - 改名五处（已全部执行并 smoke 验证）：① plugins 源目录（git mv）+ package.json/cordis.patch.yml/client.js 内容 ② 三处 vendor 目录+内容 ③ 三处声明（**dependencies key + file: 路径值 + bundles 数组**——值易漏！）④ main.mjs 注释 ⑤ lockfile / .modules.yaml / .package-map.json（pnpm 状态，install 重物化）。
  - 独立插件设计迭代：**待用户详说**（design doc 后再动）。

### 门槛
- §9 适用：现状 **dsh-ssid-panels** 有 typecheck+测试；**dsh-ssid-zh-ui** 无 scripts/测试；README/截图两兄弟全缺（待补）。dsh-quick-toolbar 已迁出独立，门槛随上游仓库（`max-null-plugins/dsh-quick-toolbar` 具备 build/typecheck/test 三件套）。
