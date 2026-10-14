/**
 * 测量 4（修正版，字段已核对）：分离「用户点名」「任务类型」「压力」「压缩」四个因素。
 *
 * 已核对的字段（别再取错）：
 *   user/message  → data.content 是消息块数组 [{type:'text',text:...}]，data 里**没有** message 字段
 *   user/message  → data 里**没有** turn；turn 归属靠 seq：最后一个 seq 更小的 turn/start
 *   tool/call     → 有 data.turn / data.step / data.name / data.arguments
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
const textOf = (d) => (Array.isArray(d?.content) ? d.content : []).map(c => c.text ?? '').join(' ')

// 触发词：用户显式点名某类技能
const TRIGGERS = [/提交|commit|推送/i, /日报|周报/, /设计文档|设计方案|写方案|原型/, /代码审查|review|审查/, /拉取|pull|同步代码/i, /整理代码|加注释/,
  /更新文档|更新 ?AGENTS|同步文档/i, /pptx|ppt|幻灯片|演示/, /做成图片|发群里|导出 ?PDF|做成 ?PDF/i, /架构图|活点地图|链路图/, /剧本杀/, /台账|判据|能发吗|能交付/]
// 任务类型（粗分，用于看是否只有某类任务在长会话里消失）
const TASK = [[/提交|commit|推送|发版|部署|jenkins|构建/i, '交付/发版'], [/文档|方案|设计|报告|日报|周报|ppt|幻灯片|pdf|图片/i, '文档/报告'],
  [/代码|接口|字段|bug|报错|编译|测试|重构|实现|排查/i, '编码/排查'], [/查|看看|有没有|多少|状态|进度|列表/i, '查询/核对']]

const rows = []
for (const file of walk(root)) {
  let size = 0
  try { size = statSync(file).size } catch { continue }
  if (size < minSize) continue
  let evs
  try { evs = readEvents(file) } catch { continue }
  if (!evs.length) continue

  // 先建 turn 起点表
  const turnStarts = []   // {turn, seq}
  for (const e of evs) if (e.type === 'turn/start') turnStarts.push({ turn: e.data.turn, seq: e.seq })
  if (turnStarts.length < MIN_ROUNDS) continue
  const turnOfSeq = (seq) => { let t = null; for (const ts of turnStarts) { if (ts.seq < seq) t = ts.turn; else break } return t }

  const info = new Map()   // turn -> {...}
  for (const ts of turnStarts) info.set(ts.turn, { pressure: 0, calls: [], startSeq: ts.seq, userText: '', comps: 0 })
  const compSeqs = []
  for (const e of evs) {
    if (e.type === 'compaction/start') compSeqs.push(e.seq)
    else if (e.type === 'assistant/message' && e.data?.usage) {
      const u = e.data.usage
      const p = (u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0)
      const it = info.get(e.data.turn); if (it) it.pressure = Math.max(it.pressure, p)
    } else if (e.type === 'tool/call') {
      const it = info.get(e.data.turn); if (it) it.calls.push(e.data.name)
    } else if (e.type === 'user/message' && e.data?.source?.kind === 'user') {
      const t = turnOfSeq(e.seq)
      const it = info.get(t)
      if (it) it.userText += ' ' + textOf(e.data)
    }
  }

  const list = [...info.entries()].filter(([, i]) => i.pressure > 0).sort((a, b) => a[0] - b[0])
  const N = list.length
  if (N < MIN_ROUNDS) continue
  list.forEach(([turn, i], idx) => {
    const task = (TASK.find(([re]) => re.test(i.userText)) ?? [null, '(未分类)'])[1]
    rows.push({
      roundsInSession: N,
      relPos: idx / (N - 1),
      pressure: i.pressure,
      calledSkill: i.calls.includes('skill'),
      calledOther: i.calls.filter(n => n !== 'skill').length,
      compactionsBefore: compSeqs.filter(s => s <= i.startSeq).length,
      userNamed: TRIGGERS.some(re => re.test(i.userText)),
      hasUserText: i.userText.trim().length > 0,
      task,
    })
  })
}

const rate = (rs) => rs.length ? rs.filter(r => r.calledSkill).length / rs.length : 0
const pct = (x) => (x * 100).toFixed(2) + '%'
const avg = (rs, f) => rs.length ? rs.reduce((a, b) => a + f(b), 0) / rs.length : 0
const totalCalls = rows.filter(r => r.calledSkill).length

console.log(`=== 样本：≥${MIN_ROUNDS} 轮会话，${rows.length} 轮，skill 调用 ${totalCalls} 次 ===`)
console.log(`    其中有真人输入文本的轮次：${rows.filter(r => r.hasUserText).length} 轮\n`)

// ═══ 1. 用户点名 ═══
console.log('=== 表 1：用户是否显式点名 ═══')
const named = rows.filter(r => r.userNamed), unnamed = rows.filter(r => !r.userNamed)
const namedCalls = named.filter(r => r.calledSkill).length
console.log(`  点名轮次 ${named.length} 轮 → 调用率 ${pct(rate(named))}（贡献 ${namedCalls}/${totalCalls} 次调用，占 ${pct(namedCalls / totalCalls)}）`)
console.log(`  未点名   ${unnamed.length} 轮 → 调用率 ${pct(rate(unnamed))}（贡献 ${totalCalls - namedCalls}/${totalCalls} 次，占 ${pct((totalCalls - namedCalls) / totalCalls)}）`)

const CBINS = [[0, 100_000, '<100k'], [100_000, 200_000, '100-200k'], [200_000, 300_000, '200-300k'], [300_000, 500_000, '300-500k'], [500_000, 700_000, '500-700k'], [700_000, Infinity, '>700k']]

// ═══ 2. 只未点名，压力效应 ═══
console.log('\n=== 表 2：只用【用户未点名】的轮次，按压力 ===')
console.log('压力            轮数   skill调用率   平均位置   普通工具/轮')
console.log('─'.repeat(68))
for (const [lo, hi, label] of CBINS) {
  const rs = unnamed.filter(r => r.pressure >= lo && r.pressure < hi)
  if (!rs.length) continue
  console.log(label.padEnd(15) + String(rs.length).padStart(5) + '  ' + pct(rate(rs)).padStart(10) + '  ' + (avg(rs, r => r.relPos) * 100).toFixed(0).padStart(8) + '%  ' + avg(rs, r => r.calledOther).toFixed(2).padStart(11))
}

// ═══ 3. 未点名 + 开头 25%（位置固定）═══
console.log('\n=== 表 3：未点名 且 位置在会话开头 25%（位置固定，看压力的独立效应）===')
const head = unnamed.filter(r => r.relPos < .25)
console.log(`样本 ${head.length} 轮\n压力            轮数   skill调用率`)
console.log('─'.repeat(40))
for (const [lo, hi, label] of CBINS) {
  const rs = head.filter(r => r.pressure >= lo && r.pressure < hi)
  if (!rs.length) continue
  console.log(label.padEnd(15) + String(rs.length).padStart(5) + '  ' + pct(rate(rs)).padStart(10))
}

// ═══ 4. 任务类型分层 ═══
console.log('\n=== 表 4：按【用户消息的任务类型】分层，看各类任务在长会话里是否消失 ===')
console.log('任务类型        轮数   平均压力   skill调用率   普通工具/轮   来自会话数')
console.log('─'.repeat(80))
for (const [, label] of TASK) {
  const rs = rows.filter(r => r.task === label)
  if (!rs.length) continue
  console.log(label.padEnd(15) + String(rs.length).padStart(5) + '  ' + (avg(rs, r => r.pressure) / 1000).toFixed(0).padStart(7) + 'k  ' + pct(rate(rs)).padStart(10) + '  ' + avg(rs, r => r.calledOther).toFixed(2).padStart(11) + '  ' + String(new Set(rs.map(r => r.roundsInSession)).size).padStart(10))
}
const un = rows.filter(r => r.task === '(未分类)')
console.log('(未分类)'.padEnd(15) + String(un.length).padStart(5) + '  ' + (avg(un, r => r.pressure) / 1000).toFixed(0).padStart(7) + 'k  ' + pct(rate(un)).padStart(10))

// ═══ 5. 任务类型固定后，压力效应 ═══
console.log('\n=== 表 5：固定任务类型（取样本最多的两类），看压力效应是否仍在 ===')
for (const label of ['交付/发版', '文档/报告', '编码/排查']) {
  const rs0 = rows.filter(r => r.task === label)
  if (rs0.length < 60) continue
  console.log(`\n  【${label}】共 ${rs0.length} 轮`)
  console.log('  压力            轮数   skill调用率')
  for (const [lo, hi, lab] of CBINS) {
    const rs = rs0.filter(r => r.pressure >= lo && r.pressure < hi)
    if (rs.length < 10) continue
    console.log('  ' + lab.padEnd(15) + String(rs.length).padStart(5) + '  ' + pct(rate(rs)).padStart(10))
  }
}

// ═══ 6. 压缩的独立效应（格子内比较）═══
console.log('\n=== 表 6：压缩的独立效应（位置×压力 格子内：未压缩 vs 已压缩）===')
const PB = [[0, .25, '<25%'], [.25, .6, '25-60%'], [.6, 1.01, '>60%']]
const CB = [[0, 200_000, '<200k'], [200_000, 400_000, '200-400k'], [400_000, 600_000, '400-600k'], [600_000, Infinity, '>600k']]
console.log('位置      压力        未压缩过            已压缩过')
console.log('─'.repeat(66))
let a0 = [], a1 = []
for (const [plo, phi, pl] of PB) for (const [clo, chi, cl] of CB) {
  const cell = rows.filter(r => r.relPos >= plo && r.relPos < phi && r.pressure >= clo && r.pressure < chi)
  const A = cell.filter(r => r.compactionsBefore === 0), B = cell.filter(r => r.compactionsBefore > 0)
  a0.push(...A); a1.push(...B)
  if (cell.length < 10) continue
  console.log(pl.padEnd(9) + cl.padEnd(12) + (A.length ? `${pct(rate(A))} (${A.length})` : '—').padEnd(20) + (B.length ? `${pct(rate(B))} (${B.length})` : '—'))
}
console.log(`\n  合计：未压缩 ${a0.length} 轮 → ${pct(rate(a0))}    已压缩 ${a1.length} 轮 → ${pct(rate(a1))}`)
