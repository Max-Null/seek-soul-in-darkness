# v0.1.13 发布说明（2026-08-26）

## 内置升级

- **dsh-memory 0.5.2（跨会话记忆）**：注入预算治理（记忆常驻注入受预算约束）、中文 2-gram 检索（比 word 切分更准）、记忆生命周期、可插拔语义检索、存储文件名迁移；记忆面板布局优化（工具栏与 namespace tab 固定顶部）
- **dsh-plugin-center 0.2.13（插件中心）**：0.2.11 更新检测区分热更新（纯前端提示已热生效无需重启）→ 0.2.12 pnpm 静默 no-op 识破（exit 0 但版本未变报真实错误）→ 0.2.13 捆绑 pnpm 假执行修复（pnpm 是 .cjs 须 node 显式执行）+ 禁用失效修复（无稳定 id 条目按 name 寻址）
- **dsh-better-sidebar 0.16.1**：VSCode 式右侧栏（explorer/editor/terminal/git/browser）小版本修复
- **dsh-dream-skin 0.4.14**：换肤（iOS/Linear 清冷主题 + 壁纸 + 智能背景 + 主题包分享）主题与稳定性增强
- **Office 文件预览 0.1.2**：better-sidebar 编辑器 docx/xlsx/pptx 文件查看器小版本修复

## 新增预置

- **dsh-context 0.32.0**：上下文可视化「1 号位」——Context 标签页（组成/趋势/事件/消息/浏览器）+ `/context` 斜杠命令，悬停趋势柱即预览该 step 的上下文构成
- **dsh-genui 0.9.2（SSiD 定制）**：回复内交互 UI（`dsh-ui` fence：仪表盘/表格/曲线/判卷/常驻面板/事件回传），安装版 **自带上游 PR #58 的面板样式修复**——会话面板 dock 对齐宿主导航/输入区宽度轴、标题栏分隔线、徽标间距、宿主图标折叠箭头（上游合并后自动切换官方版）
- **dsh-context-doctor 0.6.1**：上下文注入审计——指令链/技能目录/工具 schema/MCP 四项 token 成本、跨文件重复与同名遮蔽检测、composer 圆环面板 + `context_audit` 模型工具
- **genui 教学技能**：`genui` skill 随预置技能包安装，模型无需提示即会输出 `dsh-ui` 界面

## 调整

- **移出 dsh-web-preview-panel 预制**：该插件禁用失效（根因 + 修复方案已落档 dsh-plugin-center 仓库），不再随安装版分发
- **移除 dsh-ssid-screenshot 源码残留**：源码已于 8-23 迁至独立仓库（`Max-Null/dsh-ssid-screenshot`），截图能力由 dsh-capture（重命名收尾）承担；本轮清理残留目录

## 修复

- **SSID_PNPM 假执行**：捆绑的 pnpm .cjs 必须用 node 显式执行（同插件中心 v0.2.13 修复），否则插件中心「发起更新」可能显示成功但未实际安装

## 流程

- 新增[发版流程规范](发版流程规范.md)（v0.1.12 复盘）与 agent skill（`.agents/skills/ssid-release/`），后续发版按此走

## 更新说明

- 老用户安装 v0.1.13：启动时版本指纹不一致 → 自动重部署运行环境（约 30 秒，可跳过；重部署后 profile 与本版预置一致）
- 全新安装：首启自动部署（进度条），全程无需 Node.js / pnpm
