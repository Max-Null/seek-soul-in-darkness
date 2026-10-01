/**
 * 换根后的工作区登记自愈。
 *
 * ## 为什么需要
 *
 * `WorkspaceRegistry.bootstrap()` 只在 `global.initialized === false` 时跑一次
 * （`packages/workspace/workspace/src/index.ts`），它会把历史会话按 cwd 归位。
 * 机器一旦 `initialized: true`（正常用过的机器都是），此后**再没有兜底**：
 * 会话根一换（共享根 ⇄ 隔离根），`workspace.json` 里登记的 id 就与文件系统上的会话
 * 彻底脱节 —— 表现是侧栏里所有会话掉进「未分组」、点开报 `session/not-found`，
 * 而已有工作区看着是空的。2026-09-27 实机现场：登记 41 条 vs 根里 187 个会话文件，
 * **交集为 0**。
 *
 * ## 触发条件（保守）
 *
 * 只在「登记非空、文件非空、且两者**交集为空**」时动手 —— 这是完全脱节的特征，
 * 不是正常的增删。正常的「登记里有几条已删会话」不会触发。
 *
 * 补登记按 cwd 归到已有工作区（path 归一化比较：忽略大小写与尾部分隔符）；cwd 没有
 * 对应工作区的，新建一个（title 取目录名）。子代理会话（`origin: 'subagent'`）跳过：
 * 它们是主会话派生的，DSH 本就不把它们列进主列表，写进工作区只会污染侧栏。
 *
 * 只加不删；写入前备份 `workspace.json.bak-<时间戳>`。
 */

import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { zstdDecompressSync } from 'node:zlib'

/** {@link healWorkspaceRegistry} 的输入。 */
export interface HealWorkspaceRegistryInput {
  /** Harness home —— 会话根都在其下。 */
  readonly dshHome: string
  /**
   * 内核 storage 服务的根，登记文件 `workspace.json` 在其下；省略时退回
   * `<dshHome>/storages`（与官方桌面版共用一份的形态）。存储根隔离之后必须显式传，
   * 否则这里改的是**旧根**那份、而内核读写的是新根那份，自愈于是静默失效。
   */
  readonly storageRoot?: string
  /** 落日志钩子（省略则静默）。 */
  readonly log?: (text: string) => void
}

/** {@link healWorkspaceRegistry} 的结果。 */
export interface HealWorkspaceRegistryResult {
  /** 是否真的做了补登记（false 时 `reason` 说明为何没做）。 */
  readonly healed: boolean
  /** 未触发的原因。 */
  readonly reason: string
  /** 补进去的会话条目数。 */
  readonly added: number
  /** 新建的工作区数。 */
  readonly workspacesCreated: number
  /** 跳过的子代理会话数。 */
  readonly skippedSubagent: number
}

/** 会话存储根目录名：`sessions` 与 `sessions-<profile>`（排除 `.bak-*` 备份）。 */
const SESSION_ROOT_PATTERN = /^sessions(-[A-Za-z0-9._-]+)?$/

/** 归一化路径：Windows 大小写不敏感，尾部分隔符不算另一个目录。 */
function normalizePath(path: string): string {
  return path.replace(/[\\/]+$/u, '').toLowerCase()
}

/** 目录名归一成登记用的会话 id（v3 日志的 `header.id` 是裸 uuid，登记用 `session-<uuid>`）。 */
function canonicalSessionId(name: string): string {
  return name.startsWith('session-') ? name : `session-${name}`
}

/** 列出一个目录下的子目录名；不可读时返回空数组。 */
function subdirectories(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return []
  }
}

/**
 * 扫描会话根，返回 `<cwd 编码目录> → <会话 id 数组>`。只读目录名，不解压日志。
 * @param dshHome - Harness home。
 * @param roots - 要扫描的根目录名。
 * @returns 按 cwd 编码目录分组的会话 id。
 */
function scanSessionIds(dshHome: string, roots: readonly string[]): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const root of roots) {
    for (const project of subdirectories(join(dshHome, root))) {
      const dir = join(dshHome, root, project)
      const ids = subdirectories(dir).map(canonicalSessionId)
      if (ids.length > 0) found.set(project, [...(found.get(project) ?? []), ...ids])
    }
  }
  return found
}

/**
 * `workspaceRecord` 的持久形态 —— `packages/workspace/workspace/src/spec.ts` 的 zod
 * schema，**五个字段全必填**。缺 `createdAt` / `updatedAt` 会让整张工作区表在读取时
 * 校验失败，比不写标题严重得多；`title` 缺了侧栏就没有名字。
 */
interface WorkspaceRecord {
  path: string
  title: string
  sessionIds: string[]
  createdAt: string
  updatedAt: string
}

/** 补齐必填字段后落盘；`now` 兼作缺失时间戳的兜底。 */
function toRecord(base: Partial<WorkspaceRecord>, sessionIds: string[], now: string): WorkspaceRecord {
  return {
    path: base.path ?? '',
    title: base.title ?? '',
    sessionIds,
    createdAt: base.createdAt ?? now,
    updatedAt: now,
  }
}

/** 一个会话的归属事实（从日志首帧读出）。 */
interface SessionFact {
  readonly id: string
  readonly cwd: string
  readonly subagent: boolean
}

/** 读一个会话日志首帧（session header）；读不出来返回 undefined。 */
function readSessionFact(file: string): SessionFact | undefined {
  try {
    const parsed: unknown = JSON.parse(zstdDecompressSync(readFileSync(file)).toString('utf8'))
    if (parsed === null || typeof parsed !== 'object') return undefined
    const header = parsed as { type?: unknown; id?: unknown; cwd?: unknown; origin?: unknown }
    if (header.type !== 'session' || typeof header.id !== 'string' || typeof header.cwd !== 'string') return undefined
    return { id: canonicalSessionId(header.id), cwd: header.cwd, subagent: header.origin === 'subagent' }
  } catch {
    // 首帧损坏或不是 zstd：当作不可读，跳过该会话
    return undefined
  }
}

/**
 * 检测并修复「登记与文件系统完全脱节」。
 *
 * 整个流程只读，直到确认需要写回为止；写回前备份。任何一步失败都静默放弃
 * （返回 `healed: false`）—— 自愈是尽力而为的补救，不该挡住应用启动。
 * @param input - Harness home 与日志钩子。
 * @returns 本次自愈的结果摘要。
 */
export function healWorkspaceRegistry(input: HealWorkspaceRegistryInput): HealWorkspaceRegistryResult {
  const { dshHome, storageRoot = join(dshHome, 'storages'), log = () => {} } = input
  const empty = (reason: string): HealWorkspaceRegistryResult =>
    ({ healed: false, reason, added: 0, workspacesCreated: 0, skippedSubagent: 0 })

  const registryFile = join(storageRoot, 'workspace.json')
  if (!existsSync(registryFile)) return empty('no-registry')
  let doc: { tables?: { workspaces?: Record<string, Partial<WorkspaceRecord>> }; global?: { workspaceIds?: string[] } }
  try {
    doc = JSON.parse(readFileSync(registryFile, 'utf8')) as typeof doc
  } catch {
    return empty('unreadable-registry')
  }
  const workspaces = doc.tables?.workspaces
  if (workspaces === undefined) return empty('no-workspaces-table')

  const registered = new Set<string>()
  for (const key of Object.keys(workspaces)) {
    for (const id of workspaces[key]?.sessionIds ?? []) registered.add(id)
  }

  let roots: string[]
  try {
    roots = readdirSync(dshHome, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && SESSION_ROOT_PATTERN.test(entry.name))
      .map(entry => entry.name)
  } catch {
    return empty('no-dsh-home')
  }
  const onDisk = scanSessionIds(dshHome, roots)
  const diskIds = new Set<string>()
  for (const ids of onDisk.values()) for (const id of ids) diskIds.add(id)

  if (registered.size === 0) return empty('nothing-registered')
  if (diskIds.size === 0) return empty('no-sessions-on-disk')
  for (const id of registered) if (diskIds.has(id)) return empty('registry-matches-disk')

  log(`registry heal: registry(${String(registered.size)}) and disk(${String(diskIds.size)}) share no id; rebuilding`)

  const byPath = new Map<string, string>()
  for (const key of Object.keys(workspaces)) {
    const path = workspaces[key]?.path
    if (typeof path === 'string') byPath.set(normalizePath(path), key)
  }

  const plan = new Map<string, { cwd: string; ids: Set<string> }>()
  let skippedSubagent = 0
  // 逐个会话读首帧拿 cwd：只凭目录名还原不可靠 —— 项目名里的 `-` 与路径分隔符同形。
  for (const root of roots) {
    for (const project of subdirectories(join(dshHome, root))) {
      for (const dir of subdirectories(join(dshHome, root, project))) {
        const fact = readSessionFact(join(dshHome, root, project, dir, 'session.jsonl.zstd'))
        if (fact === undefined) continue
        if (fact.subagent) {
          skippedSubagent += 1
          continue
        }
        const key = normalizePath(fact.cwd)
        if (!plan.has(key)) plan.set(key, { cwd: fact.cwd, ids: new Set() })
        plan.get(key)?.ids.add(fact.id)
      }
    }
  }
  if (plan.size === 0) return empty('no-readable-sessions')

  const now = new Date().toISOString()
  let added = 0
  let created = 0
  // 先算改动，再备份写回 —— 没有实际改动就不碰文件。
  const pending: { workspaceId: string; ids: string[]; create?: { path: string; title: string } }[] = []
  for (const [key, entry] of plan) {
    const existing = byPath.get(key)
    if (existing === undefined) {
      pending.push({ workspaceId: randomUUID(), ids: [...entry.ids], create: { path: entry.cwd, title: basename(entry.cwd) } })
      added += entry.ids.size
      created += 1
      continue
    }
    const current = workspaces[existing]?.sessionIds ?? []
    const seen = new Set(current)
    const fresh = [...entry.ids].filter(id => !seen.has(id))
    if (fresh.length === 0) continue
    pending.push({ workspaceId: existing, ids: fresh })
    added += fresh.length
  }
  if (pending.length === 0) return empty('nothing-to-add')

  try {
    copyFileSync(registryFile, `${registryFile}.bak-${String(Date.now())}`)
    for (const item of pending) {
      if (item.create !== undefined) {
        workspaces[item.workspaceId] = toRecord(
          { path: item.create.path, title: item.create.title }, item.ids, now,
        )
        const ids = (doc.global ??= {}).workspaceIds ?? (doc.global.workspaceIds = [])
        ids.push(item.workspaceId)
        continue
      }
      const current = workspaces[item.workspaceId]?.sessionIds ?? []
      // `updatedAt` 按 DSH 自己的口径同步推进（`packages/workspace/workspace/src/entity.ts:213`）。
      workspaces[item.workspaceId] = toRecord(
        workspaces[item.workspaceId] ?? {}, [...item.ids, ...current], now,
      )
    }
    for (const key of Object.keys(workspaces)) {
      const entry = workspaces[key]
      if (entry !== undefined) entry.sessionIds = entry.sessionIds ?? []
    }
    writeFileSync(registryFile, `${JSON.stringify(doc, undefined, 2)}\n`, 'utf8')
  } catch (error) {
    log(`registry heal: write failed: ${error instanceof Error ? error.message : String(error)}`)
    return empty('write-failed')
  }
  log(`registry heal: added=${String(added)} workspacesCreated=${String(created)} subagentSkipped=${String(skippedSubagent)}`)
  return { healed: true, reason: 'healed', added, workspacesCreated: created, skippedSubagent }
}
