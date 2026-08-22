# v0.1.9 发布说明（2026-08-22）

> v0.1.7 / v0.1.8 为本地构建验证版（tag 已打、Release 未发），v0.1.9 为包含两者全部内容的正式发布。

## 内置升级

- **内置 DSH 0.1.1-rc.2**（多模态升级：历史图片附件、vision 模型路由、Files API 图片落位）
- **预置插件全家桶升至最新**：dsh-chat-rail 0.3.1（含图消息 tip 缩略图、收起态隐藏角标、图标重设计）、dsh-plugin-center 0.2.3（AI 推荐修复、工具栏三段式重构）、dsh-memory 0.5.0、dsh-node-appearance 0.3.0 等 9 个 @max-null 插件全部对齐；dsh-better-sidebar 0.15.0、dsh-sidebar-qa 0.4.0 同步升级
- **bundles 清单修正**：移除已在依赖中删除的 dsh-skin（残留会导致启动解析失败），补入 dsh-dream-skin 与 open-sea-skin（皮肤正式生效）

## 新增

- **open-sea-skin 本地增强版（v1.2.1）**：海洋皮肤面板新增「启用开关」（禁用只卸载海洋背景、保留设置入口）、「自动昼夜循环开关」、「恢复默认」按钮；预制改为 file: tarball 离线依赖（不依赖上游 release）
- **标题栏「海洋皮肤」按钮**：插件中心按钮左侧，一键打开海洋皮肤面板（经 dsh-header-unify 转发）；原浮动按钮改 visibility 隐藏防误触

## 修复

- **插件中心**：toast 被设置面板遮罩盖住（z-index 提升）、禁用/启用单卡片乐观翻转、待重启标记与撤销文案、createPortal 改从 react-dom 导入
- **dsh-chat-rail**：展开动画结束后补发悬停 tip；投影 images 携带附件引用（stateVersion 6）

## 更新说明

- 老用户安装 v0.1.9：启动时版本指纹不一致（`0.1.8-0.1.1-rc.2-0f58d550` → `0.1.9-0.1.1-rc.2-…`）→ 自动重部署运行环境（约 30 秒，可跳过）
- 全新安装：首启自动部署（进度条），全程无需 Node.js / pnpm
