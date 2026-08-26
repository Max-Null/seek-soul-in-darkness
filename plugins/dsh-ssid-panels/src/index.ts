/**
 * @max-null/dsh-ssid-panels host half: the /ssid/api JSON route serving
 * SSiD panel data (memory / guardian / habit / balances) to the client half.
 * Same trust fence as better-sidebar's /sidebar routes: Host-header loopback
 * or the web runtime's trustedHosts, cross-site browser markers refused.
 */
import type { Context } from 'cordis'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'
import { interruptedTurnClosers, type SessionEvent } from '@deepseek-ai/dsh-session'
import { parseReleaseNotes } from './release-notes'

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

// ── 会话存储隔离开关（2026-08-22）：独立 root 与共享 root 的切换 + 载入 ───
// 开关状态存 ~/.ssid/session-root.json：isolated（设置页开关）+ applied（本次
// boot 实际生效值，shell/kernel.ts 回写）。两个根路径由 kernel.ts 启动时经
// 环境变量注入（插件侧不再计算 home，避免与 kernel 的 DSH_HOME 口径分叉）。
const SESSION_ROOT_CONFIG_PATH = join(homedir(), '.ssid', 'session-root.json')
/** B 方案（2026-08-23）：已载入会话清单——「移除已载入会话」只删清单内，
 *  隔离后新建的会话不受影响。 */
const IMPORTED_SESSIONS_PATH = join(homedir(), '.ssid', 'imported-sessions.json')
const ISOLATED_ROOT = process.env.SSID_SESSION_ISOLATED_ROOT
const SHARED_ROOT = process.env.SSID_SESSION_SHARED_ROOT

interface SessionRootState { isolated: boolean, applied: boolean }

function readImportedSessions(): Array<{ project: string, id: string }> {
  try {
    const parsed = JSON.parse(readFileSync(IMPORTED_SESSIONS_PATH, 'utf8')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry: unknown): entry is { project: string, id: string } => {
      const e = entry as { project?: unknown, id?: unknown } | null
      return e !== null && typeof e.project === 'string' && typeof e.id === 'string'
    })
  } catch {
    return []
  }
}

function writeImportedSessions(entries: Array<{ project: string, id: string }>): void {
  mkdirSync(dirname(IMPORTED_SESSIONS_PATH), { recursive: true })
  writeFileSync(IMPORTED_SESSIONS_PATH, JSON.stringify(entries, null, 2) + '\n')
}

/** 把 present（载入/已存在）并入清单（幂等按 project+id 去重）。 */
function mergeImportedSessions(present: Array<{ project: string, id: string }>): void {
  const merged = readImportedSessions()
  const seen = new Set(merged.map(entry => `${entry.project}/${entry.id}`))
  for (const entry of present) {
    const key = `${entry.project}/${entry.id}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(entry)
    }
  }
  writeImportedSessions(merged)
}

function readSessionRootState(): SessionRootState {
  try {
    const parsed = JSON.parse(readFileSync(SESSION_ROOT_CONFIG_PATH, 'utf8')) as {
      isolated?: unknown, applied?: unknown
    } | null
    return { isolated: parsed?.isolated === true, applied: parsed?.applied === true }
  } catch {
    return { isolated: false, applied: false }
  }
}

function writeSessionRootState(next: SessionRootState): void {
  mkdirSync(dirname(SESSION_ROOT_CONFIG_PATH), { recursive: true })
  writeFileSync(SESSION_ROOT_CONFIG_PATH, JSON.stringify(next, null, 2) + '\n')
}

/** 一个根目录下携带会话目录的计数（只列目录，不解析日志）。 */
function countSessionRoot(root: string | undefined): number {
  if (root === undefined || root === '') return 0
  let projects: string[] = []
  try {
    projects = readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => entry.name)
  } catch {
    return 0
  }
  let count = 0
  for (const project of projects) {
    try {
      count += readdirSync(join(root, project), { withFileTypes: true })
        .filter(entry => entry.isDirectory() && existsSync(join(root, project, entry.name, 'session.jsonl.zstd')))
        .length
    } catch {
      // 项目目录不可读不影响整体计数
    }
  }
  return count
}

/** 取一个 zstd 文件的第一个完整帧（header record 所在帧；扫描规则与
 *  dsh session-persistence-jsonl 的 scanZstdFrames 一致）。 */
function firstZstdFrame(buf: Buffer): Buffer | undefined {
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0xFD2FB528) return undefined
  let offset = 4
  const descriptor = buf.readUInt8(offset); offset += 1
  const single = (descriptor & 0x20) !== 0
  const csum = (descriptor & 0x04) !== 0
  const dictFlag = descriptor & 0x03
  const dictBytes = dictFlag === 3 ? 4 : dictFlag
  const contentSizeFlag = descriptor >>> 6
  const contentSizeBytes = contentSizeFlag === 0 ? (single ? 1 : 0) : 1 << contentSizeFlag
  const remainingHeaderBytes = (single ? 0 : 1) + dictBytes + contentSizeBytes
  if (buf.length - offset < remainingHeaderBytes) return undefined
  offset += remainingHeaderBytes
  for (;;) {
    if (buf.length - offset < 3) return undefined
    const blockHeader = buf.readUIntLE(offset, 3); offset += 3
    const lastBlock = (blockHeader & 1) !== 0
    const blockType = (blockHeader >>> 1) & 0x03
    const blockSize = blockHeader >>> 3
    if (blockType === 0x03) return undefined
    const payloadBytes = blockType === 0x01 ? 1 : blockSize
    if (buf.length - offset < payloadBytes) return undefined
    offset += payloadBytes
    if (lastBlock) break
  }
  if (csum) {
    if (buf.length - offset < 4) return undefined
    offset += 4
  }
  return buf.subarray(0, offset)
}

/** 读一个会话 artifact 的 header cwd（只解压第一个 zstd 帧，成本 ~KB 级）。 */
function readArtifactHeaderCwd(artifact: string): string | undefined {
  try {
    const frame = firstZstdFrame(readFileSync(artifact))
    if (frame === undefined) return undefined
    const plain = zstdDecompressSync(frame).toString('utf8')
    const first = plain.split('\n')[0]
    if (first === undefined) return undefined
    const parsed = JSON.parse(first) as { cwd?: unknown }
    return typeof parsed.cwd === 'string' ? parsed.cwd : undefined
  } catch {
    return undefined
  }
}

/** 把共享根的会话日志复制到独立根（只复制 session.jsonl.zstd，原件保留）。
 *  `present` 收集所有「已存在（复制或跳过）」的会话，供载入后进行
 *  workspace attach（侧栏分组可见——workspace 账目只随 attach/首次 bootstrap
 *  填充，直接复制文件不会写入，2026-08-23 实测）。 */
function importSharedSessions(): { copied: number, skipped: number, errors: string[], present: Array<{ id: string, project: string, source: string }> } {
  if (ISOLATED_ROOT === undefined || SHARED_ROOT === undefined || ISOLATED_ROOT === SHARED_ROOT) {
    throw new PanelsError('not-configured', 'session roots are not configured (SSiD boot must inject SSID_SESSION_* env)', 503)
  }
  let copied = 0
  let skipped = 0
  const errors: string[] = []
  const present: Array<{ id: string, project: string, source: string }> = []
  let projects: string[] = []
  try {
    projects = readdirSync(SHARED_ROOT, { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => entry.name)
  } catch {
    return { copied, skipped, errors, present } // 共享根不存在 = 没有可载入的会话
  }
  for (const project of projects) {
    const projectSource = join(SHARED_ROOT, project)
    let ids: string[] = []
    try {
      ids = readdirSync(projectSource, { withFileTypes: true })
        .filter(entry => entry.isDirectory()).map(entry => entry.name)
    } catch {
      continue
    }
    for (const id of ids) {
      const sourceArtifact = join(projectSource, id, 'session.jsonl.zstd')
      if (!existsSync(sourceArtifact)) continue
      const targetArtifact = join(ISOLATED_ROOT, project, id, 'session.jsonl.zstd')
      if (existsSync(targetArtifact)) {
        skipped += 1
        present.push({ id, project, source: sourceArtifact })
        continue
      }
      try {
        mkdirSync(dirname(targetArtifact), { recursive: true })
        copyFileSync(sourceArtifact, targetArtifact)
        copied += 1
        present.push({ id, project, source: sourceArtifact })
      } catch (error: unknown) {
        errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  return { copied, skipped, errors: errors.slice(0, 20), present }
}

/** 把（载入/已存在的）会话 attach 到其 cwd 对应的 workspace：workspace 归属
 *  要求「账目记录 + cwd 匹配」（types.ts:17-22），复制文件不写账目，故此步
 *  幂等补齐——侧栏分组即时可见。cwd 不存在的会话与无匹配 workspace 的跳过。 */
async function attachCopiedToWorkspaces(
  ctx: Context,
  present: Array<{ id: string, source: string }>,
): Promise<number> {
  const registry = ctx.get('workspaceRegistry') as {
    list?: () => Array<{ path: string, attachSession: (id: string) => Promise<void> }>
  } | undefined
  if (registry === undefined) return 0
  const workspaces = registry.list?.() ?? []
  let attached = 0
  for (const item of present) {
    const cwd = readArtifactHeaderCwd(item.source)
    if (cwd === undefined) continue
    let real: string
    try { real = realpathSync(cwd) } catch { continue }
    const ws = workspaces.find(w => w.path === real)
    if (ws === undefined) continue
    try {
      await ws.attachSession(item.id)
      attached++
    } catch {
      // 单会话 attach 失败（header 校验等）不影响整体
    }
  }
  return attached
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
    'sessionRoot.get': () => {
      const state = readSessionRootState()
      return {
        ...state,
        // 壳层重启通道是否存在（SSiD 内嵌 boot 才有；手动 dsh web 为 false，
        // 客户端据此跳过「确认后自动重启」、提示手动重启）。
        restartable: typeof ctx.get('ssid.shell.restart') === 'function',
        sharedRoot: SHARED_ROOT,
        isolatedRoot: ISOLATED_ROOT,
        sharedSessions: countSessionRoot(SHARED_ROOT),
        isolatedSessions: countSessionRoot(ISOLATED_ROOT),
        // B 方案：已载入会话数（「移除已载入会话」按钮的可用性依据）。
        importedSessions: readImportedSessions().length,
        // 持久判定「列表需要重启」：清单最后变更时刻 > 本次启动时刻 ⇒
        // 本次运行中载入/移除过会话，workspace 索引尚未重建；重启后自然消失。
        listNeedsRestart: (() => {
          try {
            const bootedAt = Number(process.env.SSID_BOOTED_AT ?? 0)
            if (!Number.isFinite(bootedAt) || bootedAt === 0) return false
            return statSync(IMPORTED_SESSIONS_PATH).mtimeMs > bootedAt
          } catch {
            return false // 清单不存在（从未载入）＝无需重启
          }
        })(),
      }
    },
    'sessionRoot.set': (payload) => {
      const record = payload as { isolated?: unknown } | null
      if (typeof record?.isolated !== 'boolean') {
        throw new PanelsError('bad-request', 'missing or invalid "isolated"')
      }
      const next: SessionRootState = { isolated: record.isolated, applied: readSessionRootState().applied }
      writeSessionRootState(next)
      return {
        ...next,
        // 与 get 一致：client 的 toggle 用 saved.restartable 决定「自绘重启
        // 弹窗」还是「提示手动重启」（2026-08-22：曾漏传导致永远走提示分支）。
        restartable: typeof ctx.get('ssid.shell.restart') === 'function',
        sharedRoot: SHARED_ROOT,
        isolatedRoot: ISOLATED_ROOT,
      }
    },
    'sessionRoot.import': async () => {
      const state = readSessionRootState()
      if (!state.isolated) {
        throw new PanelsError('not-isolated', 'session isolation is off; enable the switch first')
      }
      const result = importSharedSessions()
      // B 方案：记录已载入清单（「移除已载入会话」只删清单内，新建会话保护）。
      mergeImportedSessions(result.present.map(({ id, project }) => ({ id, project })))
      // 复制文件 ≠ 分组可见：把全部已存在会话 attach 到对应 workspace（幂等，
      // 侧栏分组即时出现；attach 失败不阻断统计结果）。
      let attached = 0
      try {
        attached = await attachCopiedToWorkspaces(ctx, result.present)
      } catch {
        attached = 0
      }
      return { ...result, attached }
    },
    // 移除已载入会话（2026-08-23 B 方案）：只删 imported-sessions.json 清单内
    // 的会话（即从共享根载入的），隔离后新建的会话与共享根不受影响。
    'sessionRoot.clear': () => {
      if (ISOLATED_ROOT === undefined || ISOLATED_ROOT === '') {
        throw new PanelsError('not-configured', 'session roots are not configured', 503)
      }
      const imported = readImportedSessions()
      let cleared = 0
      for (const entry of imported) {
        const dir = join(ISOLATED_ROOT, entry.project, entry.id)
        if (existsSync(dir)) {
          try {
            rmSync(dir, { recursive: true, force: true })
            cleared++
          } catch {
            // 单会话删除失败（文件锁等）不阻断整体
          }
        }
      }
      writeImportedSessions([])
      return { cleared }
    },
    'sessionRoot.restart': () => {
      // 重启通道：main.mjs 经 bootKernel opts.restart 注入（服务键
      // 'ssid.shell.restart'，kernel.ts 的 SSID_SHELL_RESTART_KEY 契约）。
      const restart = ctx.get('ssid.shell.restart')
      if (typeof restart !== 'function') {
        throw new PanelsError('restart-unavailable', 'SSiD restart channel is unavailable (not booted by the shell?)', 503)
      }
      // 进行中会话检查（2026-08-22）：任何 live session 带未闭合 turn
      // （open turn，interruptedTurnClosers 非空）时拒绝执行重启——重启会让
      // 该轮按 interrupted 收尾，进行中的对话会被打断。
      // 注：检查与 shutdown 之间存在极窄竞态（新 turn 可能恰好开始），
      // 但对用户触发的这个场景足够；真·边界由 DSH 的 crash-repair 兜底。
      const store = ctx.get('sessions') as { list?: () => Array<{ events: readonly SessionEvent[] }> } | undefined
      const activeSessions = (store?.list?.() ?? [])
        .filter(session => interruptedTurnClosers(session.events).length > 0)
        .length
      if (activeSessions > 0) {
        return { ok: false, code: 'busy', activeSessions }
      }
      ;(restart as () => void)()
      return { ok: true, activeSessions: 0 }
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
    // 离线更新日志（2026-08-26）：读插件包内 release-notes.md（发版时同步），
    // 不依赖检查更新/网络——关于 SSiD「更新日志」区与启动弹窗共用。
    'release-notes': () => {
      try {
        const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'release-notes.md')
        const text = readFileSync(path, 'utf8')
        const parsed = parseReleaseNotes(text)
        return parsed
      } catch (error) {
        return { version: null, title: null, date: null, sections: [], error: error instanceof Error ? error.message : String(error) }
      }
    },
    // 在线增量更新（2026-08-26）：桥接壳层 electron-updater
    // （服务键 ssid.shell.update，main.mjs 经 bootKernel opts.update 注入）。
    // download/install 是动作；status 供客户端轮询（下载进度/pct）。
    'update.check': async () => {
      const bridge = ctx.get('ssid.shell.update') as { check: () => Promise<Record<string, unknown>> } | undefined
      if (bridge === undefined) return { state: 'unavailable', message: '更新桥未注入（手动 dsh web / 裸跑）' }
      return await bridge.check()
    },
    'update.download': async () => {
      const bridge = ctx.get('ssid.shell.update') as { download: () => Promise<Record<string, unknown>> } | undefined
      if (bridge === undefined) return { ok: false, error: '更新桥未注入' }
      return await bridge.download()
    },
    'update.install': async () => {
      const bridge = ctx.get('ssid.shell.update') as { install: () => Promise<Record<string, unknown>> } | undefined
      if (bridge === undefined) return { ok: false, error: '更新桥未注入' }
      return await bridge.install()
    },
    'update.status': () => {
      const bridge = ctx.get('ssid.shell.update') as { onStatus: (cb: (s: Record<string, unknown>) => void) => () => void } | undefined
      if (bridge === undefined) return { state: 'unavailable', message: '更新桥未注入' }
      const holder: { current?: Record<string, unknown> } = {}
      const disposer = bridge.onStatus((status) => { holder.current = status })
      disposer()
      return holder.current ?? { state: 'idle' }
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
