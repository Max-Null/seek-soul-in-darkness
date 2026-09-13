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
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * 内核子进程诊断输出的落盘位置。
 *
 * 不落盘就只能靠 inherit —— 而 GUI（双击）启动时 Electron 的 stderr 是无效的，
 * 内核里任何插件加载失败、channel 注册报错都会**整段丢失**：2026-09-13 的
 * 「插件中心 405」正是这样一个被藏住的错误，只能靠外部探测反推根因。
 * 与 ssid.log 同目录，便于并排对照。
 */
const CHILD_LOG_PATH = process.env.SSID_KERNEL_CHILD_LOG ?? join(homedir(), '.ssid', 'kernel-child.log')

/** ready 等待上限：源码模式首次 boot 要转译几百个 TS 文件，给足时间。 */
const READY_TIMEOUT_MS = 180_000

/**
 * 解析子进程的执行方式。
 * @param isPackaged 是否打包版（打包走 `resources/node/node.exe resources/kernel-child.bundle.mjs`，
 *   dev 走 `electron --import tsx/esm kernel-child.ts`）。
 * @returns `{ command, args }`。
 */
function resolveLauncher(isPackaged) {
  if (isPackaged) {
    // 打包版：用内置 node.exe。resources/node/node.exe 由 electron-builder 的
    // extraResources 带入（main.mjs 的预制 MCP 也用它，路径约定一致）。
    const node = join(process.resourcesPath, 'node', process.platform === 'win32' ? 'node.exe' : 'node')
    // 脚本取 resources/ 下的 bundle，**不是** asar 内的同名文件：这个子进程是纯
    // Node（没有 Electron 的 asar 补丁），asar 内的路径对它是 ENOENT。
    return {
      command: existsSync(node) ? node : process.execPath,
      args: [join(process.resourcesPath, 'kernel-child.bundle.mjs')],
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
  const scriptPath = args[args.length - 1]
  if (!existsSync(scriptPath)) {
    // 提前给可读错误：spawn 只会回一句 ENOENT，看不出缺的是哪个产物。
    throw new Error(
      `内核子进程脚本不存在：${scriptPath}\n`
      + (isPackaged
        ? '打包版应由 electron-builder 的 build.extraResources 带入（见 shell/package.json），'
          + '且打包前需先跑 npm run bundle-kernel-child 生成。'
        : 'dev 形态请确认 shell/kernel-child.ts 存在且完整。'),
    )
  }
  log(`ssid: kernel-child spawn ${command} ${args.join(' ')}\n`)

  // cwd 必须是真实存在的目录。打包版 HERE 指向 app.asar —— 那是**文件**不是目录，
  // spawn 会以 ENOENT 失败，而错误信息指向 exe 路径，极具误导性（实测：
  // resources/node/node.exe 明明存在，却报 `spawn ...node.exe ENOENT`；
  // dev 下 HERE 就是 shell/，所以这个坑只在运行打包产物时才暴露）。
  // 子进程的诊断输出落盘（见 CHILD_LOG_PATH 注释）：GUI 启动时 Electron 的 stderr
  // 无效，inherit 等于把内核报错整段丢掉。打不开就退回 inherit，不因此阻断启动。
  let childLogFd = null
  try {
    mkdirSync(dirname(CHILD_LOG_PATH), { recursive: true })
    childLogFd = openSync(CHILD_LOG_PATH, 'a')
    appendFileSync(CHILD_LOG_PATH, `\n===== kernel-child @ ${new Date().toISOString()} =====\n`)
  } catch { /* 落盘不可用（权限/磁盘）时退回 inherit，子进程照常启动 */ }

  const cwd = isPackaged ? process.resourcesPath : HERE
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      // command 是 electron 二进制（process.execPath）时必须加这个变量：否则它当
      // 自己是 Electron 主进程、把脚本当应用路径解析，秒退 code=1 且不打印任何栈
      // （实测只报「在 ready 之前退出」，无从归因）。该变量让 electron 表现为纯 Node。
      // 判据跟随**实际命令**而非 isPackaged：打包版在 resources/node/node.exe 缺失时
      // 会退回 process.execPath，同样需要它。
      ...(command === process.execPath ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
      // 子进程无从得知 app.isPackaged，由这里告知：kernel-child 据此决定 bootKernel
      // 的 preferBundled（防 $DSH_CHECKOUT 劫持运行时，pitfalls #5 幽灵依赖）。
      ...(isPackaged ? { SSID_KERNEL_CHILD_PACKAGED: '1' } : {}),
    },
    stdio: ['ignore', childLogFd ?? 'inherit', childLogFd ?? 'inherit', 'ipc'],
    windowsHide: true,
  })
  // 父进程关掉自己这一份句柄（子进程已 dup），避免句柄泄漏
  if (childLogFd !== null) closeSync(childLogFd)

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
