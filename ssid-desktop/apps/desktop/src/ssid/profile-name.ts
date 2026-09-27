/**
 * SSiD profile 名解析。
 *
 * 默认 `ssid`：换壳之后 profile 目录（`$DSH_HOME/profiles/ssid`）与会话根
 * （`$DSH_HOME/sessions-ssid`）与自建壳逐字一致，因此现有会话、设置与插件配置
 * 直接可用。`SSID_PROFILE_NAME` 可覆盖，用于并行开第二个实例：profile 目录、
 * 会话存储根随之分开，两个实例互不覆盖对方的会话。
 *
 * 校验与自建壳 `shell/lib/profile-name.mjs` 同源，两边必须同时改：拒绝路径分隔符
 * 与保留名，避免这个变量把路径带出 `profiles/`。
 */

import { join } from 'node:path'

/** 出厂 profile 名。 */
export const DEFAULT_PROFILE_NAME = 'ssid'

/**
 * 解析本次进程使用的 profile 名。
 * @param env - 环境变量源，默认 `process.env`。
 * @returns 去空白后的 profile 名，或出厂默认值。
 * @throws 名字含路径分隔符或属保留名时。
 */
export function resolveProfileName(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.SSID_PROFILE_NAME
  if (raw === undefined || raw.trim() === '') return DEFAULT_PROFILE_NAME
  const name = raw.trim()
  if (name === '.' || name === '..' || name === 'node_modules' || /[/\\]/u.test(name)) {
    throw new Error(
      `SSID_PROFILE_NAME 非法：${JSON.stringify(name)}`
      + '（不得含路径分隔符，且不得为 . / .. / node_modules）',
    )
  }
  return name
}

/**
 * 会话存储根目录名，跟随 profile 名。
 *
 * 为什么必须跟随：两个宿主并发写同一份会话 JSONL 会反复造成
 * `corrupt session log: seq gap`（会话根隔离引入前的实测结论），所以并行实例的
 * 会话根必须各落一份。默认 profile 下即历史上的 `sessions-ssid`。
 * @param profileName - profile 名。
 * @returns 会话存储根目录名。
 */
export function sessionsRootDirName(profileName: string): string {
  return `sessions-${profileName}`
}

/**
 * 把会话存储根写进 `process.env`，供 Host 子进程继承。
 *
 * `dsh-ssid-panels` 靠这对变量启用会话隔离：两者缺席时它退回官方基础层的
 * `dshHomePath('sessions')`，隔离根里的历史会话就整个消失（升级后「历史会话没了」
 * 的成因）。必须在 `host.start()` 之前调用 —— 子进程继承的是当时的 `process.env`。
 * @param dshHome - Harness home，两个根都在其下。
 * @param profileName - profile 名。
 * @returns 注入的两个绝对路径，供调用方记日志。
 */
export function installSessionRootEnv(dshHome: string, profileName: string): {
  readonly isolated: string
  readonly shared: string
} {
  // 共享根名与官方基础层的 `dshHomePath('sessions')` 一致（见
  // `packages/bundle/base/cordis.patch.yml` 的 session-persistence-jsonl config）。
  const shared = join(dshHome, 'sessions')
  const isolated = join(dshHome, sessionsRootDirName(profileName))
  process.env['SSID_SESSION_ISOLATED_ROOT'] = isolated
  process.env['SSID_SESSION_SHARED_ROOT'] = shared
  return { isolated, shared }
}
