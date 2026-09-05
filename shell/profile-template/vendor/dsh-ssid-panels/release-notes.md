# v0.2.0 发布说明（2026-09-06）

> 注：本版原编排为 v0.1.18（未分发即合并重打）。因内容达内核里程碑（DSH rc.1 + 三插件语义版本发布），按「未外发版本合并重打」先例（v0.1.10/0.1.11 同期情况）直接以 v0.2.0 发布；提交除版本号外与已验证内容一致，并含发布后补录的在线更新网络链修复。

## 内核升级

- **DSH 内核 0.1.2-alpha.2 → 0.1.2-rc.1（官方发布版）**：升级到官方 rc.1 内核（源码模式基于官方 `dsh-v0.1.2-rc.1` checkout 构建，闭包 214 条 @deepseek-ai/dsh-* 版本锁定同步切换 rc.1，防止运行环境组件漂移）——经 SSiD dev 环境完整适配与实测后发版
- **alpha.4 评估记录**：期间评估过 alpha.4，实测大历史会话加载卡死（净负收益）后回滚 alpha.2，最终定稿 rc.1
- **官方 rc.1 依赖范围缺陷规避**：官方若干子包依赖声明为 `>=0.1.2 <0.2.0-0`，无法匹配 rc.1 等预发布版本（干净安装 NO_MATCHING）——本版通过 profile-template 全局 overrides 强制 rc.1 家族版本解析，插件侧同步加固（chat-rail / capture 相应处理）

## 预制插件升级（rc.1 适配 + npm 最新）

- **@max-null/dsh-chat-rail 0.5.1 → 0.6.0**（npm 发布）：设定迁移到官方 settings 卡片（§9 三段式）、rc.1 适配；0.5.1 为 alpha.2 跳转失效修复线
- **@max-null/dsh-capture 0.3.0**（npm 发布 + vendor 三处同步）：截图组件设定迁移（settings 新卡片，与另两个插件同一范式）
- **@max-null/dsh-quick-toolbar 0.8.6**（npm 发布 + vendor 三处同步）：侧栏/底栏图标改用 better-sidebar 官方同款（框 + 实心内条）、悬浮球修复（7a53c9a）
- **dsh-better-sidebar 0.18.0-alpha.0 → 0.18.0**：作者发布正式版（适配 rc.1）
- **dsh-context 0.38.5 → 0.42.0**：更新至 npm 最新（rc.1 适配）
- **ds-harness-remote 0.4.2 → 0.4.9**：更新至 npm 最新
- **dsh-pocket 2.10.0 → 2.10.3**：更新至 npm 最新
- **dsh-session-manager 0.4.1 → 0.4.4**：更新至 npm 最新
- **@changfenhuang/dsh-genui 0.9.6 → 0.9.7**：更新至 npm 最新
- **@max-null/dsh-draft-polish 0.2.1 → 0.2.3**：更新至 npm 最新
- **@max-null/dsh-node-appearance 0.3.5 → 0.3.6**：steering 图标锚点迁移修复线（1b8b14e 先行 pin 0.3.5）
- **移除 @huanlin/dsh-plugin-better-sidebar-plugin-office 0.1.2**：预制列表清理（不再维护的第三方插件）

## 内置调整

- **dev 裸跑隔离（main.mjs）**：dev 模式跳过归档自动部署；profile 就绪信号从预设插件（@max-null/dsh-memory）改为内核本体（@deepseek-ai/dsh）实体——清除预设插件不再触发「归档回灌 → 依赖报错 → 回灌」死循环，dev profile 由本地 pnpm 独占维护；安装版首启/升级部署逻辑不变
- **startup cookie 清理**：启动时清除陈旧 dsh-auth cookie，根治「431 Failed to load plugins」
- **archive 版本锁定升级**：prepare-runtime overrides 214 条 0.1.2-alpha.2 → 0.1.2-rc.1（与内核升级配套）
- **workspace 适配测试支持**：pnpm-workspace 增加 tests/plugin-adapt 成员（rc.1 插件适配测试体系）

## 修复

- **在线检查更新/下载更新网络链修复**：electron-updater 的更新请求走专用网络会话，默认不继承 Windows 系统代理——国内开启系统代理（如 Clash）的环境直连 GitHub 被断（`ERR_TIMED_OUT`/`ECONNRESET`），点击「检查更新」失败（检测「新版本可用」仍可显示：GitHub API 域名直连可达，卡住的是下载/检查链路）。本版从系统设置读取代理地址注入更新会话（`http://` 前缀语法实测有效），开代理的用户检查更新/增量下载恢复正常；无代理用户行为不变（直连）
- **431 Failed to load plugins（根因修复）**：陈旧 dsh-auth cookie 清除
- **quick-toolbar 悬浮球**：修复并 vendor 同步（487843e）
- **quick-toolbar 图标**：改用 better-sidebar 官方同款（框 + 实心内条），移除根目录误放副本（仅 lib/ 保留）

## 更新说明

- 老用户安装 v0.2.0：启动时版本指纹不一致 → 自动重部署运行环境（约 30 秒，可跳过；重部署后 profile 与本版预置一致，含 rc.1 内核）
- 全新安装：首启自动部署（进度条），全程无需 Node.js / pnpm
