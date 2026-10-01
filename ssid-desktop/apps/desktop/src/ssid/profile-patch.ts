/**
 * profile 的 `cordis.patch.yml` 单条目幂等写入。
 *
 * 思灵的根覆盖都走同一条路 —— 往 profile 的 patch 文件追加一条顶层 `- id:` 条目，
 * 让内核在 bundle 层之后覆盖某个 loader 条目的 `config`：会话根覆盖
 * `session-persistence-jsonl`，存储根覆盖 `storage-json`。两者只有条目文本不同，
 * 幂等与备份规则完全一致，因此共用这里。
 *
 * 幂等与用户优先：条目已存在一律不动（用户可能改过那一行）；写入前备份。
 *
 * @module ssid/profile-patch
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PATCH_FILENAME } from './profile-seed.ts'

/** 单条目写入的结果。 */
export interface PatchEntryResult {
  /** 本次是否改动了文件。 */
  readonly written: boolean
  /** 未改动或失败的原因；成功写入时为 `written`。 */
  readonly reason: string
}

/**
 * 把一条顶层 patch 条目幂等写进 profile 的 `cordis.patch.yml`。
 *
 * 三种情形：条目已在（按 id 子串判定）原样不动；文件是空骨架（`[]` 或空白）整份
 * 替换成该条目；已有其他条目则追加到末尾。写入前备份为 `<文件名>.bak-<时间戳>`。
 * @param profileDir - profile 目录（`$DSH_HOME/profiles/<名>`）。
 * @param entryId - 条目 id，存在性判定用。
 * @param entryText - 完整条目文本，含结尾换行。
 * @returns 写入结果；读取或写入失败只记录原因、不抛出 —— 覆盖写不进去不该挡住启动。
 */
export function installPatchEntry(profileDir: string, entryId: string, entryText: string): PatchEntryResult {
  const patchPath = join(profileDir, PATCH_FILENAME)
  if (!existsSync(patchPath)) return { written: false, reason: 'no-profile-patch' }
  let current: string
  try {
    current = readFileSync(patchPath, 'utf8')
  } catch {
    return { written: false, reason: 'unreadable' }
  }
  if (current.includes(entryId)) return { written: false, reason: 'already-present' }
  const body = current.trim() === '' || current.trim() === '[]'
    ? entryText
    : `${current.trimEnd()}\n\n${entryText}`
  try {
    copyFileSync(patchPath, `${patchPath}.bak-${String(Date.now())}`)
    writeFileSync(patchPath, body, 'utf8')
  } catch {
    return { written: false, reason: 'write-failed' }
  }
  return { written: true, reason: 'written' }
}
