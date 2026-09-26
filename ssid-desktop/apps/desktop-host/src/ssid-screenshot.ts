/**
 * SSiD 截图服务（Host 侧）。
 *
 * 截图浮层与抓帧都在 Electron **主进程**（`apps/desktop/src/ssid/screenshot.ts`），
 * 而 `dsh-capture` 的 host 半在这个 **Host 子进程**里。两者之间没有共享内存，
 * 所以这里把「开一次截图」变成一条 IPC 往返，并把壳的能力注册成
 * `ssid.shell.screenshot` 服务供插件 `ctx.get` 取用。
 *
 * 与 `ssid-notify.ts` 的方向相反：那条是 Host → 壳（上报发生了什么），
 * 这条是壳 → Host（执行壳才做得到的动作）。走的是同一个 `process.send` /
 * `process.on('message')` 通道，配对方式照 `quit-inspection.ts` 的 `requestId`。
 *
 * 为什么 `apply` 也由壳执行：它要重注册 Electron 的全局快捷键
 * （`globalShortcut`），而那是主进程专属 API；Host 侧只负责把请求转过去并回传结果。
 */

import type { Context } from '@deepseek-ai/cordis'

/** 服务键。与壳 `apps/desktop/src/ssid/screenshot.ts` 的消费者、自建壳
 *  `shell/kernel.ts` 的 `SSID_SHELL_SCREENSHOT_KEY` 三处同值。 */
export const SSID_SHELL_SCREENSHOT_KEY = 'ssid.shell.screenshot'

/** 交给壳执行的一次截图动作。 */
export type SsidScreenshotAction = 'trigger' | 'apply'

/** `trigger` 不回传结果（截图走页面事件），`apply` 回传是否成功占用键位。 */
export interface SsidScreenshotRequest {
  readonly action: SsidScreenshotAction
}

/**
 * 发一条截图请求给壳。
 *
 * `trigger` 是单向的：截图结果由壳直接派发页面事件（`ssid:screenshot`）交给
 * `dsh-capture` 的 client 半，Host 不需要、也拿不到一个「截完了」的信号。
 * 只有 `apply` 需要回传，因为插件把它当同步成功位用。
 * @param request - 要壳执行的动作。
 * @returns `apply` 的是否成功占用键位；`trigger` 恒为 undefined。
 */
export type SsidScreenshotRequestFn = (request: SsidScreenshotRequest) => Promise<boolean | undefined>

/**
 * 注册 `ssid.shell.screenshot` 服务。
 *
 * 服务的两个方法与自建壳同名同义，所以 `dsh-capture` 一行都不用改：
 * `trigger()` 开浮层，`apply()` 改配置后重注册热键。
 * @param ctx - 已启动的 Desktop profile 上下文。
 * @param request - 向壳发一条请求（由 `index.ts` 接 `process.send`）。
 */
export function installSsidScreenshotService(ctx: Context, request: SsidScreenshotRequestFn): void {
  ctx.provide(SSID_SHELL_SCREENSHOT_KEY, {
    trigger: (): void => {
      // 壳不可达（IPC 断了）时只记日志：截图是便利功能，不该把调用方拖挂。
      void request({ action: 'trigger' }).catch((error: unknown) => {
        console.warn('[screenshot] trigger request failed:', error instanceof Error ? error.message : String(error))
      })
    },
    apply: (): boolean => {
      // `apply` 是同步契约（插件在路由里直接把它当成功位），所以这里只能返回
      // 「壳当前可达」——真正的占用结果由壳决定并落日志（与自建壳同款：那里
      // 也是 console.warn 而非回传）。IPC 断了才返回 false。
      void request({ action: 'apply' }).catch((error: unknown) => {
        console.warn('[screenshot] apply request failed:', error instanceof Error ? error.message : String(error))
      })
      return process.connected === true
    },
  })
}
