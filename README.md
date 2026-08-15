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
- **插件**：`@max-null/dsh-memory`（跨会话记忆）、`@max-null/dsh-chinese-thinking`（中文思考）

## 现状

起步阶段，已就绪：

- 两个起步插件：`dsh-memory`、`dsh-chinese-thinking`
- 迁移决策与壳选型结论：见 [`docs/决策/`](docs/决策/)

## 路线图

见 [`docs/决策/2026-08-16-分形DSH迁移-重评估映射表.md`](docs/决策/2026-08-16-分形DSH迁移-重评估映射表.md)。

## License

[MIT](LICENSE)
