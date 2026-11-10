# DSH STORE 追评原文（issue #1411，2026-10-15）

**为什么存档**：本仓库有一条自纠纪律——只被"推"过、没被"读"过的因果句要显式作废（见仓库 CHANGELOG 10.15.0 与仓库 `docs/publishing-to-npm.md` §十一）。10.16.0 的全部前提来自外部目录的一条 GitHub 评论，所以那段话必须以**对方原文**留在仓库里，让任何读者能核对"我方摘要"与"对方原话"是否一致。核对门：`tests/client.audit_surface.test.cjs`（"what the catalog actually wrote is archived"）。

**来源**：`https://github.com/AI-Scarlett/DSH-Store/issues/1411#issuecomment-6195702732`（comment id 6195702732，作者 `AI-Scarlett`，`created_at` `2026-10-15T15:24:28Z`，取回方式 `gh api repos/AI-Scarlett/DSH-Store/issues/comments/6195702732`，取回时间 2026-10-16T03:57Z，正文 sha256 见下）。

**正文未作任何改动**（无翻译、无删节、无省略号）；下面代码块内的文本即 API 返回的 `body` 字段。

```text
We rechecked **10.15.0 at `6c5b3c7b4390bf2ba867d6ded90e0ba4d30d5fb2`**. The old report conflated a per-file limit with the total: the former scanner's 262,144-byte file limit was exceeded; 467,678 bytes did not exceed a 2,097,152-byte total limit. That diagnostic was incorrect. The current bounds are **4 MiB per file, 8 MiB total, 512 source files**. This fixed source has complete coverage (11 files, 474,793 runtime bytes), with no budget findings. Your 442,975-byte client needs no minification or splitting, and the two explicit locale exports need no further pattern change.

We also corrected declaration-module resolution, including `lib/types/client/index.d.ts` → `../index.js` resolving to the packaged `lib/types/index.d.ts`. The remaining review includes real file/network capabilities and the dynamic `require(name)` helper in `lib/client.js:70` (`requireSeed`). The scanner does not prove its finite caller set; that remains a Store-side review boundary, not a claim that your host reproduction failed. The refreshed Catalog remains blocked, with runtime acceptance unknown. We did not execute your tests or a host. [Fixed source](https://github.com/RevolutionLA/dsh-dream-skin/commit/6c5b3c7b4390bf2ba867d6ded90e0ba4d30d5fb2).
```

**我方从中读到的三条（摘要，非原文）**：

1. 旧的"单文件 262,144 字节超限"这条**由对方作废**，现行边界 4 MiB/文件、8 MiB/总量、512 源文件；在那套边界下我方 `lib/client.js` **不需要压缩也不需要拆分**。
2. 他们**更正了自己那一侧**的 declaration-module 解析问题（`lib/types/client/index.d.ts` → `../index.js`）。
3. 仍然开着的审查项是"真实文件/网络能力"与 `requireSeed` 里那枚 `require(name)`；原话是扫描器"does not prove its finite caller set"，并且他们明说**这是 Store 侧的审查边界**，不是"我方宿主复现失败"。Catalog 仍 blocked，runtime acceptance unknown，**他们没有执行我方测试、也没有跑宿主**。

**这份存档证明不了的事**：它不能证明对方扫描器的行为，也不能证明我方会因此被放行；它只固定"我方据以动手的那段话确实说过"。10.16.0 的答复只针对第 3 条里的 `require(name)`。

正文 sha256（对 `body` 去掉尾部换行后计算）：`cff4bf4828888d2d3c7552c3ef84e3c6130e53a5771785e493441dc07a73600a`
