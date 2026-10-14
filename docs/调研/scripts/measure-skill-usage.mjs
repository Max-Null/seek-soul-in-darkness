/**
 * 测量：skill 使用率 vs 上下文长度。
 *
 * 设计要点
 * ────────
 * ① 会话内分箱（核心）。不在会话之间比，而是在**同一个会话内部**按上下文压力分箱，
 *    看每一轮「调用 skill 的概率」随压力怎么变。同一会话的任务类型固定，
 *    天然控制了「长会话任务不同」这个混杂因素。
 * ② 压力取该轮**最后一次** assistant/message 的 usage：
 *    inputTokens + cacheReadTokens + cacheWriteTokens（provider 上报的真实计数）。
 * ③ 目录距离：每次调用 skill 时，回看最近一条可见的 skill-catalog 消息在多少 turn 之前。
 *    这是对「目录越远越少用」这个假说的直接检验。
 * ④ 对照组：同一批轮次里，非 skill 的普通工具调用率随压力怎么变。
 *    若只有 skill 下降 → 目录远端化问题；若都下降 → 整体注意力/退化问题。
 *
 * 运行：<node24> measure-skill-usage.mjs --root <会话根> [--min-size 300000] [--json <out>]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { join } from 'node:path'

const argv = process.argv
const root = argv[argv.indexOf('--root') + 1]
const minSize = Number(argv[argv.indexOf('--min-size') + 1] || 300_000)
const jsonOut = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null

function readEvents(file) {
  const bytes = readFileSync(file)
  const M = [0x28, 0xb5, 0x2f, 0xfd]
  const st = []
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (bytes[i] === M[0] && bytes[i + 1] === M[1] && bytes[i + 2] === M[2] && bytes[i + 3] === M[3]) st.push(i)
  }
  st.push(bytes.length)
  let t = ''
  for (let k = 0; k < st.length - 1; k++) {
    try { t += zstdDecompressSync(bytes.subarray(st[k], st[k + 1])).toString('utf8') } catch {}
  }
  return t.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.jsonl.zstd')) out.push(p)
  }
  return out
}

// 已知的非 skill 自动化工具（用于对照组时排除，避免口径混乱）
const SKILL_TOOL = 'skill'

const sessions = []
const allRounds = []      // 每一轮一行：{file, turn, pressure, calledSkill, calledOther, catDist}

for (const file of walk(root)) {
  let size = 0
  try { size = statSync(file).size } catch { continue }
  if (size < minSize) continue
  let evs
  try { evs = readEvents(file) } catch { continue }
  if (!evs.length) continue

  // 该会话的 catalog 消息（可见性用 surface 近似：取全部 catalog 事件即可，
  // 压缩后旧 catalog 会被 shadow，但我们用「最近的 catalog seq」判断距离）
  const catalogSeqs = evs.filter(e => e.type === 'user/message' && e.data?.source?.kind === 'skill-catalog').map(e => e.seq)
  const compStart = evs.filter(e => e.type === 'compaction/start').map(e => e.seq)

  // 按 turn 聚合
  const turns = new Map()   // turn -> {pressure, calls: Set(toolName), startSeq}
  for (const e of evs) {
    if (e.type === 'turn/start') {
      const t = e.data.turn
      if (!turns.has(t)) turns.set(t, { pressure: 0, calls: [], startSeq: e.seq })
    } else if (e.type === 'assistant/message' && e.data?.usage) {
      const u = e.data.usage
      const p = (u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0)
      const t = e.data.turn
      if (turns.has(t)) turns.get(t).pressure = Math.max(turns.get(t).pressure, p)
    } else if (e.type === 'tool/call') {
      const t = e.data.turn
      if (turns.has(t)) turns.get(t).calls.push({ name: e.data.name, seq: e.seq })
    }
  }

  const sessRounds = []
  for (const [turn, info] of [...turns.entries()].sort((a, b) => a[0] - b[0])) {
    if (info.pressure <= 0) continue
    const calledSkill = info.calls.some(c => c.name === SKILL_TOOL)
    const otherCalls = info.calls.filter(c => c.name !== SKILL_TOOL).length
    // 目录距离：该轮开始时，最近的 catalog seq 在多少个事件之前（近似 turn 距离用 seq 差）
    const priorCats = catalogSeqs.filter(s => s <= info.startSeq)
    const catDist = priorCats.length ? info.startSeq - priorCats[priorCats.length - 1] : -1
    sessRounds.push({ turn, pressure: info.pressure, calledSkill, otherCalls, catDist, startSeq: info.startSeq })
    allRounds.push({ file: file.replace(root, ''), turn, pressure: info.pressure, calledSkill, otherCalls, catDist })
  }

  if (sessRounds.length) {
    sessions.push({
      file: file.replace(root, '').replace(/\\/g, '/'),
      sizeMB: +(size / 1048576).toFixed(1),
      rounds: sessRounds.length,
      skillCalls: sessRounds.filter(r => r.calledSkill).length,
      compactions: compStart.length,
      maxPressure: Math.max(...sessRounds.map(r => r.pressure)),
      roundsArr: sessRounds,
    })
  }
}

console.log(`扫描完成：${sessions.length} 个会话（≥${(minSize / 1024).toFixed(0)}KB），共 ${allRounds.length} 轮\n`)

// ═══ 表 1：会话总览 ═══
console.log('=== 表 1：会话总览（按轮数排序，只看有 skill 调用的）===')
console.log('会话                                                        轮数   skill调用  skill率  压缩次数  峰值压力')
console.log('─'.repeat(118))
const withSkill = sessions.filter(s => s.skillCalls > 0).sort((a, b) => b.rounds - a.rounds)
for (const s of withSkill) {
  console.log(
    s.file.split('/').pop().slice(0, 30).padEnd(32) +
    String(s.rounds).padStart(5) + '  ' +
    String(s.skillCalls).padStart(8) + '  ' +
    ((s.skillCalls / s.rounds * 100).toFixed(2) + '%').padStart(7) + '  ' +
    String(s.compactions).padStart(7) + '  ' +
    (s.maxPressure / 1000).toFixed(0).padStart(7) + 'k'
  )
}

// ═══ 表 2：会话内分箱（核心）═══
console.log('\n\n=== 表 2【核心】：会话内分箱 —— 同一会话内，调用率随上下文压力怎么变 ===')
const BINS = [
  [0, 50_000, '<50k'],
  [50_000, 100_000, '50-100k'],
  [100_000, 200_000, '100-200k'],
  [200_000, 300_000, '200-300k'],
  [300_000, 400_000, '300-400k'],
  [400_000, 500_000, '400-500k'],
  [500_000, 700_000, '500-700k'],
  [700_000, Infinity, '>700k'],
]
const bins = BINS.map(([lo, hi, label]) => ({ lo, hi, label, rounds: 0, skill: 0, otherCalls: 0, sessionsPresent: new Set() }))
for (const r of allRounds) {
  const b = bins.find(b => r.pressure >= b.lo && r.pressure < b.hi)
  if (!b) continue
  b.rounds++
  if (r.calledSkill) b.skill++
  b.otherCalls += r.otherCalls
  b.sessionsPresent.add(r.file)
}
console.log('压力区间         轮数    skill调用  skill调用率   普通工具调用/轮   涉及会话数')
console.log('─'.repeat(90))
for (const b of bins) {
  if (b.rounds === 0) continue
  console.log(
    b.label.padEnd(14) +
    String(b.rounds).padStart(6) + '  ' +
    String(b.skill).padStart(8) + '  ' +
    ((b.skill / b.rounds * 100).toFixed(2) + '%').padStart(10) + '  ' +
    (b.otherCalls / b.rounds).toFixed(2).padStart(14) + '  ' +
    String(b.sessionsPresent.size).padStart(9)
  )
}

// ═══ 表 3：目录距离 ═══
console.log('\n\n=== 表 3：调用 skill 时，最近的 skill 目录在多远之前（seq 距离）===')
const skillRounds = allRounds.filter(r => r.calledSkill && r.catDist >= 0)
const nonSkill = allRounds.filter(r => !r.calledSkill && r.catDist >= 0)
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
console.log(`  调用 skill 的轮次：${skillRounds.length} 轮，目录平均距离 ${avg(skillRounds.map(r => r.catDist)).toFixed(0)} seq`)
console.log(`  未调用 skill 的轮次：${nonSkill.length} 轮，目录平均距离 ${avg(nonSkill.map(r => r.catDist)).toFixed(0)} seq`)
console.log('\n  按目录距离分箱的调用率：')
const DBINS = [[0, 200, '很近(<200)'], [200, 1000, '近(200-1k)'], [1000, 5000, '中(1k-5k)'], [5000, 20000, '远(5k-20k)'], [20000, Infinity, '很远(>20k)']]
for (const [lo, hi, label] of DBINS) {
  const rs = allRounds.filter(r => r.catDist >= lo && r.catDist < hi)
  if (!rs.length) continue
  const sk = rs.filter(r => r.calledSkill).length
  console.log(`    ${label.padEnd(16)} ${String(rs.length).padStart(6)} 轮  skill调用率 ${(sk / rs.length * 100).toFixed(2)}%`)
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ sessions: sessions.map(s => ({ ...s, roundsArr: undefined })), bins: bins.map(b => ({ ...b, sessionsPresent: b.sessionsPresent.size })) }, null, 2))
  console.log(`\nJSON 已写入 ${jsonOut}`)
}
