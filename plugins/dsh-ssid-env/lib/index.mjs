/**
 * `@max-null/dsh-ssid-env` — 运行环境自述。
 *
 * 一条固定的 system-prompt 段落，告诉模型当前跑在 SSiD（思灵）桌面壳里，
 * 而不是裸的 DSH web 版，并给出可验证的判据与「两侧可能同时在跑」的提醒。
 *
 * 为什么需要它：SSiD 与 DSH web 的界面都是同一个 DSH Web GUI，但 profile、
 * 插件集合、会话根与配置层都不同——没有自述时，调查环境相关问题容易把两侧
 * 混为一谈（2026-09-17 实测踩过：查宿主、查 Playwright MCP 配置、查会话根
 * 都先问了一遍「我到底在哪」）。
 *
 * 动态而非硬编码：只有探测到 SSiD 的运行期标识（内核在 boot 前写入的
 * `SSID_PROFILE_DIR`）才注入。若本包被装进非 SSiD 环境，它保持沉默——
 * 自述不能说谎，否则比没有更糟。
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
 * 由当前进程环境探测 SSiD 标识。
 * @returns SSiD 专有的运行期事实；不在 SSiD 内时返回 undefined。
 */
function detectSsid() {
  // 内核在 boot DSH 之前写入（kernel.ts → kernel-child.bundle.mjs）：
  // 这三者同属 SSiD 的启动契约，缺一即不认为自己在 SSiD 内。
  const profileDir = process.env.SSID_PROFILE_DIR
  if (typeof profileDir !== 'string' || profileDir === '') return undefined
  const isolatedRoot = process.env.SSID_SESSION_ISOLATED_ROOT
  return {
    profileDir,
    isolatedRoot: typeof isolatedRoot === 'string' && isolatedRoot !== '' ? isolatedRoot : undefined,
  }
}

/**
 * 组装自述文本。判据取自实际进程环境，因此模型可据此复核，不必盲信。
 * @param fact - {@link detectSsid} 的返回值。
 * @returns 注入用的一段文本。
 */
function describe(fact) {
  const lines = [
    '[运行环境] 你在 SSiD（思灵）桌面壳内运行，不是裸的 DSH web 版。',
    `- 判据：宿主进程链为 思灵.exe → kernel-child.bundle.mjs；profile 目录 ${fact.profileDir}`
      + (fact.isolatedRoot === undefined ? '。' : `；会话根 ${fact.isolatedRoot}。`),
    '- DSH web 版可能与 SSiD 同时在跑，两者各有独立进程、会话根与端口。'
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
