/**
 * @max-null/dsh-ssid-screenshot — host half.
 *
 * 三层职责：
 *  ① `/ssid/api/screenshot/*` 路由（fence 与 dsh-ssid-panels 同款）：设置页
 *     读写 ~/.ssid/screenshot.json（hideWindow 截图时是否隐藏主窗口、
 *     hotkey 全局快捷键），客户端按钮走 trigger 触发截图。
 *  ② 经服务键 `ssid.shell.screenshot`（main.mjs 经 bootKernel opts.screenshot
 *     注入）调用壳层能力：trigger 开浮层、apply 重注册快捷键。手动 dsh web
 *     （无 Electron 壳）时服务不存在：get 返回 shellAvailable=false，
 *     set 仅写配置文件（壳内下次启动生效），trigger 返回 503。
 *  ③ client 半完成投递：监听 `ssid:screenshot` CustomEvent → 官方 drop
 *     intake 填入当前会话输入框草稿。
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the family Context augmentations (webServer / webRuntime).
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-web-app'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Plugin identity for cordis.yml rows. */
export const name = '@max-null/dsh-ssid-screenshot'

/** Services required before mounting: the webserver routes and the web runtime's trusted hosts. */
export const inject = ['webServer', 'webRuntime']

/** 配置文件路径（与 shell/main.mjs 的 SCREENSHOT_CONFIG_PATH 一致）。 */
const CONFIG_PATH = join(homedir(), '.ssid', 'screenshot.json')
const CONFIG_DEFAULTS = { hideWindow: true, hotkey: 'Control+Shift+A' }

/** 服务键（与 shell/kernel.ts 的 SSID_SHELL_SCREENSHOT_KEY 一致）。 */
const SHELL_SCREENSHOT_KEY = 'ssid.shell.screenshot'

/** 读取配置（损坏/缺失 → 默认值）。 */
function readConfig(): { hideWindow: boolean, hotkey: string } {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as { hideWindow?: unknown, hotkey?: unknown } | null
    return {
      hideWindow: parsed?.hideWindow !== false,
      hotkey: typeof parsed?.hotkey === 'string' && parsed.hotkey.trim() !== '' ? parsed.hotkey : CONFIG_DEFAULTS.hotkey,
    }
  } catch {
    return { ...CONFIG_DEFAULTS }
  }
}

/** 写入配置（目录不存在则创建）。 */
function writeConfig(next: { hideWindow: boolean, hotkey: string }): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n')
}

/** 是否运行在 SSiD 壳内（Electron 主进程注入过截图能力）。 */
function shellScreenshot(ctx: Context): { trigger: () => void, apply: () => boolean } | undefined {
  return ctx.get(SHELL_SCREENSHOT_KEY) as { trigger: () => void, apply: () => boolean } | undefined
}

// ---- 路由基础设施（与 dsh-ssid-panels 同款 fence） ----

/** Body size bound of one JSON request. */
const MAX_BODY_BYTES = 1 << 20

/** One API failure with its wire code and HTTP status. */
class ScreenshotError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message)
    this.name = 'ScreenshotError'
  }
}

function writeJson(res: unknown, status: number, body: unknown): void {
  const r = res as { writeHead(status: number, headers: Record<string, string>): void; end(data: string): void }
  r.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  r.end(JSON.stringify(body))
}

function writeError(res: unknown, error: unknown): void {
  if (error instanceof ScreenshotError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  writeJson(res, 500, { ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : String(error) } })
}

async function readJsonBody(req: AsyncIterable<string | Uint8Array>): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new ScreenshotError('bad-request', 'request body too large')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ScreenshotError('bad-request', 'request body is not valid JSON')
  }
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** Whether one request may reach the plugin routes (mirror of the /api gateway fence). */
function isTrusted(request: { headers: Record<string, string | string[] | undefined> }, trustedHosts: readonly string[]): boolean {
  const host = header(request.headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  const trusted = isLoopbackHostname(hostUrl.hostname)
    || trustedHosts.some((entry) => {
      const entryUrl = parseAuthority(entry)
      return entryUrl !== undefined && entryUrl.host === hostUrl.host
    })
  if (!trusted) return false
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(request.headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/**
 * Plugin body: mount the fenced /ssid/api/screenshot route.
 * @param ctx - host plugin context (webServer, webRuntime).
 */
export function apply(ctx: Context): void {
  const fence = (req: { headers: Record<string, string | string[] | undefined> }): boolean =>
    isTrusted(req, ctx.webRuntime.trustedHosts)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/ssid/api/screenshot',
    handler: async (req: unknown, res: unknown) => {
      const request = req as { headers: Record<string, string | string[] | undefined>, method?: string, url?: string }
      if (!fence(request)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
        return
      }
      if (request.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
        return
      }
      const pathname = new URL(request.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith('/ssid/api/screenshot/') ? pathname.slice('/ssid/api/screenshot/'.length) : undefined
      if (method === undefined || method.includes('/')) {
        writeError(res, new ScreenshotError('not-found', 'unknown screenshot API method', 404))
        return
      }
      try {
        const payload = await readJsonBody(req as AsyncIterable<string | Uint8Array>)
        let value: unknown
        if (method === 'get') {
          value = {
            ...readConfig(),
            shellAvailable: shellScreenshot(ctx) !== undefined,
          }
        } else if (method === 'set') {
          const record = payload as { hideWindow?: unknown, hotkey?: unknown } | null
          const config = readConfig()
          if (typeof record?.hideWindow === 'boolean') config.hideWindow = record.hideWindow
          if (typeof record?.hotkey === 'string' && record.hotkey.trim() !== '') config.hotkey = record.hotkey.trim()
          writeConfig(config)
          // 壳内即时重注册快捷键（手动 dsh web 无服务：仅配置文件生效）。
          const applied = shellScreenshot(ctx)?.apply?.() ?? false
          value = { ...config, appliedHotkey: applied === true }
        } else if (method === 'trigger') {
          const shell = shellScreenshot(ctx)
          if (shell === undefined) {
            throw new ScreenshotError('shell-unavailable', 'screenshot capture is only available inside the SSiD desktop shell', 503)
          }
          shell.trigger()
          value = { ok: true }
        } else {
          throw new ScreenshotError('not-found', `unknown screenshot API method "${method}"`, 404)
        }
        writeJson(res, 200, { ok: true, value })
      } catch (error) {
        writeError(res, error)
      }
    },
  }), '@max-null/dsh-ssid-screenshot: /ssid/api/screenshot routes')
}
