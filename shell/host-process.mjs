/**
 * SSiD 内核子进程管理（Electron 主进程侧）。
 *
 * 与 `kernel-child.ts` 成对：本模块负责 spawn、等待 ready、转发事件、优雅关闭。
 * 协议只用 Node IPC（`child.send` / `child.on('message')`）——不用官方桌面壳那套
 * fd3/fd4 分帧字节管道，原因见 kernel-child.ts 顶部注释（SSiD 的内核本来就有
 * HTTP 端口，窗口直接 loadURL，不需要隧道）。
 *
 * 为什么值得做：内核跑在标准 Node 里，不再需要 module-resolution.ts 的
 * registerHooks 绕 `ctx.loader.internal`（Electron 的 V8 embedder 探测失败）；
 * 且内核崩溃不会拖死 UI，可独立重启。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** ready 等待上限：源码模式首次 boot 要转译几百个 TS 文件，给足时间。 */
const READY_TIMEOUT_MS = 180_000

/**
 * 解析子进程的执行方式。
 * @param isPackaged 是否打包版（打包走 `node <bundle>`，dev 走 `electron --import tsx/esm`）。
 * @returns `{ command, args }`，command 为空串时表示无法确定运行时。
 */
function resolveLauncher(isPackaged) {
  if (isPackaged) {
    // 打包版：用内置 node.exe。resources/node/node.exe 由 electron-builder 的
    // extraResources 带入（main.mjs 的预制 MCP 也用它，路径约定一致）。
    const node = join(process.resourcesPath, 'node', process.platform === 'win32' ? 'node.exe' : 'node')
    return {
      command: existsSync(node) ? node : process.execPath,
      args: [join(HERE, 'kernel-child.bundle.mjs')],
    }
  }
  // dev：Electron 自带的 Node 当运行时，tsx 负责转译 TS。
  // cwd 设为 shell/ 以便子进程解析到 shell/node_modules/tsx。
  return {
    command: process.execPath,
    args: ['--import', 'tsx/esm', join(HERE, 'kernel-child.ts')],
  }
}

/**
 * 启动内核子进程并等待 ready。
 * @param options.isPackaged 打包版标记（决定运行时与脚本形态）。
 * @param options.onEvent 内核事件回调（`{ name, payload }`），用于通知等主进程动作。
 * @param options.onExit 子进程退出回调（拿到退出码与信号）。
 * @param options.capabilities 壳层能力（restart/update/screenshot），供子进程经 IPC 调用。
 * @returns `{ port, url, dshVersion, pid, shutdown, pushCapabilityEvent }`。
 */
export function startKernelHost({
  isPackaged = false,
  onEvent = () => {},
  onExit = () => {},
  capabilities = {},
  log = () => {},
} = {}) {
  const { command, args } = resolveLauncher(isPackaged)
  log(`ssid: kernel-child spawn ${command} ${args.join(' ')}\n`)

  const child = spawn(command, args, {
    cwd: HERE,
    env: {
      ...process.env,
      // dev 模式下 command 是 process.execPath —— 在 Electron 里那是 electron.exe，
      // 不加这个变量它会当自己是 Electron 主进程、把 `kernel-child.ts` 当应用路径解析，
      // 于是秒退 code=1 且不打印任何栈（实测：报「在 ready 之前退出」，无从归因）。
      // 该变量让 electron 二进制表现为纯 Node。
      ...(isPackaged ? {} : { ELECTRON_RUN_AS_NODE: '1' }),
    },
    // stdin 忽略；stdout/stderr 继承，内核日志直接进 Electron 的控制台/日志文件
    // （与同进程模式看到的日志一致，便于对照排查）
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    windowsHide: true,
  })

  let settled = false
  let resolveReady
  let rejectReady
  const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej })

  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    rejectReady(new Error(`kernel-child 在 ${READY_TIMEOUT_MS / 1000}s 内没有 ready（boot 超时或子进程已挂）`))
  }, READY_TIMEOUT_MS)

  /**
   * 执行一次子进程请求的能力调用。
   *
   * 返回值**必须可 JSON 序列化**（IPC 限制）：闭包、类实例、Buffer 之外的二进制都不行。
   * 这也是 capabilities 的契约——见 main.mjs 传入的那三个对象。
   */
  const runCapability = async (name, method, args) => {
    const cap = capabilities[name]
    if (cap === undefined) throw new Error(`主进程未提供能力：${name}`)
    const fn = cap[method]
    if (typeof fn !== 'function') throw new Error(`能力 ${name} 上没有方法：${method}`)
    return await fn(...(Array.isArray(args) ? args : []))
  }

  child.on('message', (msg) => {
    if (msg === null || typeof msg !== 'object') return
    if (msg.type === 'capability') {
      const { name, method, callId, args } = msg
      // 异步执行但立刻返回——不阻塞其它 IPC 消息（shutdown / 事件转发）
      void (async () => {
        try {
          const value = await runCapability(name, method, args)
          child.send({ type: 'capabilityReply', callId, ok: true, value })
        } catch (cause) {
          child.send({ type: 'capabilityReply', callId, ok: false, error: cause instanceof Error ? cause.message : String(cause) })
        }
      })()
      return
    }
    if (msg.type === 'ready') {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveReady({ port: msg.port, url: msg.url, dshVersion: msg.dshVersion, pid: msg.pid })
      return
    }
    if (msg.type === 'event') {
      try { onEvent({ name: msg.name, payload: msg.payload }) } catch (cause) { log(`ssid: onEvent 抛错 ${String(cause)}\n`) }
      return
    }
    if (msg.type === 'fatal') {
      log(`ssid: kernel-child fatal ${msg.message}\n`)
      if (!settled) {
        settled = true
        clearTimeout(timer)
        rejectReady(new Error(`kernel-child 启动失败：${msg.message}`))
      }
    }
  })

  child.on('error', (cause) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    rejectReady(new Error(`kernel-child spawn 失败：${cause.message}`))
  })

  child.on('exit', (code, signal) => {
    clearTimeout(timer)
    if (!settled) {
      settled = true
      rejectReady(new Error(`kernel-child 在 ready 之前退出（code=${String(code)} signal=${String(signal)}）`))
    }
    onExit({ code, signal })
  })

  return {
    ready,
    pid: child.pid,
    /**
     * 主进程 → 子进程的能力事件推送（如 `update:status`）。
     * 子进程侧由 kernel-child-bridge 的 onStatus 订阅接收。
     * @param name 事件名（与 bridge 的 subscribe 名称对应）。
     * @param payload 任意可序列化负载。
     */
    pushCapabilityEvent(name, payload) {
      try { child.send({ type: 'capabilityEvent', name, payload }) } catch { /* IPC 已断 */ }
    },
    /**
     * 优雅关闭：先请子进程 dispose 内核树，超时未退则强杀。
     *
     * 默认 15s 而非更短：实测内核 dispose 要清理 MCP 子进程（playwright/codegraph）、
     * 远程连接与投影缓存，8s 不够（会走强杀路径，日志出现「未在超时内退出」）。
     * 强杀本身安全（端口会释放），但会跳过内核自己的清理。
     * @param timeoutMs 等待优雅退出的上限。
     */
    async shutdown(timeoutMs = 15_000) {
      if (child.exitCode !== null || child.signalCode !== null) return
      const exited = new Promise((res) => child.once('exit', res))
      try { child.send({ type: 'shutdown' }) } catch { /* IPC 已断 */ }
      const timeout = new Promise((res) => setTimeout(res, timeoutMs))
      await Promise.race([exited, timeout])
      if (child.exitCode === null && child.signalCode === null) {
        log('ssid: kernel-child 未在超时内退出，强杀\n')
        child.kill()
        await Promise.race([exited, new Promise((res) => setTimeout(res, 3000))])
      }
    },
  }
}
