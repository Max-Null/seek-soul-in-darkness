# SSiD 插件清单（自研 + 预制）

> 日期：2026-08-16
> 状态：清单草案（第三方部分待 M0 实测后定稿）
> 视角区分：**自研清单** = 我们要亲手写的；**预制清单** = SSiD 开箱即用的（含自研 + 第三方）
> 关联：[SSiD 技术设计方案](SSiD-技术设计方案.md) 的模块设计 + 路线图

---

## 一、自研插件清单（我们要做的）

> 对应迁移映射表的「增量 5 块」+ 品牌皮肤。

| # | 插件 | 包名（拟） | 里程碑 | 状态 | 说明 |
|---|---|---|---|---|---|
| 1 | 中文思考 | `@max-null/dsh-chinese-thinking` | 已发布 | ✅ | system-prompt section，order -90 |
| 2 | 跨会话记忆 | `@max-null/dsh-memory` | 已发布 | ✅ | 5 工具 + 人工闸门 + 两层 JSON |
| 3 | 记忆 UI 面板 | dsh-memory 扩展 | M1 | 🔲 | Typert remote + 设置页 tab（施工图已出） |
| 4 | Guardian 状态引擎 | `@max-null/dsh-guardian`（新） | M2 | 🔲 | 六触发线 → `session/event` 重做 |
| 5 | 四 agent 编排 | `ssid-agents`（preset） | M3 | 🔲 | 双星/工匠/参谋/军师 → preset + subagent |
| 6 | 14 技能包 | `ssid-skills` | M3 | 🔲 | 8 mxy + 6 omo → DSH skill |
| 7 | 品牌皮肤 | `ssid-skin` | M4 | 🔲 | 思灵主题（深渊/巨鲸之眼） |
| 8 | 自研壳 | `ssid-shell`（非 DSH 插件，Electron 壳） | M4 | 🔲 | 参考 anywhere-labs，不换皮 |
| 9 | 草稿润色 | `@max-null/dsh-polish`（新） | M3（可并行） | 🔲 | host 侧 `ctx.llm.stream`（flash、不带历史）+ client 侧输入框按钮 + `setDraft` 回填 |
| 10 | 文件预览面板 | `@max-null/dsh-preview`（新） | M4 后 | 🔲 | 多格式渲染（mammoth/xlsx/pdfjs/html/md）；DSH 原生仅图片（`ui-attachment` "Images only"），非图片预览全空白 |
| 11 | 划选内容发送 | dsh-preview 子能力 | M4 后 | 🔲 | 预览面板划选 → 发送，复用 `ui-input-trigger` 的 `ReferenceInsert` / `setDraft` |
| 12 | 零散面板 | 诊断/文件修改卡/上下文 | M4 后 | 🔲 | 逐项评估「原生有/自研」 |

## 二、预制插件清单（开箱即用）

### 2.1 已就绪（自研，直接预制）

| 插件 | 作用 |
|---|---|
| `@max-null/dsh-memory` | 跨会话记忆 |
| `@max-null/dsh-chinese-thinking` | 中文思考 |

### 2.2 待开发（完成后自动进入预制，即一、表里的 🔲 项）

记忆 UI 面板、Guardian、四 agent、14 技能、品牌皮肤——开发一个，预制一个。

### 2.3 第三方候选（现成，M0 实测后评估预制）

| 能力（fractal 原资产） | DSH 候选 | 状态 |
|---|---|---|
| 联网查证 | `dsh-web-search-deepseek`（官方内置） | ✅ 默认 |
| 代码搜索 | 待评估（Tavily/GitHub 类插件） | ⏳ |
| 上下文压缩保护 | `dsh-compaction-shield`（用户已装） | ✅ 建议预制 |
| 皮肤/主题 | `dsh-skin` / `dsh-web-ui` 参考，自研 `ssid-skin` | 🔲 用自研 |

## 三、对应 fractal 预置体系（溯源）

fractal 的「预置配置体系」（D15/D10）＝ oc-plus 全家桶：

| oc-plus 内容 | SSiD 对应（插件化） |
|---|---|
| 双星四 agent | `ssid-agents`（M3） |
| 分形 Guardian | `dsh-memory`（已做）+ `dsh-guardian`（M2） |
| 14 技能 | `ssid-skills`（M3） |
| agents-priority | DSH `systemPrompt.section(order)` 原生，无需插件 |
| MCP 五通道 | DSH `web` + `mcp-client`（官方）+ 第三方候选 |
| opencode-acp | DSH `compaction` 原生 |

## 四、结论

1. **自研 9 项**：2 个已发布，7 个待开发（按 M1→M4 排期）。
2. **预制 = 自研全部 + 少量第三方**（compaction-shield、web search）。
3. **多数第三方能力 DSH 原生已有**（压缩/搜索/skill/subagent），无需额外预制，这是 DSH 相对 OC 的「开箱即用」红利。
