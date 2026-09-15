# pwsh 工具 `spawn EPERM`：SSiD 侧透明重试与上游 issue

> 状态：**已交付**（新插件 `dsh-ssid-pwsh-retry` 随 v0.3.2 出包；上游 issue 草稿见
> `docs/排查/2026-09-15-pwsh-spawn-EPERM-上游issue草稿.md`，尚未提交）
> 关联：`docs/排查/2026-09-14-pwsh工具间歇性spawn-EPERM-排查记录.md`（现象与取证）、手册 §7

## 一、问题的归属

排查记录把失败点收敛到 DSH 的进程创建层：轮子进程（runner）内部经由 Koffi 调
`CreateProcessW`，返回 `ERROR_ACCESS_DENIED` 后由 `spawn-runner.ts` 的映射表翻成 Node
风格的 `spawn EPERM`。**这一层在 `deepseek-harness` 里，属「只引用不改」的范围**——SSiD
不能在此处修，只能二选一：缓解，或等上游。

同时有一条改变判断的观测：报出 `spawn EPERM` 的前提是 runner 进程**刚刚被 Node 成功
spawn**（`windows-job.ts` 的启动路径），说明失败发生在同一时刻的第二次创建，而不是宿主
的 spawn 能力整体失效。再加上映射层的门控 `jobHandle === undefined` 同时覆盖
`AssignProcessToJobObject` 与 `ResumeThread` 的错误 5，**「失败点 = CreateProcessW」在只有
现象、没有 Procmon/Sysmon 证据时属推断**。

## 二、决策

**SSiD 侧做一次透明重试，同时向上游提 issue。** 理由：该错误可自愈（取消后台任务后即恢复），
说明失败是瞬时的资源/权限竞争而非配置错误，重试对用户是可感知的改善；而根治需要上游改
进程创建层，不能由 SSiD 完成。

**代价必须写明**：重试会重新执行一次命令——非幂等命令因此可能执行两次。这是「透明重试」
固有的取舍，用户已确认接受。

## 三、实现

新增内置插件 `@max-null/dsh-ssid-pwsh-retry`（`plugins/dsh-ssid-pwsh-retry/`）：

- 包装 `tools/execute` waterfall——DSH 的工具管线把该事件定义为「围绕 dispatch 的包装器，
  用于 timeout、retry 或 metrics」，正是重试的正当入口。
- 命中条件三重收窄：工具名必须是 `pwsh`、结果必须是 `isError` 且文本或 `error.message`
  匹配 `spawn EPERM`、调用未中止。
- 只重试**一次**：等待 300ms（落在用户可感知阈值以下）后重新 `next()`。
- 挂载在 `dsh.profile.bundles` 末尾：Cordis 的 waterfall 用 `cbs.shift()` 逐个消耗监听器，
  `next()` 不可重放——只有位于链尾的包装器重新 `next()` 才会再次真正 dispatch，而不会跳过
  后面的包装器。
- 单测 7 项（`tests/retry.test.mjs`）钉住行为：命中 EPERM 重试一次并返回第二次结果、
  `error.message` 形态同样识别、非 pwsh 不重试、非 EPERM 不重试、成功不重试、已中止不重试。

## 四、验证

- 插件单测 7/7 通过。
- `npm run check:rules` 七门全过（含 vendor 四份一致、profile 与 template 声明对比、
  插件 peerDeps 覆盖性）。
- 重试行为在真实宿主上的效果**尚未观测**——该错误是间歇性的，无法按需复现；插件上线后
  靠 `~/.ssid/ssid.log` 与插件自己的 stderr 行（`[dsh-ssid-pwsh-retry] pwsh 命中 spawn EPERM…`）
  确认它是否真的兜住过。

## 五、遗留

- **透明重试掩盖根因**：它降低用户侧症状，不改变 DSH 进程创建层的失败概率。上游 issue
  一旦有进展，应优先评估收紧或撤下本插件。
- **触发条件仍未确证**：排查记录里设计的三项实验（失败瞬间抓 conhost/句柄、pwsh 路径别名
  判别、取消后台任务后连跑）只完成了别名一项，且该假设已被证伪（本机 pwsh 无 Store 别名）。
- 上游若采纳「区分三个系统调用的错误回传」，本插件应随之收窄命中条件——届时
  `spawn EPERM` 将不再是三种失败的共同文本。
