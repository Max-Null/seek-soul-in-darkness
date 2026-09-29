/**
 * 把「只存在于隔离根、且未被任何工作区登记」的置顶会话按 cwd 归回工作区。
 *
 * ## 为什么需要它
 *
 * 「独立会话存储」的隔离根与共享根之间存在历史副本（2026-08-22 引入隔离时整体复制过一次），
 * 而**工作区登记表是共享的**（`~/.dsh/storages/workspace.json` 的 `tables.workspaces[*].sessionIds`）。
 * 内核实际读共享根时，侧栏与置顶菜单里查不到只落在隔离根的那批会话，`dsh-quick-toolbar` 便把
 * 置顶项归入 `unresolved`（显示为「已失效」）。切根修好之后这些会话会重新出现，但它们**从未被
 * 登记进任何工作区**，于是落到「未分组」—— 本次要补的就是这一步。
 *
 * ## 归属判据
 *
 * 隔离根**按 cwd 分桶**：`<隔离根>/--H-MaxNull-WorkStation--/<session-id>/session.v4.jsonl.zstd`。
 * 桶名就是 cwd 的编码（去掉盘符冒号、反斜杠换连字符、两侧各加 `--`），所以归属不必解压会话内容 ——
 * 直接把每个工作区的 `path` 按同一规则编码，与桶名精确比对即可。这比解压首行可靠：会话文件是
 * 多帧 zstd，首帧未必是会话头。
 *
 * ## 用法
 *
 * 默认**只读探查**，不改任何文件；确认要写入时加 `--apply`。
 * 写入前把 `workspace.json` 备份成 `workspace.json.bak-register-<时间戳>`。
 * **必须先退出思灵**：内核在会话列表变化时会回写这份文件，运行中修改会被覆盖。
 *
 * ```powershell
 * node shell/scripts/register-isolated-sessions.mjs           # 探查
 * node shell/scripts/register-isolated-sessions.mjs --apply   # 写入
 * ```
 */

import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const apply = process.argv.includes('--apply')
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const workspacePath = join(home, 'storages', 'workspace.json')
/** 隔离根按 profile 名派生（默认 `ssid` → `sessions-ssid`）。 */
const isolatedRoot = process.env.SSID_SESSION_ISOLATED_ROOT
  ?? join(home, `sessions-${process.env.SSID_PROFILE_NAME ?? 'ssid'}`)

if (!existsSync(workspacePath)) throw new Error(`缺少 ${workspacePath}`)
if (!existsSync(isolatedRoot)) throw new Error(`缺少隔离根 ${isolatedRoot}`)
const workspaces = JSON.parse(readFileSync(workspacePath, 'utf8'))

/** 工作区路径到隔离根桶名的编码。 */
function bucketOf(path) {
  return `--${path.replaceAll(':', '').replaceAll('\\', '-')}--`
}

/** 在隔离根的各桶里找一条会话，返回它的桶名与目录。 */
function findSession(sessionId) {
  for (const entry of readdirSync(isolatedRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(isolatedRoot, entry.name, sessionId)
    if (existsSync(dir)) return { bucket: entry.name, dir }
  }
  return undefined
}

const bucketToWorkspace = new Map()
for (const [workspaceId, entry] of Object.entries(workspaces.tables.workspaces)) {
  if (typeof entry.path !== 'string' || entry.path === '') continue
  bucketToWorkspace.set(bucketOf(entry.path), { workspaceId, path: entry.path, title: entry.title })
}

const registered = new Set()
for (const entry of Object.values(workspaces.tables.workspaces)) for (const id of entry.sessionIds) registered.add(id)

const targets = workspaces.global.pinnedSessionIds.filter(id => !registered.has(id))
console.log(`置顶 ${String(workspaces.global.pinnedSessionIds.length)} 条，其中未登记 ${String(targets.length)} 条`)
console.log(`隔离根：${isolatedRoot}\n`)

const plan = []
const unmatched = new Map()
for (const id of targets) {
  const found = findSession(id)
  if (found === undefined) {
    console.log(`  ${id}\n      隔离根里找不到该会话，跳过`)
    continue
  }
  const owner = bucketToWorkspace.get(found.bucket)
  if (owner === undefined) {
    // 桶存在但工作区已从登记表移除：归不了，如实报出来而不是猜一个。
    unmatched.set(found.bucket, (unmatched.get(found.bucket) ?? 0) + 1)
    continue
  }
  plan.push({ id, bucket: found.bucket, ...owner })
}

for (const [bucket, count] of unmatched) console.log(`  ${String(count)} 条落在 ${bucket}，但没有对应的工作区登记`)

const byWorkspace = new Map()
for (const item of plan) byWorkspace.set(item.workspaceId, [...(byWorkspace.get(item.workspaceId) ?? []), item])
for (const [workspaceId, items] of byWorkspace) {
  const { title, path } = items[0]
  console.log(`  ${title}（${path}）  ← ${String(items.length)} 条`)
  for (const item of items) console.log(`      ${item.id}   [${item.bucket}]`)
}

console.log(`\n可归位 ${String(plan.length)} 条。`)
if (plan.length === 0) process.exit(0)
if (!apply) {
  console.log('这是探查模式，未改动任何文件。确认后加 --apply 写入。')
  process.exit(0)
}

const backup = `${workspacePath}.bak-register-${new Date().toISOString().replaceAll(':', '-')}`
copyFileSync(workspacePath, backup)
const now = new Date().toISOString()
for (const item of plan) {
  const entry = workspaces.tables.workspaces[item.workspaceId]
  entry.sessionIds = [...entry.sessionIds, item.id]
  entry.updatedAt = now
}
writeFileSync(workspacePath, `${JSON.stringify(workspaces, undefined, 2)}\n`, 'utf8')
console.log(`已登记 ${String(plan.length)} 条；备份在 ${backup}`)
