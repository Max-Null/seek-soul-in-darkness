/**
 * SSiD 内核子进程入口。
 *
 * 为什么要把内核移出 Electron 主进程：主进程内 boot 时，DSH 的 native addon
 * 探测不到标准 Node 的 V8 embedder，`ctx.loader.internal` 为 undefined，
 * 于是要用 module-resolution.ts 的 registerHooks 改写 bare specifier 的 parentURL
 * 才能加载（见 kernel.ts 头部注释）。跑在**标准 Node 子进程**里就没有这个问题；
 * 附带收益是内核崩溃不会拖死 UI，且内核可独立重启。
 *
 * 与 Electron 主进程的分工（协议见 host-process.mjs）：
 *   - 子进程：boot 内核、把端口/URL 报给主进程、转发需要主进程动作的事件
 *   - 主进程：起子进程、加载窗口、托盘、通知、单实例锁
 *
 * 进程间只走 Node IPC（`process.send` / `process.on('message')`）——**不用**官方
 * 桌面壳那套 fd3/fd4 分帧字节管道：那套是为了让窗口走 `dsh-app://` 自定义协议、
 * 彻底不要端口；SSiD 的内核本来就监听 127.0.0.1 随机端口、窗口直接 loadURL，
 * 所以只需要把端口和生命周期传出来。
 *
 * 用法：node <本文件或 kernel-child.bundle.mjs>
 *   dev  : node --import tsx/esm shell/kernel-child.ts
 *   打包 : node resources/node/node.exe shell/kernel-child.bundle.mjs
 */
import { bootKernel } from './kernel.ts'
import { createCapabilityProxies, handleParentMessage } from './kernel-child-bridge.ts'

/** 子进程 → 主进程的消息 */
type ToParent =
  | { type: 'ready'; port: number; url: string; dshVersion: string; pid: number }
  | { type: 'event'; name: string; payload?: unknown }
  | { type: 'fatal'; message: string; stack?: string }

/** 主进程 → 子进程的消息 */
type FromParent =
  | { type: 'shutdown' }

const send = (msg: ToParent): void => {
  // 无 IPC 通道（有人直接跑本文件调试）时静默——不能让日志噪音盖住真实错误
  try { process.send?.(msg) } catch { /* IPC 已断，忽略 */ }
}

/** 需要在主进程侧触发通知的内核事件——只挑用得上的字段，不转发整个事件对象 */
function forwardEvent(event: { type?: string; data?: unknown; time?: number }): void {
  const type = event.type
  if (type === 'turn/start') {
    const data = event.data as { turn?: unknown } | undefined
    send({ type: 'event', name: 'turn/start', payload: { turn: data?.turn, time: event.time } })
    return
  }
  if (type === 'turn/end') {
    const data = event.data as { turn?: unknown, reason?: { kind?: string } } | undefined
    send({
      type: 'event',
      name: 'turn/end',
      payload: { turn: data?.turn, time: event.time, reasonKind: data?.reason?.kind },
    })
    return
  }
  if (type === 'approval/asked') {
    const data = event.data as { toolName?: unknown } | undefined
    send({ type: 'event', name: 'approval/asked', payload: { toolName: data?.toolName } })
  }
}

async function main(): Promise<void> {
  // 壳层能力的**代理**：内核对 restart/update/screenshot 的用法是「调用 + 订阅状态」，
  // 所以子进程侧放代理，真实能力仍在 Electron 主进程（闭包不能跨进程传对象）。
  // 见 kernel-child-bridge.ts 的协议与近似点说明。
  const capabilities = createCapabilityProxies()

  const kernel = await bootKernel(
    (code) => { process.exit(code) },
    capabilities,
  )

  send({
    type: 'ready',
    port: kernel.port,
    url: kernel.url,
    dshVersion: kernel.dshVersion,
    pid: process.pid,
  })

  // 内核事件 → 主进程（通知用）。
  //
  // 类型上 `session/event` 声明为 `this: Scoped<Session>`，根 ctx 不满足，故此处断言。
  // 依据：`main.mjs:1286` 用**同款调用**已在生产运行数月（它是 .js，不经类型检查）；
  // 运行时 Cordis 的 on() 对根 ctx 订阅该事件是有效的（实测本文件 spawn 后事件可转发）。
  // 这是**受控的类型断言**而非绕过验证：真正该做的是把订阅下沉到 session 作用域，
  // 但那需要 Scoped 的正确构造方式（cordis 未导出该类型名），列为后续改进。
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  ;(kernel.ctx as unknown as { on(name: string, cb: (...args: unknown[]) => void): void })
    .on('session/event', (_session: unknown, event: { type?: string }) => {
      forwardEvent(event as { type?: string, data?: unknown, time?: number })
    })

  process.on('message', (msg: unknown) => {
    // 先交给能力桥：主进程回传的 capabilityReply / capabilityEvent 都在这里消费
    if (handleParentMessage(msg)) return
    if ((msg as FromParent)?.type === 'shutdown') {
      void kernel.shutdown(0).catch((cause: unknown) => {
        send({ type: 'fatal', message: `shutdown 失败：${String(cause)}` })
        process.exit(1)
      })
    }
  })

  // 父进程消失（Electron 退出/被强杀）时自我了结——否则会成为孤儿进程继续占端口。
  // 'disconnect' 在父端 IPC 关闭时触发，比轮询存活性可靠。
  process.on('disconnect', () => { process.exit(0) })
}

void main().catch((cause: unknown) => {
  const err = cause instanceof Error ? cause : new Error(String(cause))
  send({ type: 'fatal', message: err.message, stack: err.stack })
  console.error('ssid kernel-child 启动失败：', err.stack ?? err.message)
  process.exit(1)
})
