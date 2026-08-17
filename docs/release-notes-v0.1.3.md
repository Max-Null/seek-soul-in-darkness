# v0.1.3 发布说明（2026-08-17）

## 新增

- **内置运行环境归档**：603MB 运行环境（6 万文件）归档为单个 dsh-runtime.tar.gz（123MB）打进安装包。NSIS 安装器从「逐个写入 6 万文件」变为「写入 1 个文件」，安装阶段大幅提速
- **升级感知**：启动时比对内置归档版本与已部署版本（.runtime-version = 思灵版本 + DSH 版本），版本不一致自动重部署运行环境（约 30 秒，进度条精确到文件数），可点「取消更新」跳过本次（旧版照常启动，下次启动再检测）
- **原子替换部署**：解压到临时目录 → 完整性校验 → 删旧 + 改名交换（毫秒级窗口），取消/失败/杀进程都不损坏当前版本
- **exe 图标注入**：恢复 signAndEditExecutable，思灵.exe 图标从 Electron 默认恢复为 SSiD logo
- **DSH 依赖精确锁定**：@deepseek-ai/dsh 去掉 ^（rc 阶段不再悄悄升级）

## 修复

- **目录选择器崩溃**（开发模式）：worker 改用纯 node.exe（内置 / NVM / PATH 候选链），不再退回 electron.exe 执行（koffi.view 在 V8 memory cage 下必崩）
- **开发模式 boot 失败**：tsx paths 把 loader 解析到 checkout 后，module-resolution 的改写判定失效（Cannot find package @max-null/dsh-memory）——按 vendor/loader 目录兜底判定修复
- **部署嵌套错位**：归档顶层是 profile 根内容，解压目标从 node_modules.new 改为 profile/.deploy.new，逐条目落位（此前会生成 node_modules/node_modules 嵌套）

## 体积变化

| 项 | v0.1.2 | v0.1.3 |
|---|---|---|
| 安装包 | 236 MB | 234.7 MB |
| 运行环境（解压后） | 603 MB / 6 万文件 | 603 MB（归档 123 MB） |
| 首启部署 | 复制 6 万文件 | 解压 6 万文件（进度条精确） |

## 更新说明

- 老用户安装 v0.1.3：版本检测到不一致（0.1.2-0.1.0-rc.6 → 0.1.3-0.1.0-rc.6），自动重部署一次后正常使用
- 全新安装：首启自动部署运行环境（进度条 + 约 1-2 分钟），全程无需 Node.js / pnpm / 环境变量
