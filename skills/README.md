# SSiD 技能清单（oc-plus 迁移）

> 日期：2026-08-16
> 来源：`oc-plus/技能/`（8 个 mxy-* 自研 + 6 个 omo-* 源自 oh-my-opencode-slim）
> 格式：DSH skill（`<name>/SKILL.md`，name kebab-case + description）

## 适配状态

| 技能 | 来源 | 适配状态 |
|---|---|---|
| mxy-commit-review | 自研 | ✅ `question`→`ask_user_question` |
| mxy-design-doc | 自研 | ✅ 同上 |
| mxy-git-pull | 自研 | ✅ 干净 |
| mxy-organize-code | 自研 | ✅ `question`→`ask_user_question` |
| mxy-organize-scss | 自研 | ✅ 干净 |
| mxy-pptx-slim | 自研 | ✅ 干净 |
| mxy-update-docs | 自研 | ✅ 干净 |
| mxy-upgrade-vue3 | 自研 | ✅ 干净 |
| omo-verification-planning | omo-slim | ✅ 纯方法论，不依赖 OC 环境 |
| omo-worktrees | omo-slim | 🔧 路径已适配（`.slim/`→`.dsh/`） |
| omo-codemap | omo-slim | 🔧 路径已适配（脚本→`$DSH_HOME/skills/codemap/`） |
| omo-clonedeps | omo-slim | 🔧 路径已适配（`.slim/`→`.dsh/`） |
| omo-simplify | omo-slim | 🔧 路径已适配 |
| omo-reflect | omo-slim | 🔄 需重写（依赖 opencode.db sqlite） |

## 深度适配点（待 M3）

1. **omo-reflect 需重写**：依赖 OpenCode 的 sqlite session 库（`opencode.db` + `bun:sqlite`），DSH 是 event-sourced JSONL（`session.jsonl.zstd`），需按 `ctx.sessionQuery`（SQLite FTS5）重写。
2. **oh-my-opencode-slim 概念**：omo 系列源自该第三方项目，技能正文里的项目名/概念保留作来源标注，DSH 对应机制（如 codemap 的脚本路径）已改路径，语义适配待 M3 逐项核对。
3. **`whenToUse` 补充**：DSH 的 skill 支持 `whenToUse` 字段（增强模型发现），当前未补，可从 `description` 提炼，M3 优化。

## 结论

- **8 mxy + 1 omo-verification-planning = 9 个可直接用** ✅
- **4 个 omo 已做路径适配，基本可用** 🔧
- **1 个 omo-reflect 需重写** 🔄（依赖 OC 数据库 schema，DSH 无对应）
