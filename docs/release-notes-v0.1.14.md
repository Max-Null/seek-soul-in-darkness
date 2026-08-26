# v0.1.14 发布说明（2026-08-27）

## 内置升级

- **dsh-memory 0.6.0（提示词模板库）**：新增模板库机制——md 文件即模板（`~/.dsh/prompt-library/` 全局、`<workspace>/.dsh/prompt-library/` 随工作区），`prompt_search / prompt_get / prompt_list / prompt_add` 四个工具 + 记忆面板「模板」tab（列表/预览/插入/新增/删除）；模板存在即生效、永不注入 system prompt
- **dsh-genui 0.9.5 定制版**：合并上游 #60/#64/#65/#61（quiz 字符串选项、plot 滚轮锁、grade 窄布局、CI 发布守卫）+ 本地上游面板 dock 对齐；新增**模板中心**（面板 header「模板」按钮：11 个分类示例、内嵌预览、试用插入输入框/复制）与**探索成就**（「成就」按钮：12 个成就含隐藏传说彩蛋，解锁 toast + dsh-ui 自渲染成就页）
- **dsh-capture 0.2.1**：修复设置页「截图时隐藏窗口/全局快捷键」两行在壳不可用二次渲染时的 React #300 崩溃（hooks 顺序）
- **dsh-ssid-panels 0.1.7**：模板库首启种子（6 个内置模板：代码审查/周报/翻译/Bug 排查/会议纪要/PPT）+ **补入 11 条 GenUI 模板**（与 genui 面板模板中心同源指令）；升级补种机制（`.seed-version` 标记，老用户升版自动补齐，标记后永不复写）

## 新增预置

- **@max-null/dsh-achievements 0.1.0（SSiD 全家桶成就）**：19 成就 7 类别（启程/记忆/审计/GenUI/工具/行为/隐藏），监听 session/tool 事件计数（只读叶级标量，绝不读正文/文件）；`$DSH_HOME/achievements/state.json` 持久化；设置页「成就」面板（进度/稀有度/解锁态、**奖杯图标**、成就持续增加中提示卡、成就归属插件标签、未装插件置灰）+ 解锁 toast + `list_achievements` 模型工具；GenUI 类别与 genui 插件计数融合（全景同源）
- **dsh-pocket 1.14.5**（精确 pin）：本地口袋/剪藏，待使用中验证
- **ds-harness-remote ^0.3.0**：远程会话/控制，待使用中验证

## 调整

- **启动弹「思灵已更新」**：dsh-ssid-panels 内置更新日志弹窗（每版本一次）+ 关于页「更新日志」离线展示
- **在线增量更新**：electron-updater + NSIS blockmap 差分——「检查更新」增量下载变化块；全程诊断日志（`~/.ssid/updater.log`）
- genui 抽屉内「模板|成就」重复切换移除（面板 header 按钮为唯一切换）

## 修复

- **启动崩溃（在线更新绑定）**：electron-updater autoUpdater 绑定层曾用对象展开导致 EventEmitter 原型方法（on）丢失——打包版首启即 `autoUpdater.on is not a function`，已改为 Proxy 委托（原型保留 + 注入 NSIS /S 静默安装器），并新增回归守卫测试（spread 丢原型 vs Proxy 保留）。
- dsh-capture 设置页两行 React #300 崩溃（hooks 顺序：`setHidden(true)` 二次渲染跳过 useCallback）
- 更新器 dev/unavailable 状态与错误翻译；事件流/install 守卫单测

## 流程

- 发版守卫入 skill：更新器纯逻辑 + 更新日志解析测试（§3.5）；smoke-ui 支持 `--clean-sessions`/`--clean`（发布后验证会话归档与产物清理）

## 更新说明

- 老用户安装 v0.1.14：启动时版本指纹不一致 → 自动重部署运行环境（约 30 秒，可跳过；重部署后 profile 与本版预置一致）
- 全新安装：首启自动部署（进度条），全程无需 Node.js / pnpm
