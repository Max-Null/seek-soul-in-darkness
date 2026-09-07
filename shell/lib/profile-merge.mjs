/**
 * SSiD 升级部署「用户层保留」工具（v0.2.1 引入，2026-09-07）。
 *
 * 背景（根因见 docs/决策/2026-09-07-升级部署覆盖用户层修复.md）：
 * deployRuntime 用归档模板对 profile 根配置层整体覆盖（package.json /
 * cordis.patch.yml / pnpm-lock.yaml / node_modules），用户自装插件的声明与
 * 自装 MCP 的注册条目（cordis.patch.yml insert/disable）零保留 —— 升级后
 * 插件与 MCP 全部消失；再叠加陈旧 pending 清单还会把插件回滚到与新版
 * 内核不兼容的旧版本 → 白屏「无法启动」。
 *
 * 本文件提供：① 部署前快照用户配置文件；② 计算用户插件增量（升级报告）；
 * ③ cordis.patch.yml 条目级合并（纯文本，不解析 !!js，失败保模板）；
 * ④ 轻量 semver 比较（pending 回滚护栏用）。
 *
 * 纯 ESM、零依赖：main.mjs（electron 主进程，不加载 tsx）与 kernel.ts
 * （tsx/esbuild bundle）共用。所有写文件均为 UTF-8 无 BOM（手册铁律）。
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** 部署覆盖面内的用户配置文件（快照清单；settings.yaml 虽不在归档顶部，
 *  快照无害且便于人工对比）。 */
export const SNAPSHOT_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'cordis.patch.yml',
  'settings.yaml',
  '.npmrc',
]

/** 把 profile 根的用户配置文件复制到备份目录。返回实际复制的文件名列表。 */
export function snapshotProfileConfigs(profileDir, backupDir) {
  const copied = []
  mkdirSync(backupDir, { recursive: true })
  for (const file of SNAPSHOT_FILES) {
    const src = join(profileDir, file)
    if (!existsSync(src)) continue
    try {
      copyFileSync(src, join(backupDir, file))
      copied.push(file)
    } catch {
      // 单文件快照失败不影响部署（用户层清单里少一项，报告会体现）
    }
  }
  return copied
}

/** 从解析后的 manifest 提取用户理解的依赖/捆绑清单（容错缺失 dsh 段）。 */
function depsOf(manifest) {
  return (manifest != null && typeof manifest === 'object' && manifest.dependencies && typeof manifest.dependencies === 'object')
    ? manifest.dependencies
    : {}
}

function bundlesOf(manifest) {
  const list = manifest?.dsh?.profile?.bundles
  return Array.isArray(list) ? list : []
}

/**
 * 计算升级部署导致的「用户插件丢失」增量。
 * oldManifest = 升级前的 profile package.json（含用户自装插件）；
 * newManifest = 归档模板 manifest（部署后的基线）。
 * 返回 { depsLost, bundlesLost }：depsLost = [{ name, version }]，
 * bundlesLost = [name]，均为「旧有而新无」的用户增量。
 * 反向（新有旧无 = 出厂新增）不报告。
 */
export function computeUserPluginDelta(oldManifest, newManifest) {
  const oldDeps = depsOf(oldManifest)
  const newDeps = depsOf(newManifest)
  const oldBundles = bundlesOf(oldManifest)
  const newBundles = bundlesOf(newManifest)
  const depsLost = Object.keys(oldDeps)
    .filter((name) => !(name in newDeps))
    .map((name) => ({ name, version: String(oldDeps[name] ?? '') }))
  const bundlesLost = oldBundles.filter((name) => !newBundles.includes(name))
  return { depsLost, bundlesLost }
}

/**
 * 把 cordis.patch.yml 顶层拆成条目数组。
 * 顶层 YAML 数组元素 = 行首无空白的 `- `（或孤立 `-`）起始的块，直到下一个
 * 这类行（注释/空行并入前导/条目缓冲，不影响条目边界）。返回
 * [{ text, start, end, id }]：text 为该条目的原文（含尾随换行），id 为
 * 提取到的标识（insert 子 id / disable 值 / 顶层 id；无法判定为 null）。
 */
export function splitPatchEntries(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const entries = []
  let current = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isTopItem = /^-\s/.test(line) && !/^\s+/.test(line)
    if (isTopItem) {
      if (current !== null) entries.push(current)
      current = { lines: [line], start: i, end: i }
    } else if (current !== null) {
      current.lines.push(line)
      current.end = i
    }
  }
  if (current !== null) entries.push(current)
  return entries.map((entry) => ({
    text: entry.lines.join('\n') + '\n',
    start: entry.start,
    end: entry.end,
    id: patchEntryId(entry.lines),
  }))
}

/**
 * 从条目的行数组推断标识 id。识别（宽松，提取不到返回 null → 调用方按
 * 「无 id 条目」处理）：
 * - 顶层 `- id: xxx`（条目的第一行）
 * - `- disable:` / `- remove:` / `- unset:` 后跟 id（第一行）
 * - `- insert:` 后其子行首个 `- id: xxx`（缩进 2+）
 * - 其余形态取条目文本内首个子行 `id:`（assign/dispatch/set 等），
 *   再取不到 = null。
 */
export function patchEntryId(lines) {
  const first = lines[0] ?? ''
  let m = /^-\s+id:\s*([^\s#]+)/.exec(first)
  if (m !== null) return m[1]
  m = /^-\s+(disable|remove|unset):\s*(?:id:\s*)?([^\s#]+)/.exec(first)
  if (m !== null) return m[2]
  if (/^-\s+insert:/.test(first)) {
    // 子条目 id（`    - id: xxx`，缩进 2+ 空格 + '- id:'）
    for (let i = 1; i < lines.length; i++) {
      const child = /^\s+-\s+id:\s*([^\s#]+)/.exec(lines[i])
      if (child !== null) return child[1]
    }
    return null
  }
  for (let i = 1; i < lines.length; i++) {
    const child = /^\s+-?\s*id:\s*([^\s#]+)/.exec(lines[i])
    if (child !== null) return child[1]
  }
  return null
}

/**
 * 合并用户 patch 层：以 templateText 为基线（整体保留，含头注释），把
 * oldText（升级前用户 patch）中「模板里不存在同 id」的顶层条目追加到尾部。
 * - 无法解析（oldText 为空/非数组形态）→ 返回模板原文 + merged=0；
 * - 仅追加、绝不重排模板条目；条目原文按原样拼接（!!js 等原样保留）；
 * - 任何异常都退回模板原文，绝不写坏 profile 的 patch。
 * @returns {{ text: string, merged: number, ids: string[] }}
 */
export function mergeUserPatch(oldText, templateText) {
  const base = String(templateText ?? '')
  let oldEntries
  try {
    oldEntries = splitPatchEntries(String(oldText ?? ''))
  } catch {
    return { text: base, merged: 0, ids: [] }
  }
  if (oldEntries.length === 0) return { text: base, merged: 0, ids: [] }
  let tmplIds = new Set()
  try {
    tmplIds = new Set(splitPatchEntries(base).map((e) => e.id).filter(Boolean))
  } catch {
    return { text: base, merged: 0, ids: [] }
  }
  const additions = oldEntries.filter((e) => e.id === null || !tmplIds.has(e.id))
  if (additions.length === 0) return { text: base, merged: 0, ids: [] }
  const text = base.replace(/\s+$/, '') + '\n' + additions.map((e) => e.text).join('')
  return {
    text,
    merged: additions.length,
    ids: additions.map((e) => e.id).filter(Boolean),
  }
}

/** 轻量 semver 解析：主.次.补丁[-pre][+build]。无法解析 → null。 */
export function parseVersion(input) {
  const raw = String(input ?? '').trim().replace(/^[~^>=<\s]+/, '')
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(raw)
  if (m === null) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null }
}

function cmpPre(a, b) {
  // a/b 为 pre-release 字符串或 null（null = 无 pre，按 semver 大于任何 pre）
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  const ra = a.split('.')
  const rb = b.split('.')
  const len = Math.max(ra.length, rb.length)
  for (let i = 0; i < len; i++) {
    if (i >= ra.length) return -1
    if (i >= rb.length) return 1
    const x = ra[i]
    const y = rb[i]
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      if (+x !== +y) return +x < +y ? -1 : 1
      continue
    }
    if (xn !== yn) return xn ? -1 : 1 // 数字段 < 字母段
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** 版本比较：a < b → -1，a = b → 0，a > b → 1。任一无法解析 → null。 */
export function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (pa === null || pb === null) return null
  for (const key of ['major', 'minor', 'patch']) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1
  }
  // 主次补丁相同：无 pre > 有 pre；pre 段比较
  const preCmp = cmpPre(pa.pre, pb.pre)
  if (preCmp !== 0) return preCmp
  return 0
}

/**
 * pending 回滚护栏：给定 profile 当前声明的依赖 spec 与 pending 要装的
 * 版本，返回是否应丢弃 pending。
 * - declared 不存在（用户已卸载/声明被模板重置）→ 丢弃（防止「升级时把
 *   老插件装回新环境」，这是 0.2.0 事故的根源之一）；
 * - declared 为 file:/link:/workspace: 等非 registry 形态 → 丢弃（vendor
 *   包不参与 registry 更新，无 pending 需要）；
 * - declared 版本 ≥ pending 版本 → 丢弃（不降级；模板 pin 的新版不做
 *   回滚）；
 * - 版本无法解析（异常 spec）→ 丢弃（保守）。
 */
export function shouldDropPending(declared, pendingVersion) {
  if (typeof declared !== 'string' || declared === '') return true
  const kind = /^(file:|link:|workspace:|npm:)/.test(declared) ? 'dir' : 'registry'
  if (kind === 'dir') return true
  const cmp = compareVersions(cleanSpec(declared), pendingVersion)
  if (cmp === null) return true
  return cmp >= 0
}

/** 去掉声明 spec 的 semver 范围前缀（^/~/>=/<=/== 等），取版本本体。 */
export function cleanSpec(spec) {
  const raw = String(spec ?? '')
  const first = raw.split(/[\s|,]+/).filter(Boolean)[0] ?? raw
  return first.replace(/^[~^>=<]+/, '')
}

/**
 * 构建升级报告对象（升级部署后落盘 ~/.ssid/upgrade-report-<ver>.json）。
 * oldManifest = 快照的升级前 manifest；newManifest = 部署后的 manifest；
 * patchMerge = mergeUserPatch 的结果；snapshotDir = 快照目录。
 * 纯数据构建，写盘由调用方负责（main.mjs）。
 */
export function buildUpgradeReport({
  fromRuntime,
  toRuntime,
  snapshotDir,
  oldManifest,
  newManifest,
  patchMerge,
}) {
  const delta = computeUserPluginDelta(oldManifest, newManifest)
  return {
    schema: 1,
    at: new Date().toISOString(),
    fromRuntime: fromRuntime ?? null,
    toRuntime: toRuntime ?? null,
    snapshotDir: snapshotDir ?? null,
    // 声明层丢失的用户插件（实体随 node_modules 一并被替换，需要重装；
    // 本次修复不自动重装，避免旧版插件在新内核下「Failed to load」）
    userPluginsLost: delta.depsLost,
    userBundlesLost: delta.bundlesLost,
    // MCP 等 patch 条目合并结果（已自动保留）
    patchMerged: {
      count: patchMerge?.merged ?? 0,
      ids: patchMerge?.ids ?? [],
    },
    notes: [
      'userPluginsLost：升级前声明、部署后不存在的插件（不自动重装，请从插件中心安装与新内核兼容的版本）',
      'patchMerged：升级前 cordis.patch.yml 中不属于出厂模板的条目，已自动合并保留（含用户自装 MCP 注册）',
      `快照目录：${snapshotDir ?? '（无）'}（部署前的 package.json / cordis.patch.yml / pnpm-lock.yaml 等原文）`,
    ],
  }
}
