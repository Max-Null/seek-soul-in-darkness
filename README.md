# 思灵（SSiD）· Seek Soul in Darkness

<p align="center">
  <img src="assets/logo.png" width="160" alt="SSiD logo — Si 原子，原子核是瞳孔">
</p>

> **在黑暗中，寻找硅基生命的灵魂。**

SSiD 是 fractal 的 **DSH 基座版**——基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的桌面 AI 应用，用「DSH 官方 GUI + 自研壳 + 插件」拼装而成。

## 一页总览

| 维度 | 内容 |
|---|---|
| 三代家底 | cc-gui（UI 资产）→ oc-plus（增强件）→ fractal（桌面 GUI）≈ **50 个功能** |
| 迁移结论 | 约 **70% DSH 原生覆盖**，增量收敛 **5 块**：自研壳 / 记忆 UI + Guardian / 四 agent / 14 技能 / 零散面板 |
| 路线 | **M0** 闭环验证 → **M1** 记忆 UI → **M2** Guardian 状态 → **M3** 四 agent → **M4** 自研壳 |
| 护栏 | ① fractal（OC 版）继续兜底 ② 渐进迁移不 all-in ③ 不 fork 换皮、不改 DSH 源码 |

📄 **[技术设计方案](docs/设计/SSiD-技术设计方案.md)** · [迁移对照表](docs/设计/2026-08-16-三代资产完整迁移对照表.md) · [路线图](docs/设计/2026-08-16-分阶段路线图.md) · [品牌手册](docs/品牌/品牌手册.md)

## 名字

中文名 **思灵**，英文 **Seek Soul in Darkness**，缩写 **SSiD**（中间的 `i` 小写）。

- **思（sī）** —— Si 的谐音＝硅，也是「思考 / 探寻」（Seek 的中文落点）。
- **灵（líng）** —— 灵魂，即 logo 里那只瞳孔的灵光。
- **Seek** —— 呼应 DeepSeek 的 Seek，SSiD 的基座正是 DeepSeek 的 DSH。
- **darkness** —— 三层：DeepSeek 鲸鱼 logo 游弋的深海；DS 无多模态、模型「看不见」；做 AI 本身就是在摸黑探路。
- **SSiD 里的 `i`** —— 那一点就是瞳孔，也是 Si（硅）。
- **彩蛋** —— SSiD 与 Wi-Fi 的 SSID 只差一个大小写；「在黑暗中寻找信号」与「连接」暗合。

完整品牌规范见 [`docs/品牌/品牌手册.md`](docs/品牌/品牌手册.md)。

## 定位

| 维度 | 说明 |
|---|---|
| 基座 | DeepSeek Harness（一切皆插件） |
| 形态 | DSH 官方 Web GUI + 自研桌面壳（参考 anywhere-labs） + 插件 |
| 引擎 | DeepSeek 唯一 Provider |
| 与 fractal 关系 | fractal = OC 基座版（继续维护、兜底）；SSiD = DSH 基座版（2.0） |

## 技术栈

- **基座**：DeepSeek Harness（`dsh web` 官方 GUI）
- **壳**：自研（Electron，参考 anywhere-labs 架构）
- **插件**：预制插件全家桶（中文思考、跨会话记忆、Guardian 状态引擎、自学习习惯引擎、皮肤）+ 侧栏生态（dsh-better-sidebar 及扩展）

## 现状

**v0.1.6 已发布**（2026-08-20）：标题栏统一按钮组（插件中心/侧栏/底栏，内置 dsh-header-unify）+ 插件中心交互优化（toggle/互斥/遮罩关）+ 部署 EPERM 自愈 + skill-mcp-center 0.2.0（Skill 管理 UI 重构、MCP 状态修复）；v0.1.5 为预设技能包 14 技能出厂 + 预设插件更新 + 通知体系扩展；v0.1.4 为安装卡死修复（安装前自动关闭运行中的思灵）+ 安装/首启步骤清单可视化；v0.1.3 为内置运行环境归档与升级感知；v0.1.2 为一键安装（免 DSH_CHECKOUT）+ 首装进度条；v0.1.1 为 EPIPE 崩溃修复；v0.1.0（2026-08-16）起自研壳 + 侧栏生态 + SSiD 面板 + 预制插件 + NSIS 安装器齐备，详见 [v0.1.6 Release Notes](docs/release-notes-v0.1.6.md) / [v0.1.5 Release Notes](docs/release-notes-v0.1.5.md) / [v0.1.4 Release Notes](docs/release-notes-v0.1.4.md) / [v0.1.3 Release Notes](docs/release-notes-v0.1.3.md) / [v0.1.2 Release Notes](docs/release-notes-v0.1.2.md) / [v0.1.1 Release Notes](docs/release-notes-v0.1.1.md) / [v0.1.0 Release Notes](docs/release-notes-v0.1.0.md)。

## 下载安装

- 安装包：[`思灵 Setup 0.1.6.exe`](https://github.com/Max-Null/seek-soul-in-darkness/releases/download/v0.1.6/Setup.0.1.6.exe)（约 253 MB，Windows x64）
- 全部版本：[Releases](https://github.com/Max-Null/seek-soul-in-darkness/releases)
- NSIS 向导安装：安装目录选择、桌面/开始菜单快捷方式
- **一键安装**：首次启动自动部署内置运行环境（DSH 内核 + 预制插件，约 600MB），无需安装 Node/pnpm、无需设置任何环境变量；安装完成后关闭窗口重新打开即用
- **升级**：安装新版后启动时自动检测版本，不一致自动重部署运行环境（约 30 秒，可取消），旧版无损

## 路线图

见 [`docs/决策/2026-08-16-分形DSH迁移-重评估映射表.md`](docs/决策/2026-08-16-分形DSH迁移-重评估映射表.md)。

## License

[MIT](LICENSE)
