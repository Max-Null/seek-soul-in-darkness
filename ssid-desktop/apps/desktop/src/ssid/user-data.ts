/**
 * 思灵自有的 Electron userData 目录。
 *
 * 官方桌面版与思灵的 `app.name` 同为包名 `@deepseek-ai/dsh-desktop`，Electron 因此把
 * 两者的默认 userData 都指向 `%APPDATA%\@deepseek-ai\dsh-desktop`，而单实例锁就在该目录下
 * —— 先启动的一方占住锁，另一方在 `single-instance.ts` 里静默 `app.quit()`，界面上表现为
 * 「双击没反应」。把 userData 挪到思灵自有目录，两者即可并存。
 *
 * 官方版一侧不可隔离：0.2.0-rc.2 拒绝 `--user-data-dir`（`bad option`），且它自己不调
 * `setPath`。所以让位只能由思灵做。见 `docs/决策/2026-10-01-思灵userData与官方桌面版并存冲突.md`。
 *
 * 只在 userData 仍是官方默认值时改写：显式传 `--user-data-dir` 的隔离实例（dev 与并行
 * 测试，见铁律 2.2 的三件套）保持原位，否则隔离会失效。
 *
 * **本模块不解决 dev 与装版之间的互斥** —— 两者都走默认值、都会挪到同一个自有目录，
 * 因此仍共用锁；那需要另加 `app.isPackaged` 分流。
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** 官方桌面版的默认 userData 末两段路径。 */
const OFFICIAL_USER_DATA_SEGMENTS = ['@deepseek-ai', 'dsh-desktop'] as const

/** 思灵自有 userData 的目录名，与安装目录同名。 */
const SSID_USER_DATA_DIR = 'ssid-shell'

/**
 * 从官方默认 userData 迁移的条目。
 *
 * 只搬界面状态与平台会话所需的那些；`Cache` / `Code Cache` / `GPUCache` / `Dawn*Cache`
 * 是纯缓存，重建成本为零，不搬。DSH 自己的配置、profile、会话根在 DSH_HOME，与此无关。
 */
const MIGRATED_ENTRIES = ['Local Storage', 'Preferences', 'Local State', 'Network'] as const

/**
 * 本模块用到的 Electron 应用面。
 *
 * 照 `single-instance.ts` 的做法只声明用到的方法，模块因此可以脱离 Electron 单独验证。
 */
export interface SsidUserDataApplication {
  getPath(name: 'userData' | 'appData'): string
  setPath(name: 'userData', path: string): void
}

/**
 * 判断一个 userData 路径是否为官方桌面版的默认值。
 * @param path - 待判断的 userData 绝对路径。
 * @returns 末两段为 `@deepseek-ai\dsh-desktop` 时为 true。
 */
export function isOfficialDefaultUserData(path: string): boolean {
  return basename(dirname(path)) === OFFICIAL_USER_DATA_SEGMENTS[0]
    && basename(path) === OFFICIAL_USER_DATA_SEGMENTS[1]
}

/**
 * 把老 userData 里仍然需要保留的条目复制到新目录。
 * @param legacy - 官方默认 userData 目录。
 * @param target - 思灵自有 userData 目录。
 * @returns 实际复制成功的条目名；失败项只告警，不阻塞启动。
 */
export function migrateLegacyUserData(legacy: string, target: string): readonly string[] {
  const copied: string[] = []
  for (const entry of MIGRATED_ENTRIES) {
    const from = join(legacy, entry)
    const to = join(target, entry)
    // 目标已存在的条目一律不动，避免覆盖新目录里已经写出的状态。
    if (!existsSync(from) || existsSync(to)) continue
    try {
      mkdirSync(target, { recursive: true })
      cpSync(from, to, { recursive: true })
      copied.push(entry)
    } catch (error: unknown) {
      console.warn(`[ssid] userData 迁移失败，已跳过 ${entry}:`, error)
    }
  }
  return copied
}

/**
 * 确认一个目录可建可写。
 *
 * 改到写不进去的目录会让 Chromium 连锁文件都建不出来（`process_singleton_win.cc`
 * `Lock file can not be created`），应用直接起不来 —— 那比与官方版冲突更糟。所以先探一次。
 * @param path - 待确认的目录。
 * @returns 目录已存在且可写时为 true。
 */
function isUsableDirectory(path: string): boolean {
  const probe = join(path, '.ssid-write-probe')
  try {
    mkdirSync(path, { recursive: true })
    writeFileSync(probe, '')
    rmSync(probe, { force: true })
    return true
  } catch (error: unknown) {
    console.warn('[ssid] 自有 userData 目录不可用:', error)
    return false
  }
}

/**
 * 让出官方桌面版的默认 userData，改用思灵自有目录。
 *
 * 必须在 `app.setAppLogsPath()` 与任何 userData 读取之前调用 —— 日志落点按 userData 解析。
 * @param application - Electron 应用面；隔离实例（已显式指定 userData）原样保留。
 * @returns 生效的 userData 目录；自有目录不可用时保持官方默认目录，不让应用起不来。
 */
export function applySsidUserData(application: SsidUserDataApplication): string {
  const current = application.getPath('userData')
  if (!isOfficialDefaultUserData(current)) return current
  const target = join(application.getPath('appData'), SSID_USER_DATA_DIR)
  if (!isUsableDirectory(target)) return current
  const copied = migrateLegacyUserData(current, target)
  application.setPath('userData', target)
  console.info('[ssid] userData 已改用自有目录:', { target, migrated: copied })
  return target
}
