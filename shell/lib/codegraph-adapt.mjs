/**
 * CodeGraph MCP 索引目录适配（v0.2.2）。
 *
 * 背景：v0.2.1 出厂把 CodeGraph 的索引目录默认设为用户主目录（homedir），
 * 而 CodeGraph 是代码图谱工具——主目录里没有代码仓库。后果（AI 中台项目组
 * 2026-09-09 反馈）：首次调用扫描 AppData 撞 `--max-files` 上限后长时间卡死
 * 超时、索引常驻内存 700–900MB、查询返回 Chrome 扩展的 JS 与项目无关。
 *
 * 架构约束：`dsh-mcp-client` 是 profile 级 loader 条目（一个进程服务所有
 * 会话），cwd 在 MCP 进程启动时固定，**无法**「默认取当前会话工作目录」。
 * 因此改为 boot 前由壳解析一次索引目录（见 {@link resolveCodeGraphWorkspace}），
 * 且「未适配」的表现为条目停用，而不是指向用户主目录。
 *
 * 纯 ESM、零依赖：main.mjs（electron 主进程，不加载 tsx）与测试共用。
 * 所有写文件均为 UTF-8 无 BOM（手册铁律）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse, resolve, sep } from 'node:path'
import zlib from 'node:zlib'

/** SSiD 侧 CodeGraph 配置文件（~/.ssid/codegraph.json）。 */
export const CG_CONFIG_FILE = 'codegraph.json'

/**
 * 出厂保护参数：无论索引目录最终指向哪里，都不进这些目录。
 * 报告第 3 条（默认排除清单）——避免撞 `--max-files` 后索引一堆无关文件。
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

/** 去掉尾部分隔符并把路径规范化为绝对路径；空/非字符串 → null。 */
function normalizeDir(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/^"+|"+$/g, '')
  if (trimmed === '') return null
  return resolve(trimmed)
}

/**
 * 该目录是否适合作为索引目录：必须存在，且不是用户主目录本身，
 * 也不是主目录的祖先（否则等于把整个主目录当项目索引——正是本次事故）。
 */
export function isUsableWorkspace(dir, home = homedir()) {
  const target = normalizeDir(dir)
  if (target === null || !existsSync(target)) return false
  const normalizedHome = normalizeDir(home)
  if (normalizedHome === null) return true
  if (target === normalizedHome) return false
  // 祖先判断：主目录以 `target + sep` 开头 ⇒ target 是主目录的父级
  return !normalizedHome.startsWith(target.endsWith(sep) ? target : target + sep)
}

/** 读取 SSiD 侧 CodeGraph 配置；不存在/损坏/非对象 → null。 */
export function readCodeGraphConfig(configPath) {
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/** 写 SSiD 侧 CodeGraph 配置（node 写 JSON = UTF-8 无 BOM）。 */
export function writeCodeGraphConfig(configPath, config) {
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
}

/**
 * 取一个 zstd 文件的第一个完整帧（会话 header record 所在帧）。
 * 扫描规则与 `dsh-session-persistence-jsonl` 的 scanZstdFrames、
 * dsh-ssid-panels 的 firstZstdFrame 一致——同一格式的三处读者。
 */
function firstZstdFrame(buf) {
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
 * 运行时不支持 zstd（Node < 22.15）时返回 undefined——探测静默降级。
 */
export function readArtifactCwd(artifactPath) {
  if (typeof zlib.zstdDecompressSync !== 'function') return undefined
  try {
    const frame = firstZstdFrame(readFileSync(artifactPath))
    if (frame === undefined) return undefined
    const plain = zlib.zstdDecompressSync(frame).toString('utf8')
    const first = plain.split('\n')[0]
    if (first === undefined || first === '') return undefined
    const parsed = JSON.parse(first)
    if (parsed === null || typeof parsed !== 'object') return undefined
    const cwd = parsed.cwd
    return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
  } catch {
    return undefined
  }
}

/** 列出会话根下的 artifact（<root>/<project>/<sessionId>/session.jsonl.zstd）。 */
function listArtifacts(root) {
  const out = []
  let projects
  try {
    projects = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  } catch {
    return out // 会话根不存在
  }
  for (const project of projects) {
    const projectDir = join(root, project.name)
    let sessions
    try {
      sessions = readdirSync(projectDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    } catch {
      continue // 单个项目目录不可读不影响整体
    }
    for (const session of sessions) {
      const artifact = join(projectDir, session.name, 'session.jsonl.zstd')
      try {
        out.push({ artifact, mtimeMs: statSync(artifact).mtimeMs })
      } catch {
        // 该会话没有 artifact（未落盘/已清理）
      }
    }
  }
  return out
}

/**
 * 探测「最近用过的项目目录」：扫描会话根，按 artifact 修改时间降序，
 * 取第一个 cwd 仍存在且可用的会话。
 *
 * @param sessionRoots - 会话存储根目录候选（隔离根在前，共享根在后）。
 * @param home - 用户主目录（用于排除主目录本身，默认 os.homedir()）。
 * @returns 绝对路径；无可用结果 → null。
 */
export function detectRecentWorkspace(sessionRoots, home = homedir()) {
  const artifacts = []
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

/**
 * 解析 CodeGraph 索引目录。优先级：
 * 1. `SSID_MCP_CG_WS` 环境变量（高级用户/脚本显式指定）
 * 2. SSiD 配置 `~/.ssid/codegraph.json` 的 `workspace`（MCP 管理页之外的稳定入口）
 * 3. 最近会话探测（{@link detectRecentWorkspace}，零打扰自动适配）
 * 4. 都没有 → null（调用方据此停用该 MCP 条目）
 *
 * @param {object} input
 * @param {string|undefined} input.envWorkspace - 环境变量原文。
 * @param {object|null} input.config - readCodeGraphConfig 的结果。
 * @param {string[]} [input.sessionRoots] - 会话根候选。
 * @param {string} [input.home] - 用户主目录。
 * @returns {{ workspace: string|null, source: 'env'|'config'|'detected'|'none' }}
 */
export function resolveCodeGraphWorkspace({ envWorkspace, config, sessionRoots = [], home = homedir() } = {}) {
  const explicit = normalizeDir(envWorkspace)
  if (explicit !== null && isUsableWorkspace(explicit, home)) return { workspace: explicit, source: 'env' }
  const configured = normalizeDir(config?.workspace)
  if (configured !== null && isUsableWorkspace(configured, home)) return { workspace: configured, source: 'config' }
  const detected = detectRecentWorkspace(sessionRoots, home)
  if (detected !== null) return { workspace: detected, source: 'detected' }
  return { workspace: null, source: 'none' }
}

/**
 * 出厂 `args` 追加项：排除清单（每项一个 `--exclude <dir>`）。
 * `--max-files` 不在此列——它按项目规模调，出厂保持引擎默认值。
 * @returns 展开为 argv 的字符串数组。
 */
export function codeGraphProtectionArgs(excludes = CG_EXCLUDE_DIRS) {
  const args = []
  for (const dir of excludes) {
    if (typeof dir !== 'string' || dir === '') continue
    args.push('--exclude', dir)
  }
  return args
}

/** 路径的根盘符/挂载点（用于展示「索引目录来自哪个盘」之类的诊断）。 */
export function rootOf(target) {
  return parse(resolve(target)).root
}
