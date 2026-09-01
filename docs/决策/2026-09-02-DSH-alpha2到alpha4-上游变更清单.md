# DSH 0.1.2-alpha.2 → 0.1.2-alpha.4 上游变更清单（2026-09-02）

> 拉取总结（基于全部 338 个 non-merge 提交的实际 diff 阅读，非标题推断）。
> 拉取布局：主工作区 `deepseek-harness/` 保持 alpha.2（运行环境）；官方主线在独立
> worktree `H:\MaxNull\WorkStation\deepseek-harness-alpha4`（master @ 4e84901e64）。
> 规模：338 提交（feat 18 / perf 22 / fix 132 / docs 68 / test 64 / refactor 13 /
> chore 11 / ci 3 / revert 2 / release 2 / cleanup 1 / style 1），
> 2901 文件 +39496 / -31644。

## 新增功能

- **CPython 子进程后端**（c388169cff + ~130 跟进修复）：新包
  `packages/experimental/code-runtime-python`（`@deepseek-ai/dsh-experimental-code-runtime-python`，
  private）；fd-3 帧协议、SIGXCPU 重置/软限钳制、RLIMIT 预算门
  （maxLogBytes/maxValueBytes 载入即校验）、同组进程 reap、输出按序列化成本计量；
  053d17f6a1 整体迁入 experimental，d6bd5eb973 限界解释器版本探测，7f84a825c9 定稿 provider 契约。
- **全会话 turn rail**（7e2eacb1fe / b3064cca77 / 6af1ee49b1 / 3a834fe6c9）：新包
  `session-turn-outline`（每 turn 号 / start seq / 首提示预览投影，挂 web-app bundle）；
  ui-chat 固定间距可滚动 turn rail 与 load-and-jump；218bb7f645 在 `ISession` 新增
  **`loadThrough(seq)`** 深历史分页（共享 low-water 重定向 + no-progress 守卫）；
  0e63841189 settled-response 预览、b7053eba79 限界超大预览块。
- **web fetch 默认暴露**（0a0f9e59ff + cf7b0bd5a4 + ca723d9273）：base/headless/sdk-app
  的 `tool-web` 行 `fetch: false → true`（Web 禁用该行、按 agent preset 组合）。
- **PTC preset 去掉 workflow**（0cdcc9c3c5）：Web ptc preset 禁用 `tool-workflow` 行
  （`workflow-worker-thread` 与 `ralph` 保留），Standard/Creator 不变。
- **subagent steer 图像交付**（7c38fd8102 + ec493c2db8 + 53f5418a72）：turn 关闭窗口内的
  steer/跟进改新 turn 认领；可继续子代理跟进接受图片部件（宿主先准入持久化再入 inbox；
  模型拒图则拒交付）；queue dock 渲染图片缩略图；fixes #3186。
- 其他：4df85c85ff PR open 初始化 Issue 开始日期（`.github/issue-management/policy.mjs`）；
  2480bdf27a Workspace Write 中文文案；7020c7e122/3ce5604a71 超级椭圆圆角 + 发丝线
  elevation 描边。

## 修复（代表性）

- ff21366916 输入机 Tab 完成高亮命令（候选 drill 动作优先）
- 25e4527f5e + 5257c75092 llm profile headers 按 Fetch 可表示性校验（不可表示即配置错误拒绝）
- 49bf26a794 网关 WebSocket 心跳改 2 次 missed 才断开（`stream-server.ts` 的
  `MAX_MISSED_HEARTBEATS`），慢主机不再误判掉线
- 7222e17dc0 `read_image` 接受无扩展名附件路径（`sniffImageMediaType` 文件签名识别，
  `INVALID_IMAGE` 诊断带路径）
- 1dd3e60f50 + d8e2ac5052 流式代码围栏增量渲染（`CodeBlock.tsx` / `highlight.ts` /
  `incremental.ts` 重构）
- 2e21d210a5 trajectory 替换窗口重锚；39b90961c7 / 62f707bb1d / db5417ff6f jump 与
  分页器所有权；32d681f023 空恢复模型选择保留；d7abd0a01e 空白会话先激活选中视图再 blank 门控

## 重构与性能优化

- **27bf1039db refactor(session)!（breaking）**：`packages/util/brand` 新增 `brandNumber`；
  `@deepseek-ai/dsh-session/types` 引入 **`SessionSeq`**（事件序号）与 **`SessionLogOffset`**
  （log 偏移/前缀长）双品牌；`SessionEvent.seq`、`SurfaceOp.replace.start/end`、
  `sourceEventSeqs` 全部品牌化；`SessionHeader.seedLength?` → **`isSeeded: boolean`**，
  `CreateSessionOptions.meta.seedLength` → `isSeeded` + `inheritedEventCount`；
  物理 JSONL v0 行仍存可选 `seedLength`（向后兼容读）。
- **4553c9d957 refactor(session)!（breaking）**：删除整个 `session-persistence-sqlite` 包
  （codec/schema/store/sql/压缩字典），会话持久化只留 JSONL。
- **5660f44d29（连带 bcfec8d1c3 / 47e6448e23）（breaking）**：`Session.events` getter
  删除 → **`eventAt(seq)`** + **`snapshotEvents(fromSeq, toSeqExclusive)`** 半开区间快照；
  `Session.seeded` 新布尔字段。
- **4203317e18 perf(client)**：`ConversationNodeAssembler` 按需物化 target——
  `activeTargets()` 更名 **`activityTargets()`**、新增 `activateTarget(target)`；
  未激活 target 不建 builder/snapshot；buildLocationData 回传上次 publication，
  未变则原样返回。
- **perf(chat)**：e32437d18b 滚动几何采样节流 500ms + `scrollend` 终采样
  （`SCROLL_SAMPLE_INTERVAL_MS`）；0e90d47d19 `ChatNodeList` memo 跳过稳定 order 映射；
  c809098b06 / 5934201109 streaming publication 合并到 2→3 帧；
  81431381d6 / 2ab37e9558 location projection 复用与 trajectory 先分页再渲染；
  faa61ada74 视口外语法高亮延迟；8478de9b0e 工具体格式化延迟到展开；86c6d9345e 等。

## 插件生态影响（升级前必读）

1. **Session 读取 API 破坏**：任何调用 `session.events` 的插件必须改为
   `snapshotEvents()` / `eventAt()`；`seeded` 字段取代隐式判断。
2. **类型品牌化**：`SessionSeq` / `SessionLogOffset` 改变公开签名（运行时仍是 number，
   但 TS 编译期强制品牌），`@deepseek-ai/dsh-session` 消费者需重新类型化。
3. **Client observable 契约收紧**（b8a19413e9）：`ChatNodeSource` / `ChatNodeProcessSource`
   的 `getSnapshot` / `subscribe` 必须是 readonly 函数属性而非类方法；
   **`InboxState.claimed` → `currentClaimed`**（拒绝的 claim 不再分类后续消息）。
4. **注入面新增**（577f0cf7d9）：slot 注入契约新增 **`keyedHooks` compartment**
   （`KeyedHooksSources = Record<string, KeyedStandardSource>`），合成
   `use<Name>(key, selector?)` 键控选择器 hooks；`bindInjectHooks` → `bindInjectSources`；
   chat 节点订阅源改为 keyed 形态（scoped-slots / ui-slots 同步）。
5. **session-projection 事件语义**：ceadd90e71 identity 门控（视图 Object.is 相同不推送）
   + 9069a8b6f8 每步视图比较（不存 dedup baseline）；acc23f6d9c 的 viewKey token 已被
   a2437db180 回退——最终形态是 "per-step raw-view gate"。
6. **Assembler 激活语义**：第三方 View 通过自身订阅激活 target（`activateTarget`），
   未激活无快照；`activeTargets` 只反映已物化快照；turn-rail 依赖新
   `session-turn-outline` 投影单元。
7. **工具面**：base/headless/sdk 默认新增 `web_fetch`（匿名 fetch 仅公开 HTTP(S)），
   Web 按 preset 组合不受影响；PTC preset 的 `workflow` 绑定移除。

## 其他

- docs / notes 双语文档海量同步（config-catalog、module-graph、子系统文档）。
- CI 加固：161c6591be 首个 gate 失败即停、a074e6131f 超时与 store-scan 降本、
  e2ef25b06e Windows 零构建覆盖率、4032a0a428 ReFS block-clone。
- 两个 release 提交（a9e185f205 / 14bab4422b）为全包版本号提升，无 CHANGELOG 变更。
- 依赖锁与第三方 notices 同步。

## 备注

- 主 checkout 曾因 `git pull` 在 alpha.2 分支上短暂被快进至 alpha.4，已
  `git reset --hard 0a53fb55be` 恢复；最终布局 = 主工作区 alpha.2 + worktree alpha.4。
- 仓库遗留 2 条旧 stash（`ds-harness-remote trustedHosts 适配（alpha.1 时代）`、
  `fix-3198-resume-seq-gap: temp: switch to official master`），非本批产物，待人工裁决。
- 在 alpha.4 上运行前需在 worktree 内 `pnpm install`；建议随 SSiD 下一次内核升级窗口
  统一适配（全景 breaking 见「插件生态影响」）。
