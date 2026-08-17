# v0.1.2 一键安装

> 本版解决「安装版依赖 DSH_CHECKOUT 环境变量、不带 DSH 不算一键安装」的短板，
> 把 DeepSeek Harness 运行环境内置进安装包，全新电脑双击即用。

## 新增

- **内置运行环境（一键安装）**：安装包内嵌 `dsh-runtime/`（`@deepseek-ai/dsh@0.1.0-rc.6`
  npm 闭包 + 全部预制插件，约 600MB）。首次启动自动复制到用户 profile 并 boot，
  无需安装 Node/pnpm、无需设置 `DSH_CHECKOUT`、无需 DSH 源码。
- **首次安装进度条**：部署内置运行环境时 splash 显示真实进度（MB 计数 + 百分比），
  替代原无限动画；旧版 pnpm 在线安装路径保留为兜底。
- **错误可见化**：boot 失败不再「闪一下就没了」——splash 显示错误详情与引导
  （如 `DSH_CHECKOUT` 指向无效路径时给出 clone 指引），用户可关闭窗口。
- **splash 关闭按钮**：右上角 ✕（hover 变红），修复「插件安装完成后无法关闭窗口」。

## 修复

- **再次打开闪退**：无 DSH checkout 时 boot 失败直接 `app.exit(1)` 导致窗口闪退，
  现改为 splash 错误提示（v0.1.1 用户升级即得修复）。
- **开发模式 tsconfig paths 失效**：改为 289 条内联精确键（tsx 不支持通配符
  paths 键），开发模式不再依赖 extends 继承。

## 体积说明

| 项 | 体积 |
|---|---|
| 安装包 | 约 215 MB（NSIS，LZMA 压缩） |
| 安装后运行时 | dsh-runtime 约 603 MB（node_modules 扁平布局，hoisted） |
| 首启部署耗时 | 复制 603MB 约 1-2 分钟（机械盘更久） |

> 对比：v0.1.0/v0.1.1 安装包约 99MB，但需用户自行准备 DSH checkout。

## 更新说明

- 已安装 v0.1.0/v0.1.1 的用户：覆盖安装后**老 profile 直接复用**（跳过部署），
  无需卸载、数据不丢；如需完全全新安装可删除 `%USERPROFILE%\.dsh` 后重开。
- 安装版不再读取 `DSH_CHECKOUT`；开发模式（源码跑）仍支持该变量。
- v0.1.1 Release 保留，可回退。

## 已知边界

- 老 profile 若由 pnpm 旧版安装（symlink 布局）且缺 peer 包，建议删除
  `%USERPROFILE%\.dsh\profiles\ssid` 后重新首启（内置闭包会补齐）。
