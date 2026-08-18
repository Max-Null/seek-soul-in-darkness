---
name: mxy-git-pull
description: 拉取当前分支最新代码并总结拉取内容
---

请严格执行以下步骤，不得跳过任何一步：

## 步骤 1：暂存本地未提交的修改
执行 `git stash push -m "temp: before pull"`

## 步骤 2：获取当前分支名
执行 `git branch --show-current`，记录为 $BRANCH

## 步骤 3：记录拉取前的 HEAD
执行 `git log --oneline -1`，记录 commit hash 为 $BEFORE

## 步骤 4：拉取最新代码
执行 `git pull origin $BRANCH`

## 步骤 5：展示新拉取的 commits
执行 `git log $BEFORE..HEAD --oneline --no-merges`，如果没有新 commits 则告知用户"当前分支已是最新"

## 步骤 6：展示变更文件统计
执行 `git diff --stat $BEFORE..HEAD`

## 步骤 7：读取每个新 commit 的详细 diff（禁止跳过的核心步骤）
逐个执行 `git show <commit-hash> --no-color` 阅读所有新拉取 commits 的实际改动。

**硬约束**：
- 禁止只凭 commit 标题（步骤 5 的 oneline）或文件统计（步骤 6 的 stat）推断改动内容——标题是作者写的摘要，stat 只有行数，都不是代码事实
- 必须从 diff 中提取**具体内容**：改动的函数名、新增/修改的配置项、行为变化的机制（如 "readModelAliases 改读项目根 opencode.json"、"新增 BUILTIN_MODEL_ALIASES 兜底映射"）
- 每次 `git show` 一个 commit，记录其关键改动点，最后汇总

若本地有未提交修改（步骤 1 stash 了内容），注意：新拉取的 commits 用 `git show <hash>` 查看不受影响（只读）。

## 步骤 8：恢复本地修改
执行 `git stash pop`

## 步骤 9：检查未推送 commits 并自动推送
执行 `git log origin/$BRANCH..HEAD --oneline` 检查当前分支是否有未推送的 commits。

若同时满足以下两个条件，则自动执行 `git push origin $BRANCH`：
- 步骤 1 的 stash 实际未保存任何内容（本地无未提交修改）
- 当前分支存在未推送的 commits（`git log origin/$BRANCH..HEAD --oneline` 有输出）

否则跳过推送，记录跳过原因（"存在本地修改" / "无需推送"）。

## 步骤 10：总结
用中文汇总本次操作结果，包含以下两部分：

### 拉取内容
基于**步骤 7 的 diff 阅读结果**（不是标题/统计），按以下维度总结：
- **新增功能**：新 feature、新模块
- **修复**：bug 修复、问题修正
- **重构/优化**：代码重构、性能优化
- **其他**：文档、配置、依赖更新等

每个维度下的条目必须包含**具体改动**（函数名、配置项、机制变化），禁止只写 commit 标题。

若远程无新提交，简述"远程已是最新"。

### 推送结果
- 若执行了推送，列出推送的 commits 及数量
- 若跳过推送，说明原因（"存在本地修改，跳过自动 push" / "无需推送"）