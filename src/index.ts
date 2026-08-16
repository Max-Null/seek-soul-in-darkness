/**
 * @max-null/dsh-ssid-panels host half: the /ssid/api JSON route serving
 * SSiD panel data (memory / guardian / habit / balances) to the client half.
 * Same trust fence as better-sidebar's /sidebar routes: Host-header loopback
 * or the web runtime's trustedHosts, cross-site browser markers refused.
 */
import type { Context } from 'cordis'

/** Plugin identity for cordis.yml rows. */
export const name = '@max-null/dsh-ssid-panels'

/** Services required before mounting: the webserver routes and the web runtime's trusted hosts. */
export const inject = ['webServer', 'webRuntime']

/** SSiD 壳版本（main.mjs 启动时从 shell/package.json 注入环境变量）。 */
const SHELL_VERSION = process.env.SSID_SHELL_VERSION ?? '0.0.0'

/** SSiD 仓库（更新检查与更新日志来源）。 */
const SSID_REPO = 'Max-Null/seek-soul-in-darkness'

/** Body size bound of one JSON request. */
const MAX_BODY_BYTES = 1 << 20

/** One API failure with its wire code and HTTP status. */
class PanelsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message)
    this.name = 'PanelsError'
  }
}

/** Write a JSON response. */
function writeJson(res: unknown, status: number, body: unknown): void {
  const r = res as { writeHead(status: number, headers: Record<string, string>): void; end(data: string): void }
  r.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  r.end(JSON.stringify(body))
}

/** Write the failure envelope for any thrown value. */
function writeError(res: unknown, error: unknown): void {
  if (error instanceof PanelsError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  writeJson(res, 500, { ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : String(error) } })
}

/** Read and parse the JSON request body (bounded). */
async function readJsonBody(req: AsyncIterable<string | Uint8Array>): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new PanelsError('bad-request', 'request body too large')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new PanelsError('bad-request', 'request body is not valid JSON')
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

/** One API method. */
type ApiMethod = (payload: unknown) => Promise<unknown> | unknown

/** Read one optional service or throw 503 so the client can degrade. */
function required<T>(service: T | undefined, label: string): T {
  if (service === undefined) {
    throw new PanelsError('service-unavailable', `the ${label} service is not mounted in this deployment`, 503)
  }
  return service
}

/**
 * Plugin body: mount the fenced /ssid/api route.
 * @param ctx - host plugin context (webServer, webRuntime).
 */
export function apply(ctx: Context): void {
  const api: Record<string, ApiMethod> = {
    'about': () => ({
      shellVersion: SHELL_VERSION,
      // 预制插件清单：非官方（非 @deepseek-ai/）loader 条目，按名排序。
      plugins: [...(ctx as unknown as {
        loader: { entries(): Array<{ id: string, options: { name?: string, group?: boolean } }> }
      }).loader.entries()]
        .filter(entry => !entry.options.group && entry.options.name !== undefined
          && !entry.options.name.startsWith('@deepseek-ai/')
          && !entry.options.name.startsWith('cordis:'))
        .map(entry => ({ id: entry.id, name: entry.options.name as string }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }),
    'update-check': async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${SSID_REPO}/releases?per_page=20`, {
          headers: { accept: 'application/vnd.github+json' },
        })
        if (!res.ok) return { currentVersion: SHELL_VERSION, latest: null, releases: [], message: `GitHub API 返回 ${res.status}` }
        const releases = await res.json() as Array<{ tag_name?: string, name?: string, body?: string, published_at?: string }>
        const list = releases.map(release => ({
          tag: release.tag_name ?? '',
          name: release.name ?? release.tag_name ?? '',
          body: release.body ?? '',
          publishedAt: release.published_at ?? '',
        }))
        return { currentVersion: SHELL_VERSION, latest: list[0] ?? null, releases: list }
      } catch (error) {
        return { currentVersion: SHELL_VERSION, latest: null, releases: [], message: error instanceof Error ? error.message : String(error) }
      }
    },
    'memory.list': () => {
      const memory = required(ctx.get('memory'), 'memory')
      return memory.list?.() ?? []
    },
    'memory.search': (payload) => {
      const memory = required(ctx.get('memory'), 'memory')
      const record = payload as { query?: unknown } | null
      const query = typeof record?.query === 'string' ? record.query : ''
      return memory.search?.(query) ?? []
    },
    'memory.confirm': (payload) => {
      const memory = required(ctx.get('memory'), 'memory')
      const record = payload as { id?: unknown } | null
      if (typeof record?.id !== 'string') throw new PanelsError('bad-request', 'missing or invalid "id"')
      return memory.setStatus?.(record.id, 'auto') ?? null
    },
    'memory.forget': (payload) => {
      const memory = required(ctx.get('memory'), 'memory')
      const record = payload as { id?: unknown } | null
      if (typeof record?.id !== 'string') throw new PanelsError('bad-request', 'missing or invalid "id"')
      return memory.forget?.(record.id) ?? false
    },
    'guardian.snapshot': () => {
      const guardian = required(ctx.get('guardian'), 'guardian')
      return guardian.snapshot?.() ?? { session: null, reviewQueue: [] }
    },
    'habit.snapshot': () => {
      const habit = required(ctx.get('habit'), 'habit')
      return habit.snapshot?.() ?? []
    },
    'habit.confirm': async (payload) => {
      const habit = required(ctx.get('habit'), 'habit')
      const memory = ctx.get('memory')
      const record = payload as { id?: unknown } | null
      if (typeof record?.id !== 'string') throw new PanelsError('bad-request', 'missing or invalid "id"')
      const candidate = habit.confirm?.(record.id)
      if (candidate !== undefined && candidate !== null && memory !== undefined) {
        await memory.remember?.({ content: `[习惯] ${candidate.habit}` })
      }
      return candidate ?? null
    },
    'habit.discard': (payload) => {
      const habit = required(ctx.get('habit'), 'habit')
      const record = payload as { id?: unknown } | null
      if (typeof record?.id !== 'string') throw new PanelsError('bad-request', 'missing or invalid "id"')
      return habit.discard?.(record.id) ?? null
    },
    'balance.deepseek': async () => {
      const credentials = required(ctx.get('credentials'), 'credentials')
      const cred = await credentials.resolve('DEEPSEEK_API_KEY')
      if (cred === undefined) return { ok: false, message: '未配置 DEEPSEEK_API_KEY' }
      const res = await fetch('https://api.deepseek.com/user/balance', {
        headers: { Authorization: `Bearer ${cred.value}` },
      })
      if (!res.ok) return { ok: false, message: `余额查询失败（HTTP ${res.status}）` }
      const data = await res.json() as { is_available?: boolean, balance_infos?: Array<{ currency?: string, total_balance?: string }> }
      return {
        ok: true,
        isAvailable: data.is_available === true,
        balanceInfos: (data.balance_infos ?? []).map(info => ({ currency: info.currency ?? 'CNY', totalBalance: info.total_balance ?? '0' })),
      }
    },
    'balance.kimi': async () => {
      const credentials = required(ctx.get('credentials'), 'credentials')
      const cred = await credentials.resolve('MOONSHOT_API_KEY')
      if (cred === undefined) return { ok: false, message: '未配置 MOONSHOT_API_KEY' }
      const res = await fetch('https://api.moonshot.cn/v1/users/me/balance', {
        headers: { Authorization: `Bearer ${cred.value}` },
      })
      if (!res.ok) return { ok: false, message: `余额查询失败（HTTP ${res.status}）` }
      const data = await res.json() as { data?: { available_balance?: number } }
      const available = data.data?.available_balance
      const value = typeof available === 'number' ? available : 0
      return { ok: true, isAvailable: value > 0, balanceInfos: [{ currency: 'CNY', totalBalance: String(value) }] }
    },
  }

  const fence = (req: { headers: Record<string, string | string[] | undefined> }): boolean =>
    isTrusted(req, ctx.webRuntime.trustedHosts)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/ssid/api',
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
      const method = pathname.startsWith('/ssid/api/') ? pathname.slice('/ssid/api/'.length) : undefined
      if (method === undefined || method.includes('/')) {
        writeError(res, new PanelsError('not-found', 'unknown ssid API method', 404))
        return
      }
      try {
        const payload = await readJsonBody(req as AsyncIterable<string | Uint8Array>)
        const handler = api[method]
        if (handler === undefined) {
          throw new PanelsError('not-found', `unknown ssid API method "${method}"`, 404)
        }
        writeJson(res, 200, { ok: true, value: await handler(payload) })
      } catch (error) {
        writeError(res, error)
      }
    },
  }), '@max-null/dsh-ssid-panels: /ssid/api routes')
}
