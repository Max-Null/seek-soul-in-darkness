/** Launch the Desktop profile through the Web application and report its URL to Electron. */

import { delimiter, join } from 'node:path'
import { inspect } from 'node:util'
import { loadLayeredEnv, loadProfileDirectory, reportSkippedBundles } from '@deepseek-ai/dsh-app-boot'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import * as desktopOffice from './office.ts'
import { resolveProfileName } from './profile-name.ts'

import { installDesktopUpdateTaskControl } from './update-tasks.ts'
import { installDesktopQuitInspection } from './quit-inspection.ts'
import { installPlatformSessionPublisher } from './platform-session.ts'
import { installSsidNotifyPublisher } from './ssid-notify.ts'
import { installSsidKeepAwakePublisher } from './ssid-keep-awake.ts'
import { installSsidScreenshotService } from './ssid-screenshot.ts'
import { installOfficeEngineResolution } from './office-engine.ts'

async function main(): Promise<void> {
  const runtimeDir = process.argv[2] as string
  const projectDir = process.argv[3] as string
  installOfficeEngineResolution(runtimeDir)
  const installAnchor = join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  const loadedProfile = loadProfileDirectory('dsh', projectDir, installAnchor)
  // SSiD 纯净模式：插件把内核拖坏时的自救入口，只留官方 bundle 层、丢弃 profile patch
  // 与 home patch，因此用户看到的还是同一个思灵，只是没有第三方插件，于是进得去设置页
  // 把坏插件禁掉。按**层**判定而非逐行禁用：用户 patch 可能只是改官方行的 config，
  // 那种坏配置照样会生效，必须整层丢。全程不碰任何数据（会话 / 设置 / 记忆 / storage 原样）。
  const safeMode = process.env.SSID_SAFE_MODE === '1'
  const profile = safeMode
    ? {
      ...loadedProfile,
      layers: loadedProfile.layers.filter(layer => layer.packageName.startsWith('@deepseek-ai/')),
      patches: [],
    }
    : loadedProfile
  if (safeMode) {
    console.log(`ssid: 纯净模式（SSID_SAFE_MODE=1）：${String(loadedProfile.layers.length)} 层中保留官方 `
      + `${String(profile.layers.length)} 层，丢弃 ${String(loadedProfile.layers.length - profile.layers.length)} 层第三方`
      + `与 ${String(loadedProfile.patches.length)} 条 profile patch`)
  }
  reportSkippedBundles('dsh', profile)
  const application = runProfile({
    environment: loadLayeredEnv('dsh'),
    // SSiD：官方固定 `desktop`，这里改为可配、默认 `ssid`，与 Shell 侧
    // `resolveDesktopPaths` 用同一份解析结果（见 `profile-name.ts`）。
    profile: resolveProfileName(),
    resolvedProfile: { profile, installAnchor },
    patchFiles: [],
    // SSiD：官方默认 19387，与官方桌面端同端口会导致两者永远互斥（实测：一方先起，
    // 另一方 Host 报 listen EADDRINUSE、只留一个起不来的壳挂着托盘图标）。改用独立端口。
    args: ['--no-open', '--port', '19388'],
    ...(process.argv[5] === undefined ? {} : {
      packageManager: {
        command: process.execPath,
        args: ['--expose-internals', process.argv[5]],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
          PATH: `${process.argv[6] ?? ''}${delimiter}${process.env.PATH ?? ''}`,
        },
      },
    }),
  })
  let stopping: Promise<void> | undefined
  const control: {
    updateTasks?: ReturnType<typeof installDesktopUpdateTaskControl>
    quitInspection?: ReturnType<typeof installDesktopQuitInspection>
  } = {}
  const send = (message: object): Promise<void> => new Promise((resolve, reject) => {
    if (!process.connected || process.send === undefined) { resolve(); return }
    process.send(message, (error) => { if (error === null) resolve(); else reject(error) })
  })
  /** 已发出、等壳答复的截图请求。`trigger` 不需要答复（见 requestShot）。 */
  const pendingShots = new Map<number, { resolve: (ok: boolean) => void; action: string }>()
  let nextShotRequest = 0
  const requestShot = (request: { action: 'trigger' | 'apply' }): Promise<boolean | undefined> => {
    if (request.action === 'trigger') {
      // 单向：截图结果由壳直接派发页面事件给 dsh-capture，Host 拿不到也不需要信号。
      // 消息类型是 `screenshot-request`（Host → 壳）；壳回执用 `screenshot-result`。
      return send({ type: 'screenshot-request', action: 'trigger' }).then(() => undefined)
    }
    nextShotRequest += 1
    const requestId = nextShotRequest
    return new Promise<boolean>((resolve) => {
      // 壳不答（崩溃、IPC 断了）时按失败处理——比永久 pending 好排查。
      const timer = setTimeout(() => {
        if (!pendingShots.delete(requestId)) return
        console.warn(`[screenshot] ${request.action} timed out waiting for the shell`)
        resolve(false)
      }, 5_000)
      pendingShots.set(requestId, {
        action: request.action,
        resolve: (ok) => { clearTimeout(timer); resolve(ok) },
      })
      void send({ type: 'screenshot-request', action: request.action, requestId }).catch(() => {
        if (!pendingShots.delete(requestId)) return
        clearTimeout(timer)
        resolve(false)
      })
    })
  }
  const stop = (): Promise<void> => stopping ??= (async () => {
    // Startup failure is reported by main; shutdown only owns a tree that booted.
    const running = await application.catch(() => undefined)
    await running?.shutdown.shutdown(0)
    await send({ type: 'shutdown-complete' })
    if (process.connected) process.disconnect()
  })()
  process.on('message', (message: unknown) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) return
    if (message.type === 'shutdown') { void stop(); return }
    if (message.type === 'screenshot-result') {
      // 消息形状是运行时的（IPC 边界），所以先收窄再用；`requestId` 先取成局部
      // 常量，`Number.isSafeInteger` 之后 TypeScript 才认它是 number。
      if (!('requestId' in message)) return
      const requestId = message.requestId
      if (!Number.isSafeInteger(requestId)) return
      const pending = pendingShots.get(Number(requestId))
      if (pending === undefined) return
      pendingShots.delete(Number(requestId))
      pending.resolve('ok' in message && message.ok === true)
      return
    }
    if (message.type === 'quit-inspection') {
      if (!('requestId' in message) || !Number.isSafeInteger(message.requestId)) return
      const requestId = message.requestId
      void (async () => {
        try {
          if (stopping !== undefined || control.quitInspection === undefined) throw new Error('desktop quit: Host is unavailable')
          const inspection = await control.quitInspection()
          await send({ type: 'quit-inspection', requestId, ...inspection })
        } catch (error) {
          // The shell treats an unknown state as interruptible work and asks before quitting.
          await send({ type: 'quit-inspection', requestId, activeTasks: true, scheduledTasks: false,
            error: error instanceof Error ? error.message : String(error) })
        }
      })().catch((error: unknown) => { console.error(error) })
      return
    }
    if (message.type !== 'update-tasks' || !('requestId' in message) || !Number.isSafeInteger(message.requestId)
      || !('action' in message) || !['inspect', 'lock', 'unlock'].includes(String(message.action))) return
    void (async () => {
      try {
        if (stopping !== undefined || control.updateTasks === undefined) throw new Error('desktop update: Host is unavailable')
        const active = await control.updateTasks(message.action as 'inspect' | 'lock' | 'unlock')
        await send({ type: 'update-tasks', requestId: message.requestId, active })
      } catch (error) {
        await send({ type: 'update-tasks', requestId: message.requestId, active: true,
          error: error instanceof Error ? error.message : String(error) })
      }
    })().catch((error: unknown) => { console.error(error) })
  })
  process.once('disconnect', () => { void stop() })
  const { ctx } = await application
  control.updateTasks = installDesktopUpdateTaskControl(ctx)
  control.quitInspection = installDesktopQuitInspection(ctx)
  // SSiD 截图：把壳的截图能力注册成服务，供 dsh-capture 的 host 半 `ctx.get` 取用。
  // 服务方法只做一件事——把动作转成 IPC 发给壳（`requestShot`），**不要**在这里回头
  // `ctx.get` 取自己注册的服务：那会形成「取服务 → 调 trigger → 再取服务」的无限递归
  // （2026-09-26 实测：路由返回 500 Maximum call stack size exceeded）。
  installSsidScreenshotService(ctx, requestShot)
  await ctx.plugin(desktopOffice, {
    runtimeDir,
    source: process.argv[4] ?? join(runtimeDir, '..', 'runtime', 'primary-runtime'),
    root: join(resolveDshHome(), 'dsh-runtimes', 'dsh-primary-runtime'),
  })
  installPlatformSessionPublisher(ctx, (session) => {
    if (process.connected) process.send?.({ type: 'platform-session', session })
  })
  installSsidNotifyPublisher(ctx, (event) => {
    if (process.connected) process.send?.({ type: 'ssid-notify', ...event })
  })
  // SSiD 保活：与通知**分道**（见 ssid-keep-awake.ts 的文件头）——保活要任何
  // turn/end 都递减计数，而通知只在 completed 时播报，所以不能共用一条通道。
  installSsidKeepAwakePublisher(ctx, (phase) => {
    if (process.connected) process.send?.({ type: 'ssid-keep-awake', phase })
  })
  const url = ctx.connection.authenticatedUrl(`http://127.0.0.1:${String(ctx.webServer.port)}`)
  if (process.connected) process.send?.({ type: 'ready', url, injections: ctx.webServer.collectIndexInjections() }, (error) => { if (error !== null) console.error(error) })
}

/** Upper bound of the startup diagnostic carried over IPC; the head holds the message and stack. */
const MAX_FATAL_DIAGNOSTIC_CHARS = 64 * 1024

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    // The shell receives the complete inspected error here, not through stderr:
    // stderr bytes and this IPC message race, and the shell reports the first
    // failure it sees.
    const diagnostic = inspect(error, { depth: 4, maxArrayLength: 50 }).slice(0, MAX_FATAL_DIAGNOSTIC_CHARS)
    if (process.connected) process.send?.({ type: 'fatal', message, diagnostic }, (error) => { if (error !== null) console.error(error) })
    console.error(error)
    process.exitCode = 1
    if (process.connected) process.disconnect()
  })
}
