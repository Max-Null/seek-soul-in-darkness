# open-sea-skin 增强版提交上游 PR（2026-08-22）

## 背景

前一决策（2026-08-22-open-sea-skin本地增强与SSiD集成.md）本地 fork 增强版已运行于 SSiD。用户要求：将增强改动整理成 commit 并向上游 d-dev0101/open-sea-skin 提 PR。

## 调研结论

- **本地 fork 与上游 main 的差异只有 4 个文件**：`shared/skin-core.js`（手写）+ `plugin/client.js`、`extension/content.js`、`native-dist/loader.js`（均由 build 脚本从 skin-core 生成，必须 byte-for-byte 同步）
- 上游 main（2437d80）领先 v1.2.1 共 6 个提交（website/CI），本地 fork 基于 main 全量拷贝，PR 基线用 main
- 上游 CONTRIBUTING 要求：改 shared/ 后跑 `npm run build`、更新 CHANGELOG.md、跑测试（installer 测试依赖 bash，Windows 跳过）
- gh（Max-Null）已登录，有 repo 权限；Max-Null/open-sea-skin fork **尚未创建**，需先 fork

## 提 PR 前的代码修正（评审发现的 3 个问题）

1. **中文注释 → 英文**：原改动含「SSiD 增强（2026-08-22）」等内部注释，上游全英文注释，公开 PR 需剥离内部引用
2. **autoCycle 复选框不同步 bug**：拖「日光」滑块的原始逻辑置 `state.autoCycle = false` 并保存，但新复选框仍显示勾选 → 同步 `cycleBox.checked`
3. **reset 走单一写入路径**：改为 `save({...DEFAULTS}).then(...)`（save 内部已更新 state），避免先手动赋值 state 再写存储的重复路径

## PR 核心卖点（对上游的价值）

- 新增「启用」「自动昼夜循环」「恢复默认」3 个控件（修复禁用后不可再启用的逻辑缺陷）
- 原版 disabled → `unmount()` 会删除按钮/面板 → 无法再启用；增强版只卸载海洋背景（frame/glass），保留设置入口

## 执行结果

- **PR 已创建并验证**：https://github.com/d-dev0101/open-sea-skin/pull/1 （OPEN, MERGEABLE）
- commit `c73f133`（分支 `feat/quick-controls-enable-toggle`，作者 MaxNull / 24647158+Max-Null@users.noreply.github.com，含 CHANGELOG Unreleased）
- 构建产物 `--check` 通过（byte-for-byte 同步）；static/bundle 测试除「site/index.html hash」外全绿——该失败为上游 main 既有问题（测试期望 hash 是按 LF 计算的 `69267b…`，Windows CRLF checkout 本地必失败，CI Linux 无碍），与本次改动无关
- 本地 fork 4 个代码文件与 PR 分支完全一致（仅 CHANGELOG 差异预期内）
- fork 仓库：https://github.com/Max-Null/open-sea-skin

## 后续注意

- 作者合并后如需回投 tarball 重建 SSiD vendor，按归档流程走（本次未重建）
- 若作者未响应，可考虑跟进评论或关闭 PR（本地增强版不依赖合并，SSiD 继续用 file: tarball）

## 不涉及

- 不重建 SSiD vendor tarball / 归档（当前部署已用修正前版本且工作正常；下一轮归档时自然带入修正版）
- 不改 package.json 版本（发版由维护者决定）
