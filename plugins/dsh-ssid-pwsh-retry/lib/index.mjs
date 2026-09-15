/**
 * @max-null/dsh-ssid-pwsh-retry — one transparent retry for the pwsh tool.
 *
 * Windows 上 DSH 的进程创建偶发失败：runner 内的 `CreateProcessW` 返回
 * `ACCESS_DENIED`，被映射成 Node 风格的 `spawn EPERM`。现象与命令内容无关、
 * 可自愈，根治在 DSH 的进程创建层（见 SSiD 仓库内那次排查记录）。这里补一次
 * 重试：命中该错误时等待片刻再重新 dispatch，给残留的 runner/句柄留出释放时间。
 *
 * 边界：只对 `pwsh` 工具、只对 `spawn EPERM` 这一种错误、只重试一次；调用已中止
 * 或错误不是 EPERM 时原样透传。重试会重新执行一次命令——非幂等命令因此可能执行
 * 两次，这是透明重试固有的代价。
 */

/**
 * 重试前的等待：给残留的 runner 进程与句柄留出释放时间。
 * 取值偏小是有意的——它落在用户可感知的阈值以下，宁可重试仍失败，也不让每次
 * 调用都明显变慢。
 */
const RETRY_DELAY_MS = 300

/** DSH 把 Win32 的 ACCESS_DENIED 映射成的 Node 风格错误文本。 */
const SPAWN_EPERM = /spawn EPERM/

/** Cordis 插件名（与包名一致，bundle patch 按此名挂载）。 */
export const name = '@max-null/dsh-ssid-pwsh-retry'

/** 本插件包装的对象：工具注册表的 `tools/execute` waterfall。 */
export const inject = ['tools']

/**
 * 判断一次工具结果是否是 Windows 的 spawn EPERM。
 * @param result - `tools/execute` 链返回的工具结果。
 * @returns 命中该错误时为 true。
 */
function isSpawnEperm(result) {
  if (result === null || result === undefined || result.isError !== true) return false
  const message = result.error?.message
  if (typeof message === 'string' && SPAWN_EPERM.test(message)) return true
  const parts = Array.isArray(result.content) ? result.content : []
  return parts.some((part) => part?.type === 'text' && typeof part.text === 'string' && SPAWN_EPERM.test(part.text))
}

/** 落一行诊断；stderr 不可用时静默——诊断不该影响工具结果。 */
function log(message) {
  try {
    process.stderr.write(`[dsh-ssid-pwsh-retry] ${message}\n`)
  } catch {
    // Electron 无控制台宿主下 stderr 不可写，忽略
  }
}

/**
 * 注册 `tools/execute` 包装：先按原链执行，命中 spawn EPERM 时等待后再执行一次。
 * @param ctx - 携带 `tools` 服务的 Cordis 上下文。
 * @returns 首次或重试后的工具结果。
 */
export function apply(ctx) {
  ctx.on('tools/execute', async (exec, next) => {
    const first = await next()
    if (exec.name !== 'pwsh') return first
    if (exec.signal?.aborted === true) return first
    if (!isSpawnEperm(first)) return first
    log(`pwsh 命中 spawn EPERM，${RETRY_DELAY_MS}ms 后重试一次`)
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    if (exec.signal?.aborted === true) return first
    return next()
  })
}
