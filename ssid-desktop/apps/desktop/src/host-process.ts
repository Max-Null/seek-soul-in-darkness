/** Electron Node-mode child lifecycle for the shared Web application. */

import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account'
import { desktopNodeEnvironment } from './node-environment.ts'

interface ReadyEvent {
  readonly type: 'ready'
  readonly url: string
  readonly injections?: readonly unknown[] | undefined
}

interface FatalEvent {
  readonly type: 'fatal'
  readonly message: string
  /** The Host's complete inspected error: stack, enumerable properties, cause chain. */
  readonly diagnostic?: string
}

interface PlatformSessionEvent {
  readonly type: 'platform-session'
  readonly session: PlatformSession | null
}

/** SSiD 通知事件：壳按 `~/.ssid/notify.json` 决定是否投递为原生通知。 */
interface SsidNotifyEvent {
  readonly type: 'ssid-notify'
  readonly scene: 'replyDone' | 'approval' | 'question'
  readonly toolName?: string
  readonly startedAt?: number
  readonly endedAt?: number
}

/** 截图浮层可执行的动作。`trigger` 开浮层，`apply` 改配置后重注册全局热键。 */
type SsidScreenshotAction = 'trigger' | 'apply'

/** 保活状态机关心的两个事实。 */
type SsidKeepAwakePhase = 'turnStart' | 'turnEnd'

/**
 * 保活事实（Host → 壳）。
 *
 * 与 `ssid-notify` **分道**：保活要任何 `turn/end` 都递减计数，通知只在
 * `reason.kind === 'completed'` 时播报。合并成一条会让中断的回合漏减，保活再也释放不掉。
 */
interface SsidKeepAwakeEvent {
  readonly type: 'ssid-keep-awake'
  readonly phase: SsidKeepAwakePhase
}

/**
 * Host 请壳执行一次截图动作（**Host → 壳**方向）。
 *
 * 截图浮层与全局快捷键都在 Electron 主进程，Host 子进程没有这些 API；这条消息
 * 是唯一的通道。`apply` 带 `requestId`（要等壳回执才知道键位是否占上），
 * `trigger` 不带（单向——截图结果由壳直接派发页面事件给 dsh-capture，Host 不需要信号）。
 */
interface SsidScreenshotRequestEvent {
  readonly type: 'screenshot-request'
  readonly action: SsidScreenshotAction
  readonly requestId?: number
}

/** 壳对一次 `apply` 的答复。`trigger` 是单向的，壳不回执。 */
interface SsidScreenshotResultEvent {
  readonly type: 'screenshot-result'
  readonly requestId: number
  readonly ok: boolean
  /** 壳执行失败时的原因；与另外两条控制答复保持同一字段。 */
  readonly error?: string
}

type DesktopHostEvent = ReadyEvent | FatalEvent | PlatformSessionEvent | SsidNotifyEvent | SsidScreenshotRequestEvent
  | SsidScreenshotResultEvent | SsidKeepAwakeEvent | { readonly type: 'shutdown-complete' } | {
    readonly type: 'update-tasks'
    readonly requestId: number
    readonly active: boolean
    readonly error?: string
  } | {
    readonly type: 'quit-inspection'
    readonly requestId: number
    readonly activeTasks: boolean
    readonly scheduledTasks: boolean
    readonly error?: string
  }

/** Correlated answer to one shell control request. */
type DesktopHostControlResponse = Extract<DesktopHostEvent, { readonly requestId: number }>

/** What quitting now would affect, as reported by the Host. */
export interface DesktopQuitInspection {
  readonly activeTasks: boolean
  readonly scheduledTasks: boolean
}

/** Quit inspection deadline; a slower Host counts as unknown work and the shell asks before quitting. */
export const QUIT_INSPECTION_DEADLINE_MS = 2_000

const MAX_HOST_DIAGNOSTIC_CHARS = 64 * 1024

function isDesktopHostEvent(message: unknown): message is DesktopHostEvent {
  if (typeof message !== 'object' || message === null || !('type' in message)) return false
  const candidate = message as Record<string, unknown>
  switch (candidate.type) {
    case 'shutdown-complete':
      return true
    case 'ready':
      return typeof candidate.url === 'string'
    case 'platform-session': {
      const session = candidate.session
      if (session === null) return true
      if (typeof session !== 'object' || !('origin' in session) || !('token' in session)
        || typeof session.origin !== 'string' || typeof session.token !== 'string' || session.token.length === 0) return false
      if (!('userId' in session) || (session.userId !== null
        && (typeof session.userId !== 'string' || session.userId.length === 0))) return false
      if ('embeddedPageDist' in session && typeof session.embeddedPageDist !== 'string') return false
      if ('requestHeaders' in session && (typeof session.requestHeaders !== 'object' || session.requestHeaders === null
        || Array.isArray(session.requestHeaders)
        || Object.entries(session.requestHeaders).some(([name, value]) => typeof value !== 'string'
          || name !== name.toLowerCase() || /[\r\n]/.test(value)
          || ['authorization', 'x-dsh-auth-token', 'host', 'content-length', 'transfer-encoding', 'connection', 'content-type'].includes(name)))) return false
      try {
        const url = new URL(session.origin)
        return url.origin === session.origin && !url.username && !url.password
          && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      } catch { return false }
    }
    case 'ssid-notify': {
      const scene = candidate.scene
      if (scene !== 'replyDone' && scene !== 'approval' && scene !== 'question') return false
      if ('toolName' in candidate && typeof candidate.toolName !== 'string') return false
      if ('startedAt' in candidate && typeof candidate.startedAt !== 'number') return false
      if ('endedAt' in candidate && typeof candidate.endedAt !== 'number') return false
      return true
    }
    case 'fatal':
      return typeof candidate.message === 'string' && (candidate.diagnostic === undefined || typeof candidate.diagnostic === 'string')
    case 'update-tasks':
      return Number.isSafeInteger(candidate.requestId) && typeof candidate.active === 'boolean'
        && (candidate.error === undefined || typeof candidate.error === 'string')
    case 'quit-inspection':
      return Number.isSafeInteger(candidate.requestId) && typeof candidate.activeTasks === 'boolean'
        && typeof candidate.scheduledTasks === 'boolean' && (candidate.error === undefined || typeof candidate.error === 'string')
    case 'screenshot-request': {
      if (candidate.action !== 'trigger' && candidate.action !== 'apply') return false
      // `trigger` 单向（无 requestId）；`apply` 必须带配对号，否则壳无法回执。
      return candidate.requestId === undefined
        ? candidate.action === 'trigger'
        : Number.isSafeInteger(candidate.requestId)
    }
    case 'screenshot-result':
      return Number.isSafeInteger(candidate.requestId) && typeof candidate.ok === 'boolean'
    case 'ssid-keep-awake':
      return candidate.phase === 'turnStart' || candidate.phase === 'turnEnd'
    default:
      return false
  }
}

async function exitsWithin(exit: Promise<void>, milliseconds: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => { resolve(false) }, milliseconds)
    timer.unref()
  })
  try {
    return await Promise.race([exit.then(() => true), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Browser authentication URL reported by the running Web application. */
export interface DesktopHostReady {
  readonly url: string
  readonly injections?: readonly unknown[] | undefined
}

/** The child has exited, but task teardown did not finish successfully. */
export class DesktopHostUncleanExitError extends Error {}

/**
 * A Host failure reported over IPC before the process exited. `message` is what
 * the Host chose to show; `diagnostic` is its complete inspected error, kept
 * separately so a crash report can print it verbatim instead of a string escaped
 * inside another error's properties.
 */
export class DesktopHostFatalError extends Error {
  readonly #diagnostic: string | undefined

  /**
   * @param message - The Host's failure message.
   * @param diagnostic - The Host's inspected error, when the Host supplied one.
   */
  constructor(message: string, diagnostic: string | undefined) {
    super(message)
    this.#diagnostic = diagnostic
  }

  /** The Host's inspected error; a getter so `util.inspect` of this error does not repeat it as an escaped property. */
  get diagnostic(): string | undefined { return this.#diagnostic }
}

/** One Web backend running under the Electron executable in Node mode. */
export class DesktopHostProcess {
  private child: ChildProcess | undefined
  private readyResolve!: (ready: DesktopHostReady) => void
  private readyReject!: (error: Error) => void
  private readonly readyPromise = new Promise<DesktopHostReady>((resolve, reject) => {
    this.readyResolve = resolve
    this.readyReject = reject
  })
  private exitPromise: Promise<void> | undefined
  private stderr = ''
  private failureReported = false
  private stopping = false
  private shutdownCompleted = false
  private nextControlId = 1
  private readonly controlRequests = new Map<number, {
    resolve: (response: DesktopHostControlResponse) => void
    reject: (error: Error) => void
  }>()

  /**
   * @param node - Absolute Electron executable in Node mode.
   * @param runtimeDir - Immutable packages carried by the current application.
   * @param projectDir - Desktop plugin profile and child working directory.
   * @param inspectPort - Optional loopback inspector port for workspace development.
   * @param environment - Environment inherited by the Host and its plugin subprocesses.
   * @param onFailure - Receives the first unexpected child failure, including after readiness.
   * @param primaryRuntime - Optional bundled dependency payload; when supplied, missing sibling
   *   `office-skills` resources fail Host startup.
   * @param packageManager - Bundled pnpm entry and Node launcher directory, scoped to package operations.
   * @param onPlatformSession - Private credential updates for embedded Platform views.
   * @param onSsidNotify - SSiD notification events; the shell renders them as native notifications.
   */
  constructor(
    private readonly node: string,
    private readonly runtimeDir: string,
    private readonly projectDir: string,
    private readonly inspectPort?: number,
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly onFailure?: (error: Error) => void,
    private readonly primaryRuntime?: string,
    private readonly packageManager?: { readonly pnpm: string; readonly nodeBin: string },

    private readonly onPlatformSession?: (session: PlatformSession | null) => void,
    private readonly onSsidNotify?: (event: SsidNotifyEvent) => void,
    /** SSiD 截图：Host 的插件请求壳执行一次截图动作（壳回 `ok` 作为答复）。 */
    private readonly onScreenshot?: (action: SsidScreenshotAction) => Promise<boolean>,
    /** SSiD 保活：Host 上报一轮的开始/结束，壳据此持有或释放 `powerSaveBlocker`。 */
    private readonly onKeepAwake?: (phase: SsidKeepAwakePhase) => void,
  ) {}

  /**
   * Start this child once and await its Web application URL.
   * @returns Ready facts supplied by the child after application startup.
   */
  async start(): Promise<DesktopHostReady> {
    if (this.child !== undefined) return this.readyPromise
    const entry = join(this.runtimeDir, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js')
    const child = spawn(this.node, [
      '--expose-internals',
      ...(this.inspectPort === undefined ? [] : [`--inspect=127.0.0.1:${String(this.inspectPort)}`]),
      entry,
      this.runtimeDir,
      this.projectDir,
      this.primaryRuntime ?? join(this.runtimeDir, '..', 'runtime', 'primary-runtime'),
      ...this.packageManager === undefined ? [] : [this.packageManager.pnpm, this.packageManager.nodeBin],
    ], {
      cwd: this.projectDir,
      env: desktopNodeEnvironment(this.node, undefined, this.environment),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    this.child = child
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => { this.stderr = (this.stderr + chunk).slice(-MAX_HOST_DIAGNOSTIC_CHARS) })
    child.stdout?.pipe(process.stdout)
    child.on('message', (message: unknown) => {
      if (!isDesktopHostEvent(message)) {
        this.fail(new Error('dsh desktop host sent an invalid IPC event'))
        child.kill('SIGTERM')
        return
      }
      if (message.type === 'ready') this.readyResolve({ url: message.url, injections: message.injections })
      else if (message.type === 'platform-session') this.onPlatformSession?.(message.session)
      else if (message.type === 'ssid-notify') this.onSsidNotify?.(message)
      else if (message.type === 'ssid-keep-awake') this.onKeepAwake?.(message.phase)
      // 截图动作：Host 的插件经 `ssid.shell.screenshot` 发起，壳在这里执行。
      else if (message.type === 'screenshot-request') void this.answerScreenshot(message)
      else if (message.type === 'shutdown-complete') {
        if (this.stopping) this.shutdownCompleted = true
        else this.fail(new Error('dsh desktop host acknowledged an unrequested shutdown'))
      }
      else if (message.type === 'fatal') this.fail(new DesktopHostFatalError(message.message, message.diagnostic))
      else {
        const request = this.controlRequests.get(message.requestId)
        if (message.error === undefined) request?.resolve(message)
        else request?.reject(new Error(message.error))
      }
    })
    child.once('error', (error) => { this.fail(error) })
    this.exitPromise = new Promise<void>((resolve) => {
      child.once('close', (code) => {
        const suffix = this.stderr.trim() === '' ? '' : `: ${this.stderr.trim()}`
        if (code !== 0 && code !== null) this.fail(new Error(`dsh desktop host exited with ${String(code)}${suffix}`))
        else this.fail(new Error(`dsh desktop host stopped${suffix}`))
        resolve()
      })
    })
    return this.readyPromise
  }

  /**
   * Inspect active work or lock request admission for update handoff.
   * @param action - Read-only inspection, admission lock, or recovery unlock.
   * @returns Whether live tasks would be affected. Locking drains admitted API requests before inspecting tasks;
   * an unanswered drain fails at the control-request deadline without authorizing installation.
   */
  async updateTasks(action: 'inspect' | 'lock' | 'unlock'): Promise<boolean> {
    const response = await this.control({ type: 'update-tasks', action }, 10_000, 'desktop update: task inspection timed out')
    if (response.type !== 'update-tasks') throw new Error('desktop update: Host answered with a different control response')
    return response.active
  }

  /**
   * 转达 Host 的一次截图动作请求，并把壳的结果答复回去。
   *
   * `trigger` 也要回一条：Host 侧等的是「壳收到了」这个事实本身，用不到成功位，
   * 但回一条能让它的 5 秒兜底定时器立刻清掉，而不是每次截图都空等。
   * @param request - 宿主发来的动作与配对号。
   */
  private async answerScreenshot(request: SsidScreenshotRequestEvent): Promise<void> {
    let ok = false
    let error: string | undefined
    try {
      ok = this.onScreenshot === undefined ? false : await this.onScreenshot(request.action)
    } catch (caught) {
      // `caught` 是 IPC 边界的未知值，按惯例取 message 字符串。
      error = caught instanceof Error ? caught.message : String(caught)
      console.warn('[screenshot] shell action failed:', error)
      ok = false
    }
    // `trigger` 是单向的：没有配对号就不回执——回一条 `requestId: undefined` 会被
    // Host 侧的事件校验判为非法，直接 kill 掉整个 Host 子进程（2026-09-26 实测）。
    if (request.requestId === undefined) return
    this.child?.send?.({ type: 'screenshot-result', requestId: request.requestId, ok, ...(error === undefined ? {} : { error }) } satisfies SsidScreenshotResultEvent)
  }

  /**
   * Ask the Host what quitting now would interrupt.
   * @returns Active tasks and armed scheduled reminders; rejects when the Host is unavailable or misses
   * {@link QUIT_INSPECTION_DEADLINE_MS}, and the shell then asks before quitting.
   */
  async inspectQuit(): Promise<DesktopQuitInspection> {
    const response = await this.control({ type: 'quit-inspection' }, QUIT_INSPECTION_DEADLINE_MS, 'desktop quit: inspection timed out')
    if (response.type !== 'quit-inspection') throw new Error('desktop quit: Host answered with a different control response')
    return { activeTasks: response.activeTasks, scheduledTasks: response.scheduledTasks }
  }

  private async control(
    request: { readonly type: 'update-tasks'; readonly action: 'inspect' | 'lock' | 'unlock' } | { readonly type: 'quit-inspection' },
    deadlineMs: number, deadlineMessage: string,
  ): Promise<DesktopHostControlResponse> {
    const child = this.child
    if (child === undefined || !child.connected || this.failureReported || this.stopping) {
      throw new Error(`${request.type === 'update-tasks' ? 'desktop update' : 'desktop quit'}: Host is unavailable`)
    }
    const requestId = this.nextControlId++
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await new Promise<DesktopHostControlResponse>((resolve, reject) => {
        this.controlRequests.set(requestId, { resolve, reject })
        timer = setTimeout(() => { reject(new Error(deadlineMessage)) }, deadlineMs)
        child.send({ ...request, requestId }, (error) => { if (error !== null) reject(error) })      })
    } finally {
      clearTimeout(timer)
      this.controlRequests.delete(requestId)
    }
  }

  /**
   * Request teardown and await child exit, escalating termination when needed.
   * @param requireGraceful - Reject update handoff after forced termination or unsuccessful child exit.
   * @returns Completion of owned process teardown. DesktopHostUncleanExitError confirms exit but refuses installation;
   * other failures do not confirm exit.
   */
  async stop(requireGraceful = false): Promise<void> {
    const child = this.child
    if (child === undefined) return
    this.stopping = true
    this.onPlatformSession?.(null)
    if (child.connected) child.send({ type: 'shutdown' }, (error) => { if (error !== null) this.fail(error) })
    const exited = this.exitPromise ?? Promise.resolve()
    const graceful = await exitsWithin(exited, 10_000)
    if (!graceful) child.kill('SIGTERM')
    if (!await exitsWithin(exited, 5_000)) {
      child.kill('SIGKILL')
      if (!await exitsWithin(exited, 5_000)) {
        throw new Error('dsh desktop host did not exit after SIGKILL')
      }
    }
    this.child = undefined
    if (requireGraceful && (!graceful || child.exitCode !== 0 || !this.shutdownCompleted)) {
      // This diagnostic reaches expandable UI; arbitrary plugin stderr can contain credentials.
      throw new DesktopHostUncleanExitError(`desktop update: Host did not complete graceful task teardown (exit ${String(child.exitCode)}, signal ${String(child.signalCode)}, shutdown acknowledged ${String(this.shutdownCompleted)}, graceful deadline exceeded ${String(!graceful)})`)
    }
  }

  private fail(error: Error): void {
    this.onPlatformSession?.(null)
    this.readyReject(error)
    for (const request of this.controlRequests.values()) request.reject(error)
    this.controlRequests.clear()
    if (!this.failureReported && !this.stopping) {
      this.failureReported = true
      try { this.onFailure?.(error) } catch (listenerError) {
        console.error('desktop host failure listener failed', listenerError)
      }
    }
  }
}
