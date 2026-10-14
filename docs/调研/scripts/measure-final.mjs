/**
 * 测量 3（最终版）：修掉前两版的两个偏差，并拆出「用户驱动」的成分。
 *
 * 修的偏差
 * ────────
 * ① 单轮会话污染：1 轮会话 = relPos 0 = 100% 调用率，把「开头」区间抬高。
 *    → 只统计 ≥5 轮的会话，且 relPos 用 (idx)/(N-1) 但排除 N<5。
 * ② 「开头效应」可能不是注意力，而是任务类型：会话第一轮用户往往直接点命 skill。
 *    → 拆出「用户显式点名」的轮次：从 user/message 文本里匹配 skill 触发词，
 *      分别统计「用户点名」与「用户没点名」两类轮次里模型的 skill 调用率。
 *      若后者也随压力下降，才是真正的注意力/可用性效应。
 *
 * 新增
 * ────
 * ③ 三维交叉：位置 × 压力 × 是否压缩过 —— 把压缩的独立效应从压力里剥出来。
 * ④ 会话规模分层：同样压力的轮次，在短会话 vs 长会话里调用率是否不同。
 *
 * 运行：<node24> measure-final.mjs --root <会话根> --min-size 300000
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { join } from 'node:path'

const argv = process.argv
const root = argv[argv.indexOf('--root') + 1]
const minSize = Number(argv[argv.indexOf('--min-size') + 1] || 300_000)
const MIN_ROUNDS = 5

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

// skill 触发词表：从会话里真实出现过的 skill 名字与它们的 description 关键词提炼。
// 只用于判断「用户这一轮是否显式要求了某个技能」。
const TRIGGERS = [
  /提交|commit|推送到|push/i,
  /日报|周报|进度报告/,
  /设计文档|设计方案|写方案|原型文档/,
  /代码审查|review|审查一下/,
  /拉取|pull 一下|拉一下|同步代码/,
  /整理代码|加注释|代码排序/,
  /更新文档|同步文档|更新 AGENTS/,
  /压缩 ppt|pptx|幻灯片|演示/,
  /做成图片|发群里|做成 ?PDF|导出 ?PDF/,
  /架构图|活点地图|链路图/,
  /剧本杀|开一局|带一局/,
  /台账|判据|能不能发|能交付吗/,
]

const rows = []
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
    if (e.type === 'turn/start') {
      if (!turns.has(e.data.turn)) turns.set(e.data.turn, { pressure: 0, calls: [], startSeq: e.seq, userText: '' })
    } else if (e.type === 'assistant/message' && e.data?.usage) {
      const u = e.data.usage
      const p = (u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0)
      if (turns.has(e.data.turn)) turns.get(e.data.turn).pressure = Math.max(turns.get(e.data.turn).pressure, p)
    } else if (e.type === 'tool/call') {
      if (turns.has(e.data.turn)) turns.get(e.data.turn).calls.push(e.data.name)
    } else if (e.type === 'user/message' && e.data?.source?.kind === 'user') {
      // 真人输入：归到它之后的那一轮
      const txt = (e.data.message?.content ?? []).map(c => c.text ?? '').join(' ')
      const t = e.data.turn ?? [...turns.keys()].pop()
      if (turns.has(t)) turns.get(t).userText += txt
    }
  }
  const list = [...turns.entries()].filter(([, i]) => i.pressure > 0).sort((a, b) => a[0] - b[0])
  const N = list.length
  if (N < MIN_ROUNDS) continue
  list.forEach(([turn, info], idx) => {
    rows.push({
      roundsInSession: N,
      relPos: idx / (N - 1),
      pressure: info.pressure,
      calledSkill: info.calls.includes('skill'),
      calledOther: info.calls.filter(n => n !== 'skill').length,
      compactionsBefore: compSeqs.filter(s => s <= info.startSeq).length,
      userNamed: TRIGGERS.some(re => re.test(info.userText)),
    })
  })
}

const rate = (rs) => rs.length ? rs.filter(r => r.calledSkill).length / rs.length : 0
const pct = (x) => (x * 100).toFixed(2) + '%'
const avg = (rs, f) => rs.length ? rs.reduce((a, b) => a + f(b), 0) / rs.length : 0

console.log(`=== 样本：≥${MIN_ROUNDS} 轮的会话，共 ${rows.length} 轮，skill 调用 ${rows.filter(r => r.calledSkill).length} 次 ===`)
console.log(`（对比：含单轮会话时是 2206 轮 —— 排除 ${2206 - rows.length} 个短会话轮次）\n`)

// ═══ 1. 用户是否显式点名 ═══
console.log('=== 表 1：拆出「用户显式点名」的成分 ===')
const named = rows.filter(r => r.userNamed)
const unnamed = rows.filter(r => !r.userNamed)
console.log(`  用户显式点名 skill 的轮次：${named.length} 轮，调用率 ${pct(rate(named))}`)
console.log(`  用户未点名的轮次：        ${unnamed.length} 轮，调用率 ${pct(rate(unnamed))}`)
const namedHits = named.filter(r => r.calledSkill).length
console.log(`  → 全部 ${rows.filter(r => r.calledSkill).length} 次调用中，${namedHits} 次发生在用户点名的轮次` +
  `（占调用总数 ${pct(namedHits / rows.filter(r => r.calledSkill).length)}，` +
  `占点名轮次的 ${pct(rate(named))}）`)

// ═══ 2. 只留「用户未点名」的轮次，看压力效应是否仍在 ═══
console.log('\n\n=== 表 2【核心】：只用【用户未点名】的轮次 —— 压力效应还剩多少 ===')
const CBINS = [[0, 100_000, '<100k'], [100_000, 200_000, '100-200k'], [200_000, 300_000, '200-300k'], [300_000, 500_000, '300-500k'], [500_000, 700_000, '500-700k'], [700_000, Infinity, '>700k']]
console.log('压力            轮数   skill调用率   平均位置')
console.log('─'.repeat(56))
for (const [lo, hi, label] of CBINS) {
  const rs = unnamed.filter(r => r.pressure >= lo && r.pressure < hi)
  if (!rs.length) continue
  console.log(label.padEnd(15) + String(rs.length).padStart(5) + '  ' + pct(rate(rs)).padStart(10) + '  ' + (avg(rs, r => r.relPos) * 100).toFixed(0).padStart(8) + '%')
}

// ═══ 3. 只用未点名 + 会话开头 25%（位置固定）═══
console.log('\n=== 表 3：未点名 且 位置固定在会话开头 25% ===')
const head = unnamed.filter(r => r.relPos < .25)
console.log(`样本 ${head.length} 轮\n`)
console.log('压力            轮数   skill调用率')
console.log('─'.repeat(40))
for (const [lo, hi, label] of CBINS) {
  const rs = head.filter(r => r.pressure >= lo && r.pressure < hi)
  if (!rs.length) continue
  console.log(label.padEnd(15) + String(rs.length).padStart(5) + '  ' + pct(rate(rs)).padStart(10))
}

// ═══ 4. 压缩的独立效应（同一位置 × 压力格子里比）═══
console.log('\n=== 表 4：压缩的独立效应 —— 在每个 位置×压力 格子内比较「未压缩过 vs 已压缩过」===')
const PB = [[0, .25, '<25%'], [.25, .6, '25-60%'], [.6, 1.01, '>60%']]
const CB = [[0, 200_000, '<200k'], [200_000, 400_000, '200-400k'], [400_000, 600_000, '400-600k'], [600_000, Infinity, '>600k']]
console.log('位置      压力        未压缩过              已压缩过')
console.log('─'.repeat(76))
let compNo = [], compYes = []
for (const [plo, phi, pl] of PB) {
  for (const [clo, chi, cl] of CB) {
    const cell = rows.filter(r => r.relPos >= plo && r.relPos < phi && r.pressure >= clo && r.pressure < chi)
    const a = cell.filter(r => r.compactionsBefore === 0)
    const b = cell.filter(r => r.compactionsBefore > 0)
    compNo.push(...a); compYes.push(...b)
    if (cell.length < 8) continue
    const fa = a.length ? `${pct(rate(a))} (${a.length})` : '—'
    const fb = b.length ? `${pct(rate(b))} (${b.length})` : '—'
    console.log(pl.padEnd(9) + cl.padEnd(12) + fa.padEnd(22) + fb)
  }
}
console.log(`\n  合计：未压缩过 ${compNo.length} 轮 → ${pct(rate(compNo))}   已压缩过 ${compYes.length} 轮 → ${pct(rate(compYes))}`)
console.log(`  （注：这两组的压力分布不同，格子内的比较才可信）`)

// ═══ 5. 会话规模分层 ═══
console.log('\n=== 表 5：会话规模分层 —— 相同压力下，短会话 vs 长会话 ===')
console.log('会话轮数        轮数   skill调用率   平均压力')
console.log('─'.repeat(56))
for (const [lo, hi, label] of [[5, 15, '5-15 轮'], [15, 40, '15-40 轮'], [40, 100, '40-100 轮'], [100, Infinity, '>100 轮']]) {
  const rs = rows.filter(r => r.roundsInSession >= lo && r.roundsInSession < hi)
  if (!rs.length) continue
  console.log(label.padEnd(15) + String(rs.length).padStart(5) + '  ' + pct(rate(rs)).padStart(10) + '  ' + (avg(rs, r => r.pressure) / 1000).toFixed(0).padStart(8) + 'k')
}

// ═══ 6. 只在高压力(>500k)里看会话规模 ═══
console.log('\n=== 表 6：只取高压力(>500k)轮次，按会话规模看 ===')
const hiP = rows.filter(r => r.pressure > 500_000)
console.log(`样本 ${hiP.length} 轮\n`)
console.log('会话轮数        轮数   skill调用率')
console.log('─'.repeat(40))
for (const [lo, hi2, label] of [[5, 40, '5-40 轮'], [40, 100, '40-100 轮'], [100, Infinity, '>100 轮']]) {
  const rs = hiP.filter(r => r.roundsInSession >= lo && r.roundsInSession < hi2)
  if (!rs.length) continue
  console.log(label.padEnd(15) + String(rs.length).padStart(5) + '  ' + pct(rate(rs)).padStart(10))
}
