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
