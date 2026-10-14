# skill 召回研究的脚本

配套文档：[`../2026-10-14-skill召回机制-调研与实验.md`](../2026-10-14-skill召回机制-调研与实验.md)

这些脚本产出并校验了那篇文档里的每一个数字。**下次要继续研究或复核，直接从这里跑，不必重写。**

## 运行环境（两个硬要求）

```sh
# ① 必须用壳自带的 Node 24 —— PATH 里的 Node 22 没有 zstdDecompressSync
NODE="$LOCALAPPDATA/Programs/ssid-shell/resources/runtime/primary-runtime/dependencies/node/bin/node.exe"

# ② 会话根按需传入（默认从 --root 参数取）
$NODE measure-skill-usage.mjs --root "$USERPROFILE/.dsh/sessions-ssid" --min-size 300000
```

- **`yaml` 包**：脚本从本地已知位置解析加载（`deepseek-harness/node_modules/yaml` 或
  `ssid-plugins/node_modules/yaml`）。都用真 YAML 解析器——**别改回单行正则**，
  否则 YAML 折叠块（`description: >`）会被读成一个 `>`（踩过，见文档 §五）。
- **写死的路径**：原版脚本里有 `C:\Users\<用户名>` 前缀，已统一替换为
  `${process.env.USERPROFILE}`。skill 语料目录的盘符仍按需调整。

## 脚本分类

### 一、测量：调用率随上下文压力怎么变

| 脚本 | 作用 | 文档节 |
|---|---|---|
| `measure-skill-usage.mjs` | 首版：会话内分箱，压力 vs skill 调用率 | §4.1 |
| `measure-position-vs-pressure.mjs` | 分离「会话内位置」与「压力」两个变量 + 二维交叉表 | §4.3 |
| `measure-final.mjs` | 拆「用户显式点名」成分；压缩的独立效应 | §4.3 |
| `measure-4.mjs` | 修正字段 bug 后的正式测量（四因素全分离） | §四 |

### 二、匹配可行性：BM25 与触发词（两个都被否掉）

| 脚本 | 作用 | 文档节 |
|---|---|---|
| `step1-positive-count.mjs` | 统计每个 skill 的真实正例数 → 决定哪些 skill 可评估 | §7.2 |
| `match-feasibility.mjs` | BM25 匹配可行性；top-1 与模型选择的一致率 | §7.1 |
| `diag-bm25-why.mjs` | BM25 误匹配的根因诊断（通用词堆分、分数与语义无关） | §7.1 |
| `exp-trigger-words.mjs` | **对照实验**：补触发词 vs 只接长（三组：base/exp/ctrl） | §7.2 |

### 三、数据重建

| 脚本 | 作用 |
|---|---|
| `extract-named-rounds.mjs` | 提取「用户点名但模型没调用」的轮次 → 漏用清单 |

> **评估集不在版本控制里**：65 条带真值正例与 276 条漏用清单含真实用户输入，
> 不随仓库分发。用上面两个脚本可从会话日志重建（`--root <会话根> --out <输出>`）。

### 四、机制探测

| 脚本 | 作用 | 文档节 |
|---|---|---|
| `probe-compaction-republish.mjs` | 跨会话找「压缩事件」与「skill 目录重发」的关系——**产出 16/16 重发**那个结论 | §2.3 |

## 已知坑（都写在文档 §三里）

- 会话日志是**多帧 zstd 拼接**，必须逐帧解压（按魔数切），否则第二帧报 `Unknown frame descriptor`
- `user/message` 的文本在 **`data.content`**，不在 `data.message`；`data` 里**没有** `turn`——turn 归属靠 seq 比 `turn/start`
- 压力 = `assistant/message.usage` 的 `inputTokens + cacheReadTokens + cacheWriteTokens`
- 会话日志格式已从 v3 走到 **v4**，按魔数切帧，别按版本名判断
