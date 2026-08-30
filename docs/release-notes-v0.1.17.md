# v0.1.17 发布说明（2026-08-30）

## 内核升级

- **DSH 内核 0.1.2-alpha.1 → 0.1.2-alpha.2（官方 npm 发布版）**：升级到官方 alpha.2 内核（含设定 API 重构：`settingsNamespace()` 函数与页内设定注册面退役，改为按命名空间的 `settings.plugin.item` 卡片 + 服务注入；客户端模块表移除 `dsh-client-runtime`，统一由 `dsh-client-modules` / `dsh-client-ui-cordis` 承载）——经 SSiD dev 环境完整实测后发版

## 预制插件升级（适配 alpha.2 内核）

- **dsh-better-sidebar 0.17.1 → 0.18.0-alpha.0**：作者已按 alpha.2 发布适配版（上游 issue 闭环）
- **dsh-context 0.38.2 → 0.38.5**：alpha.2 适配（作者发布）
- **@max-null/dsh-node-appearance 0.3.3 → 0.3.4**：DSh settings 注册面迁移 + client 端按官方 alpha.2 范式重写（移除 runtime 类型源、`settings.plugin.item` keyed 卡片、官方 settingsScope 服务）
- **ds-harness-remote 0.4.1 → 0.4.2**：alpha.2 适配（作者发布）
- **dsh-pocket 2.8.0 → 2.10.0**：更新至 npm 最新
- **@max-null/dsh-chat-rail 0.4.0 → 0.5.0**：更新至 npm 最新
- **dsh-quick-toolbar vendor 0.8.2**：同步独立仓库构建产物

## 内置调整

- **托盘新增「刷新 web 页面」菜单**（重启按钮上方，直接 reload 宿主页面）
- **悬浮球开关（titlebar）**：圆圈+圆点状态图标（开启有点/关闭空圈）+ 过渡动画；开关初始状态改读宿主状态文件
- **vendor 清理**：归档基准移除历史残留 dsh-genui（已使用 npm 源版本）
- **归档依赖修正**：prepare-runtime 补充 alpha.2 新增的 peer-only 包（dsh-util-time / dsh-util-workspace-path / dsh-hook-protocol / dsh-authorization / dsh-sdk-protocol），修源码模式 boot 缺包

## 修复

- **dev 源码模式 boot**：deepseek-harness 切分支后 workspace 重装 + 全量构建，源码运行态与 alpha.2 一致

## 更新说明

- 老用户安装 v0.1.17：启动时版本指纹不一致 → 自动重部署运行环境（约 30 秒，可跳过；重部署后 profile 与本版预置一致）
- 全新安装：首启自动部署（进度条），全程无需 Node.js / pnpm
