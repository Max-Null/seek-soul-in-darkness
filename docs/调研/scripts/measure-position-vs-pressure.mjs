/**
 * 测量 2：排掉「任务位置」这个混杂因素。
 *
 * 假说 H：skill 调用集中在任务开头（任务开始时人/模型才决定要用哪个 skill），
 *         与上下文压力无关。若成立，则按「会话内位置」分箱应看到单调下降，
 *         而按「压力」分箱看到的相关是伪相关。
 *
 * 做法：
 *   变量 A = 会话内归一化位置（该轮序号 / 该会话总轮数）
 *   变量 B = 上下文压力
 *   分别分箱看 skill 调用率；再用「位置 x 压力」二维交叉表看压力是否仍有独立效应。
 *
 * 运行：<node24> measure-position-vs-pressure.mjs --root <会话根> --json <in.json>
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { join } from 'node:path'

const argv = process.argv
const root = argv[argv.indexOf('--root') + 1]
const minSize = Number(argv[argv.indexOf('--min-size') + 1] || 300_000)

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

const rows = []   // {file, turn, relPos, pressure, calledSkill, calledOther, roundsInSession, compactedBefore}
for (const file of walk(root)) {
  let size = 0
  try { size = statSync(file).size } catch { continue }
  if (size < minSize) continue
  let evs
  try { evs = readEvents(file) } catch { continue }
  if (!evs.length) continue

  const turns = new Map()
  const compSeqs = []
  for (const e of evs) {
    if (e.type === 'compaction/start') compSeqs.push(e.seq)
    if (e.type === 'turn/start') { if (!turns.has(e.data.turn)) turns.set(e.data.turn, { pressure: 0, calls: [], startSeq: e.seq }) }
    else if (e.type === 'assistant/message' && e.data?.usage) {
      const u = e.data.usage
      const p = (u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0)
      if (turns.has(e.data.turn)) turns.get(e.data.turn).pressure = Math.max(turns.get(e.data.turn).pressure, p)
    } else if (e.type === 'tool/call') {
      if (turns.has(e.data.turn)) turns.get(e.data.turn).calls.push(e.data.name)
    }
  }
  const list = [...turns.entries()].filter(([, i]) => i.pressure > 0).sort((a, b) => a[0] - b[0])
  const N = list.length
  if (N === 0) continue
  list.forEach(([turn, info], idx) => {
    rows.push({
      file: file.replace(root, ''),
      turn,
      relPos: N === 1 ? 0 : idx / (N - 1),
      pressure: info.pressure,
      calledSkill: info.calls.includes('skill'),
      calledOther: info.calls.filter(n => n !== 'skill').length,
      roundsInSession: N,
      compactionsBefore: compSeqs.filter(s => s <= info.startSeq).length,
    })
  })
}

const rate = (rs) => rs.length ? rs.filter(r => r.calledSkill).length / rs.length : 0
const pct = (x) => (x * 100).toFixed(2) + '%'

console.log(`总轮数 ${rows.length}，skill 调用 ${rows.filter(r => r.calledSkill).length} 次\n`)

// ═══ 单变量 A：会话内位置 ═══
console.log('=== 表 A：按【会话内位置】分箱 ===')
const PBINS = [[0, .1, '开头 0-10%'], [.1, .25, '10-25%'], [.25, .5, '25-50%'], [.5, .75, '50-75%'], [.75, .9, '75-90%'], [.9, 1.01, '结尾 90-100%']]
console.log('位置            轮数   skill调用率   平均压力    普通工具/轮')
console.log('─'.repeat(72))
for (const [lo, hi, label] of PBINS) {
  const rs = rows.filter(r => r.relPos >= lo && r.relPos < hi)
  if (!rs.length) continue
  const avgP = rs.reduce((a, b) => a + b.pressure, 0) / rs.length
  const avgO = rs.reduce((a, b) => a + b.calledOther, 0) / rs.length
  console.log(label.padEnd(15) + String(rs.length).padStart(5) + '  ' + pct(rate(rs)).padStart(10) + '  ' + (avgP / 1000).toFixed(0).padStart(8) + 'k  ' + avgO.toFixed(2).padStart(11))
}

// ═══ 单变量 B：压力 ═══
console.log('\n=== 表 B：按【上下文压力】分箱 ===')
const CBINS = [[0, 100_000, '<100k'], [100_000, 200_000, '100-200k'], [200_000, 300_000, '200-300k'], [300_000, 500_000, '300-500k'], [500_000, 700_000, '500-700k'], [700_000, Infinity, '>700k']]
console.log('压力            轮数   skill调用率   平均位置    普通工具/轮')
console.log('─'.repeat(72))
for (const [lo, hi, label] of CBINS) {
  const rs = rows.filter(r => r.pressure >= lo && r.pressure < hi)
  if (!rs.length) continue
  const avgPos = rs.reduce((a, b) => a + b.relPos, 0) / rs.length
  const avgO = rs.reduce((a, b) => a + b.calledOther, 0) / rs.length
  console.log(label.padEnd(15) + String(rs.length).padStart(5) + '  ' + pct(rate(rs)).padStart(10) + '  ' + (avgPos * 100).toFixed(0).padStart(9) + '%  ' + avgO.toFixed(2).padStart(11))
}

// ═══ 二维交叉：位置 x 压力 ═══
console.log('\n=== 表 C【关键】：位置 × 压力 交叉表（格子里是 skill 调用率 / 轮数）===')
const PL = PBINS.map(b => b[2])
const CL = CBINS.map(b => b[2])
const w = 18
console.log('压力＼位置'.padEnd(14) + PL.map(l => l.padStart(w)).join(''))
console.log('─'.repeat(14 + w * PL.length))
for (const [clo, chi, clabel] of CBINS) {
  let line = clabel.padEnd(14)
  for (const [plo, phi] of PBINS) {
    const rs = rows.filter(r => r.relPos >= plo && r.relPos < phi && r.pressure >= clo && r.pressure < chi)
    line += (rs.length === 0 ? '—' : `${pct(rate(rs))} (${rs.length})`).padStart(w)
  }
  console.log(line)
}

// ═══ 只在「会话开头」内看压力效应（把位置固定住）═══
console.log('\n=== 表 D：只取会话开头 25% 的轮次，再按压力分箱（位置固定，看压力独立效应）===')
const head = rows.filter(r => r.relPos < .25)
console.log(`开头 25% 共 ${head.length} 轮\n`)
console.log('压力            轮数   skill调用率')
console.log('─'.repeat(40))
for (const [lo, hi, label] of CBINS) {
  const rs = head.filter(r => r.pressure >= lo && r.pressure < hi)
  if (!rs.length) continue
  console.log(label.padEnd(15) + String(rs.length).padStart(5) + '  ' + pct(rate(rs)).padStart(10))
}

// ═══ 只在「高压力」内看位置效应 ═══
console.log('\n=== 表 E：只取高压力(>500k)的轮次，再按位置分箱（压力固定，看位置独立效应）===')
const hi = rows.filter(r => r.pressure > 500_000)
console.log(`高压力共 ${hi.length} 轮\n`)
console.log('位置            轮数   skill调用率')
console.log('─'.repeat(40))
for (const [lo, hi2, label] of PBINS) {
  const rs = hi.filter(r => r.relPos >= lo && r.relPos < hi2)
  if (!rs.length) continue
  console.log(label.padEnd(15) + String(rs.length).padStart(5) + '  ' + pct(rate(rs)).padStart(10))
}

// ═══ 压缩前后对比 ═══
console.log('\n=== 表 F：该轮之前是否发生过压缩 ===')
for (const [cond, label] of [[r => r.compactionsBefore === 0, '未压缩过'], [r => r.compactionsBefore > 0, '已压缩过']]) {
  const rs = rows.filter(cond)
  console.log(`  ${label.padEnd(10)} ${String(rs.length).padStart(5)} 轮  skill调用率 ${pct(rate(rs))}  平均压力 ${(rs.reduce((a, b) => a + b.pressure, 0) / rs.length / 1000).toFixed(0)}k`)
}
