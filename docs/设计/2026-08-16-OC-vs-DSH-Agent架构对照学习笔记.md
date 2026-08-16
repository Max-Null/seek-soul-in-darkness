# OC vs DSH · Agent 架构对照学习笔记（2026-08-16）

> 目的：MaxNull 重新学习两家的 agent 架构，能看懂 M3 设计方案的每个决策。
> 视角：从熟悉的 OC（opencode，fractal/oc-plus 底座）出发，映射到 DSH（DeepSeek Harness，SSiD 底座）。
> 阅读方式：先看「一句话世界观」，再逐项对照；每项末尾标 M3 用法。

---

## 一句话世界观

| | OC | DSH |
|---|---|---|
| agent 是什么 | **一个 .md 文件**：frontmatter 声明角色属性，正文是 persona | **一次运行时装配**：cordis 条目列表（插件行）组合出的会话级实例 |
| 核心抽象 | 文件 + 权限清单 + hook | 插件（Service）+ 事件（event）+ 服务注入（inject） |
| 主 agent 从哪来 | `agents/双星.md`（mode: primary） | `agent-presets`（`preset.yml` 元数据 + `agent.cordis.yml` 条目列表） |
| 子 agent 从哪来 | `agents/工匠.md`（mode: subagent） | preset 里一行 `tool-subagent` 插件（persona/toolFilter/model 全在配置里） |
| 扩展方式 | 写 hook 脚本、写 agent 文件 | 写插件（独立 npm 包，SSiD 已实践：dsh-memory/dsh-guardian） |

**本质差异**：OC 是「CLI 中心」——agent 是静态文件，靠进程隔离和 hook 拼能力；DSH 是「插件运行时」——agent 是动态装配的服务树，能力全是插件，SSiD 的 M2 就是这么做的（guardian 就是一个插件）。

---

## 逐项对照

### 1. 主 agent 定义

**OC**：
```markdown
<!-- agents/双星.md -->
---
description: 双星：主力智能助手…
mode: primary
model: "DS_MODEL_HIGH"
temperature: 0.2
permission: { read: allow, edit: allow, … }
---
你是**主力智能助手**，负责直接理解用户需求…（正文 persona）
```

**DSH**（SSiD 现状）：
```yaml
# presets/ssid-double-star/preset.yml（元数据）
name: 双星
description: SSiD 主力智能助手——先对齐再动手，复杂编码走四阶段流程

# presets/ssid-double-star/agent.cordis.yml（组成条目）
- id: persona
  name: '@deepseek-ai/dsh-persona'     # persona 是一个插件
  config: { text: |- 你是 SSiD 的主力智能助手「双星」… }
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'   # 每个工具也是一行插件
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'
…
```

**差异**：OC 一个文件搞定；DSH 拆成「元数据文件 + 条目列表」，因为**工具、persona、压缩、guardian 全是插件**，preset 只决定装哪些、怎么配。M3 的角色收敛就是在这个列表上做加减。

### 2. 子 agent 定义

**OC**：`agents/工匠.md`，mode: subagent + permission 收窄 + `task: { "*": deny }`（禁止工匠再委派）。

**DSH**：preset 里一行：
```yaml
- id: tool-subagent-artisan
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn                       # 干净上下文（继承上下文用 fork）
    toolName: subagent_artisan            # 主 agent 看到的工具名
    backgroundMode: continuable           # 可续接（对应 OC task_id）
    agentOptions: { provider: deepseek-official, model: deepseek-v4-flash }
    persona: |-
      你是**编码工匠**。执行者，不是思考者。…
    toolFilter: { allow: [read, edit, write, bash, pwsh] }   # 等价 OC permission
    maxDepth: 0                            # 等价 OC task: "*": deny
```

**差异**：OC 的子 agent 是「另一个 .md 文件」；DSH 的子 agent 是「主 agent preset 里的一行插件配置」。**每个角色一行、每行一个独立工具名**——模型按工具名委派（`subagent_artisan` / `subagent_strategist`），这就是 M3 的机制层方案。

### 3. 委派与续接（OC 的 task_id → DSH 的 continuable）

**OC**：
- 委派：`task({ subagent_type: "工匠", prompt: "…" })`
- 续接：`task({ task_id: <同ID>, prompt: "规则 D 为准，继续执行" })`——同一子 agent 保留上下文继续
- 铁律：不把子 agent 的确认问题转发给用户、不新建 task（丢上下文）、不接手剩余工作

**DSH**：
- 委派：调用 `subagent_artisan` 工具（prompt 参数）
- 续接：`backgroundMode: continuable` 时，工具返回 durable child id，后续用 `send_message`（同 id）续接——**同一子会话、上下文保留**
- 铁律原样保留在双星 persona（M3 改写 task_id 措辞为 subagent id）

### 4. 权限 / 工具范围

| OC | DSH |
|---|---|
| `permission: { read: allow, bash: deny }` | `toolFilter: { allow: […], deny: […] }` |
| `task: { "*": deny, "参谋": allow }` | `maxDepth: 0`（禁止再委派）或正数（允许 N 层） |
| 权限在 frontmatter | 权限在 tool-subagent 行 config |
| deny 的工具模型不可见 | 同：filtered tools **从提示词消失 + 执行拒绝**（单一可见性） |

**M3 用法**：工匠 `allow: [read, edit, write, bash, pwsh, todo_write]`（执行者不需要 web_search）；军师 `allow: [read, glob, grep, web_search]`（审查者不可写）；制图师 `allow: [read]`（看图者只读）。

### 5. 模型路由与成本分层

**OC**：`model: "DS_MODEL_HIGH"`（别名，`deploy.mjs` 部署时替换）+ `temperature: 0.1/0.3/0.7`。

**DSH**：`agentOptions: { provider, model, maxTokens }`。模型按 provider/model 路由（如 `deepseek-official/deepseek-v4-flash`），settings.yaml 的 `agent-default-model` 是主 agent 默认路由。

**⚠️ 硬差异：DSH 没有 temperature 透传**（AgentOptions 只有 provider/model/maxTokens，实测确认）。OC 用 temperature 控制「发散度」（参谋 0.7 发散、工匠 0.1 收敛），DSH 的替代品是：
- 思考深度：settings 的 `reasoningEffort`（off/high/max）
- 输出纪律：persona 收紧（工匠「不总结不提议」、军师「输出 3-5 句」）

**M3 用法**：双星 pro、工匠 flash、军师继承 pro、制图师 kimi k3（走 `llm-pi-ai` 多 provider，待验证）。

### 6. 提示词装配

**OC**：agent 文件正文 + `experimental.chat.system.transform` hook 追加块（如分形 Guardian 的知识注入）。

**DSH**：`systemPrompt.section`（静态段，按 order 排序）/ `systemPrompt.context`（动态段，每轮组装时求值）。可以**按 scope shadow**（per-agent 覆盖全局同名段）。M2 的 guardian 提醒就是三个 `systemPrompt.context`（order 60-62），每轮按当前状态动态生成。

**M3 用法**：工匠/军师/制图师的 persona 是 per-child 覆盖（shadow 部署 persona）——正是这个机制。

### 7. 事件与钩子

**OC**：`chat.message` / `chat.params` / `system.transform` 等 hook（文件级注册）。

**DSH**：cordis 事件 + waterfall 链（监听者可以拦截/改写再 `next()`）：
- `agent/pre-step`：每步前（guardian 断言注入、compaction 都在这里挂）
- `agent/request`：模型请求装配（waterfall 可改 provider/model）
- `session/event`：会话日志事件流（M2 guardian 的唯一数据源）
- `llm/stream`：流式输出

**M3 用法**：四阶段纪律是 persona（提示词），不是事件硬约束；若想硬约束（如「阶段 4 未审查不得宣称完成」），可以在 `agent/pre-step` 上做状态检查——这是 OC 做不到的，DSH 的事件链给了这个可能。

### 8. 技能

**OC**：`available_skills` 列表注入提示词，模型手动加载。

**DSH**：`skill-filesystem`（发现）+ `tool-skill`（加载）+ **scope 分层**（global 层部署级技能 / per-agent 层 preset 技能）。14 个 mxy-*/omo-* 技能已迁移，会话 catalog 里可见。

### 9. 计划与断点

**OC**：`plans/` 目录 + `.active.json`（手工约定，「用户说继续时先查 plans 断点」）。

**DSH**：`plan-mode` 插件（结构化状态机：planning → 批准 → implementing）+ session 持久化（崩溃/重启后 resume，从会话日志重建）。计划落盘走普通文档（`docs/设计/`、`docs/决策/`）。

### 10. 多 agent 隔离

**OC**：子 agent 独立进程（天然隔离，也意味着跨进程开销）。

**DSH**：`scope`/`isolate`——**同进程内的 context 层隔离**。每个 agent 的注册（工具、prompt 段）挂在它的 scope 层，dispose 时整层卸载；`isolate` realm 让同名服务在 agent 间互不可见。SSiD 单进程 electron + 多会话共存就靠这个。

### 11. 子 agent 上下文继承

**OC**：子 agent 默认无父上下文（只拿到 task 的 prompt）。

**DSH**：两种 provider——`spawn`（干净上下文，适合执行型工匠/制图师）+ `fork`（继承父会话前缀，适合需要全局视野的军师）。**fork 的代价是 token**（携带父前缀），M3 风险段已标注。

### 12. Guardian（分形 → DSH，M2 已完成）

| 分形 Guardian（OC） | dsh-guardian（DSH） |
|---|---|
| hook 注入 `[分形]` 消息 | `systemPrompt.context` 动态提醒（断言/无反馈环/审查） |
| 文件状态（`.assertion-counter.json` 等） | JSON storage（`~/.dsh/storages/guardian`） |
| 事件 = OC hook 回调 | 事件 = `session/event` 流 |
| 状态面板 GUI 读文件 | SSiD 侧栏同进程 `guardian.snapshot()` |

---

## M3 方案决策 → 机制映射速查

| M3 决策 | 用的机制 | 对应 OC 概念 |
|---|---|---|
| 角色 7→4（双星/工匠/军师/制图师） | agent-presets + tool-subagent 行 | agents/*.md 收敛 |
| 每角色独立工具名 | tool-subagent `toolName` | task 的 subagent_type |
| 工匠 continuable | `backgroundMode: continuable` | task_id 续接 |
| 军师全局视野 | `provider: fork` | 无对应（OC 子 agent 无上下文继承） |
| 工匠 flash / 制图师 kimi | `agentOptions.model` | model 别名 + deploy 替换 |
| temperature 放弃 | persona 纪律 + reasoningEffort | temperature 字段 |
| 四阶段纪律 | 双星 persona 文本 | 双星.md 正文 |
| 阶段 4 验证 | 军师 toolFilter 只读 + 主 agent git diff | 军师 permission read-only |

---

## 学习路径建议

1. 先跑一遍现有 SSiD：看 `presets/ssid-double-star/agent.cordis.yml` 的每一行（persona/tool-*），对照上面第 1-2 项。
2. 在 SSiD 里实际委派一次子 agent（说"让子 agent 探索 XX"），观察 `subagent` 工具的调用与返回。
3. 读 `dsh-guardian/src/engine.ts`（M2 刚写的，~200 行）——它是「DSH 插件式 agent 能力」的最小样本：监听事件 → 状态机 → 存储 → 提醒注入，一条链走完 DSH 的核心抽象。
