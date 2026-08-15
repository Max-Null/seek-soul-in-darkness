# SSiD agent 迁移映射（oc-plus → DSH）

> 日期：2026-08-16
> 状态：资产迁移（语义适配待 M3 细化）
> 源：`oc-plus/双星系统/agents/*.md`（frontmatter 定义 mode/model/temperature/permission）

## 迁移总览

oc-plus 的 agent 是「.md frontmatter 定义角色 + 正文是 persona」；DSH 是「preset 定义主 agent，subagent 的 persona/model/toolFilter 定义子 agent」。

## 映射表

| oc-plus agent | mode | model 别名 | DSH 落点 | 委派参数 |
|---|---|---|---|---|
| 双星 | primary | DS_MODEL_HIGH | **preset**（主 agent） | persona = 双星.md 正文 |
| 工匠 | subagent | DS_MODEL_LOW | subagent | `model: flash` + persona + `toolFilter: read/edit/bash/glob/grep/lsp` |
| 参谋 | subagent | (继承) | subagent | `temperature: 0.7`（待核实）+ persona + `toolFilter: read/web_search` |
| 军师 | subagent | (继承) | subagent | `temperature: 0.3`（待核实）+ persona + `toolFilter: read/glob/grep/web_search` |
| 制图师 | subagent | DS_MODEL_VISION (kimi k3) | subagent | `model: kimi-k3` + persona + `toolFilter: read` |
| 侦查兵 | all | DS_MODEL_LOW_ANTHROPIC | **退役** | DSH 原生 `web_search` 替代 |

## 适配点（M3 细化，当前仅记录）

| oc-plus 概念 | DSH 对应 |
|---|---|
| `task` / `task_id` 续接 | `subagent` 工具 + continuable child |
| `question` 工具 | `ask_user_question` |
| `available_skills` | DSH `skill` 机制 |
| `websearch` / `webfetch` | `web_search` / `web_fetch` |
| `.opencode/plans/` | DSH `plan-mode` |
| `分形 Guardian` 消息 | `dsh-guardian`（M2） |
| temperature per-child | 待核实（SubagentStartRequest 是否透传） |

## 关键红利

- 制图师配 kimi k3、工匠配 flash、军师配 pro——DSH 原生 `SubagentStartRequest.model` 支持，无需写 frontmatter。
- 侦查兵退役——DSH 原生 `web-search-deepseek` provider 就是「用 Anthropic 格式调 DeepSeek 网络搜索」，无需专门 agent。
