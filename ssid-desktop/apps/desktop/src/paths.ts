/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { resolveProfileName } from './ssid/profile-name.ts'

/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param dshHome - Harness home shared with npm-installed dsh.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(dshHome: string = resolveDshHome()): DesktopPaths {
  // SSiD：官方固定 `desktop`，这里改为可配、默认 `ssid`，好让换壳后直接沿用
  // 自建壳的 profile 目录与会话（见 `ssid/profile-name.ts`）。
  const name = resolveProfileName()
  return {
    profile: join(dshHome, 'profiles', name),
    lock: join(dshHome, 'profiles', name, 'lock'),
  }
}
