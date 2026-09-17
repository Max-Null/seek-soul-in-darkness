#!/usr/bin/env node
/**
 * 长会话输出退化扫描：读 DSH 会话日志，量模型是否已经在「打转」。
 *
 * 为什么需要它：自动压缩的触发线是 `thresholdRatio` × 窗口（默认 0.8）。本机
 * deepseek 路由的窗口是 1,000,000（`deepseek-harness/packages/llm/llm-deepseek/src/adapter.ts:147`
 * 的 DEFAULT_CONTEXT_WINDOW），阈值因此落在 **80 万 token**——而实测长会话在 67 万
 * 附近就开始输出退化（推理里成段重复，甚至泄漏进正文）。两者之间约 13 万 token 里，
 * 系统认为「还不到时候」，模型却在打转。这个脚本把「感觉它在重复」变成可比较的数字。
 *
 * 它能回答：
 *   · 某个会话是否已经进入退化区？重复率从多少 token 开始爬？
 *   · 这个会话的上下文压力峰值是多少、占窗口几成？
 *   · 压缩线（阈值）与退化起点之间还差多少？
 *   · 跨多个会话看，退化是不是普遍现象？
 *
 * 判据（全部来自日志，不猜）：
 *   · 上下文压力 = `assistant/message` 的 inputTokens + cacheReadTokens + cacheWriteTokens
 *     （provider 上报的真实计数；不是本地估算）
 *   · 窗口取自 `request/context` 记录
 *   · 重复率 = 单条 reasoning 输出按换行与中英句读切分后，出现 ≥3 次的单元占比
 *
 * 用法：
 *   node session-degeneration-scan.mjs <session.v3.jsonl.zstd>        # 单会话报告
 *   node session-degeneration-scan.mjs --root <dir>                   # 跨会话扫描
 *   node session-degeneration-scan.mjs --root <dir> --min-size 2MB    # 只看大会话
 *   node session-degeneration-scan.mjs <file> --json                  # 机器可读
 *
 * 选项：
 *   --root <dir>        递归扫该目录下所有 `*.jsonl.zstd`，逐会话报退化信号
 *   --min-size <size>   `--root` 模式的最小文件，支持 `1MB` / `500KB`（默认 1MB）
 *   --threshold <0-1>   重复率告警阈值（默认 0.5）
 *   --top <n>           报告列出的条目数（默认 10）
 *   --json              输出 JSON（完整数据，便于二次处理）
 *   --help              显示本说明
 *
 * 退出码：0 = 未发现越线退化；1 = 有会话越线；2 = 用法错误或读取失败。
 *
 * 局限：只对含 `reasoning-chunks` 的新格式会话有效。旧格式日志没有推理文本，
 * 会报 `no-reasoning` —— **别把「扫不出来」读成「没问题」**。
 *
 * 帧扫描逻辑复制自 DSH 自身（`deepseek-harness/packages/session/session-persistence-jsonl/
 * src/zstd.ts` 的 `scanZstdFrames`）：会话日志是**拼接的 zstd 帧**，每次追加一批事件写一帧，
 * 按普通压缩流解压会在第二帧就报 `Unknown frame descriptor`。
 *
 * 背景与实测数据：`seek-soul-in-darkness/docs/排查/2026-09-18-长会话输出退化.md`
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { basename, join } from 'node:path'

const ZSTD_MAGIC = 0xFD2FB528
const DEFAULT_MIN_BYTES = 1024 * 1024
const DEFAULT_THRESHOLD = 0.5
const DEFAULT_TOP = 10

const USAGE = `长会话输出退化扫描 — 读 DSH 会话日志，量模型是否已经在「打转」。

用法：
  node session-degeneration-scan.mjs <session.v3.jsonl.zstd>
  node session-degeneration-scan.mjs --root <dir> [--min-size 1MB]

选项：
  --root <dir>        递归扫该目录下所有 *.jsonl.zstd
  --min-size <size>   跨会话模式的最小文件（默认 1MB，支持 500KB 写法）
  --threshold <0-1>   重复率告警阈值（默认 0.5）
  --top <n>           报告列出的条目数（默认 10）
  --json              输出 JSON
  --help              显示本说明

退出码：0 = 未越线；1 = 有会话越线；2 = 用法错误或读取失败。
判据与背景见文件头注释。`

/**
 * 解析 `1MB` / `500KB` / 纯字节数。
 * @param {string} raw - 用户输入的大小。
 * @returns {number} 字节数。
 */
function parseSize(raw) {
  const match = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i.exec(raw.trim())
  if (match === null) throw new Error(`无法解析大小: ${raw}`)
  const scale = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[(match[2] ?? 'B').toLowerCase()]
  return Math.floor(Number(match[1]) * scale)
}

/** 解析命令行参数。 */
function parseArgs(argv) {
  const options = {
    file: undefined, root: undefined,
    minBytes: DEFAULT_MIN_BYTES, threshold: DEFAULT_THRESHOLD,
    top: DEFAULT_TOP, json: false, help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--json') options.json = true
    else if (arg === '--root') options.root = argv[++i]
    else if (arg === '--min-size') options.minBytes = parseSize(argv[++i] ?? '')
    else if (arg === '--threshold') options.threshold = Number(argv[++i])
    else if (arg === '--top') options.top = Number(argv[++i])
    else if (arg.startsWith('-')) throw new Error(`未知选项: ${arg}`)
    else if (options.file === undefined) options.file = arg
    else throw new Error(`多余的参数: ${arg}`)
  }
  if (options.root === undefined && options.file === undefined && !options.help) {
    throw new Error('需要给出会话文件，或用 --root 指定会话目录')
  }
  return options
}

/**
 * 定位拼接 zstd 流里的完整帧边界，不展开块内容。
 * 复制自 DSH 的 `scanZstdFrames`（见文件头注释的来源说明）。
 * @param {Buffer} buffer - 会话日志的全部字节。
 * @returns {{frames: {start: number, end: number}[], tornStart?: number}}
 */
function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return { frames, tornStart: start }
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`会话日志损坏：偏移 ${offset} 处不是 zstd 帧魔数`)
    }
    offset += 4
    if (offset === buffer.length) return { frames, tornStart: start }
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) throw new Error(`帧头保留位异常：偏移 ${offset - 1}`)
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start }
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) throw new Error(`块类型保留值异常：偏移 ${offset - 3}`)
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start }
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return { frames }
}

/**
 * 读一个会话日志并解析出事件数组。
 * @param {string} file - `session.v3.jsonl.zstd`（或旧版 `session.jsonl.zstd`）路径。
 * @returns {{events: unknown[], frames: number, plainBytes: number, badLines: number}}
 */
function readSession(file) {
  const bytes = readFileSync(file)
  const { frames } = scanZstdFrames(bytes)
  const plain = frames.map(frame => zstdDecompressSync(bytes.subarray(frame.start, frame.end)))
  const text = Buffer.concat(plain).toString('utf8')
  const events = []
  let badLines = 0
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try { events.push(JSON.parse(line)) } catch { badLines += 1 }
  }
  return { events, frames: frames.length, plainBytes: Buffer.byteLength(text), badLines }
}

/** 取流式条目里 `texts` 数组拼成的文本（`reasoning-chunks` / `text-chunks`）。 */
function streamText(stream, wanted) {
  if (!Array.isArray(stream)) return ''
  const out = []
  for (const entry of stream) {
    if (entry?.type !== wanted) continue
    for (const piece of entry.texts ?? []) if (typeof piece === 'string') out.push(piece)
  }
  return out.join('')
}

/**
 * 量一条输出的行级重复度。
 * @param {string} text - 拼接好的输出文本。
 * @returns {{ratio: number, units: number, top: [string, number][]}|null} 单元太少时返回 null。
 */
function repeatProfile(text) {
  const units = text.split(/[\n。！？!?]/).map(unit => unit.trim()).filter(unit => unit !== '')
  if (units.length < 20) return null
  const counts = new Map()
  for (const unit of units) counts.set(unit, (counts.get(unit) ?? 0) + 1)
  let repeated = 0
  for (const [, count] of counts) if (count >= 3) repeated += count
  const top = [...counts].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).slice(0, 3)
  return { ratio: repeated / units.length, units: units.length, top }
}

/**
 * 分析一个会话：事件普查、压力轨迹、重复率越线点、压缩事件。
 * @param {string} file - 日志路径。
 * @param {{threshold: number, top: number}} options - 告警阈值与列出条数。
 * @returns {object} 结构化报告。
 */
function analyze(file, options) {
  const started = Date.now()
  const { events, frames, plainBytes, badLines } = readSession(file)

  const census = new Map()
  const pressures = []
  const repetitions = []
  const compactions = []
  let window = null
  let model = null
  let reasoningCount = 0

  for (const event of events) {
    const type = event.type ?? '(header)'
    census.set(type, (census.get(type) ?? 0) + 1)
    if (type === 'request/context') {
      window = event.data?.contextWindow ?? window
      model = event.data?.model ?? model
      continue
    }
    if (type === 'compaction/start' || type === 'compaction/end') {
      compactions.push({ type, seq: event.seq })
      continue
    }
    if (type !== 'assistant/message') continue

    const usage = event.data?.usage
    if (usage !== undefined) {
      pressures.push({
        turn: event.data?.turn, step: event.data?.step, seq: event.seq,
        tokens: usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
      })
    }
    const reasoning = streamText(event.data?.stream, 'reasoning-chunks')
    if (reasoning === '') continue
    reasoningCount += 1
    const profile = repeatProfile(reasoning)
    if (profile === null) continue
    repetitions.push({
      turn: event.data?.turn, step: event.data?.step, seq: event.seq,
      ratio: profile.ratio, units: profile.units, top: profile.top,
      chars: reasoning.length,
      tokens: pressures.at(-1)?.tokens ?? null,
    })
  }

  const peakPressure = pressures.reduce((best, row) => (best === null || row.tokens > best.tokens ? row : best), null)
  const peakRepeat = repetitions.reduce((best, row) => (best === null || row.ratio > best.ratio ? row : best), null)
  const firstOver = repetitions.find(row => row.ratio >= options.threshold) ?? null
  // 越线点里最早的那个（repetitions 已按日志顺序积累）
  const crossings = repetitions.filter(row => row.ratio >= options.threshold)

  return {
    file,
    name: basename(join(file, '..')),
    fileBytes: statSync(file).size,
    frames, plainBytes, badLines, events: events.length,
    model, window,
    threshold: options.threshold,
    assistantMessages: census.get('assistant/message') ?? 0,
    reasoningCount,
    elapsedMs: Date.now() - started,
    census: [...census].sort((a, b) => b[1] - a[1]),
    compactions,
    peakPressure,
    peakRepeat,
    firstOver,
    crossings: crossings.length,
    windowShare: window !== null && peakPressure !== null ? peakPressure.tokens / window : null,
    thresholdTokens: window === null ? null : Math.floor(window * 0.8),
    topPressures: pressures.slice().sort((a, b) => b.tokens - a.tokens).slice(0, options.top),
    topRepeats: repetitions.slice().sort((a, b) => b.ratio - a.ratio).slice(0, options.top),
    note: reasoningCount === 0 ? 'no-reasoning（该日志没有推理文本，本判据不适用）' : null,
  }
}

/** 百分比格式化。 */
const pct = (ratio) => `${(ratio * 100).toFixed(0)}%`
/** 千分位格式化。 */
const num = (value) => value.toLocaleString('en-US')

/** 渲染单会话报告。 */
function renderSingle(report) {
  const lines = []
  lines.push(`会话      ${report.name}`)
  lines.push(`文件      ${report.file}`)
  lines.push(`规模      ${(report.fileBytes / 1048576).toFixed(2)} MB → ${(report.plainBytes / 1048576).toFixed(2)} MB 明文，${report.frames} 帧，${report.events} 条事件${report.badLines > 0 ? `（${report.badLines} 行解析失败）` : ''}`)
  lines.push(`模型/窗口 ${report.model ?? '(未知)'} / ${report.window === null ? '(日志未记录)' : num(report.window)}`)
  lines.push(`assistant ${report.assistantMessages} 条，其中带推理 ${report.reasoningCount} 条`)
  if (report.note !== null) lines.push(`注意      ${report.note}`)

  lines.push('')
  lines.push('── 事件普查（前 12） ──')
  for (const [type, count] of report.census.slice(0, 12)) {
    lines.push(`  ${String(count).padStart(7)}  ${type}`)
  }

  lines.push('')
  lines.push('── 上下文压力 ──')
  if (report.peakPressure === null) {
    lines.push('  日志里没有 usage 记录')
  } else {
    const share = report.windowShare === null ? '' : `（占窗口 ${pct(report.windowShare)}）`
    lines.push(`  峰值 ${num(report.peakPressure.tokens)} token ${share}  @ t${report.peakPressure.turn}/s${report.peakPressure.step}`)
    if (report.thresholdTokens !== null) {
      lines.push(`  自动压缩阈值（0.8 × 窗口）= ${num(report.thresholdTokens)} token`)
      const gap = report.thresholdTokens - report.peakPressure.tokens
      lines.push(`  峰值距阈值 ${num(Math.abs(gap))} token ${gap >= 0 ? '（未触发压缩）' : '（已越过）'}`)
    }
    lines.push('  最高的几个压力点：')
    for (const row of report.topPressures) {
      const share = report.window === null ? '' : `  ${(row.tokens / report.window * 100).toFixed(1)}%`
      lines.push(`    t${String(row.turn).padStart(3)}/s${row.step}  ${num(row.tokens).padStart(9)} token${share}`)
    }
  }

  lines.push('')
  lines.push('── 推理重复率 ──')
  if (report.peakRepeat === null) {
    lines.push('  样本不足（没有足够长的推理输出可判定）')
  } else {
    lines.push(`  峰值 ${pct(report.peakRepeat.ratio)}  @ t${report.peakRepeat.turn}/s${report.peakRepeat.step}${report.peakRepeat.tokens === null ? '' : `  ${num(report.peakRepeat.tokens)} token`}`)
    lines.push(`  越线（≥${pct(report.threshold)}）次数：${report.crossings}`)
    if (report.firstOver !== null && report.firstOver.tokens !== null) {
      lines.push(`  最早越线 @ ${num(report.firstOver.tokens)} token`)
    }
    lines.push('  最高的几条：')
    for (const row of report.topRepeats) {
      const tokens = row.tokens === null ? '' : `  ${num(row.tokens).padStart(9)} token`
      lines.push(`    t${String(row.turn).padStart(3)}/s${row.step}  ${pct(row.ratio).padStart(4)}  (${row.units} 单元)${tokens}`)
      for (const [unit, count] of row.top) {
        lines.push(`          ×${String(count).padStart(3)}  ${unit.slice(0, 60)}`)
      }
    }
  }

  if (report.compactions.length > 0) {
    lines.push('')
    lines.push('── 压缩事件 ──')
    for (const row of report.compactions) lines.push(`  seq ${String(row.seq).padStart(5)}  ${row.type}`)
  }

  lines.push('')
  lines.push(`扫描耗时 ${report.elapsedMs} ms`)
  return lines.join('\n')
}

/** 渲染跨会话汇总。 */
function renderSurvey(reports, options) {
  const lines = []
  lines.push(`扫描 ${reports.length} 个会话（≥ ${(options.minBytes / 1048576).toFixed(1)} MB）`)
  lines.push('')
  lines.push('会话                          消息   推理   峰值重复   越线  峰值压力        窗口占比')
  lines.push('─'.repeat(96))
  for (const report of reports) {
    const repeat = report.peakRepeat === null ? '   n/a' : `  ${pct(report.peakRepeat.ratio).padStart(4)}`
    const pressure = report.peakPressure === null ? '        n/a' : `${num(report.peakPressure.tokens).padStart(11)}`
    const share = report.windowShare === null ? '   n/a' : `${(report.windowShare * 100).toFixed(1)}%`
    lines.push(
      `${report.name.slice(0, 28).padEnd(29)} ${String(report.assistantMessages).padStart(5)} ${String(report.reasoningCount).padStart(6)}`
      + `  ${repeat}  ${String(report.crossings).padStart(4)}  ${pressure}  ${share.padStart(8)}`
      + `${report.note === null ? '' : '  [no-reasoning]'}`,
    )
  }

  const crossed = reports.filter(report => report.crossings > 0)
  lines.push('')
  if (crossed.length === 0) {
    lines.push(`没有任何会话越线（阈值 ${pct(options.threshold)}）。`)
  } else {
    lines.push(`越线会话（阈值 ${pct(options.threshold)}）：`)
    for (const report of crossed) {
      const first = report.firstOver?.tokens
      lines.push(`  ${report.name.slice(0, 28).padEnd(29)} 峰值 ${pct(report.peakRepeat.ratio)}` +
        `${first === undefined || first === null ? '' : `，最早越线 @ ${num(first)} token`}` +
        `${report.window === null ? '' : `（窗口 ${num(report.window)}）`}`)
    }
  }
  const noReasoning = reports.filter(report => report.note !== null).length
  if (noReasoning > 0) {
    lines.push('')
    lines.push(`注意：${noReasoning} 个会话没有推理文本（多为旧格式日志），本判据对它们不适用——`)
    lines.push('      扫不出来不等于没问题。')
  }
  return lines.join('\n')
}

/** 递归收集候选日志。 */
function collectLogs(root, minBytes) {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.jsonl.zstd') && statSync(path).size >= minBytes) found.push(path)
    }
  }
  walk(root)
  return found.sort()
}

function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`参数错误：${error.message}`)
    console.error('')
    console.error(USAGE)
    process.exit(2)
  }
  if (options.help) {
    console.log(USAGE)
    process.exit(0)
  }

  const files = options.root === undefined ? [options.file] : collectLogs(options.root, options.minBytes)
  if (files.length === 0) {
    console.error(`没有找到符合条件的会话日志${options.root === undefined ? '' : `（root=${options.root}，min-size=${options.minBytes}）`}`)
    process.exit(2)
  }

  const reports = []
  for (const file of files) {
    try {
      reports.push(analyze(file, options))
    } catch (error) {
      reports.push({ file, name: basename(join(file, '..')), error: String(error.message ?? error) })
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ options: { threshold: options.threshold, minBytes: options.minBytes }, reports }, null, 2))
  } else if (options.root === undefined) {
    console.log(renderSingle(reports[0]))
  } else {
    console.log(renderSurvey(reports, options))
  }

  const failed = reports.filter(report => report.error !== undefined)
  if (failed.length > 0) {
    console.error('')
    console.error('以下会话读取失败：')
    for (const report of failed) console.error(`  ${report.name}: ${report.error}`)
  }
  const crossed = reports.some(report => (report.crossings ?? 0) > 0)
  process.exit(crossed ? 1 : 0)
}

main()
