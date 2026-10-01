/**
 * SSiD 存储根隔离：让思灵与官方 DSH 桌面版各写各的 `storages/`。
 *
 * 两个应用共用 `<DSH_HOME>` 时，内核 base 层的 `storage-json` 后端在两边都开同一批
 * unit（`workspace`、`schedule`…），而它对每个 unit 是**全量重写**整份文件
 * —— 后写的一方把对方那一份整个盖掉。实测后果：跑过一次官方桌面版之后，思灵的
 * 会话登记从 297 条（WorkStation 145）掉到 131 条（21），侧栏大批会话落进「未分组」。
 *
 * 与会话根隔离（`session-root.ts`）同款三层，对象换成那个后端自己的 root：
 *
 * 1. **注入 env** `SSID_STORAGE_ROOT` —— 第 2 层写的 `!!js` 表达式读它。
 * 2. **覆盖 root** —— profile 的 `cordis.patch.yml` 里 `- id: storage-json` 的
 *    `config.root`。基础层给的是 `!!js dshHomePath('storages')`，见
 *    `packages/bundle/base/cordis.patch.yml` 的 insert 块 —— `session-persistence-jsonl`
 *    就在同一个块里，本模块用的是与它逐字同款的覆盖方式。
 * 3. **首次搬家** —— 旧根里已有的 unit 复制到新根，只补不缺（目标已存在一律不动），
 *    旧根一个字节都不删。
 *
 * `memory.json` 与 `query-log.json` **不在这一层**：`dsh-memory` 自建
 * `JsonStorageBackend`，root 取自 `process.env.DSH_HOME`（`engine.ts` 的 `globalRoot()`），
 * 与内核这个后端无关 —— 于是搬家之后跨会话记忆仍留在原处、两个应用继续共用一份，
 * 正是用户 2026-09-17 明确要的语义（记忆的目的就是跨会话，分离等于自造枷锁）。
 *
 * @module ssid/storage-root
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { installPatchEntry, type PatchEntryResult } from './profile-patch.ts'
import { storagesRootDirName } from './profile-name.ts'

/** 承载存储根覆盖的 loader 条目 id（基础层供给 `root` 的那一行）。 */
export const STORAGE_ROOT_ENTRY_ID = 'storage-json'

/**
 * 写进 `cordis.patch.yml` 的覆盖条目。
 *
 * `SSID_STORAGE_ROOT` 缺席即回退到基础层的 `dshHomePath('storages')` —— 与官方版
 * 共用一份的原始行为，因此本条目单独存在不会改变「不隔离」的语义。
 */
const STORAGE_ROOT_ENTRY = String.raw`- id: ${STORAGE_ROOT_ENTRY_ID}
  config:
    root: !!js 'process.env.SSID_STORAGE_ROOT || dshHomePath("storages")'
`

/**
 * 判断旧根里的一个条目是否随本次搬家。
 *
 * 不收四类：`dsh-memory` 自建的 `memory.json` / `query-log.json`（跟着 `DSH_HOME`
 * 走，与内核这个后端无关）、各家的 `.bak-*` 备份（作为搬家前的快照留在旧根）、
 * 以及 storage-json 原子写留下的 `.tmp` 与点开头残片。
 * @param entry - 旧根下的一级条目名。
 * @returns 该条目是否应复制到新根。
 */
function isMigratedEntry(entry: string): boolean {
  if (entry.startsWith('.')) return false
  if (entry.startsWith('memory.json') || entry.startsWith('query-log.json')) return false
  if (entry.includes('.bak-')) return false
  return !entry.endsWith('.tmp')
}

/**
 * 把旧存储根里已有的条目补进新根。
 *
 * 只补不缺：目标同名条目已存在一律不动，因此重复调用幂等，也不会覆盖新根里内核
 * 已经写出的内容。单个条目失败只告警，不打断其余条目，更不打断启动。
 * @param legacy - 旧存储根（`<DSH_HOME>/storages`）。
 * @param target - 新存储根（`<DSH_HOME>/storages-<profile>`）。
 * @returns 实际复制成功的条目名。
 */
export function migrateLegacyStorages(legacy: string, target: string): readonly string[] {
  if (!existsSync(legacy)) return []
  let entries: string[]
  try {
    entries = readdirSync(legacy)
  } catch (error: unknown) {
    console.warn('[ssid] 旧存储根不可读，跳过搬家:', error)
    return []
  }
  const copied: string[] = []
  for (const entry of entries) {
    if (!isMigratedEntry(entry)) continue
    const to = join(target, entry)
    if (existsSync(to)) continue
    try {
      mkdirSync(target, { recursive: true })
      cpSync(join(legacy, entry), to, { recursive: true })
      copied.push(entry)
    } catch (error: unknown) {
      console.warn(`[ssid] 存储搬家失败，已跳过 ${entry}:`, error)
    }
  }
  return copied
}

/** {@link applyStorageRootIsolation} 的结果，供启动日志记录。 */
export interface StorageRootIsolation {
  /** 本次生效的存储根。 */
  readonly root: string
  /** 官方桌面版仍在用的共享根。 */
  readonly sharedRoot: string
  /** profile patch 的写入结果。 */
  readonly patch: PatchEntryResult
  /** 本次从旧根补进新根的条目名。 */
  readonly migrated: readonly string[]
}

/**
 * 三层契约的统一入口，必须在 Host 子进程 spawn 之前调用。
 *
 * env 必须早于 spawn（子进程继承当时的 `process.env` 快照），patch 写入只需在内核
 * boot 前完成 —— 两者都在这里做，顺序不依赖调用方。搬家排在 patch 之前：两种
 * 半成品里，「搬了家但还没改 root」保持旧行为，比「改了 root 但新根是空的」安全。
 * @param dshHome - Harness home，旧根与新根都在其下。
 * @param profileDir - profile 目录（`$DSH_HOME/profiles/<名>`）。
 * @param profileName - profile 名，新根目录名随它（`storages-<名>`）。
 * @returns 本次生效值与各层结果。
 */
export function applyStorageRootIsolation(
  dshHome: string, profileDir: string, profileName: string,
): StorageRootIsolation {
  const sharedRoot = join(dshHome, 'storages')
  const root = join(dshHome, storagesRootDirName(profileName))
  process.env['SSID_STORAGE_ROOT'] = root
  const migrated = migrateLegacyStorages(sharedRoot, root)
  const patch = installPatchEntry(profileDir, STORAGE_ROOT_ENTRY_ID, STORAGE_ROOT_ENTRY)
  return { root, sharedRoot, patch, migrated }
}
