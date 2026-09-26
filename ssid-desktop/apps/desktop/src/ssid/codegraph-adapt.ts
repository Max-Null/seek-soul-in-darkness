/**
 * CodeGraph MCP 索引目录适配（fork 版；与自建壳 `shell/lib/codegraph-adapt.mjs` 同源）。
 *
 * 背景：出厂把 CodeGraph 的索引目录默认设为用户主目录（homedir），而 CodeGraph 是
 * 代码图谱工具——主目录里没有代码仓库。后果（AI 中台项目组 2026-09-09 反馈）：
 * 首次调用扫描 AppData 撞 `--max-files` 上限后长时间卡死超时、索引常驻内存
 * 700–900MB、查询返回 Chrome 扩展的 JS 与项目无关。
 *
 * 架构约束：`dsh-mcp-client` 是 profile 级 loader 条目（一个进程服务所有会话），
 * cwd 在 MCP 进程启动时固定，**无法**「默认取当前会话工作目录」。因此改为 boot 前
 * 由壳解析一次索引目录（见 {@link resolveCodeGraphWorkspace}），且「未适配」的表现为
 * 条目停用，而不是指向用户主目录。
 *
 * 所有写文件均为 UTF-8 无 BOM（工作区铁律）。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse, resolve, sep } from 'node:path'
import zlib from 'node:zlib'

/** SSiD 侧 CodeGraph 配置文件（~/.ssid/codegraph.json）。 */
export const CG_CONFIG_FILE = 'codegraph.json'

/**
 * CodeGraph 配置文件的绝对路径。
 *
 * 落在**用户主目录**而不是 `DSH_HOME`：它是「这台机器上代码在哪」这类用户级事实，
 * 与 profile 无关 —— 换 profile 不该让用户重新指一遍项目目录。
 * @param home - 用户主目录，仅为测试可注入。
 * @returns `~/.ssid/codegraph.json` 的绝对路径。
 */
export function codeGraphConfigPath(home: string = homedir()): string {
  return join(home, '.ssid', CG_CONFIG_FILE)
}

/**
 * 出厂保护参数：无论索引目录最终指向哪里，都不进这些目录。
 * 避免撞 `--max-files` 后索引一堆无关文件。
 */
export const CG_EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'AppData',
  'target',
  'dist',
  'build',
  'out',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.next',
  '.cache',
]

/** 探测时最多读取的会话 artifact 数（每个只解第一个 zstd 帧，成本 ~KB 级）。 */
const DETECT_ARTIFACT_LIMIT = 12

/** 去掉首尾引号并把路径规范化为绝对路径；空/非字符串 → null。 */
function normalizeDir(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/^"+|"+$/g, '')
  if (trimmed === '') return null
  return resolve(trimmed)
}

/**
 * 该目录是否适合作为索引目录：必须存在，且不是用户主目录本身，
 * 也不是主目录的祖先（否则等于把整个主目录当项目索引——正是那次事故）。
 * @param dir - 候选目录。
 * @param home - 用户主目录，仅为测试可注入。
 * @returns 可用则为 true。
 */
export function isUsableWorkspace(dir: unknown, home: string = homedir()): boolean {
  const target = normalizeDir(dir)
  if (target === null || !existsSync(target)) return false
  const normalizedHome = normalizeDir(home)
  if (normalizedHome === null) return true
  if (target === normalizedHome) return false
  // 祖先判断：主目录以 `target + sep` 开头 ⇒ target 是主目录的父级
  return !normalizedHome.startsWith(target.endsWith(sep) ? target : target + sep)
}

/** 读取 SSiD 侧 CodeGraph 配置；不存在/损坏/非对象 → null。 */
export function readCodeGraphConfig(configPath: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/** 写 SSiD 侧 CodeGraph 配置（node 写 JSON = UTF-8 无 BOM）。 */
export function writeCodeGraphConfig(configPath: string, config: Record<string, unknown>): void {
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
}

/**
 * 取一个 zstd 文件的第一个完整帧（会话 header record 所在帧）。
 * 扫描规则与 `dsh-session-persistence-jsonl` 的 scanZstdFrames、
 * dsh-ssid-panels 的 firstZstdFrame 一致——同一格式的三处读者。
 */
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

/**
 * 读一个会话 artifact 的 header cwd（只解压第一个 zstd 帧）。
 * 运行时不支持 zstd 时返回 undefined——探测静默降级。
 * @param artifactPath - 会话 artifact 绝对路径。
 * @returns header 里的 cwd，或 undefined。
 */
export function readArtifactCwd(artifactPath: string): string | undefined {
  if (typeof zlib.zstdDecompressSync !== 'function') return undefined
  try {
    const frame = firstZstdFrame(readFileSync(artifactPath))
    if (frame === undefined) return undefined
    const plain = zlib.zstdDecompressSync(frame).toString('utf8')
    const first = plain.split('\n')[0]
    if (first === undefined || first === '') return undefined
    const parsed: unknown = JSON.parse(first)
    if (parsed === null || typeof parsed !== 'object') return undefined
    const cwd = (parsed as { cwd?: unknown }).cwd
    return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
  } catch {
    return undefined
  }
}

/** 列出会话根下的 artifact（`<root>/<project>/<sessionId>/session.jsonl.zstd`）。 */
function listArtifacts(root: string): { artifact: string; mtimeMs: number }[] {
  const out: { artifact: string; mtimeMs: number }[] = []
  let projects
  try {
    projects = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory())
  } catch {
    return out // 会话根不存在
  }
  for (const project of projects) {
    const projectDir = join(root, project.name)
    let sessions
    try {
      sessions = readdirSync(projectDir, { withFileTypes: true }).filter(entry => entry.isDirectory())
    } catch {
      continue // 单个项目目录不可读不影响整体
    }
    for (const session of sessions) {
      // 会话文件名带格式版本：`session.jsonl.zstd`（v0）与 `session.v4.jsonl.zstd`（v4 起）。
      // **不要写死版本号**——自建壳那版写死 v0 名字，在 v4 会话上恒探测不到 artifact，
      // 于是 resolveCodeGraphWorkspace 落到 'none' 并误弹首次引导窗
      // （2026-09-26 实测：dev 的会话全是 v4）。这里按模式匹配，跟随内核演进。
      let files: string[]
      try {
        files = readdirSync(join(projectDir, session.name))
          .filter(name => /^session(\.[^.]+)?\.jsonl\.zstd$/.test(name))
      } catch {
        continue // 单个会话目录不可读不影响整体
      }
      for (const name of files) {
        const artifact = join(projectDir, session.name, name)
        try {
          out.push({ artifact, mtimeMs: statSync(artifact).mtimeMs })
        } catch {
          // 该 artifact 读不到（未落盘/已清理）
        }
      }
    }
  }
  return out
}

/**
 * 探测「最近用过的项目目录」：扫描会话根，按 artifact 修改时间降序，
 * 取第一个 cwd 仍存在且可用的会话。
 * @param sessionRoots - 会话存储根目录候选（隔离根在前，共享根在后）。
 * @param home - 用户主目录（用于排除主目录本身）。
 * @returns 绝对路径；无可用结果 → null。
 */
export function detectRecentWorkspace(sessionRoots: readonly string[], home: string = homedir()): string | null {
  const artifacts: { artifact: string; mtimeMs: number }[] = []
  for (const root of sessionRoots) {
    if (typeof root !== 'string' || root === '') continue
    artifacts.push(...listArtifacts(root))
  }
  artifacts.sort((a, b) => b.mtimeMs - a.mtimeMs)
  for (const item of artifacts.slice(0, DETECT_ARTIFACT_LIMIT)) {
    const cwd = readArtifactCwd(item.artifact)
    if (cwd === undefined) continue
    if (!isUsableWorkspace(cwd, home)) continue
    return normalizeDir(cwd)
  }
  return null
}

/** 解析来源，用于日志与诊断。 */
export type CodeGraphWorkspaceSource = 'env' | 'config' | 'detected' | 'prompt' | 'none'

/**
 * 解析 CodeGraph 索引目录。优先级：
 * 1. `SSID_MCP_CG_WS` 环境变量（高级用户/脚本显式指定）
 * 2. SSiD 配置 `~/.ssid/codegraph.json` 的 `workspace`（MCP 管理页之外的稳定入口）
 * 3. 最近会话探测（{@link detectRecentWorkspace}，零打扰自动适配）
 * 4. 都没有 → null（调用方据此停用该 MCP 条目）
 * @param input - 各来源的原始值。
 * @returns 解析出的目录与来源。
 */
export function resolveCodeGraphWorkspace(input: {
  envWorkspace?: string | undefined
  config?: Record<string, unknown> | null
  sessionRoots?: readonly string[]
  home?: string
} = {}): { workspace: string | null; source: CodeGraphWorkspaceSource } {
  const { envWorkspace, config, sessionRoots = [], home = homedir() } = input
  const explicit = normalizeDir(envWorkspace)
  if (explicit !== null && isUsableWorkspace(explicit, home)) return { workspace: explicit, source: 'env' }
  const configured = normalizeDir(config?.['workspace'])
  if (configured !== null && isUsableWorkspace(configured, home)) return { workspace: configured, source: 'config' }
  const detected = detectRecentWorkspace(sessionRoots, home)
  if (detected !== null) return { workspace: detected, source: 'detected' }
  return { workspace: null, source: 'none' }
}

/**
 * CodeGraph 条目的启停开关值（模板 patch 的 `disabled` 表达式读 `SSID_MCP_CG_ENABLE`）。
 *
 * 两个条件缺一不可：解析到可用的索引目录，**且** CLI 实体真的在 profile 里。
 * 只看目录会把「目录可用、CLI 缺失」的机器置为启用，而模板 `args[0]` 取自
 * `SSID_MCP_CG_CLI`——缺失时求值为 `null`，`dsh-mcp-client` 的 schema 要求 `string[]`，
 * 于是**整棵插件树加载失败、内核起不来**。停用只让 CodeGraph 不可用，不影响其他插件与界面。
 * @param workspace - resolveCodeGraphWorkspace 的 workspace。
 * @param cliExists - profile 内 codegraph-mcp 的 CLI 是否存在。
 * @returns 写入 `SSID_MCP_CG_ENABLE` 的值。
 */
export function resolveCodeGraphEnable(workspace: string | null, cliExists: boolean): '0' | '1' {
  return workspace !== null && cliExists ? '1' : '0'
}

/**
 * 出厂 `args` 追加项：排除清单（每项一个 `--exclude <dir>`）。
 * `--max-files` 不在此列——它按项目规模调，出厂保持引擎默认值。
 * @param excludes - 排除目录名。
 * @returns 展开为 argv 的字符串数组。
 */
export function codeGraphProtectionArgs(excludes: readonly string[] = CG_EXCLUDE_DIRS): string[] {
  const args: string[] = []
  for (const dir of excludes) {
    if (typeof dir !== 'string' || dir === '') continue
    args.push('--exclude', dir)
  }
  return args
}

/** 路径的根盘符/挂载点（用于展示「索引目录来自哪个盘」之类的诊断）。 */
export function rootOf(target: string): string {
  return parse(resolve(target)).root
}
