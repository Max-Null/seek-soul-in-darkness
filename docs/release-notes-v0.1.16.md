# v0.1.16 发布说明（2026-08-30）

## 内核升级

- **DSH 内核 0.1.1-rc.2 → 0.1.2-alpha.1（master）**：内核架构升级（客户端模块表重构为 `dsh-client-modules`、Cordis 服务面变化、新会话/对话链路）——经 web 端（2026-08-29 适配测试）验证后回灌 SSiD；受影响插件（dsh-context-doctor / dsh-dream-skin）均按 master 适配（上游 PR 已提，采纳后切回官方源）

## 内置调整

- **dsh-quick-toolbar 0.1.0（插件按钮聚合器，原 dsh-header-unify）迁出独立**：SSiD 内置副本移除，改由 vendor 集成（`file:./vendor/dsh-quick-toolbar`，npm `@max-null/dsh-quick-toolbar@0.1.0` 已发布）；设计文档/开发手册随迁
- **open-sea-skin 移除**：该皮肤插件导致部分面板半透明（WebGPU 背景叠加干扰面板/弹窗显示）——预制依赖、声明与归档物料全面清理；i18n 修复已提上游 PR（d-dev0101/open-sea-skin#6）
- **dsh-context-doctor 0.6.1 → 0.6.2-master**：master 客户端模块表适配（本地构建；上游 PR Zhenyu98/dsh-context-doctor#10 已提，采纳后切回官方源）
- **dsh-dream-skin 8.29.0 → 8.30.1**：更新至 npm 最新

## 修复

- **dev 裸跑不再自动归档部署**：本地测试/未发布插件不再被旧归档回滚（此前 dev 运行会以旧归档覆盖本地修改，2026-08-29 升级测试期间修复）

## 文档

- **AGENTS.md 指令链**：工作区根 + SSiD 壳库自动加载
- **SSiD 开发手册**：铁律速查 → 工作区规范 → 环境流转 → 运行模式 → 流程 → 坑（开发规范权威）
- **2026-08-29 决策记录**：DSH master 插件适配测试报告 / SSiD 升级执行指南 / 升级执行记录

## 更新说明

- 老用户安装 v0.1.16：启动时版本指纹不一致 → 自动重部署运行环境（约 30 秒，可跳过；重部署后 profile 与本版预置一致）
- 全新安装：首启自动部署（进度条），全程无需 Node.js / pnpm
