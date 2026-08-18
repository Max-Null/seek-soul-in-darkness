/**
 * @max-null/dsh-ssid-panels host half: the /ssid/api JSON route serving
 * SSiD panel data (memory / guardian / habit / balances) to the client half.
 * Same trust fence as better-sidebar's /sidebar routes: Host-header loopback
 * or the web runtime's trustedHosts, cross-site browser markers refused.
 */
import type { Context } from 'cordis'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/** 预制插件中文简介（未知插件回退包内 description）。 */
const PLUGIN_ZH: Record<string, string> = {
  '@huanlin/dsh-plugin-better-sidebar-plugin-office': 'Office 三件套内联预览（docx/xlsx/pptx）',
  '@max-null/dsh-chinese-thinking': '中文思考——系统提示注入，首轮即中文',
  '@max-null/dsh-guardian': 'Guardian 状态引擎——断言计数、编辑审查队列、无反馈环监控',
  '@max-null/dsh-habit': '自学习习惯引擎——纠错信号检测、阈值判断、两级人工闸门',
  '@max-null/dsh-memory': '跨会话明文记忆——BM25 检索、无向量、人工可管',
  '@max-null/dsh-ssid-panels': 'SSiD 面板——记忆/状态/习惯/余额 tab 与关于页',
  'dsh-better-sidebar': 'VSCode 式右侧栏——文件/终端/Git/浏览器，按会话隔离',
  'dsh-excel-panel': 'Excel 编辑面板——多工作表、公式、批量格式、保存回写',
  'dsh-sidebar-qa': '划选提问——选文本到侧栏追问，不打断主对话',
  'dsh-skin': '皮肤切换——预设调色板、壁纸、透明度/模糊、字号',
  'dsh-video-preview': '视频内联预览——mp4/webm 等，支持拖进度',
}

/** 预制插件英文简介（与 PLUGIN_ZH 键一一对应，客户端按 UI 语言选择）。 */
const PLUGIN_EN: Record<string, string> = {
  '@huanlin/dsh-plugin-better-sidebar-plugin-office': 'Inline preview for Office files (docx/xlsx/pptx)',
  '@max-null/dsh-chinese-thinking': 'Chinese thinking — system prompt injection, Chinese from the first turn',
  '@max-null/dsh-guardian': 'Guardian state engine — assertion counts, edit review queue, feedback-loop watch',
  '@max-null/dsh-habit': 'Self-learning habit engine — correction signals, thresholds, two human gates',
  '@max-null/dsh-memory': 'Cross-session plaintext memory — BM25 retrieval, no vectors, human-manageable',
  '@max-null/dsh-ssid-panels': 'SSiD panels — memory/status/habits/balance tabs and the about page',
  'dsh-better-sidebar': 'VSCode-style right sidebar — files/terminal/git/browser, per-session',
  'dsh-excel-panel': 'Excel editing panel — multi-sheet, formulas, batch formatting, save back',
  'dsh-sidebar-qa': 'Selection Q&A — ask about selected text in the sidebar without interrupting the main chat',
  'dsh-skin': 'Skin switcher — preset palettes, wallpaper, opacity/blur, font size',
  'dsh-video-preview': 'Inline video preview — mp4/webm etc., scrubbing',
}

/** 读一个已挂载插件的版本与简介。
 * 优先从 profile node_modules 直接路径读（SSID_PROFILE_DIR 由壳注入，
 * 不依赖各包 exports 是否暴露 ./package.json），回退模块解析。 */
function pluginMeta(name: string): { version?: string, descriptionZh?: string, descriptionEn?: string } {
  const candidates: string[] = []
  const profileDir = process.env.SSID_PROFILE_DIR
  if (profileDir !== undefined && profileDir !== '') {
    candidates.push(join(profileDir, 'node_modules', name, 'package.json'))
  }
  try {
    candidates.push(require.resolve(`${name}/package.json`))
  } catch {
    // exports 未暴露 ./package.json 的包走上面的直接路径
  }
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: string, description?: string }
      return {
        version: pkg.version,
        descriptionZh: PLUGIN_ZH[name] ?? pkg.description,
        descriptionEn: PLUGIN_EN[name] ?? pkg.description,
      }
    } catch {
      // 尝试下一个候选
    }
  }
  return {}
}

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

// ── 通知配置（2026-08-18）：壳层主进程读同一文件驱动失焦通知 ─────────────
const NOTIFY_CONFIG_PATH = join(homedir(), '.ssid', 'notify.json')
const NOTIFY_DEFAULTS = { enabled: true, replyDone: true, question: true, approval: true }
type NotifyConfig = typeof NOTIFY_DEFAULTS

function readNotifyConfig(): NotifyConfig {
  try {
    const parsed = JSON.parse(readFileSync(NOTIFY_CONFIG_PATH, 'utf8')) as unknown
    return { ...NOTIFY_DEFAULTS, ...(typeof parsed === 'object' && parsed !== null ? parsed : {}) }
  } catch {
    return { ...NOTIFY_DEFAULTS }
  }
}

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
    'notify.get': () => readNotifyConfig(),
    'notify.set': (payload) => {
      const record = payload as Record<string, unknown> | null
      const next = readNotifyConfig()
      for (const key of ['enabled', 'replyDone', 'question', 'approval'] as const) {
        const value = record?.[key]
        if (typeof value === 'boolean') next[key] = value
      }
      mkdirSync(dirname(NOTIFY_CONFIG_PATH), { recursive: true })
      writeFileSync(NOTIFY_CONFIG_PATH, JSON.stringify(next, null, 2) + '\n')
      return next
    },
    'about': () => ({
      shellVersion: SHELL_VERSION,
      // 预制插件清单：非官方（非 @deepseek-ai/）loader 条目，按名排序。
      plugins: [...(ctx as unknown as {
        loader: { entries(): Array<{ id: string, options: { name?: string, group?: boolean } }> }
      }).loader.entries()]
        .filter(entry => !entry.options.group && entry.options.name !== undefined
          && !entry.options.name.startsWith('@deepseek-ai/')
          && !entry.options.name.startsWith('cordis:'))
        .map(entry => ({ id: entry.id, name: entry.options.name as string, ...pluginMeta(entry.options.name as string) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }),
    'update-check': async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${SSID_REPO}/releases?per_page=20`, {
          headers: { accept: 'application/vnd.github+json' },
        })
        if (!res.ok) return { currentVersion: SHELL_VERSION, latest: null, releases: [], code: 'api-failed', status: res.status, message: `GitHub API returned ${res.status}` }
        const releases = await res.json() as Array<{ tag_name?: string, name?: string, body?: string, published_at?: string }>
        const list = releases.map(release => ({
          tag: release.tag_name ?? '',
          name: release.name ?? release.tag_name ?? '',
          body: release.body ?? '',
          publishedAt: release.published_at ?? '',
        }))
        return { currentVersion: SHELL_VERSION, latest: list[0] ?? null, releases: list }
      } catch (error) {
        return { currentVersion: SHELL_VERSION, latest: null, releases: [], code: 'api-failed', message: error instanceof Error ? error.message : String(error) }
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
      if (cred === undefined) return { ok: false, code: 'missing-key', message: 'DEEPSEEK_API_KEY is not configured' }
      const res = await fetch('https://api.deepseek.com/user/balance', {
        headers: { Authorization: `Bearer ${cred.value}` },
      })
      if (!res.ok) return { ok: false, code: 'http-failed', status: res.status, message: 'upstream balance query failed' }
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
      if (cred === undefined) return { ok: false, code: 'missing-key', message: 'MOONSHOT_API_KEY is not configured' }
      const res = await fetch('https://api.moonshot.cn/v1/users/me/balance', {
        headers: { Authorization: `Bearer ${cred.value}` },
      })
      if (!res.ok) return { ok: false, code: 'http-failed', status: res.status, message: 'upstream balance query failed' }
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
