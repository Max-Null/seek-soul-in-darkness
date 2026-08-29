# DSH master 插件适配测试报告

- 日期：2026-08-29
- 背景：deepseek-harness 拉取最新 master（0.1.2-alpha.1 之后），相对 SSiD 安装版内置的 0.1.1-rc.2 有大量架构变化。web 版 DSH（`dsh web`，3080）启动后出现插件加载失败、新增会话不可用等异常，需确认插件全家桶对 master 的适配情况。
- 测试环境：`C:\Users\MaxNull\.dsh\profiles\web`（web profile，源码模式 `node --import tsx/esm apps/cli/src/bin.ts web`），Playwright 驱动 UI 验证。

## 结论速览

- 纯净版（仅 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`）→ 新增会话/完整对话链路正常；旧依赖（web profile 的 node-pty）`AttachConsole failed` 报错消失。
- 共测试 26 项插件：**24 项 ✅ 适配，2 项 ❌ 不兼容，2 项 ⚠️ 有小问题**。
- ❌ 共性问题：预编译 bundle 型插件（无源码、`lib/client.js` 为 `__ModuleLoader__` 包裹的 CJS）内部 `require("@deepseek-ai/dsh-client-runtime/client")`，而 master 的 client 模块表已无该 key（见根因分析）。

## 测试矩阵

| 类别 | 插件 | 版本 | 结果 | 说明 |
|---|---|---|---|---|
| 预制 | dsh-better-sidebar | 0.17.1 | ✅ | 折叠分组/设置入口「侧边卡片」正常 |
| 预制 | better-sidebar-plugin-office | 0.1.2 | ✅ | — |
| 预制 | dsh-sidebar-qa | 0.4.0 | ✅ | — |
| 预制 | dsh-capture | 0.2.1 | ✅ | 输入栏「截图」按钮挂载正常；tray/热键依赖壳注入 |
| 预制 | dsh-header-unify | 0.1.0 | ✅ | 壳端插件，web 端验证加载兼容即可（用户确认无需启用） |
| 预制 | dsh-ssid-panels | 0.1.9 | ✅ | 「关于 SSiD」页完整：版本/通知/会话存储（独立根 183 + 共享根 184 隔离与载入/移除）/更新日志/预制插件清单 |
| 预制 | dsh-ssid-zh-ui | 0.1.0 | ✅ | — |
| 预制 | dsh-genui | 0.9.6 (npm) | ✅ | 渲染链路实测（agent 自动渲染测试卡片） |
| 预制 | dsh-session-manager | 0.2.2 | ✅ | 对话管理面板完整（119 会话/未读/继续/路径）；**⚠️ 回收站加载失败** |
| 预制 | open-sea-skin | 1.2.1 | ⚠️ | 面板/设置/开关功能正常；**❌ i18n 不跟随 DSH locale**（按钮/面板全英文，根因见下） |
| 预制 | dsh-context-doctor | 0.6.1 | ❌ | client 模块表缺失 → 整页 Failed to load plugins（已回滚） |
| 用户批 | dsh-memory | 0.6.0 | ✅ | 记忆面板完整（15 条全局记忆/注入预览/搜索/过滤/常驻注入开关） |
| 用户批 | dsh-chinese-thinking | 0.3.0 | ✅ | 思考过程/回复均为中文 |
| 用户批 | dsh-guardian | 0.2.0 | ✅ | 无拦截异常 |
| 用户批 | dsh-chat-rail | 0.4.0 | ✅ | 消息「收藏消息」「填充到输入框」按钮挂载正常 |
| 用户批 | dsh-habit | 0.2.0 | ✅ | — |
| 用户批 | dsh-node-appearance | 0.3.3 | ✅ | 设置「节点外观」完整（思考开关/工具颜色/覆盖） |
| 用户批 | dsh-draft-polish | 0.2.1 | ✅ | 输入栏「润色」按钮正常 |
| 用户批 | dsh-plugin-center | 0.2.13 | ✅ | 插件更新弹窗正常（检测到 0.2.14） |
| 用户批 | dsh-skill-mcp-center | 0.4.1 | ✅ | Skill & MCP 管理完整（18 skill/搜索/停用） |
| 用户批 | dsh-achievements | 0.1.0 | ✅ | 成就面板（10/19 解锁，进度真实） |
| 用户批 | dsh-context | 0.34.1 | ✅ | 上下文可视化全面（统计/趋势/浏览器/事件/Agent 网络/费用估算） |
| 用户批 | dsh-video-preview | 0.1.4 | ✅ | — |
| 用户批 | dsh-excel-panel | 0.6.1 | ✅ | — |
| 用户批 | dsh-pocket | 1.14.5 | ✅ | 代理端口 3081 占用自动切 3082 |
| 用户批 | ds-harness-remote | 0.4.1 | ✅ | host/client 身份就绪，与 dsh.r2049.cn 控制通道在线 |
| 用户批 | dsh-dream-skin | 8.28.0 | ❌ | 与 context-doctor 同根因（已回滚） |

## ❌ 根因分析：client 模块表演进

- 旧 DSH（0.1.1-rc.2 时代）的 client bundle 通过 `require("@deepseek-ai/dsh-client-runtime/client")` 获取共享运行时。
- master 已将 client 模块体系重构为 `@deepseek-ai/dsh-client-modules`：shell 种下冻结的 `PLATFORM_MODULES` 表（React/Cordis/静态 UI 库），动态插件通过 `package.json` 的 `dsh.client` 声明 + `clientBundle()` 构建（产物 `lib/client.js`），非 baseline 请求走 `dsh.client.external` 精确声明。
- `@deepseek-ai/dsh-client-runtime` 包在 master 已不存在（残留的 `runtime-diagnostics` README 仍引用旧名，待更新）。旧式独立 bundle 的裸 require 找不到该 key，load 失败并带着 `missed the module table` 错误；浏览器端因此整页 `Failed to load plugins`（任一加载失败均拖垮 shell）。
- 与源码型插件（@max-null/dsh-*、npm 预编译但按新体系声明的第三方如 video-preview/excel-panel）不冲突：源码型插件重新打包时用新基线，旧 bundle 则卡死。

## ⚠️ 问题细节

### open-sea-skin i18n

- 现象：悬浮按钮/面板文案全英文（DSH 界面语言为中文）。
- 根因：`plugin/client.js` 的 `apply()` 创建 controller 时不传 `options.locale`；`selectCopy()` 回退 `document.documentElement.lang || navigator.language`，且面板创建时一次性选定、语言切换不刷新。
- 修复资源：fork `Max-Null/open-sea-skin`（分支 `feat/quick-controls-enable-toggle`）的 `harness-plugin/src/client/index.ts` 已按新版架构实现 `ctx.locale.register(SETTINGS_NS, { zh, en })`（inject 含 `locale` 服务）——重建产物即可修好 i18n（同时完成旧 bundle → 新体系迁移）。

### dsh-session-manager 回收站

- 现象：「对话管理」面板显示「回收站加载失败」，其余管理功能（列表/未读/继续/路径）正常。
- 疑似新 DSH 的回收站相关 API（trash/restore）结构变化；待深挖 0.2.2 源码确认。

## 处理建议

1. **open-sea-skin**：已本地修复（i18n 尾补丁 IIFE，见上「⚠️ 问题细节」；补丁 tgz 已同步 `~/.dsh/profiles/ssid/vendor` 与 `shell/profile-template/vendor`，下次重建 dsh-runtime.tar.gz 自动带上）。后续仍建议用 fork 源码（`Max-Null/open-sea-skin#feat/quick-controls-enable-toggle`，已实现 `ctx.locale.register`）按 master `clientBundle` 体系重建提 PR 到 d-dev01001/open-sea-skin。
2. **dsh-context-doctor / dsh-dream-skin**：2026-08-29 追升结果——
   - **context-doctor**：已本地完成 master API 迁移并构建 **0.6.2-master**（克隆上游 + 改 5 处：ClientContext 改 cordis、store 改 dsh-client-store、CLIENT_EXTERNALS 增删、slots augment 拉 ui-renderer、setup 链接重定向），实测 ✅（审计环/预算/四类统计全中文正常）。改动保留在 `.dsh-tmp/context-doctor-src`；**已提 PR**：[Zhenyu98/dsh-context-doctor#10](https://github.com/Zhenyu98/dsh-context-doctor/pull/10)（fork Max-Null：fix/master-client-modules，Closes #9）——上游采纳后 SSiD 归档可切回官方源。
   - **dream-skin**：上游 main 与 npm 均为 8.28.0。本地定位到唯一旧引用 `require("@deepseek-ai/dsh-client-runtime/client")`（6 处调用全部是 `defineStore`，master 的 `@deepseek-ai/dsh-client-store` 同签名且在种子表内）→ **一行替换**修好并本地验证 ✅（设置「Theme / 外观」面板完整：8 套皮肤/强调色/壁纸/透明度/主题包）。**已提 PR**：[RevolutionLA/dsh-dream-skin#42](https://github.com/RevolutionLA/dsh-dream-skin/pull/42)（fork Max-Null：fix/master-client-modules，v8.28.1，Closes #41）。
3. **文档同步**：deepseek-harness 侧 `packages/runtime-diagnostics/invariants/README.md` 里的 `dsh-client-runtime` 旧名应更新为 `dsh-client-modules`（待上游 PR）。

## 2026-08-29 升级记录（web 端追升）

- dsh-session-manager 0.2.2 → **0.4.1**（npm）：✅ 功能增强（归档/移出归档/移动至工作区/迁移预设/删除会话，侧边栏「会话管理」入口）；0.2.2 的「回收站加载失败」问题消失。
- （同日追升，插件中心清单）dsh-sidebar-qa 0.4.0 → **0.4.2**、@max-null/dsh-plugin-center 0.2.13 → **0.2.14**、@max-null/dsh-skill-mcp-center 0.4.1 → **0.4.2**、dsh-context 0.36.0 → **0.38.1**、dsh-pocket 1.14.5 → **1.16.1**：✅ 全部验证通过（context 0.38.1 上下文统计/浏览器/Agent 网络完整；pocket 代理 3082；插件中心「有更新 0」）。
- @max-null/dsh-achievements 0.1.0 → **0.1.2**：✅（新增「收藏」成就等）。
- dsh-context 0.34.1 → **0.36.0**：✅（上下文统计/趋势/浏览器正常）。
- dsh-context-doctor 0.6.1 → **0.6.2-master**（本地构建）：✅ 详见上。
- dsh-dream-skin：❌ 无新版（8.28.0 仍为最新，未适配）。

## 2026-08-29 侧边栏 footer 布局修复（Remote/会话管理/设置）

- **问题**：DSH master 侧边栏 footer 三个入口（Remote=ds-harness-remote、会话管理=dsh-session-manager 0.4.1、设置=官方）同排时互相挤压——会话管理被压窄成竖排文字，与官方「设置」样式不统一；收起态下 Remote 仍用 `isWide` 溢出错位（其插件自带的 `isRail` 未触发）。
- **修复（dsh-ssid-panels client 尾补丁，v5 完整集）**：JS 从稳定类名（`.dshRemoteSidebarEntry`/`.sm-footerBtn`）向上定位官方 footer 容器并挂 `data-dsh-footer`（wide/rail，React 不覆盖 data-*）+ 注入 <style> 规则（竖排全宽 or 图标 36px 居中、文字由 span 包裹后按 rail 隐藏）。纯 CSS 驱动（inline style 会被 React 重渲染清除，已排除）；嵌套 `:has()` 不受支持（已绕开）。
- **实测**：展开态三行全宽横排（Remote→会话管理→设置，与官方样式对齐）；收起态三入口图标化 36px 居中、文字隐藏；无 console error。
- 补丁集三处一致：`~/.dsh/profiles/{web,ssid}/vendor` + `shell/profile-template/vendor`（下次重建归档自动带上）。

### 迭代收敛（v10–v22，图标对齐/尺寸/颜色/宽度/间距）

- **展开态（wide）**：官方设置触发器自身带 `margin-left:-2px`（图标列 x=18），而 Remote/会话管理在 x=20 —— v16 给两插件行同加 `margin-left:-2px`，三方图标列统一 x=18。
- **收起态（rail）居中根因（v17）**：`sm-footerBtn` 是 `display:flex; justify-content:center` 但含**两个** flex 子项——svg(18px) + 文本 span（宽 0 高 0 的占位，靠 `font-size:0` 藏字）+ 插件自带 `gap:6px`，整体内容盒实为 24px，居中后 svg 中心 25 vs 按钮中心 28，**偏左 3px**。官方设置/Remote 只有一个 svg 子项（gap 0）因此完全居中。修复：rail 下 `gap:0` + `> span { display:none }`（让占位 span 真正退流）。
- **rail 图标尺寸（v18）**：v14 曾把 Remote rail 图标放大到 20px，而会话管理/官方设置是 18px，相邻三图标大小不一。统一 Remote 为 18px（与官方 rail 图标一致）。
- **rail 图标颜色（v19）**：ds-harness-remote 自带 `.dshRemoteComputerIcon { color: var(--dsw-alias-label-secondary) }` 把图标强制为灰（svg 用 `stroke:currentColor`，按钮自身的黑色不生效）。修复：`.dshRemoteComputerIcon { color: rgb(28,28,30) !important }` 覆盖到与设置/会话管理一致。
- **宽度与间距（v20–v22）**：①官方设置触发器的 `width:260px`（右缘 270）比另两行（256、右缘 266）宽 4px → 统一 256px；②wide 下 Remote 容器 `isWide` 自带 `margin-bottom:4px` 导致首段 8px、第二段 4px → 清 bottom margin，间距统一 4/4；rail 下 Remote/设置 margin 8/10 而会话管理 0（12px vs 8px）→ 三按钮统一 `margin:4px 0` + entry `height:auto`（官方 isRail 固定 54px 会多垫 4px），间距统一 8/8。
- **两个 CSS 陷阱（本轮踩坑记录）**：①`data-dsh-footer` 只挂在 footerActions 上，`settingsArea` 是兄弟子树 → 针对设置按钮的规则全部静默失效，需 JS 给其单独挂 mark（稳定 class + 自身 data-dsh-footer）；②`[data-dsh-footer="rail"] .EWqqVW_footerActions { gap:0 }` 用后代组合器不会匹配属性宿主自身，必须写成 `[data-dsh-footer="rail"].EWqqVW_footerActions`。
- **实测（v22 后，3080）**：wide 三按钮 x=10/w=256/右缘 266、图标 16×16@x18、黑色、间距 4/4、radius 12px、hover 背景一致 rgba(0,113,227,0.1)；rail 三按钮 36×36、图标 18×18 中心 28、黑色、间距 8/8；像素采样确认三行背景一致（透明透出 #f4f4f6）；无 console error。
- 补丁发生器：`.dsh-tmp/patch-fix-sidebar-footer-v{10..22}.mjs`（每个追加一个幂等 IIFE style/JS 注入）。

### 2026-08-29（下午）撤回 + 会话管理入口迁移到标题栏（header-unify）

- **撤回**：footer 布局补丁 v1–v22 全部回滚——dsh-ssid-panels 三处 vendor（web/ssid/profile-template）恢复为插件源干净版（0.1.9，63750B，MD5 一致），footer 恢复 dsh-session-manager 0.4.1 官方样式。教训：与官方 footer 的 CSS Modules 哈希类 + 动态布局对抗成本过高（v16–v22 反复微调仍难收敛），改走"入口迁移"而非"样式对齐"。
- **入口迁移（新方案）**：会话管理按钮从 footer 迁到「壳标题栏统一按钮组」——`dsh-header-unify`（v0.3.0）：
  - DSH 侧：`HIDE_CSS` 加 `.sm-footerBtn { display:none !important }`（0.4.x）；`ssid:titlebar` detail=`session-manager` 桥接打开面板——优先 `.sm-footerBtn`（master 0.4.x，footer 按钮 display:none 后 JS click 仍触发 React onClick → panelStore.set(true)），兜底 `[data-dsh-header-button]`（rc.2 0.2.x header utilities 的「会话管理」按钮 → setDrawer({open:true,view:'manage'})）；另在会话 header（.sm-header）内嵌兜底按钮（web 无标题栏时用）。
  - 壳侧：`shell/titlebar.html` 加「会话管理」按钮（btn-session-manager）+ `titlebar.js` 转发 `action('session-manager')`（main.mjs 的 `ssid:title:action` 转发本就通用字符串，无需改）。
- **版本适配差异**：web/master 用 dsh-session-manager **0.4.1**（有 sm-footerBtn/sm-header，面板=SafePanel modal）；SSiD/rc.2 用 **0.2.2**（无 footer 按钮，header utilities 已有「会话管理」按钮 HeaderManageButton → 抽屉；稳定标识 `data-dsh-header-button`）。桥接函数双目标覆盖两版。
- **已知待办**：dsh-header-unify 的 client.js 在 web/master 上**未激活**（rc.2 时代 `window.__ModuleLoader__.load` CJS 自注册 bundle，master Loader 不调用其 apply——v0.2 起 `toggleCluster` 隐藏就从未生效；页面无报错静默跳过）。列入「web DSH 升级测试」适配项：按 master 客户端插件规范迁移（package.json `dsh.client` schema + bundle 导出格式）。当前 SSiD（rc.2）上 v0.2 正常生效，v0.3 文件已同步三处 vendor，重启壳后生效。

## 2026-08-29 用户升级计划与协作原则（原话记录）

用户明确的双阶段升级计划与协作约定，后续所有工作遵循：

- **双阶段升级计划（用户原话）**：「先通过 SSiD 发起会话升级 web DSH，并进行插件测试；完成后在 web DSH 开启会话升级 SSiD 并将插件更新，这样才能保证可用。」
  - 第 1 阶段：SSiD（稳定基石）→ web DSH（试验场）：升级 master + 插件适配 + 测试。
  - 第 2 阶段：web DSH → SSiD：确认可用后，把升级后的插件/配置回灌 SSiD。
  - 目的：保证可用后再动 SSiD，避免把稳定环境搞坏。
- **协作原则**：
  - 当前会话运行在 54621（SSiD 壳）上——**不得重启/停止 54621 的任何进程**（会中断当前会话）；SSiD 保持稳定，只允许同步 vendor 文件，生效时机由用户安排。
  - web（3080）不是当前会话宿主，可以随意重启验证。
  - 用户对探索性尝试的反馈：「不要急」——小改动若反复不收敛，及时止损换方案（如 footer 样式对齐 → 放弃改为入口迁移）。
- **dsh-header-unify 定位（用户澄清）**：header-unify 是 **SSiD 专属插件**，配合 SSiD 的壳（标题栏按钮组）把乱七八糟的插件按钮集成到壳的标题栏——不是给无壳的 web 用的；web 上其 master 激活问题属于第 1 阶段适配项。
- **集成诉求（用户原话）**：「你把会话管理的按钮屏蔽了，集成到 header-unify 吧」「不要回滚 header-unify」。即：隐蔽 session-manager footer 按钮（0.4.x），入口统一到壳标题栏（v0.3 已实现）；header-unify 的改动不可回滚。

## 2026-08-29（晚）web 三个插件升级（LLM 更新流程）

- **dsh-dream-skin 8.28.1 → 8.29.0（vendor → switch-npm）**：本地为 vendor 8.28.1（带一行 require swap 定制）；8.29.0 发布说明含「Merge PR #42 · point defineStore require at dsh-client-store」——**本地定制已被上游采纳**（实测 8.29.0 client.js 中 `dsh-client-runtime` 出现 0 次）。依赖声明 `file:vendor\dsh-dream-skin` → `8.29.0`，vendor 目录保留未删（可回退）。
- **dsh-sidebar-qa 0.4.2 → 0.5.0**：插件中心标记「不兼容当前 DSH」——核实为**误判**：engines.dsh `>=0.1.2-alpha.1` 恰好等于运行时 master 源码版本 0.1.2-alpha.1；0.5.0 客户端含 13 处 `remote.session` 服务依赖，但 **master 提供该服务**（0.4.2 在 web 上运行正常即证据；SSiD rc.2 无此服务，血泪陷阱不适用于 web/master）。peer dsh-better-sidebar >=0.16.0（已装 0.17.1）✓。升级后页面加载正常、0 console error、无 pending。
- **dsh-pocket 2.0.0 → 2.1.3**：patch 级（移动端工作区菜单 #72、iOS 触摸自适应、停止注入 dsh-desktop-* markers），peer 同 2.0.0，低风险直接升。
- **连带发现与修复（重要）**：本轮 head-unify v0.3 在 master 上**被实际激活**（v0.2 时代在 web 上未激活——重装后 master loader 正常加载并调用 apply；SSiD 升级到 master 后必然同此）。因 v0.3 的 HIDE_CSS 会隐藏 pc-headerbtn/toggleCluster（设计给壳标题栏复制的入口），**无壳 web 上插件中心/侧栏按钮被切断**——修正：header-unify 按 `window.__SSID_SHELL__` 标志分支——壳环境（main.mjs 在 mainView dom-ready 后注入）才隐藏原按钮；无壳 web 保留。现在 web：插件中心/侧栏按钮保留 + 会话管理迁 header（footer 隐藏）+ titlebar 事件桥接均正常；SSiD：重启壳后标题栏接管行为不变。
- **过程教训（BOM）**：PowerShell 5.1 `Set-Content -Encoding UTF8` 写 package.json 会带 BOM，DSH 的 `readProfileManifest`（JSON.parse）直接崩溃 `Unexpected token ﻿`——**改 profile JSON 一律用 node（writeFileSync utf8 无 BOM）**。已用 node 重写修复。
- **实测（升级后 3080）**：三插件实体版本 8.29.0 / 0.5.0 / 2.1.3；插件中心「已安装」显示一致、开关状态启用；header「会话管理」按钮点击 → 面板正常；0 console error；已写入 `~/.dsh/plugin-center/llm-update-log.jsonl`。

## 2026-08-29 open-sea-skin 移除决策

- **原因**：open-sea-skin 导致部分面板半透明（WebGPU 背景叠加干扰面板/弹窗显示）。
- **动作**：①web profile 卸载（依赖/bundle/vendor tgz）；②SSiD 预制清单移除（`profile-template/package.json` 的 dependencies+bundles、`profile-template/vendor` 与 `~/.dsh/profiles/ssid/vendor` 的 tgz、vendor README 条目）；③下次发版重建 dsh-runtime.tar.gz 时生效。
- **修复不浪费**：i18n 尾补丁修复（跟随 DSH document lang，与本地一致但基于上游 1.2.1 原版字典）**已提报告原仓库**：[d-dev0101/open-sea-skin#6](https://github.com/d-dev0101/open-sea-skin/pull/6)（v1.2.2，fix/i18n-locale-follow）。注意上游正确仓库是 **d-dev0101**（非 d-dev01001）。
- **剩余引用检查**：scripts/repack-open-sea-skin-vendor.mjs 及其在发版流程里的调用需在下次发版时移除/更新。

## 2026-08-29 原生轮次导航栏屏蔽（TurnNavigator rail）

- **对象**：DSH master `@deepseek-ai/dsh-client-ui-chat` 的 TurnNavigator（消息流右侧轮次导航竖轨，aria-label「轮次导航/Turn navigation」，items<2 不渲染）。
- **屏蔽方案（已生效）**：在 `dsh-ssid-panels` 的 client.js 追加尾补丁 IIFE（`dsh-ssid-hide-turn-rail` style 规则，aria-label 双文案锚点），已同步 `~/.dsh/profiles/{web,ssid}/vendor` 与 `shell/profile-template/vendor`。
- **可借鉴设计（官方 rail 优于我们的点）**：①轮次 hover 预览（prompt/response 浮层 + 指针定位）②完整 aria（jump/turn/current）③marks 溢出压缩与 inset 布局 ④翻页锚点补偿（pagingAnchor）。局限性：仅轮次跳转，无收藏/复用。
- **正轨跟进（待办）**：向 deepseek-harness 提 PR——ui-chat 的 `ChatSettings` 增加 `showTurnRail`（默认 true）配置，SSiD 侧设置关闭后可移除本补丁。



- 3080 web 实例运行 27 个 bundle（官方 2 + 预制 9 + 用户批 16 中可用 15 + 无 context-doctor/dream-skin），无 console error。
- web profile 备份：`~/.dsh/profiles/web/.bak-pure-20260829-111424/`（配置 + node_modules + vendor）。
- 回滚项：dsh-context-doctor、dsh-dream-skin（bundle 与依赖均已清理，可随时按本报告恢复测试）。
