# 判据 schema 草案（2026-10-15）

> **状态**：进行中 —— 草案，用「skill 召回」当第一个用例填入验证。
> **上游**：[主 Agent 旁观助手 · 方向与可行性](2026-10-15-主Agent旁观助手-方向与可行性.md)（命题、可行性分层结论、
> §五 载体查证）。本文要回答的是那条线里最后一个技术空白：**一个声明式 schema 能不能承接真实约定**。
> **判据的定位**：旁观助手每轮照它观察主 Agent，违反时注入一次提醒。判据是**数据**，
> 求值引擎是**代码**；见方向文档 §5.1 的两层划分。

---

## 一、设计依据（每条都查过，不是设想）

| 事实 | 出处 |
|---|---|
| 动作面只有两种：拒绝这一步，或带一批消息进入这一步 | `PreStepDecision = { kind: 'reject' } \| { kind: 'enter'; messages: UserMessage[]; startsRequestSeries?: true }`（`packages/core/agent/src/runtime-types.ts:112-119`） |
| 钩子每步前触发，payload 带 `turn` / `step` / `messages` / `agent` | 同文件 `:320` |
| 提醒是一条 `form: 'notice'` 的用户消息 | `createUserMessage({ content, source: { kind: 'plugin:<名>', form: 'notice', summary } })`（`dsh-allostasis/src/messages.ts:46-55`） |
| `notice` 的语义是「独立的即时信号，谁也不取代谁」，区别于 `snapshot` | `packages/llm/llm/src/message.ts:60-67` |
| 第三方生产者的 `source.kind` 用 `plugin:<名>` | 会话格式 v4 的规范形式（`session-format-v3-to-v4/src/sources.ts:64`） |
| 观察面靠遍历会话事件 | `session.snapshotEvents()`（`dsh-allostasis/src/thinking.ts:36-51`） |
| 工具调用的字段 | `tool/call` 带 `data.turn` / `data.step` / `data.name` / `data.arguments`（`arguments` 是 JSON 字符串） |
| 用户消息不带 `turn`，靠 seq 归属 | 调研文档 §三 的字段坑；归属算法是「最后一个 seq 更小的 `turn/start`」 |
| 节流是必须的，因为钩子每步都触发 | `dsh-allostasis/src/throttle.ts` 的 `admitPerTurn` |

---

## 二、schema 草案

```yaml
- id: string                 # 唯一标识，用于节流状态与诊断行
  intent: string             # 这条判据守的是什么约定——给人读，不进模型上下文
  enabled: boolean           # 默认 true
  when:                      # 触发条件；省略 = 每轮都适用
    userText: regex          # 本轮用户消息的文本匹配
  require:                   # 「到期」时必须已出现的动作
    toolCall: string         # 工具名（精确匹配）
  window: turn               # 观察窗；第一版只实现 turn
  throttle: per-turn         # 同一轮至多提醒一次；第一版只有这一个取值
  remind: string             # 违反时注入的正文
```

求值语义（一次 `pre-step`）：

1. 取本轮窗口内的事件：`session.snapshotEvents()` 里 `turn === 当前 turn` 的部分。
2. 本轮用户文本：扫 `user/message`（`data.source.kind === 'user'`），按 seq 归属到本轮，
   与 `data.content` 拼接。`when.userText` 缺省视为匹配。
3. `require.toolCall`：本轮窗口内是否已出现同名 `tool/call`。
4. 触发条件成立 + 要求未满足 + 节流放行 → 注入一条 `notice`，然后推进节流状态。

---

## 三、第一个用例填进去

```yaml
- id: skill-recall-on-delivery-actions
  intent: 用户点名「提交 / 拉取 / 审查 / 发版 / 同步代码」这类交付动作时，本轮应当出现一次 skill 调用
  when:
    userText: '提交|拉取|审查|发版|同步代码'
  require:
    toolCall: skill
  window: turn
  throttle: per-turn
  remind: |
    ⚠️ 用户点名了交付类动作（提交 / 拉取 / 审查 / 发版），本轮到目前为止没有调用 skill。
    先看一眼有没有现成流程可套——有就调它；没有就继续手上的做法，并说明为什么不套。
```

形状是通的：约定的三个成分（**什么算到期**、**要求什么动作**、**违反了说什么**）各有着落，
没有哪个成分需要写代码才能表达。

---

## 四、这个 schema 刻意不做的三件事

### 4.1 不判断「该用哪个 skill」

`require` 只要求「出现一次 `skill` 调用」，不要求「调到某一个」。依据是调研 §7.2：换厂商的独立模型
做「该用哪个」的一致率只有 **49.0%**，这条路已被数据否掉；而「有没有调用」是客观事实（同文档 §9.1）。

**代价要如实标明**：这是**弱判据**——模型随手调一个不相干的 skill 也能满足它。它抓的是
「一次都没调」这种最明显的漏用。这个覆盖面并不小：调研 §4.3 测得用户点名轮次的 skill 调用率只有
**11.76%**，也就是约 88% 的点名轮次一次都没调。

### 4.2 不做跨轮状态与跨判据编排

第一版只有 `window: turn`。「先确认再动手」这类需要跨轮记忆的约定、以及「A 之后必须 B」这类
判据间关系，都留到有真实用例时再谈——现在加进来只会得到一个没人验证的表达力。

### 4.3 不做算法式判据

`dsh-allostasis` 现有的四条判据（英文功能词密度、窗口累计重复率、流内掐断、回合结尾形态）都是
算法式，需要自定义计算。它们**不走这张 schema**——按方向文档 §5.1 的划分，那是「几何」，属于代码。

---

## 五、未决

1. **判据住在哪**：`cordis.patch.yml` 的 config（人写、可 diff、进 git）还是 `ctx.storageDomain`
   （程序写、模型炼完落库）。两者都可用，见方向文档 §5.2；选择取决于「谁炼」。
2. **`require` 要不要留扩展位**：例如按参数匹配工具调用（`toolCallArgs`）。第一版不加——
   那会从「有没有调用」滑向「调到哪个」，正是 4.1 要避开的。
3. **误报怎么收**：`when.userText` 的正则太宽会命中讨论而非指令（「提交了吗」也会命中）。
   第一版的应对是窄正则 + `throttle`；真正的解法是让判据可被复核（方向文档 §四 ④）。
4. **生效范围**：全局 / 按工作区 / 按会话类型。第一版建议全局——这条约定在哪个工作区都成立。

---

## 六、下一步

写第一版实现：挂 `agent/pre-step`，从载体读判据，扫本轮事件，命中则注入一条 `notice`。
第一个验收样本是现成的——调研留下的那份「用户点名但没调用」轮次清单，里面的
「整体审查一遍」「你拉取一下三库最新代码」都是明确漏用，可直接当回归语料。
