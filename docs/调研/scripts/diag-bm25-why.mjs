/**
 * 诊断：BM25 为什么误匹配？问题在算法还是在语料？
 *
 * 三个测量：
 *  A. 每个 skill 的 description 长度 + 它贡献了多少个"唯一 token"
 *     —— 长 description 会贡献大量 token，推高所有查询的分数（这是误匹配的机制）
 *  B. 「纯点名」轮次（用户没说 skill 名）里，top-1 的分数来自哪些词
 *     —— 看高分到底是语义命中，还是「the/的/了」这类功能词/共享词
 *  C. 名称命中率：用户文本里直接出现 skill 名的比例
 *     —— 若比例高，说明用户其实经常点名，规则匹配可行；若低，则需要语义
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

// ── 语料 A
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
    skills.push({ name: fm.name, description: String(fm.description), source: b.src })
  }
}

const CJK = /[\u4e00-\u9fff]/
function tokenize(s) {
  const lower = s.toLowerCase()
  const toks = []
  toks.push(...(lower.match(/[a-z0-9][a-z0-9._-]*/g) ?? []))
  for (const run of (lower.match(/[\u4e00-\u9fff]+/g) ?? [])) {
    for (const ch of run) toks.push(ch)
    for (let i = 0; i + 1 < run.length; i++) toks.push(run.slice(i, i + 2))
  }
  return toks
}

// ── A. description 长度与贡献
console.log('=== A. 每个 skill 的 description 规模（token 数 = 单字+2gram+英文词）===')
const stats = skills.map(s => ({ name: s.name, len: s.description.length, toks: tokenize(s.description).length, src: s.source }))
stats.sort((a, b) => b.toks - a.toks)
for (const s of stats) {
  console.log(`  ${s.name.padEnd(30)} ${String(s.len).padStart(4)}字符  ${String(s.toks).padStart(4)} tokens  [${s.src}]`)
}
const avgToks = stats.reduce((a, b) => a + b.toks, 0) / stats.length
console.log(`\n  平均 ${avgToks.toFixed(0)} tokens/skill，最长/最短 = ${stats[0].toks}/${stats[stats.length - 1].toks}`)

// ── 取对话里的用户文本
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
const userTexts = []
for (const file of walk(root)) {
  let size = 0; try { size = statSync(file).size } catch { continue }
  if (size < 300_000) continue
  let evs; try { evs = readEvents(file) } catch { continue }
  for (const e of evs) {
    if (e.type !== 'user/message' || e.data?.source?.kind !== 'user') continue
    const txt = (Array.isArray(e.data.content) ? e.data.content : []).map(c => c.text ?? '').join(' ').trim()
    if (txt) userTexts.push(txt)
  }
}
console.log(`\n=== 用户消息样本：${userTexts.length} 条 ===`)

// ── C. 名称/变体命中率
console.log('\n=== C. 用户文本里直接出现 skill 名（或其组成词）的比例 ===')
let nameHit = 0, partialHit = 0, none = 0
const hitDetail = []
for (const t of userTexts) {
  const low = t.toLowerCase()
  let hit = null
  for (const s of skills) {
    if (low.includes(s.name)) { hit = s.name; break }
  }
  if (hit) { nameHit++; hitDetail.push(`  [全名] ${hit}  ←  ${t.slice(0, 60).replace(/\n/g, ' ')}`); continue }
  // 组成词：mxy-commit-review → commit / review
  let part = null
  for (const s of skills) {
    const parts = s.name.split('-').filter(x => x.length >= 4)
    if (parts.length && parts.some(p => low.includes(p))) { part = `${s.name}(${parts.find(p => low.includes(p))})`; break }
  }
  if (part) { partialHit++; hitDetail.push(`  [部分] ${part}  ←  ${t.slice(0, 60).replace(/\n/g, ' ')}`) }
  else none++
}
console.log(`  含 skill 全名：${nameHit}  (${(nameHit / userTexts.length * 100).toFixed(1)}%)`)
console.log(`  仅含组成词：  ${partialHit}  (${(partialHit / userTexts.length * 100).toFixed(1)}%)`)
console.log(`  都不含：      ${none}  (${(none / userTexts.length * 100).toFixed(1)}%)`)
console.log('\n  前 20 条命中明细：')
for (const d of hitDetail.slice(0, 20)) console.log(d)

// ── B. 纯点名轮次的高分来自哪些词
console.log('\n\n=== B. 高分误匹配的机制：top-1 的分数由哪些 token 贡献 ===')
function buildIdx(docs) {
  const df = new Map(), tf = new Map(), lens = []
  for (const d of docs) {
    const m = new Map()
    for (const t of d.tokens) m.set(t, (m.get(t) ?? 0) + 1)
    tf.set(d.id, m); lens.push(d.tokens.length)
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  }
  return { df, tf, lens, N: docs.length, avgdl: lens.reduce((a, b) => a + b, 0) / lens.length }
}
function contributions(idx, docId, docIndex, qTokens) {
  const k1 = 1.2, b = 0.75
  const m = idx.tf.get(docId), dl = idx.lens[docIndex]
  const per = new Map()
  for (const q of qTokens) {
    const f = m.get(q) ?? 0
    if (!f) continue
    const dfq = idx.df.get(q) ?? 0
    const idf = Math.log(1 + (idx.N - dfq + 0.5) / (dfq + 0.5))
    const sc = idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / idx.avgdl))
    per.set(q, (per.get(q) ?? 0) + sc)
  }
  return [...per.entries()].sort((a, b2) => b2[1] - a[1])
}
const docs = skills.map((s, i) => ({ id: i, tokens: (() => { const n = tokenize(s.name.replace(/-/g, ' ')); const d = tokenize(s.description); return [...n, ...n, ...n, ...d] })() }))
const idx = buildIdx(docs)

// 找几条高分轮次，打印贡献词
const highScoring = []
for (const t of userTexts.slice(0, 4000)) {
  const q = tokenize(t)
  const scored = docs.map((d, di) => ({ i: d.id, s: docs.reduce((a, _) => a, 0) + (() => {
    const k1 = 1.2, b = 0.75, m = idx.tf.get(d.id), dl = idx.lens[di]
    let s2 = 0
    for (const qq of q) { const f = m.get(qq) ?? 0; if (!f) continue; const dfq = idx.df.get(qq) ?? 0; const idf = Math.log(1 + (idx.N - dfq + 0.5) / (dfq + 0.5)); s2 += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / idx.avgdl)) }
    return s2
  })() }))
  scored.sort((a, b) => b.s - a.s)
  if (scored[0].s > 60) highScoring.push({ text: t.slice(0, 90).replace(/\n/g, ' '), top: skills[scored[0].i].name, score: scored[0].s, contrib: contributions(idx, scored[0].i, scored[0].i, q).slice(0, 8) })
}
console.log(`  分数 >60 的轮次：${highScoring.length} 条（总 ${userTexts.length}）\n`)
for (const h of highScoring.slice(0, 6)) {
  console.log(`  用户: ${h.text}`)
  console.log(`    → ${h.top} (${h.score.toFixed(1)})`)
  console.log(`    贡献词: ${h.contrib.map(([w, s]) => `${w}:${s.toFixed(1)}`).join('  ')}`)
  console.log()
}
