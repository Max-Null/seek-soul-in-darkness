#!/usr/bin/env node
/**
 * backup-storages —— 给 `~/.dsh` 下会被多实例竞争写入的状态文件打轮转快照。
 *
 * 背景：DSH web 与 SSiD 同时运行时共用 `~/.dsh/storages`。官方两个存储后端
 * （`storage-json` 与 `storage-sqlite`）都声明**跨进程协调 out of scope**，写入是
 * 「读—改—写全量覆盖」——后写者静默覆盖先写者。完整分析见
 * `docs/排查/2026-09-17-多实例共用storages.md`。
 *
 * 本脚本不修根因，只保证「丢了还能捞回来」。只读源文件、只写备份目录。
 *
 * **覆盖范围（2026-09-19 补齐）**：`~/.dsh` 那半边只覆盖 global 记忆（`memory.json`，
 * 实测 55 KB / 18 条）；记忆的**主体**其实在**工作区**里——dsh-memory 的 project 命名空间
 * 落在 `<工作区>/.dsh/storages/memory_project_<hash>.json`（实测 212 KB / 108 条），
 * 此前完全不在扫描范围内。工作区路径取自 `~/.dsh/storages/workspace.json` 的
 * `tables.workspaces[*].path`，备份到 `_workspaces/<盘符>/<路径…>/`。
 *
 * 用法：
 *   node scripts/backup-storages.mjs                 # 备份一份、保留最近 10 份
 *   node scripts/backup-storages.mjs --keep 20       # 改保留份数
 *   node scripts/backup-storages.mjs --dry-run       # 只报告要备份什么
 *
 * 退出码：0 成功（含无变化）/ 1 有文件读取失败（其余照常备份）。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DSH = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
const STORAGES = path.join(DSH, 'storages')
const BACKUP_ROOT = path.join(DSH, 'storages-backup')
/** 可重建的大目录，不进快照。 */
const EXCLUDE_DIRS = new Set(['session_projcache'])
/** 可重建或已废弃的大文件：旧格式投影缓存（9 MB，已被 session_projcache/ 目录取代）。 */
const EXCLUDE_FILES = new Set(['session_projcache.json'])

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback
}
const KEEP = Number(argOf('keep', '10'))
const DRY_RUN = process.argv.includes('--dry-run')

/** 值得快照的状态文件：排除可重建的大文件与历史遗留副本（`.bak-` / `.polluted-` / `.pre-`）。 */
const isStateJson = name =>
  name.endsWith('.json')
  && !EXCLUDE_FILES.has(name)
  && !name.includes('.bak-')
  && !name.includes('.polluted-')
  && !name.includes('.pre-')

/** 备份目录内的相对路径：去掉盘符冒号后按层级摊开，保持可读。 */
const workspaceKey = dir =>
  path.join('_workspaces', ...dir.replace(/^([A-Za-z]):/, '$1').split(/[\\/]/).filter(Boolean))

/**
 * 工作区路径清单——来自 `~/.dsh/storages/workspace.json` 的 `tables.workspaces[*].path`。
 * 读不出来就返回空数组：工作区那半边缺席，不该让 `~/.dsh` 这半边跟着一起失败。
 */
function workspacePaths() {
  const file = path.join(STORAGES, 'workspace.json')
  if (!fs.existsSync(file)) return []
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
    const workspaces = doc?.tables?.workspaces ?? {}
    const out = []
    for (const record of Object.values(workspaces)) {
      if (typeof record?.path === 'string' && record.path !== '') out.push(record.path)
    }
    return out
  } catch {
    return []
  }
}

/** 收集要备份的文件：storages 下的 json 与小目录、~/.dsh 根的自建存储、各工作区的记忆。 */
function collect() {
  const files = []
  if (fs.existsSync(STORAGES)) {
    for (const entry of fs.readdirSync(STORAGES, { withFileTypes: true })) {
      if (entry.isFile() && isStateJson(entry.name)) {
        files.push({ from: path.join(STORAGES, entry.name), to: entry.name })
      }
      if (entry.isDirectory() && !EXCLUDE_DIRS.has(entry.name)) {
        const dir = path.join(STORAGES, entry.name)
        for (const inner of fs.readdirSync(dir, { withFileTypes: true })) {
          if (inner.isFile() && !inner.name.startsWith('.')) files.push({ from: path.join(dir, inner.name), to: path.join(entry.name, inner.name) })
        }
      }
    }
  }
  for (const entry of fs.readdirSync(DSH, { withFileTypes: true })) {
    if (entry.isFile() && isStateJson(entry.name) && !entry.name.startsWith('.')) {
      files.push({ from: path.join(DSH, entry.name), to: path.join('_home', entry.name) })
    }
  }
  // 工作区记忆（dsh-memory 的 project 命名空间）——记忆的主体在这里，不在 ~/.dsh
  for (const workspace of workspacePaths()) {
    const storages = path.join(workspace, '.dsh', 'storages')
    if (!fs.existsSync(storages)) continue
    for (const entry of fs.readdirSync(storages, { withFileTypes: true })) {
      if (entry.isFile() && isStateJson(entry.name)) {
        files.push({ from: path.join(storages, entry.name), to: path.join(workspaceKey(workspace), entry.name) })
      }
    }
  }
  return files
}

const files = collect()
if (DRY_RUN) {
  console.log(`将备份 ${files.length} 个文件 → ${BACKUP_ROOT}`)
  for (const f of files) console.log(`  ${f.to}`)
  process.exit(0)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const target = path.join(BACKUP_ROOT, stamp)
fs.mkdirSync(target, { recursive: true })

let failed = 0
let bytes = 0
for (const f of files) {
  try {
    const data = fs.readFileSync(f.from)          // 原子读整份，避免半写状态
    const dest = path.join(target, f.to)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, data)
    bytes += data.length
  } catch (error) {
    failed++
    console.error(`  ✗ ${f.to}: ${error.message}`)
  }
}

// 轮转：只删本脚本建立的快照目录，保留最近 KEEP 份
const snapshots = fs.readdirSync(BACKUP_ROOT, { withFileTypes: true })
  .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(e.name))
  .map(e => e.name)
  .sort()
const dropped = snapshots.slice(0, Math.max(0, snapshots.length - KEEP))
for (const name of dropped) fs.rmSync(path.join(BACKUP_ROOT, name), { recursive: true, force: true })

console.log(`✓ 备份 ${files.length - failed}/${files.length} 个文件 → ${target}`)
console.log(`  ${(bytes / 1024).toFixed(1)} KB · 保留最近 ${KEEP} 份${dropped.length > 0 ? ` · 清理 ${dropped.length} 份旧快照` : ''}`)
process.exit(failed > 0 ? 1 : 0)
