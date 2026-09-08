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

**最新版本：v0.2.1**（2026-09-07，[Release Notes](docs/release-notes-v0.2.1.md)）：预制微信桥（dsh-wechat 0.9.1，扫码绑定）+ CodeGraph MCP 0.20.1、免安装版（zip）交付形态（Win10 家庭版等安装器受阻场景的正解：解压即用）、升级部署「用户层保留」护栏（用户自装插件 / MCP 不再被升级覆盖）、归档构建修正。v0.2.0（[Notes](docs/release-notes-v0.2.0.md)，原 v0.1.18 未分发内容并入重打）为 **DSH rc.1 内核升级** + 插件基线升级 + 在线更新网络链修复。v0.1.x 系列演进（自研壳 + 侧栏生态 + 预制插件、标题栏统一按钮组、插件中心、预设技能包 14 技能、会话存储隔离等）见各版本 [Release Notes](docs/) 与 [Release 页面](https://github.com/Max-Null/seek-soul-in-darkness/releases)。

## 下载安装

> **系统要求：Windows 10/11，64 位（x64）**。32 位 Windows 不支持——Shell 基于 Electron 44（官方已移除 32 位支持，见 Electron Breaking Changes），内置运行环境（DSH 内核 + 原生模块）也按 64 位预编译。

> **关于签名**：本项目为开源免费软件，安装包**未做代码签名**（无费用）。Windows/杀软首次运行可能提示「未知发布者/已保护你的电脑」——属正常安全提示，按下方步骤放行即可；**或优先选用免安装版（zip）**——无需安装器，最常见的拦截/兼容场景直接绕过。

> **推荐：免安装版（zip）**——解压即用，功能与安装版完全一致。NSIS 安装版若报「**不支持的 16 位应用程序**」等异常：大多为**下载文件损坏**（截断/下载器中断），非兼容问题——删除后重新下载，或改用免安装版。

- **免安装版（zip，推荐）**：[`ssid-shell-0.2.1-win.zip`](https://github.com/Max-Null/seek-soul-in-darkness/releases/download/v0.2.1/ssid-shell-0.2.1-win.zip)（约 405 MB）→ 解压到任意目录 → 运行 `思灵.exe`
- **安装版（NSIS）**：[`ssid-shell-setup-0.2.1.exe`](https://github.com/Max-Null/seek-soul-in-darkness/releases/download/v0.2.1/ssid-shell-setup-0.2.1.exe)（约 355 MB）
- **校验文件完整性**（可选，先验后装）：
  ```bat
  certutil -hashfile "ssid-shell-setup-0.2.1.exe" SHA256
  certutil -hashfile "ssid-shell-0.2.1-win.zip" SHA256
  ```
  各版本资产的 SHA256 见对应 [Releases](https://github.com/Max-Null/seek-soul-in-darkness/releases) 页的「下载与校验」节。
- 全部历史版本：[Releases](https://github.com/Max-Null/seek-soul-in-darkness/releases)
- **一键安装**：首次启动自动部署内置运行环境（DSH 内核 + 预制插件，约 600MB），无需安装 Node/pnpm、无需设置任何环境变量；安装完成后关闭窗口重新打开即用
- **升级**：安装新版后启动时自动检测版本，不一致自动重部署运行环境（约 30 秒，可取消），旧版无损

> **SmartScreen 放行三步**（首次安装遇到拦截图时）：
> 1. 右键安装包 → 属性 → 若勾选「解除锁定」则打勾 → 确定；
> 2. 仍被拦就在弹窗点「更多信息」→「仍要运行」；
> 3. 或右键「以管理员身份运行」。

## 路线图

见 [`docs/决策/2026-08-16-分形DSH迁移-重评估映射表.md`](docs/决策/2026-08-16-分形DSH迁移-重评估映射表.md)。

## License

[MIT](LICENSE)
