/**
 * `@max-null/dsh-ssid-env` — 运行环境自述。
 *
 * 一条固定的 system-prompt 段落，告诉模型当前跑在 SSiD（思灵）桌面壳里，
 * 而不是裸的 DSH web 版或官方 DSH 桌面版，并给出可验证的判据、隔离落点与
 * 「多个 DSH 实例可能同时在跑」的提醒。
 *
 * 为什么需要它：SSiD、官方桌面版与 DSH web 的界面都是同一个 DSH Web GUI，
 * 但 profile、插件集合、会话根、存储根与配置层都不同——没有自述时，调查环境
 * 相关问题容易把几侧混为一谈（2026-09-17 实测踩过：查宿主、查 Playwright MCP
 * 配置、查会话根都先问了一遍「我到底在哪」）。
 *
 * 动态而非硬编码：只有探测到桌面壳的运行期标识才注入。若本包被装进非 SSiD
 * 环境，它保持沉默——自述不能说谎，否则比没有更糟。
 *
 * 判据沿革（0.1.2）：0.1.0 / 0.1.1 读 `SSID_PROFILE_DIR`，那是自建壳（≤0.4.0）
 * 在 kernel-child 里写的变量；换成官方桌面端底座后，壳给的是 `DSH_SHELL` /
 * `DSH_PROFILE_DIR`，于是本插件自 1.0.0 起**一直静默返回**——那段提示词一次
 * 都没注入过，而且不报错、日志无痕（2026-10-02 实测：装版 1.1.6 里
 * `SSID_PROFILE_DIR` 不存在，`SSID_STORAGE_ROOT` / `SSID_SHELL_VERSION` 才是
 * 现在有的）。判据据此改为实测存在的变量，并把隔离落点一并读进来当证据。
 */

/** Cordis 插件名（与包名一致，bundle patch 按此名挂载）。 */
export const name = '@max-null/dsh-ssid-env'

/** 贡献提示词段落需要 `systemPrompt`；未声明时 Cordis 的属性代理会直接拒绝访问。 */
export const inject = ['systemPrompt']

/** system-prompt 段落名，需在组合内唯一。 */
const SECTION = 'ssid-env'

/** 排在部署 persona 与中文思考之前：先知道「我在哪」，其余指令都在这个前提下读。 */
const ORDER = -95

/**
 * 由当前进程环境探测桌面壳标识。
 * @returns SSiD 专有的运行期事实；不在 SSiD 内时返回 undefined。
 */
function detectSsid() {
  // `DSH_SHELL=1` 是 fork 壳（1.0.0+）注入的桌面壳标记；`DSH_PROFILE_DIR` 是同层给的
  // profile 目录。两者缺一即不认为自己在 SSiD 内。
  if (process.env.DSH_SHELL !== '1') return undefined
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir !== 'string' || profileDir === '') return undefined

  const read = key => {
    const value = process.env[key]
    return typeof value === 'string' && value !== '' ? value : undefined
  }
  return {
    profileDir,
    profileName: read('DSH_PROFILE'),
    isolatedRoot: read('SSID_SESSION_ISOLATED_ROOT'),
    storageRoot: read('SSID_STORAGE_ROOT'),
    shellVersion: read('SSID_SHELL_VERSION'),
  }
}

/**
 * 组装自述文本。判据取自实际进程环境，因此模型可据此复核，不必盲信。
 * @param fact - {@link detectSsid} 的返回值。
 * @returns 注入用的一段文本。
 */
function describe(fact) {
  const evidence = [
    `profile 目录 ${fact.profileDir}`,
    fact.profileName === undefined ? undefined : `profile 名 ${fact.profileName}`,
    fact.isolatedRoot === undefined ? undefined : `会话根 ${fact.isolatedRoot}`,
    fact.storageRoot === undefined ? undefined : `存储根 ${fact.storageRoot}`,
    fact.shellVersion === undefined ? undefined : `壳版本 ${fact.shellVersion}`,
  ].filter(part => part !== undefined)

  const lines = [
    '[运行环境] 你在 SSiD（思灵）桌面壳内运行，不是裸的 DSH web 版，也不是官方 DSH 桌面版。',
    `- 判据：宿主进程链为 思灵.exe（主进程）→ 思灵.exe --expose-internals（Host）→ 内核；${evidence.join('；')}。`,
    '- 思灵的 storages 根已隔离，不写共享的 ~/.dsh/storages —— 那一份是官方 DSH 桌面版与裸内核默认用的。'
      + '看到「两边工作区登记数不同」「某个会话不在名单里」「别的实例改写了登记」时，先分辨是哪一侧写的，不要直接当成故障。',
    '- userData 也已让位（思灵用 %APPDATA%\\ssid-shell，官方用 %APPDATA%\\@deepseek-ai\\dsh-desktop），'
      + '所以两者的单实例锁互不冲突；dsh:// 协议归官方，思灵注册的是 ssid://。',
    '- 官方 DSH 桌面版、DSH web 版与思灵可能同时在跑，各自有独立进程、会话根、存储根与端口。'
      + '涉及运行环境、配置层或插件集合的结论，先确认你在哪一侧，不要跨侧互推。',
  ]
  return lines.join('\n')
}

/**
 * 注册环境自述段落；不在 SSiD 内时不注册任何内容。
 * @param ctx - 携带 `systemPrompt` 服务的 Cordis 上下文。
 */
export function apply(ctx) {
  const fact = detectSsid()
  if (fact === undefined) return
  ctx.systemPrompt.section({
    name: SECTION,
    order: ORDER,
    text: describe(fact),
  })
}
