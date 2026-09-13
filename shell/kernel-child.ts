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
 *   打包 : resources/node/node.exe resources/kernel-child.bundle.mjs
 */
/**
 * 打包链路：本文件由 esbuild 打成 `kernel-child.bundle.mjs`，`./kernel.ts` **一并内联**
 * （`npm run bundle-kernel-child`）。所以下面保持**静态导入**——内联后产物自包含，
 * 运行时不存在 `./kernel.ts` 这个路径，也就不需要按形态分支的动态导入。
 *
 * 产物必须放在 **resources/ 而不是 asar 内**：打包形态的子进程是纯 `node.exe`
 * （`ELECTRON_RUN_AS_NODE` 在这里也用不上——它压根不是 Electron 进程），
 * 读不到 asar 虚拟文件系统，asar 内的脚本路径对它就是 ENOENT。
 * 落点由 host-process.mjs 的 resolveLauncher 决定。
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
    // 带上 nowMs：主进程不能事后补算「这一回合何时开始」，缺了就只能用主进程时钟，
    // 会让「会话已完成，用时 mm:ss」与同进程模式不一致。
    send({ type: 'event', name: 'turn/start', payload: { turn: data?.turn, time: event.time, nowMs: Date.now() } })
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
    {
      ...capabilities,
      // 打包形态**必须**显式声明「优先内置闭包」。缺了它 kernel.ts 会落到
      // resolveDshRuntime()：先认 $DSH_CHECKOUT（用户残留变量会把运行时劫持到旧源码，
      // 即 pitfalls #5 的幽灵依赖），再认 `<bundle目录>/../../deepseek-harness`
      // ——打包后那是安装目录附近，必然不存在，boot 直接失败。
      // 判据由主进程传入：只有 Electron 主进程知道 app.isPackaged，子进程不知道。
      preferBundled: process.env.SSID_KERNEL_CHILD_PACKAGED === '1',
    },
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

  // ── 「AI 提问」通知 ─────────────────────────────────────────────────────
  // 同进程模式下由**主进程**包装 userQuestions.ask 发通知（main.mjs 的通知段）；
  // 内核搬到子进程后那个包装点够不着服务（kernel.get 在主进程返回 undefined），
  // 于是改在这里的**子进程内**包装同一个服务，ask() 前上报一条事件。
  // 与主进程的包装同形：只加一个前置动作，不改 ask 自身行为。
  const uq = kernel.get('userQuestions') as { ask?: (...args: unknown[]) => Promise<unknown> } | undefined
  const ask = uq?.ask
  if (uq !== undefined && typeof ask === 'function') {
    const originalAsk = ask.bind(uq)
    uq.ask = async (...args: unknown[]) => {
      send({ type: 'event', name: 'question/asked' })
      return await originalAsk(...args)
    }
    console.error('ssid: kernel-child 已包装 userQuestions（AI 提问通知可用）')
  } else {
    // 服务缺失不是错误（profile 可能没装相关行），但必须留痕：否则「子进程模式下
    // AI 提问不通知」会被当成随机故障去排查。
    console.error('ssid: kernel-child 未提供 userQuestions，AI 提问通知不可用')
  }

  // ── 405 诊断探针（临时，定位后移除）──────────────────────────────────────
  // 实测结论（2026-09-14）：405 来自 `packages/host/frontend-static` 的兜底
  // ——「Non-GET/HEAD without a matching named route is 405」，即请求**没匹配到
  // 任何已注册路由**；同一路径 GET 走 404 兜底，`/api` 走 connection 的 401，
  // 说明 connection 自身正常，缺的是 `connection.rpc.handle` 注册的那两个 channel。
  // 见 docs/决策/2026-09-14-插件中心405诊断记录.md。
  const probeNames = ['pluginCenter', 'pluginCenterRpc', 'loader', 'skills', 'tools', 'apiProxy', 'remote']

  /** 探测一次：服务可见性 + `ctx.<name>` 代理可用性（两者语义不同，见 DSH packages/AGENTS.md）。 */
  const probeOnce = (tag: string): void => {
    for (const name of probeNames) {
      let present = false
      try { present = kernel.get(name) !== undefined } catch { present = false }
      // ctx.<name> 走 cordis 的拓扑敏感属性代理，与 ctx.get 不是同一路径
      let viaProxy = 'n/a'
      try {
        viaProxy = String((kernel.ctx as unknown as Record<string, unknown>)[name] !== undefined)
      } catch (cause) {
        viaProxy = `throw:${cause instanceof Error ? cause.message : String(cause)}`
      }
      console.error(`ssid: [probe${tag}] ${name}: get=${String(present)} proxy=${viaProxy}`)
    }
  }

  const probeConnection = kernel.get('connection') as
    | { rpc?: { handle: (channel: string, handler: unknown) => unknown } }
    | undefined
  console.error(
    `ssid: [probe] webServer=${String(kernel.get('webServer') !== undefined)}`
    + ` connection=${String(probeConnection !== undefined)}`
    + ` rpc=${String(probeConnection?.rpc !== undefined)}`,
  )
  if (probeConnection?.rpc !== undefined) {
    try {
      probeConnection.rpc.handle('/__ssid-probe', async () => ({ ok: true, value: null }))
      console.error('ssid: [probe] connection.rpc.handle 成功 —— webServerCtx 已 attach')
    } catch (cause) {
      console.error(`ssid: [probe] connection.rpc.handle 抛出：${String(cause)}`)
    }
  }
  probeOnce('')
  // 延迟复探：boot 返回后插件 fiber 可能仍在微任务队列里（cordis 的
  // `_reload()` 有 `await Promise.resolve()` 让位）。若 5s 后仍为 false，则不是
  // 「还没醒」而是「确实没成」——那就要看 fiber 自身状态，而不是猜。
  setTimeout(() => { probeOnce('+5s') }, 5000)
  setTimeout(() => { probeOnce('+20s') }, 20000)

  /**
   * 从 `ctx.registry` 找目标 runtime 的 fiber 列表。
   *
   * 走这条路是因为 `notify()` 用的正是 `runtime.fibers`（reflect.ts:316），
   * 而每个 fiber 由 `Fiber` 构造时通过 `parent.fiber.effect()` 挂进那个列表——
   * 也就是说 `pluginCenterRpc` 的 fiber 若存在、若被唤醒，一定在这里。
   */
  const loaderForWatch = kernel.get('loader') as
    | { entries?: () => Iterable<{ options?: { id?: string, name?: string }, fiber?: unknown }> }
    | undefined
  const registrySvc = (kernel.ctx as unknown as {
    registry?: { values?: () => Iterable<{ name?: string, fibers?: Iterable<unknown> }> }
  }).registry
  const dumpFibers = (tag: string): void => {
    // 照抄 reflect.ts:316 的迭代方式（`registry.values()`），它才是可用的那条路
    const runtimes = typeof registrySvc?.values === 'function' ? [...registrySvc.values()] : []
    if (runtimes.length === 0) {
      console.error(`ssid: [fibers${tag}] registry.values() 不可用或为空`)
      return
    }
    let fiberCount = 0
    let active = 0
    const rows: string[] = []
    try {
      for (const runtime of runtimes) {
        for (const fiber of runtime.fibers ?? []) {
          fiberCount++
          const f = fiber as {
            state?: unknown
            inject?: Record<string, unknown>
            _store?: Record<string, unknown>
            _error?: unknown
            name?: unknown
          }
          const state = Math.floor(Number(f.state))
          if (state === 2) { active++; continue }
          const injected = Object.keys(f.inject ?? {})
          const held = Object.keys(f._store ?? {})
          rows.push(
            `runtime=${runtime.name ?? '(anon)'} fiber=${String(f.name ?? '?')} state=${String(f.state)}`
            + ` inject=[${injected.join('|')}] store=[${held.join('|')}]`
            + ` missing=[${injected.filter(k => !held.includes(k)).join('|')}]`
            + (f._error ? ` error=${String(f._error).slice(0, 180)}` : ''),
          )
        }
      }
    } catch (cause) {
      console.error(`ssid: [fibers${tag}] 遍历失败：${String(cause)}`)
      return
    }
    console.error(`ssid: [fibers${tag}] runtime ${runtimes.length}，fiber ${fiberCount}，ACTIVE ${active}，非 ACTIVE ${rows.length}`)
    for (const r of rows.filter(x => /connection|pluginCenter|remote|apiProxy/i.test(x)).slice(0, 25)) {
      console.error(`ssid: [fibers${tag}]  * ${r}`)
    }
    for (const r of rows.slice(0, 20)) console.error(`ssid: [fibers${tag}]    ${r}`)
  }
  dumpFibers('')
  setTimeout(() => { dumpFibers('+20s') }, 20000)

  // 上一轮 boot 是否抛过错：app-boot 会把失败记在 loader entry 上。
  // 若 plugin-center 自身在列，就是它没 ACTIVE；若不在列，说明它 ACTIVE 了，
  // 405 另有原因（那种情况下条目的 name 会出现在 ACTIVE 里）。
  if (typeof loaderForWatch?.entries === 'function') {
    try {
      for (const entry of loaderForWatch.entries()) {
        const n = entry.options?.name ?? ''
        if (!/plugin-center|harness-remote|client-connection/.test(n)) continue
        const f = entry.fiber as { state?: unknown, _error?: unknown, inject?: Record<string, unknown> } | undefined
        console.error(
          `ssid: [watch] ${entry.options?.id ?? '(?)'} <${n}>`
          + ` state=${String(f?.state)}`
          + ` inject=[${Object.keys(f?.inject ?? {}).join('|')}]`
          + ` error=${f && '_error' in f && f._error ? String(f._error).slice(0, 200) : 'none'}`,
        )
      }
    } catch (cause) {
      console.error(`ssid: [watch] 失败：${String(cause)}`)
    }
  }

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
