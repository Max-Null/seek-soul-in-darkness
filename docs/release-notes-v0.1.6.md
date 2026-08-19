# v0.1.6 标题栏统一按钮组 + 稳定修复

> 正式版（2026-08-20）：安装包 `思灵 Setup 0.1.6.exe`（约 253 MB）

## 新增

- **标题栏统一按钮组**：自绘标题栏最小化按钮左侧新增「插件中心 / 侧栏 / 底栏」
  三个按钮，hero 页/会话页/设置页**恒可见**，样式跟随主题 token——
  解决插件中心按钮在 hero 页不可见、侧边栏按钮与 header 错位的问题。
- **内置插件 dsh-header-unify（0.1.0）**：隐藏 DSH 内原按钮（插件中心 header
  按钮 + better-sidebar toggleCluster，消除双入口与错位）；标题栏按钮经
  IPC → `ssid:titlebar` CustomEvent 驱动动作。
- **插件中心交互优化（plugin-center 0.1.7）**：再点标题栏按钮即关闭（toggle）；
  开侧栏/底栏时插件中心自动关闭（单向互斥）；点遮罩关闭面板。
- **部署失败可操作提示**：内置运行环境部署遇文件占用（EPERM）时，自动检测
  占用进程（node/electron/思灵）并提示关闭后重开即可自动继续，无需重装。
- **Skill & MCP 管理中心（dsh-skill-mcp-center 0.2.0）**：设置页 Skill 卡片
  重设计（独立展开头部 + 搜索工具栏固定）；侧边栏 Skill tab 富化（全部/全局/
  工作区分组、固定搜索、查看 SKILL.md 原文）；MCP 侧边栏状态修复。

## 更新

- dsh-plugin-center 0.1.7（全局 `__pluginCenterOpen/Toggle/Close` API）
- dsh-skill-mcp-center 0.2.0（Skill 管理 UI 重构 + readSkill + mcpStatus 修复）
- profile-template 预制 dsh-header-unify 0.1.0

## 修复

- **安装器首次安装 25% 闪退**：NSIS 宏返回值寄存器与结构体指针冲突导致
  `System::Free` 无效释放（堆损坏）——返回值改独立寄存器；步骤文本
  `mask=0` 致状态永不更新的问题一并修复。
- **启动闪退（安装版）**：worker 分支上移后残留的顶层 `void start()` 致
  worker 误走单例锁秒退；`PRODUCT_NAME` TDZ 与 `bootKernel` 块级作用域
  报错——常量前置、提升为顶层 `let`、删除残留调用点。
- **部署 EPERM 自愈**：部署落位改 rename 交换（旧→`.deploy.old`，新→落位）
  + 自动重试 5 次（约 6 秒）+ 失败回滚（旧环境完好，下次启动自动重部署）。
- **DSH_CHECKOUT 幽灵依赖根治**：打包版强制优先内置闭包（忽略用户残留的
  `DSH_CHECKOUT` 环境变量——曾致安装版静默运行旧版本内核，标题栏版本与
  归档不一致）。
- **目录选择器 worker 加固**：worker 分支上移顶层（不再加载整个 kernel
  bundle）；node 不可用时向 host 发真实错误原因；`DSH_DIALOG_TITLE` 缺失
  兜底；无 IPC 通道时记录被丢弃的消息。
- **启动错误面板可复制**：boot 失败详情支持一键复制（原无法选中文本）。

## 更新说明

- v0.1.5 用户覆盖安装本版即可；归档指纹变化会触发一次自动重部署
  （约 30 秒，可取消）。
- 新装机开箱即用标题栏按钮组；老 profile 首启部署后生效。
- 当前环境（2026-08-19）发布链执行中，本文件为预写草稿，发布前核对。
