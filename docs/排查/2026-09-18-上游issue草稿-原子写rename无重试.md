# 上游 issue 草稿：JSON 存储的原子写没有复用仓库里已有的 Windows 瞬时重试

> 状态：**草稿，未提交** · 2026-09-18
> 目标仓库：`deepseek-ai/deepseek-harness`
> 关联：`docs/排查/2026-09-17-DSH内核崩溃退出-排查记录.md`（完整现场、崩溃堆栈、复现探针与实测数据）
> 提交前需确认：是否已在最新 master 上核对行号（本稿基于 `0.1.5-rc.2`）；是否已有同类 issue

## 拟提交的 issue 正文

**Title**: `storage-json` publishes unit files with a bare `rename()` — the Windows transient-failure retry that `util/atomic-write` already ships is missing on the path every `storages/` unit takes

**Body**:

### What happens

On Windows, a process outside DSH can briefly hold a handle to the freshly-written temp file or the target — a real-time scanner or an indexer touching the file in the milliseconds between `close()` and `rename()`. `rename()` over an existing target then fails with `EPERM` (libuv maps it to `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`, which returns `ERROR_ACCESS_DENIED` when either side is open without `FILE_SHARE_DELETE`).

`@deepseek-ai/dsh-storage-json` treats that as a hard failure. Its publish protocol is write-temp → fsync → `rename` → rethrow, with no retry:

```ts
// packages/storage/storage-json/src/atomic.ts:24-40
export async function writeAtomic(path: string, data: string): Promise<void> {
  const tmp = join(dirname(path), `.${randomUUID()}.tmp`)
  try {
    const handle = await open(tmp, 'wx', 0o600)
    try {
      await handle.writeFile(data, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(tmp, path)          // ← no retry
    await fsyncDirectory(dirname(path))
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}
```

Every `storages/` unit goes through it — `single-unit.ts:141` and `per-record-unit.ts:153,287` are the only call sites. In our case the unit was a guardian state file on the `single` layout, rewritten whole on every `tool/result` and `turn/end`; the `EPERM` surfaced 123 ms after the last `turn/end` and the kernel child process exited with code 1, taking every session in that process with it (the path from a rejected storage write to a process exit was ours — see *What we already fixed* below — but the trigger is this call).

### Two atomic writers in this repo, only one retries

`util/atomic-write` already solves exactly this, including the error set:

```ts
// packages/util/atomic-write/src/index.ts:17-42
const WINDOWS_TRANSIENT_RENAME_ERRORS: ReadonlySet<string> = new Set(['EACCES', 'EBUSY', 'EPERM'])
const WINDOWS_RENAME_RETRY_INITIAL_MS = 20
const WINDOWS_RENAME_RETRY_MAX_MS = 200
const WINDOWS_RENAME_RETRY_LIMIT = 8
```

`renameAtomicTemp` retries on those codes with exponential backoff (20 ms doubling to 200 ms, 8 attempts) and rethrows only after the ceiling. Five packages import it — `app-boot` (`profile.ts:33`), `agent-presets` (`authoring.ts:17`), `credentials-local` (`index.ts:44`), `llm-deepseek` (`upload-index.ts:6`), `settings-file` (`index.ts:16`).

`storage-json` is not one of them: its only dependency is `@deepseek-ai/schemastery`, and `atomic.ts` re-implements the same temp+rename protocol without the retry. So the fix is not "invent backoff for Windows" — it already exists two directories away and was simply not applied on the one path that every JSON unit file takes.

Related, and the reason this is worth a second look rather than a one-line patch: `fs/fs-local/src/fsio.ts:571` is a third atomic writer, publishing through `ReplaceFileW` (`:624`) with a `rename` fallback for `ENOENT` (`:629,632`), also without backoff. We have no measurements for that path — flagging it as an inspection target, not as a confirmed defect.

### Measurements

Single-process, strictly serial probe doing the exact protocol (`open(tmp,'wx')` → `writeFile` → `fsync` → `close` → `rename` over an existing target). Any failure can only come from a holder outside the process, because there is no concurrency inside it:

| Location | Rounds | EPERM | Rate |
|---|---|---|---|
| `C:\Users\<user>\.dsh` | 1500 | 45 | 3.0% |
| `C:\Users\<user>\Documents` | 1500 | 19 | 1.3% |
| `C:\Users\<user>\.ssid` | 1500 | 9 | 0.6% |
| `C:\Users\<user>\AppData\Local\Temp` | 1500 | 6 | 0.4% |
| `D:\` (control) | 3000 | 0 | 0% |

The system drive is affected across four different directories; a data drive is not. Real workloads write far less often than the probe (≈100 renames/s), which is why the symptom is "an occasional crash" rather than a deterministic one — the exposure rises with how often a unit is flushed.

Retry shape matters more than retry count:

| Strategy | Sample | Outcome |
|---|---|---|
| No retry | 1500 | 3.0% failed |
| Immediate retry, no delay (≤5 attempts) | 800 | 3 recovered on the first retry; **8 took 6 consecutive attempts and still failed** |
| Backoff 10/30/100/300/1000 ms | 2000 | 11 retries triggered, **all recovered, 0 hard failures** |

So the lock is almost always momentary, but a retry loop without a delay does not absorb it. That is the shape `util/atomic-write` already has (20 ms initial, doubling).

Two caveats on the numbers: one host, and the holder is unidentified — the machine runs an EDR/antivirus agent whose log directory is not readable by the user, so "a process outside DSH held the file" is established while "which process" is not. The probe also amplifies the rate by stressing renames far beyond any real workload.

### Why "just call `writeFileAtomic` instead" is not a drop-in

`util/atomic-write` documents `Crash durability (fsync) is out of scope` (`index.ts:73`) — it does not `fsync` the temp handle or the parent directory. `storage-json`'s protocol does both (`atomic.ts:30,35,44-52`) and needs to: a unit file is the durable record of a state that a reader may load after a power loss. Swapping the implementation wholesale would trade a transient-failure bug for a weaker durability guarantee.

### What we would like

1. **Add the bounded backoff to `storage-json`'s `writeAtomic`.** Reusing the existing constants (`EACCES`/`EBUSY`/`EPERM`, 20 ms doubling to 200 ms, 8 attempts) keeps the failure semantics identical to the other five consumers, and the `fsync` steps stay where they are.
2. **If the retry belongs in one place, extract it rather than copy it.** `renameAtomicTemp` is self-contained (`index.ts:29-42`) and could live beside `writeFileAtomic` as an exported helper, or in a shared `util/` module, with `storage-json` calling it and keeping its own `fsync` sequence.
3. **Check the `fs-local` path in the same pass.** `ReplaceFileW` may have different transient behavior than `MoveFileExW`; we have not measured it and are not claiming a defect there.

### Reproduction

Probe core (Node, single process, serial; the target file must already exist so the replacement path is exercised):

```js
import { open, rename, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const dir = process.argv[2], rounds = Number(process.argv[3] ?? 3000)
const target = join(dir, 'probe-target.json')
await mkdir(dir, { recursive: true })
let ok = 0, failed = 0
for (let i = 0; i < rounds; i++) {
  const tmp = join(dir, `.${randomUUID()}.tmp`)
  const handle = await open(tmp, 'wx', 0o600)
  try { await handle.writeFile('{"i":1}\n', 'utf8'); await handle.sync() }
  finally { await handle.close() }
  try { await rename(tmp, target); ok++ }
  catch (error) { failed++; await rm(tmp, { force: true }).catch(() => {}) }
}
console.log({ dir, rounds, ok, failed })
```

Point it at a directory on the system drive for the failure case, and at a non-system drive for the control.

### What we already fixed on our side

Our plugin (`@max-null/dsh-guardian`, not part of this repo) had two upstream-independent defects that turned a rejected storage write into a process exit: the serialized write chain had no `.catch`, so `writeChain` stayed rejected and every later write failed immediately; and the event entry point called `void this.handleEvent(...)`, handing the rejection to a runtime that treats unhandled rejections as fatal. Both are fixed (write-chain self-healing + a guarded event entry, unit-tested). That converts the outcome from "kernel dies" to "one state update is dropped", which is the right blast radius for rebuildable advisory state — but it does not remove the trigger, and any other consumer of `storages/` that does not guard its own chain still has the fatal path.

---

## 提交前检查清单

- [ ] 在最新 master 上核对行号（本稿基于 `0.1.5-rc.2`：`atomic.ts:24/34`、`single-unit.ts:141`、`per-record-unit.ts:153,287`、`util/atomic-write/src/index.ts:17/29/73`、`fs-local/src/fsio.ts:571/624/629/632`）
- [ ] 搜一遍是否已有同类 issue 或 discussion（关键词：EPERM rename Windows、atomic write retry、storage-json）
- [ ] 确认投递渠道 —— 上游仓库 Issues 关闭，前几份报告走的是 Discussions
- [ ] 决定实测数字是否保留（主机已匿名，但 `3.0%` 这类比率来自探针的加压频率，建议连同"探针放大"的说明一起保留）
- [ ] 决定第 3 条（`fs-local`）是否保留 —— 我们只有代码观察、没有实测，写进去是提示而不是主张
- [ ] 决定是否附探针脚本 —— 成本低、可复跑，建议附
- [ ] 与本仓排查记录交叉核对一遍数字（`docs/排查/2026-09-17-DSH内核崩溃退出-排查记录.md`）
