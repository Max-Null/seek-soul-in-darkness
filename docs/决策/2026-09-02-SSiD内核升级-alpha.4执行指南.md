# SSiD 内核升级执行指南：DSH 0.1.2-alpha.2 → 0.1.2-alpha.4（2026-09-02）

> 执行方：web 端（3080）会话（当前宿主）；验证对象：SSiD dev（`~/.dsh/profiles/ssid`）。
> 官方 npm 已发布 `@deepseek-ai/dsh@0.1.2-alpha.4`（与全部 30 个 `@deepseek-ai/dsh-*` 子包）——无需私有源/源码模式。
> 上游变更全景（α.2→α.4 338 提交）见 `docs/决策/2026-09-02-DSH-alpha2到alpha4-上游变更清单.md`。

## 1. 升级矩阵（npm latest 核对，2026-09-02）

| 包 | ssid 现状 | 目标 | 决策依据 |
|---|---|---|---|
| @deepseek-ai/dsh 及 30 个 dsh-* 子包 | 0.1.2-alpha.2 | **0.1.2-alpha.4** | 官方 npm 全家族已发 |
| dsh-context | 0.38.5 | **0.40.1** | 8/31 发布，适配新内核；peer 全 `>=0.1.1-rc.2` semver 兼容 |
| @max-null/dsh-node-appearance | 0.3.4 | **0.3.5** | 8/31 发布（steering 图标锚点迁移修复）；模板侧已 pin 0.3.5（1b8b14e） |
| @max-null/dsh-plugin-center | 0.2.17 | 0.2.17 | 已最新（**模板侧 0.2.16 → 0.2.17 需同步**） |
| @max-null/dsh-chat-rail | 0.5.1 | 0.5.1 | 已最新（昨日发布） |
| dsh-better-sidebar | 0.18.0-alpha.0 | **保持** | 作者适配 alpha.2 的最新版；peer `^0.1.2-alpha.2` semver 含 alpha.4；本地超前 npm latest(0.17.1) 以本地为准 |
| 其余（genui/pocket/session-manager/sidebar-qa/dream-skin/video/excel/office/harness-remote/@max-null 全系） | — | 不变 | 均已 npm 最新 |

## 2. 内核版本来源（重要）

- `shell/scripts/prepare-runtime.mjs` 的 `DSH_VERSION` **自动读取** `DSH_CHECKOUT`（默认
  `H:/MaxNull/WorkStation/deepseek-harness` = alpha.2）的 `apps/cli/package.json`。
- **发版/归档重建时**：`$env:DSH_CHECKOUT='H:/MaxNull/WorkStation/deepseek-harness-alpha4'`
  → 自动解析为 0.1.2-alpha.4（alpha.4 源码已在独立 worktree）。
- **MISSING_PEERS 无需补充**：α.4 新增包仅 `code-runtime-python`（experimental/private 不发布）
  与 `dsh-session-turn-outline`（官方 web-app bundle 以 **dependencies** 引用 → 闭包自动拉入）。

## 3. 改动清单（本次）

### 3.1 ssid dev profile（`~/.dsh/profiles/ssid/package.json`）
1. 全部 `@deepseek-ai/dsh-*` 依赖：`0.1.2-alpha.2` → `0.1.2-alpha.4`（30 个，精确 pin，node 写 JSON）
2. `dsh-context`：`0.38.5` → `0.40.1`
3. `@max-null/dsh-node-appearance`：`0.3.4` → `0.3.5`
4. `@max-null/dsh-chat-rail`：`0.5.1`（2026-09-01 已完成，实体已同步）
5. `@max-null/dsh-plugin-center`：`0.2.17`（已最新）

### 3.2 profile-template（`shell/profile-template/package.json`，双处声明铁律）
1. `dsh-context`：`0.38.5` → `0.40.1`
2. `@max-null/dsh-plugin-center`：`0.2.16` → `0.2.17`
3. `@max-null/dsh-node-appearance`：`0.3.5`（已一致）；`@max-null/dsh-chat-rail`：`0.5.1`（已一致）
4. 内核族不在 template（prepare-runtime 注入），无需改

### 3.3 执行前置
- 备份：`package.json.pre-alpha2-$(date)`（回滚用）
- **pnpm install 必须等 SSiD 实例完全退出**（node-pty 原生模块被 SSiD 内核占用 →
  `ERR_PNPM_EPERM`，2026-09-01 chat-rail 升级实踩）。

## 4. 启动验证清单（SSiD 重启后逐项）

1. 壳正常 boot（无 `Failed to load plugins` / pending waiting for service）。
2. `~/.dsh/profiles/ssid/.runtime-version`（dev 未部署）或日志确认内核 = 0.1.2-alpha.4。
3. 插件中心：bundles 无 failed；node-appearance 0.3.5 / context 0.40.1 / plugin-center
   0.2.17 / chat-rail 0.5.1 显示无更新提示。
4. 功能抽查（按 2026-08-29 指南 §4 清单）：会话管理面板、插件中心 toggle、SSiD 面板
   （习惯/Guardian/上下文医生）、better-sidebar 双面板动画、**chat-rail 导航跳转**（上次修复点）。
5. 大会话长跳转（多页补载）与 turn rail（α.4 官方新增全会话 turn rail——与 chat-rail 导航并存，确认无遮挡/重复）。
6. console 0 error。

## 5. 风险与回滚

- **breaking 面**（α.2→α.4 变更清单「插件生态影响」）：`session.events` → `snapshotEvents/eventAt`
  （@max-null 全家桶未用 `events`——chat-rail 用 getSnapshot/loadOlder，已核）；`InboxState.claimed` →
  `currentClaimed`；注入面 `keyedHooks`。若插件出现上述 API 报错，按变量名定位修复。
- **better-sidebar 0.18.0-alpha.0 在 α.4 的运行时兼容**为最大不确定项（作者未发 α.4 适配版）；
  异常时记录并等待作者版本或临时屏蔽（官方 turn rail 与 chat-rail 已覆盖导航能力）。
- 回滚：恢复 `package.json.pre-alpha2-*` → `pnpm install` → 重启 SSiD 即回 α.2 闭包。

## 6. 执行记录（2026-09-02，web 会话）

- **停止 SSiD dev**（authorized：dev 验证对象可操作）→ `pnpm install` 14.2s（+238 包，
  node-pty 顺利通过——上次 EPERM 卡点随 SSiD 关闭解除）→ 实体校验全过：
  `@deepseek-ai/dsh 0.1.2-alpha.4`、`dsh-context 0.40.1`、`@max-null/dsh-node-appearance 0.3.5`、
  `@max-null/dsh-chat-rail 0.5.1`、`@max-null/dsh-plugin-center 0.2.17`、
  `dsh-better-sidebar 0.18.0-alpha.0`（保持）、`@deepseek-ai/dsh-session-turn-outline 0.1.2-alpha.4`
  （官方 bundle dependencies 自动拉入，闭包不缺失 ✅）。
- **重启 SSiD dev**（`npm start`）：`phase start() completed`、`loadURL ok`、内核端口 3082 HTTP 200；
  本次启动日志 0 Error（历史段的 typert-registry 导入失败为 alpha.2 时代旧记录）；
  `[sidebar-diag]`、`[theme-observer]` 正常 → better-sidebar 已运行。
- **内核选择确认**：dev 模式走 `bootKernel` 部署锚点分支（`DSH_CHECKOUT` 进程/User/Machine 级
  均无残留；`profile/node_modules/@deepseek-ai/dsh` 存在）→ 实测运行 **npm 0.1.2-alpha.4 实体**
  （非并列源码 alpha.2）。
- **待用户目视确认**：插件中心版本号/无 failed、SSiD 面板（习惯/Guardian/上下文医生）、
  chat-rail 导航跳转、官方 α.4 新增 turn rail 与 chat-rail 并存无遮挡、console 0 error。
