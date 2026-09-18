#!/usr/bin/env node
/**
 * 工作区登记对账：把会话补进它 cwd 对应的 `workspace.json` 工作区。
 *
 * 为什么需要它：DSH 的 `WorkspaceRegistry.bootstrap()` 只在 `global.initialized === false`
 * 时跑一次（`packages/workspace/workspace/src/index.ts:127-130`）——它会把历史会话按 cwd
 * 归位、甚至新建工作区。这台机器早已 `initialized: true`，于是**再没有兜底**：运行时那条
 * 「创建会话即登记」的路径一旦因多实例互相覆盖而丢写入（见 docs/排查/2026-09-17-多实例共用
 * storages.md），会话就永远不进工作区列表。这个脚本补的就是这段。
 *
 * 规则照 `bootstrap()`：按 cwd 分组、已属于本工作区或未登记的会话前置合并；不删任何 id
 * （登记里指向已消失会话的 id 由 DSH 自己的可见性过滤处理）。
 *
 * 用法：
 *   node heal-workspace-registry.mjs                  # dry-run，只报告
 *   node heal-workspace-registry.mjs --apply          # 写回（先备份同目录 .bak-<时间戳>）
 *   node heal-workspace-registry.mjs --apply --new-workspaces   # 同时为没有工作区的 cwd 新建
 *
 * **必须在 DSH 实例停止时运行**：运行中的实例持有内存态，会把整份登记写回并覆盖这里的改动。
 */
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const createMissing = args.has('--new-workspaces')

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const registryFile = join(dshHome, 'storages', 'workspace.json')
/**
 * 会话存储根（相对 `$DSH_HOME` 的目录名）：扫所有 `sessions` / `sessions-<profile>`
 * 目录，而不是列两个固定名 —— 会话根名跟随 profile 名，列死的写法会让并行实例
 * （`sessions-ssid-dev`）的会话漏出对账范围。备份后缀（`sessions.bak-*`）不算。
 */
const sessionRoots = readdirSync(dshHome, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^sessions(-[A-Za-z0-9._-]+)?$/.test(entry.name))
  .map((entry) => entry.name)

/** 归一化 cwd：Windows 大小写不敏感，尾随分隔符不算另一个目录。 */
const norm = (path) => String(path).replace(/[\\/]+$/, '').toLowerCase()
/**
 * DSH 登记统一用 `session-<uuid>` 形式的会话 id（v3 日志的 `header.id` 就是这个形式，旧格式
 * 日志里是裸 uuid）。**必须用同一形式**：可见性过滤是逐字比较
 * （`entity.ts:102` 的 `sessionPath(id) === record.path`），形式不一致的表现是
 * 「登记里有、侧栏不显示、会话掉进未分组」——本脚本第一版 `canonicalId()` 掉前缀，补入的 198 条
 * 里绝大部分因此不可见。
 */
const canonicalId = (id) => {
  const text = String(id)
  return text.startsWith('session-') ? text : `session-${text}`
}

/** 读一个会话日志的首帧头（就是 session header）；读不出来就当它不存在。 */
const headerOf = (file) => {
  try {
    const h = JSON.parse(zstdDecompressSync(readFileSync(file)).toString('utf8'))
    return h?.type === 'session' && typeof h.id === 'string' ? h : undefined
  } catch {
    return undefined
  }
}

const doc = JSON.parse(readFileSync(registryFile, 'utf8'))
const workspaces = doc.tables.workspaces
const archived = new Set((doc.global.archivedSessionIds ?? []).map(canonicalId))

// 已登记的会话 id（全局唯一：一个会话只能属于一个工作区）
const owner = new Map()
for (const [id, unit] of Object.entries(workspaces)) {
  for (const sessionId of unit.sessionIds ?? []) owner.set(canonicalId(sessionId), id)
}

// 扫会话根：cwd → 会话（按 createdAt 降序，新的在前）
const byPath = new Map()
const stats = { scanned: 0, unreadable: 0 }
for (const root of sessionRoots) {
  const rootDir = join(dshHome, root)
  if (!existsSync(rootDir)) continue
  for (const dirName of readdirSync(rootDir)) {
    const dir = join(rootDir, dirName)
    if (!statSync(dir).isDirectory()) continue
    for (const entry of readdirSync(dir)) {
      const sessionDir = join(dir, entry)
      if (!statSync(sessionDir).isDirectory()) continue
      // 会话日志有两种文件名：旧版 `session.jsonl.zstd`、v3 格式起 `session.v3.jsonl.zstd`。
      // 只认前者会**静默漏掉所有 v3 会话**（本机实测 52 个），归位统计因此少算一块。
      for (const logName of readdirSync(sessionDir)) {
        if (!logName.endsWith('.jsonl.zstd')) continue
        const file = join(sessionDir, logName)
        stats.scanned += 1
        const header = headerOf(file)
        if (header === undefined) { stats.unreadable += 1; continue }
        if (typeof header.cwd !== 'string' || header.cwd === '') continue
        const key = norm(header.cwd)
        const bucket = byPath.get(key) ?? { raw: header.cwd, members: new Map() }
        // 同一个会话可能同时躺在两个会话根里（会话根隔离时整体复制过），按 id 去重——
        // 否则它会在这份登记里出现两次，侧栏也跟着显示两次。
        if (!bucket.members.has(canonicalId(header.id))) bucket.members.set(canonicalId(header.id), header.createdAt ?? 0)
        byPath.set(key, bucket)
      }
    }
  }
}
/** 一个 cwd 下的会话，新的在前。 */
const memberList = (bucket) => bucket === undefined
  ? []
  : [...bucket.members].map(([id, createdAt]) => ({ id, createdAt })).sort((a, b) => b.createdAt - a.createdAt)

const result = []
for (const [id, unit] of Object.entries(workspaces)) {
  const key = norm(unit.path)
  const bucket = byPath.get(key)
  const members = memberList(bucket)
  const known = new Set((unit.sessionIds ?? []).map(canonicalId))
  const additions = members
    .filter(m => !known.has(m.id) && owner.get(m.id) === undefined && !archived.has(m.id))
    .map(m => m.id)
  const gone = (unit.sessionIds ?? []).map(canonicalId).filter(sid => !members.some(m => m.id === sid))
  if (additions.length > 0 || gone.length > 0) {
    result.push({ id, path: unit.path, additions, existing: (unit.sessionIds ?? []).length, gone: gone.length })
  }
  byPath.delete(key)
}

// 剩下的 cwd 没有对应工作区。临时目录不建：那些是评估/调试会话，建成工作区只会污染侧栏。
const isTemp = (path) => /[\\/]appdata[\\/]local[\\/]temp([\\/]|$)/i.test(path) || /[\\/]temp[\\/]/i.test(path)
const fresh = []
const skippedTemp = []
const skippedMissing = []
if (createMissing) {
  for (const [key, bucket] of byPath) {
    const members = memberList(bucket)
    const additions = members
      .filter(m => owner.get(m.id) === undefined && !archived.has(m.id))
      .map(m => m.id)
    if (additions.length === 0) continue
    if (isTemp(bucket.raw)) { skippedTemp.push({ path: bucket.raw, n: additions.length }); continue }
    // 目录不存在就不建：可能是某次会话把 cwd 写错（例如漏了盘符），建出来只会是空壳工作区。
    if (!existsSync(bucket.raw)) { skippedMissing.push({ path: bucket.raw, n: additions.length }); continue }
    fresh.push({ id: randomUUID(), path: bucket.raw, additions, newestAt: members[0]?.createdAt ?? Date.now() })
  }
}

console.log(`扫描 ${stats.scanned} 个会话日志（${stats.unreadable} 个读不出头，跳过）`)
console.log(`现有工作区 ${Object.keys(workspaces).length} 个\n`)
for (const r of result) {
  console.log(`${r.path}`)
  console.log(`   现有登记 ${r.existing} | 本次补入 ${r.additions.length} | 登记指向已消失会话 ${r.gone}`)
}
for (const r of fresh) {
  console.log(`＋新建 ${r.path}`)
  console.log(`   本次补入 ${r.additions.length}`)
}
if (skippedTemp.length > 0) {
  const n = skippedTemp.reduce((sum, r) => sum + r.n, 0)
  console.log(`\n（跳过临时目录 ${skippedTemp.length} 个、共 ${n} 条，未建工作区）`)
}
if (skippedMissing.length > 0) {
  const n = skippedMissing.reduce((sum, r) => sum + r.n, 0)
  console.log(`（跳过目录不存在的 cwd ${skippedMissing.length} 个、共 ${n} 条：${skippedMissing.map(r => r.path).join('、')}）`)
}
const totalAdd = [...result, ...fresh].reduce((sum, r) => sum + r.additions.length, 0)
console.log(`\n合计补入 ${totalAdd} 条${createMissing ? '' : '（未启用 --new-workspaces，没有工作区的 cwd 未处理）'}`)

// 规范化本身也算改动：登记里还留着裸 uuid 形式的 id 时，即使没有新会话要补也得写回一次。
const stale = Object.values(workspaces)
  .reduce((n, unit) => n + (unit.sessionIds ?? []).filter(id => !String(id).startsWith('session-')).length, 0)
const needsNormalize = stale > 0
if (needsNormalize) console.log(`另有 ${stale} 条历史 id 会被规范化为 session-<uuid> 形式`)

if (!apply) {
  console.log('\n这是 dry-run。加 --apply 才会写回。')
  process.exit(0)
}
if (totalAdd === 0 && !needsNormalize) {
  console.log('\n无需改动。')
  process.exit(0)
}

const backup = `${registryFile}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
copyFileSync(registryFile, backup)
for (const r of result) {
  const unit = workspaces[r.id]
  // 已有条目一并规范化，并按 id 去重（补入项与历史项可能指向同一个会话）。
  const merged = [...new Set([...r.additions, ...(unit.sessionIds ?? []).map(canonicalId)])]
  workspaces[r.id] = { ...unit, sessionIds: merged, updatedAt: new Date().toISOString() }
}
// 没有新增、只有历史条目待规范化的工作区（result 只收「有变化」的，这里补齐）。
for (const [id, unit] of Object.entries(workspaces)) {
  const ids = unit.sessionIds ?? []
  if (ids.every(sessionId => String(sessionId).startsWith('session-'))) continue
  workspaces[id] = { ...unit, sessionIds: [...new Set(ids.map(canonicalId))], updatedAt: new Date().toISOString() }
}
for (const r of fresh) {
  const createdAt = new Date(r.newestAt).toISOString()
  workspaces[r.id] = { path: r.path, title: basename(r.path), sessionIds: r.additions, createdAt, updatedAt: createdAt }
}
if (fresh.length > 0) {
  doc.global.workspaceIds = [
    ...(doc.global.workspaceIds ?? []),
    ...fresh.sort((a, b) => b.newestAt - a.newestAt).map(r => r.id),
  ]
}

// 写回前自检：DSH 启动时 validateStoredState 要求 registry order 恰好覆盖所有条目
// （index.ts:521-526 的 `state.initialized && order.size !== table.size` 会直接抛错），
// 写坏了 SSiD 起不来——宁可在这里停下。
const order = doc.global.workspaceIds ?? []
const tableIds = Object.keys(workspaces)
const absent = tableIds.filter(id => !order.includes(id))
const repeated = order.filter((id, index) => order.indexOf(id) !== index)
if (absent.length > 0 || repeated.length > 0) {
  throw new Error(`拒绝写回：registry order 与条目不一致（缺 ${absent.length} 个：${absent.join(',')}；重复 ${repeated.length} 个）`)
}

writeFileSync(registryFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
console.log(`\n已写回 ${registryFile}`)
console.log(`备份：${backup}`)
