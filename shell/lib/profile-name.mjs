/**
 * profile 名解析 —— SSiD 的 profile 目录名与会话根名都从这一个来源派生。
 *
 * 默认 `ssid`：出厂形态下所有派生路径与历史版本逐字一致（`profiles/ssid`、
 * `sessions-ssid`）。`SSID_PROFILE_NAME` 可覆盖，用于并行开第二个实例：profile
 * 目录、会话存储根、以及 profile 内的一切相对路径随之分开，两个实例因此互不
 * 覆盖对方的会话与插件配置。
 *
 * 校验规则与 `resolveProfileDir`（kernel.ts 的同名语义实现）一致：拒绝路径
 * 分隔符与保留名，避免这个变量把路径带出 `profiles/`。
 */

/** 出厂 profile 名。 */
export const DEFAULT_PROFILE_NAME = 'ssid'

/**
 * 解析本次进程使用的 profile 名。
 * @param {Record<string, string | undefined>} [env] - 环境变量源，默认 process.env。
 * @returns {string} profile 名（去空白后的原值，或出厂默认值）。
 * @throws {Error} 名字含路径分隔符或属保留名时。
 */
export function resolveProfileName(env = process.env) {
  const raw = env.SSID_PROFILE_NAME
  if (raw === undefined || raw.trim() === '') return DEFAULT_PROFILE_NAME
  const name = raw.trim()
  if (name === '.' || name === '..' || name === 'node_modules' || /[/\\]/.test(name)) {
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
 * `corrupt session log: seq gap`（会话根隔离引入前的实测结论），所以并行实例
 * 的会话根必须各落一份。默认 profile 下即历史上的 `sessions-ssid`。
 * @param {string} profileName - profile 名。
 * @returns {string} 会话存储根目录名。
 */
export function sessionsRootDirName(profileName) {
  return `sessions-${profileName}`
}
