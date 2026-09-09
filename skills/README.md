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
3. **`whenToUse` 补充（待核实，2026-09-09 修正）**：本条原记为「DSH 的 skill 支持 `whenToUse` 字段（增强模型发现）」。实测（2026-09-09）：`app.asar` 内 `whenToUse` **0 命中**，SSiD 源码中仅本文件此条提及——**该字段当前无实现，补了不生效**。若要增强模型发现，需先在 DSH 侧实现该字段，再回填各技能。

## 结论

- **8 mxy + 1 omo-verification-planning = 9 个可直接用** ✅
- **4 个 omo 已做路径适配，基本可用** 🔧
- **1 个 omo-reflect 需重写** 🔄（依赖 OC 数据库 schema，DSH 无对应）

## 部署副本（v0.2.0）

- **安装包出厂副本**：`shell/profile-template/skills/`（14 个技能目录，随
  dsh-runtime 归档部署）。思灵启动时由 `kernel.ts` 的 `syncPresetSkills`
  非覆盖合并到用户 `$DSH_HOME/skills`（用户已有同名技能则跳过，不覆盖）。
- **同步约定**：新增/修改技能后，把对应技能目录整目录同步到
  `shell/profile-template/skills/`（`prepare-runtime.mjs` 会把 skills 纳入
  归档指纹，技能内容变化会触发老用户自动升级部署）。
- 详见 [决策记录](../docs/决策/2026-08-19-SSiD预设技能包-落地方案.md)。

## 更新记录

### 2026-09-09（4 个技能，已同步两处目录）

| 技能 | 行数 | 变更 |
|---|---|---|
| `mxy-git-pull` | 64 → 69 | ① 描述补 7 个触发词（拉取代码 / 拉取远端 / 更新代码 / 同步代码 / pull 一下 / 拉一下 / 同步一下代码）；② 新增「远端无新提交」短路分支——跳过 diff 阅读、不自动 push、总结简化为一段话；③ 补多仓库执行说明 |
| `mxy-commit-review` | 164 → 167 | 描述改 YAML 折叠块，补触发词（提交 / 提交代码 / 帮我提交 / 提交并推送 / 代码审查 / 审查一下 / review 一下 / 改完提交 / 提交前检查）与「不适用于」边界 |
| `mxy-organize-code` | 241 → 240 | ① 描述补触发词（整理代码 / 加注释 / 补注释 / 代码排序 / 重新排序 / 规范化代码 / 组织代码 / 清理代码）与边界；② 修复章节层级——原「`## 步骤 2-5：逐文件处理`」之下混用「`### 步骤 2`」与「`## 步骤 3`」，现统一为二级步骤 + 引用块导语 |
| `mxy-upgrade-vue3` | 445 → 418 | 删除重复的「`## 步骤 5：汇总报告`」（两处同名，保留含「🔄 运行时验证」的较新版本） |

- **同步位置**：`skills/` + `shell/profile-template/skills/`（两处均已更新，SHA256 与运行态一致）。
- **未采纳 `whenToUse`**：见上文「深度适配点」第 3 条（实测无实现）。
- **零使用率未处理**：`mxy-organize-scss`（项目内 `.scss/.sass` 文件数 = 0）、`mxy-upgrade-vue3`（`frontend` 已是 `vue ^3.5.13` + `vite ^7`）——场景不存在，非触发失败，故不改描述。
- **技能目录实际数量**：`skills/` 14 个（无 `genui`）、`shell/profile-template/skills/` 15 个（含 `genui`）。
