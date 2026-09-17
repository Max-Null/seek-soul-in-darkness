# 上游 issue 草稿：多实例共用 DSH_HOME 时 storage 静默丢数据

> 状态：**草稿，未提交** · 2026-09-17
> 目标仓库：`deepseek-ai/deepseek-harness`
> 完整现场与逐层查证：本仓库 `docs/排查/2026-09-17-多实例共用storages.md`
> 提交前需确认：是否已在最新 master 复现（本文基于 0.1.5-rc.2 实测）

## 拟提交的 issue 正文

**Title**: Two hosts sharing one `DSH_HOME` silently lose each other's stored state

**Body**:

### What happens

Running two hosts against the same `$DSH_HOME` (here: the web profile and a second desktop-shell host, both using `~/.dsh`) makes `storages/` state silently regress. Data written by one host disappears when the other writes.

Observed on Windows, DSH `0.1.5-rc.2`. The concrete symptom that surfaced it: **142 of 235 sessions never got registered to their workspace** — the workspace had 29 session ids, all created in a three-day window; every session created after that window was missing, and nothing was ever reported to the user.

### Why it is silent

`packages/storage/storage-json` writes an entire unit by atomic replace. Its own module comment states the assumption:

> `Rename is an atomic replace on POSIX and on Windows …` **`writer per process and last-write-wins is correct.`**

So a second process holding a stale in-memory snapshot wins the race and overwrites the other's writes. `storage-domain` serializes writes **within one process only**; there is no cross-process step, so nothing detects the conflict.

`packages/storage/storage-sqlite` does not help either — its README's Known Limitations says:

> **No busy-wait or retry policy** — a competing connection holding a write lock rejects the operation immediately instead of waiting; the domain layer's write chain serializes writes within one process, and **cross-process coordination is out of scope**.

### This is not a third-party deployment mistake

The shipped desktop host derives its paths from a home that is explicitly documented as shared with npm-installed `dsh`:

```ts
// apps/desktop/src/paths.ts
/** @param dshHome - Harness home shared with npm-installed dsh. */
export function resolveDesktopPaths(dshHome: string = resolveDshHome()): DesktopPaths {
  return {
    profile: join(dshHome, 'profiles', 'desktop'),
    lock: join(dshHome, 'profiles', 'desktop', 'lock'),
    // …
  }
}
```

It owns `profiles/desktop` exclusively — with its own lock — but **not `storages/`**. So the desktop host running alongside `dsh web` (or an npm-installed `dsh`) shares the same storage directory. The collision is reachable **inside the shipped product line**, not only to downstream integrations.

### Why the loss is severe

The update window spans the whole read-modify-write cycle, not a single write. An application-level holder (workspace registry, or any plugin using `ctx.storageDomain`) reads the unit, mutates in memory, and writes the whole unit back later. A backend-level lock cannot cover that window, so this cannot be fixed by swapping backends.

Affected `$DSH_HOME` state (observed):

| Path | Effect |
|---|---|
| `storages/workspace.json` | workspace membership lost (confirmed) |
| `storages/memory.json` | **cross-session memory lost** (same write pattern: full-document `writeFileSync`) |
| `storages/query-log.json` | counters drift |
| `storages/guardian/`, `storages/habit/` | plugin statistics lost |
| `~/.dsh/*.json` (plugin-owned stores) | favorites / state lost |

Sessions and profiles are not affected when the hosts are given separate session roots — only `storages/` is shared by default.

### Reproduction sketch

1. Start two hosts against one `DSH_HOME` (e.g. `dsh --profile web`, plus a second host with its own profile but the same home).
2. In host A, create a session bound to a workspace.
3. Let host B perform any write to the same storage unit — for workspace records, opening or creating anything that touches the registry is enough.
4. The session created in step 2 is no longer accounted; the UI shows it under "ungrouped" while the storage file no longer lists it.

There is also a client-side amplifier: the failure only reaches `console.warn` (`packages/client/ui-workspace/src/client/navigation.ts`, `'new session failed:'`), so the user never sees an error.

### What we would like

Any one of:

1. **Cross-process coordination in `storage-domain`** — a lock around the unit lifecycle, or a version/generation check that rejects a stale whole-unit write instead of applying it.
2. **Detection at the backend** — e.g. a mutation counter per unit so a writer can tell its snapshot is stale, and report it rather than overwrite.
3. If neither is in scope soon, **document the constraint explicitly**: "one writer per `DSH_HOME`; concurrent hosts require separate homes", so downstream hosts can detect and refuse the configuration instead of losing data silently.

### Note on why we cannot patch it downstream

Downstream hosts cannot fix this in their own layer: the write window belongs to the application-level holder, and the storage backends' contracts do not expose a hook covering it. We have applied a rotating snapshot as mitigation only (see the linked record).

---

## 提交前检查清单

- [ ] 在最新 master（或当时最新 tag）上复现一次，替换上文的版本号
- [ ] 确认 `storage-json` / `storage-sqlite` 的注释行号仍有效（本稿引用的是 0.1.5-rc.2）
- [ ] 决定是否附最小复现脚本（两个进程 + 同一 `DSH_HOME` + 一次 workspace 写入即可）
- [ ] 决定是否附我们的排查记录链接（涉及本仓库私有路径，可选）
- [ ] 决定是否需要同时开一个上游 discussion 而非 issue
