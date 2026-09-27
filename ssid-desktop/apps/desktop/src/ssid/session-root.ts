/**
 * SSiD 会话根隔离：三层契约的壳侧实现。
 *
 * 会话根隔离要求三件事同时成立，缺任何一层都会让隔离根里的历史会话整个消失
 * （「升级后历史会话没了」）：
 *
 * 1. **注入 env** —— `SSID_SESSION_ISOLATED_ROOT` / `SSID_SESSION_SHARED_ROOT`。
 *    `dsh-ssid-panels` 与 `dsh-ssid-env` 读它们。
 * 2. **覆盖内核的 root** —— `session-persistence-jsonl` 的 `config.root`。这是真正决定
 *    内核读写哪个目录的一层；官方基座供给的是 `dshHomePath('sessions')`，覆盖点见
 *    `packages/bundle/base/cordis.patch.yml`（"later patch layer (profile
 *    `cordis.patch.yml` or a `--patch` overlay)"）。
 * 3. **回写 `applied`** —— `~/.ssid/session-root.json` 记录本次 boot 实际生效的开关值，
 *    面板据此显示「当前生效」。
 *
 * 自建壳在 `kernel.ts` 里自己做完了三层（那时壳直接调 `dsh.boot()` 并持有 `patches`）。
 * fork 版的内核由官方 `@deepseek-ai/dsh-desktop-host` 子进程启动，壳拿不到 `patches`，
 * 因此第 2 层改为写进 profile 的 `cordis.patch.yml` —— 那是官方点名的覆盖点，且
 * 内核每次 boot 都会读。
 *
 * 幂等与用户优先：条目已存在一律不动（用户改过的那份优先），写入前备份。
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { installSessionRootEnv } from './profile-name.ts'

/** 承载会话根覆盖的 loader 条目 id（官方基座里供给 `root` 的那一行）。 */
export const SESSION_ROOT_ENTRY_ID = 'session-persistence-jsonl'

/** 写入 `cordis.patch.yml` 的覆盖条目。
 *
 * `SSID_SESSION_ISOLATED_ROOT` 缺席即回退到共享根（与官方基座的 `dshHomePath('sessions')`
 * 同义）。壳据此实现「关掉隔离」：不注入该变量即可，无需改写 profile。
 *
 * `USERPROFILE` 在入参缺省时用于拼共享根；`DSH_HOME` 优先（非默认 home 的部署）。
 */
const SESSION_ROOT_ENTRY = String.raw`- id: ${SESSION_ROOT_ENTRY_ID}
  config:
    root: !!js 'process.env.SSID_SESSION_ISOLATED_ROOT || ((process.env.DSH_HOME || (process.env.USERPROFILE + "\\.dsh")) + "\\sessions")'
`

/** 会话隔离开关状态文件路径。 */
export function sessionRootConfigPath(): string {
  return join(homedir(), '.ssid', 'session-root.json')
}

/** 会话隔离开关状态。 */
export interface SessionRootState {
  /** 设置页开关：是否启用隔离根。 */
  readonly isolated: boolean
  /** 本次 boot 实际生效值，由壳回写。 */
  readonly applied?: boolean
}

/**
 * 读隔离开关。文件缺席或损坏按出厂默认（隔离开启）处理 —— 与自建壳一致
 * （`kernel.bundle.mjs` 的 `let isolatedSessionRoot = true` 后 `catch {}`）。
 * @param path - 状态文件路径，默认 `~/.ssid/session-root.json`。
 * @returns 开关状态；`isolated` 非布尔或文件不可读时返回出厂默认。
 */
export function readSessionRootState(path: string = sessionRootConfigPath()): SessionRootState {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (parsed !== null && typeof parsed === 'object') {
      const isolated = (parsed as { isolated?: unknown }).isolated
      if (typeof isolated === 'boolean') return { isolated }
    }
  } catch {
    // 文件不存在或不是合法 JSON：按出厂默认（隔离开启）处理
  }
  return { isolated: true }
}

/**
 * 回写本次 boot 实际生效值。保留文件里其他字段（设置页可能写了别的键）。
 * 失败不抛出：这只是面板显示用的记录，不该挡住启动。
 * @param applied - 本次 boot 是否真的落在隔离根。
 * @param path - 状态文件路径，默认 `~/.ssid/session-root.json`。
 */
export function writeSessionRootApplied(applied: boolean, path: string = sessionRootConfigPath()): void {
  try {
    let prev: Record<string, unknown> = {}
    if (existsSync(path)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
        if (parsed !== null && typeof parsed === 'object') prev = parsed as Record<string, unknown>
      } catch {
        // 内容损坏：用空对象起步，下面整份重写
      }
    } else {
      mkdirSync(join(path, '..'), { recursive: true })
    }
    writeFileSync(path, `${JSON.stringify({ ...prev, applied }, undefined, 2)}\n`, 'utf8')
  } catch {
    // 面板显示值写不进去不影响会话根本身
  }
}

/**
 * 把会话根覆盖幂等写进 profile 的 `cordis.patch.yml`。
 *
 * 三种情形：条目已在 → 原样不动；文件是空骨架（`[]` 或空白）→ 整份替换成该条目；
 * 已有其他条目 → 追加到末尾。写入前备份为 `<文件名>.bak-<时间戳>`。
 * @param profileDir - profile 目录（`$DSH_HOME/profiles/<名>`）。
 * @returns `written` 本次是否改动了文件；`reason` 未改动的原因。
 */
export function installSessionRootPatch(profileDir: string): { written: boolean, reason: string } {
  const patchPath = join(profileDir, 'cordis.patch.yml')
  if (!existsSync(patchPath)) return { written: false, reason: 'no-profile-patch' }
  let current: string
  try {
    current = readFileSync(patchPath, 'utf8')
  } catch {
    return { written: false, reason: 'unreadable' }
  }
  if (current.includes(SESSION_ROOT_ENTRY_ID)) return { written: false, reason: 'already-present' }

  const body = current.trim() === '' || current.trim() === '[]' ? SESSION_ROOT_ENTRY : `${current.trimEnd()}\n\n${SESSION_ROOT_ENTRY}`
  try {
    copyFileSync(patchPath, `${patchPath}.bak-${String(Date.now())}`)
    writeFileSync(patchPath, body, 'utf8')
  } catch {
    return { written: false, reason: 'write-failed' }
  }
  return { written: true, reason: 'written' }
}

/**
 * 三层契约的统一入口，必须在 `host.start()` 之前调用。
 *
 * 注：env 必须在 Host 子进程 spawn 之前进 `process.env`（子进程继承当时的快照）；
 * patch 写入只需在 boot 前完成 —— 两者都在这里做，保证顺序不依赖调用方。
 * @param dshHome - Harness home。
 * @param profileDir - profile 目录。
 * @param profileName - profile 名。
 * @returns 本次生效值与各层结果，供启动日志记录。
 */
export function applySessionRootIsolation(dshHome: string, profileDir: string, profileName: string): {
  readonly isolated: boolean
  readonly isolatedRoot: string
  readonly sharedRoot: string
  readonly patch: { written: boolean, reason: string }
} {
  const state = readSessionRootState()
  // 关掉隔离时不注入 ISOLATED_ROOT，profile patch 里的 `!!js` 于是回退到共享根。
  const roots = state.isolated
    ? installSessionRootEnv(dshHome, profileName)
    : sharedRootsOnly(dshHome)
  const patch = state.isolated ? installSessionRootPatch(profileDir) : { written: false, reason: 'isolation-disabled' }
  writeSessionRootApplied(state.isolated)
  return { isolated: state.isolated, isolatedRoot: roots.isolated, sharedRoot: roots.shared, patch }
}

/**
 * 关闭隔离时只注入共享根。`SSID_SESSION_ISOLATED_ROOT` 必须显式缺席而不是留旧值 ——
 * profile 的 `!!js` 表达式以它的存在与否决定覆盖。
 * @param dshHome - Harness home。
 * @returns 共享根路径（`isolated` 与它同值，表示本次没有隔离根）。
 */
function sharedRootsOnly(dshHome: string): { isolated: string, shared: string } {
  const shared = join(dshHome, 'sessions')
  delete process.env['SSID_SESSION_ISOLATED_ROOT']
  process.env['SSID_SESSION_SHARED_ROOT'] = shared
  return { isolated: shared, shared }
}
