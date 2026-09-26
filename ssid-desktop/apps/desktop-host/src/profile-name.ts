/**
 * SSiD profile 名解析（Host 侧副本）。
 *
 * 与 `apps/desktop/src/ssid/profile-name.ts` 必须逐字同步——两个包之间没有依赖边，
 * 拿不到同一份实现，而 Shell 与 Host 对 profile 名的理解一旦不一致，就会出现
 * 「Shell 在 `profiles/ssid` 建锁、Host 却去读 `profiles/desktop`」这类难查的偏差。
 */

/** 出厂 profile 名。 */
export const DEFAULT_PROFILE_NAME = 'ssid'

/**
 * 解析本次进程使用的 profile 名。
 * @param env - 环境变量源，默认 `process.env`（Host 由 Shell 拉起，继承同一份）。
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
 * `corrupt session log: seq gap`（会话根隔离引入前的实测结论）。
 * @param profileName - profile 名。
 * @returns 会话存储根目录名。
 */
export function sessionsRootDirName(profileName: string): string {
  return `sessions-${profileName}`
}
