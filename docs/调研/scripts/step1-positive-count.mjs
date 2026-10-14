/**
 * 步骤 1：统计每个 skill 的「真实正例」数量，据此挑选实验对象。
 *
 * 正例定义：某轮用户消息，且该轮模型**真的调用了** skill X（tool/call name=skill, arguments.name=X）。
 * 这些是有真值标签的评估样本。
 *
 * 输出：每个 skill 的正例数、正例文本示例、以及"仅点名未调用"的负例数。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

async function loadYaml() {
  for (const c of [String.raw`D:\Project\deepseek-harness\node_modules\yaml`,
    String.raw`${process.env.USERPROFILE}\AppData\Local\Programs\ssid-shell\resources\ssid-plugins\node_modules\yaml`]) {
    const pkg = join(c, 'package.json')
    if (!existsSync(pkg)) continue
    const meta = JSON.parse(readFileSync(pkg, 'utf8'))
    const entry = join(c, meta.module ?? meta.main ?? 'index.js')
    if (!existsSync(entry)) continue
    const mod = await import(pathToFileURL(entry).href)
    if (typeof mod.parse === 'function') return mod.parse
  }
  throw new Error('找不到 yaml')
}
const parse = await loadYaml()

// ── 全部 skill 的原始 description
const bases = [
  { src: 'pkg', dir: String.raw`${process.env.USERPROFILE}\AppData\Local\Programs\ssid-shell\resources\ssid-plugins\node_modules\@max-null\dsh-skills\skills` },
  { src: 'user', dir: String.raw`${process.env.USERPROFILE}\.dsh\skills` },
  { src: 'proj', dir: String.raw`D:\Project\ai-platform\.dsh\skills` },
]
const skills = []
for (const b of bases) {
  let dirs = []
  try { dirs = readdirSync(b.dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) } catch { continue }
  for (const d of dirs) {
    const p = join(b.dir, d, 'SKILL.md')
    let text
    try { text = readFileSync(p, 'utf8') } catch { continue }
    if (!text.startsWith('---')) continue
    const end = text.indexOf('\n---', 3)
    if (end === -1) continue
    let fm
    try { fm = parse(text.slice(4, end)) } catch { continue }
    if (!fm?.name || !fm?.description) continue
    skills.push({ name: fm.name, description: String(fm.description), path: p, src: b.src })
  }
}
const byName = new Map(skills.map(s => [s.name, s]))

// ── 从会话里取正例
function readEvents(file) {
  const bytes = readFileSync(file)
  const M = [0x28, 0xb5, 0x2f, 0xfd]
  const st = []
  for (let i = 0; i + 4 <= bytes.length; i++) if (bytes[i] === M[0] && bytes[i + 1] === M[1] && bytes[i + 2] === M[2] && bytes[i + 3] === M[3]) st.push(i)
  st.push(bytes.length)
  let t = ''
  for (let k = 0; k < st.length - 1; k++) { try { t += zstdDecompressSync(bytes.subarray(st[k], st[k + 1])).toString('utf8') } catch {} }
  return t.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.jsonl.zstd')) out.push(p)
  }
  return out
}

const root = process.argv[process.argv.indexOf('--root') + 1]
const positives = new Map()   // skillName -> [{text, file}]
const seenFiles = new Set()
for (const file of walk(root)) {
  let size = 0; try { size = statSync(file).size } catch { continue }
  if (size < 300_000) continue
  // 同一逻辑会话说多个格式副本（v3/v4）时去重：用会话目录名
  const sessKey = file.split('\\').slice(-2, -1)[0]
  let evs; try { evs = readEvents(file) } catch { continue }
  const turnStarts = []
  for (const e of evs) if (e.type === 'turn/start') turnStarts.push({ turn: e.data.turn, seq: e.seq })
  if (turnStarts.length < 5) continue
  const turnOfSeq = (seq) => { let t = null; for (const ts of turnStarts) { if (ts.seq < seq) t = ts.turn; else break } return t }
  const calls = new Map()
  for (const e of evs) if (e.type === 'tool/call') { if (!calls.has(e.data.turn)) calls.set(e.data.turn, []); calls.get(e.data.turn).push(e.data) }
  for (const e of evs) {
    if (e.type !== 'user/message' || e.data?.source?.kind !== 'user') continue
    const txt = (Array.isArray(e.data.content) ? e.data.content : []).map(c => c.text ?? '').join(' ').trim()
    if (!txt) continue
    const t = turnOfSeq(e.seq)
    for (const c of (calls.get(t) ?? [])) {
      if (c.name !== 'skill') continue
      let sn
      try { sn = JSON.parse(c.arguments).name } catch { continue }
      if (!byName.has(sn)) continue
      if (!positives.has(sn)) positives.set(sn, [])
      positives.get(sn).push({ text: txt.slice(0, 300), file: sessKey })
    }
  }
}

console.log('=== 每个 skill 的真实正例数（决定实验对象）===\n')
console.log('skill                         正例数   来自会话数')
console.log('─'.repeat(66))
const rows = [...positives.entries()].sort((a, b) => b[1].length - a[1].length)
for (const [n, list] of rows) {
  console.log(n.padEnd(30) + String(list.length).padStart(5) + '   ' + String(new Set(list.map(x => x.file)).size).padStart(8))
}
console.log(`\n合计 ${rows.reduce((a, b) => a + b[1].length, 0)} 条正例，涉及 ${rows.length} 个 skill`)

// 候选：正例 >= 8
const cands = rows.filter(([, l]) => l.length >= 8).map(([n]) => n)
console.log(`\n=== 候选实验对象（正例 ≥8）：${cands.length} 个 ===`)
for (const c of cands) console.log(`  ${c}  (${positives.get(c).length})`)

console.log('\n=== 候选对象的正例文本（前 8 条）——这些就是"用户会怎么说"的素材 ===')
for (const c of cands) {
  console.log(`\n【${c}】现在 description=${byName.get(c).description.length} 字符`)
  console.log(`  原文: ${byName.get(c).description.slice(0, 120)}…`)
  console.log(`  正例:`)
  for (const x of positives.get(c).slice(0, 8)) {
    console.log(`    · ${x.text.slice(0, 95).replace(/\n/g, ' ')}`)
  }
}
