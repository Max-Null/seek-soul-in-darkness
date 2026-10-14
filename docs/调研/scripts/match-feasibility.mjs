/**
 * 匹配可行性验证：用户输入 → skill 的词汇匹配准不准？
 *
 * 设计
 * ────
 * 语料 A（文档）：31 个 skill 的 name + description（内核 YAML 解析后的真实文本）
 * 语料 B（评估集）：从会话日志里取两类轮次
 *    B1「模型真的调用了 skill」的轮次 —— 有真值标签（调用了哪个）
 *    B2「用户点名但没调用」的轮次 —— 疑似漏用
 *
 * 计分：BM25（照 dsh-memory 的做法：CJK 单字 + 2-gram，name 与 description 分离加权）
 * 对每一轮取 top-1 / top-3，看它是否命中真值。
 *
 * 关键区分：真值命中率 ≠ 匹配器好坏，因为「模型调用的」本身可能是错的选择。
 * 所以额外报告「匹配器的 top-1 与模型实际选择的一致性」——
 * 一致性高 = 匹配器能复现模型的判断，那么它就能在模型忘记时替它想起来。
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// yaml 包不在本脚本所在目录的解析链上（ESM 不认 NODE_PATH），
// 显式在几个已知位置里找一份加载。
async function loadYaml() {
  const cands = [
    String.raw`D:\Project\deepseek-harness\node_modules\yaml`,
    String.raw`${process.env.USERPROFILE}\AppData\Local\Programs\ssid-shell\resources\ssid-plugins\node_modules\yaml`,
    String.raw`${process.env.USERPROFILE}\.dsh\profiles\ssid\node_modules\yaml`,
  ]
  for (const c of cands) {
    const pkg = join(c, 'package.json')
    if (!existsSync(pkg)) continue
    const meta = JSON.parse(readFileSync(pkg, 'utf8'))
    const entry = join(c, meta.module ?? meta.main ?? 'index.js')
    if (!existsSync(entry)) continue
    const mod = await import(pathToFileURL(entry).href)
    if (typeof mod.parse === 'function') return mod.parse
  }
  throw new Error('找不到 yaml 包')
}
const parse = await loadYaml()

// ─────────── 1. 读语料 A：全部 skill ───────────
function loadSkills() {
  const bases = [
    { src: 'pkg', dir: String.raw`${process.env.USERPROFILE}\AppData\Local\Programs\ssid-shell\resources\ssid-plugins\node_modules\@max-null\dsh-skills\skills` },
    { src: 'user', dir: String.raw`${process.env.USERPROFILE}\.dsh\skills` },
    { src: 'proj', dir: String.raw`D:\Project\ai-platform\.dsh\skills` },
  ]
  const out = []
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
      out.push({ name: fm.name, description: String(fm.description), whenToUse: fm.whenToUse ? String(fm.whenToUse) : undefined, source: b.src })
    }
  }
  return out
}

// ─────────── 2. 读语料 B：从会话日志取评估集 ───────────
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

const TRIGGERS = [/提交|commit|推送/i, /日报|周报/, /设计文档|设计方案|写方案|原型/, /代码审查|review|审查/, /拉取|pull|同步代码/i, /整理代码|加注释/,
  /更新文档|更新 ?AGENTS|同步文档/i, /pptx|ppt|幻灯片|演示/, /做成图片|发群里|导出 ?PDF|做成 ?PDF/i, /架构图|活点地图|链路图/, /剧本杀/, /台账|判据|能发吗|能交付/]

const cases = []   // {text, called: [names], named: bool, file}
const root = process.argv[process.argv.indexOf('--root') + 1]
for (const file of walk(root)) {
  let size = 0
  try { size = statSync(file).size } catch { continue }
  if (size < 300_000) continue
  let evs
  try { evs = readEvents(file) } catch { continue }
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
    const skillNames = (calls.get(t) ?? []).filter(c => c.name === 'skill').map(c => { try { return JSON.parse(c.arguments).name } catch { return '?' } })
    const named = TRIGGERS.some(re => re.test(txt))
    if (skillNames.length === 0 && !named) continue   // 只保留「调用了」或「点名了」的
    cases.push({ text: txt.slice(0, 500), called: skillNames, named, file: file.split('\\').slice(-2)[0] })
  }
}

// ─────────── 3. BM25（CJK 单字 + 2-gram）───────────
const CJK = /[\u4e00-\u9fff]/
function tokenize(s) {
  const lower = s.toLowerCase()
  const toks = []
  const words = lower.match(/[a-z0-9][a-z0-9._-]*/g) ?? []
  toks.push(...words)
  const cjkRuns = lower.match(/[\u4e00-\u9fff]+/g) ?? []
  for (const run of cjkRuns) {
    for (const ch of run) toks.push(ch)                       // 单字
    for (let i = 0; i + 1 < run.length; i++) toks.push(run.slice(i, i + 2))  // 2-gram
  }
  return toks
}
function buildIndex(docs) {   // docs: [{id, tokens}]
  const df = new Map()
  const tf = new Map()
  const lens = []
  for (const d of docs) {
    const m = new Map()
    for (const t of d.tokens) m.set(t, (m.get(t) ?? 0) + 1)
    tf.set(d.id, m)
    lens.push(d.tokens.length)
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const avgdl = lens.reduce((a, b) => a + b, 0) / lens.length
  return { df, tf, avgdl, N: docs.length, lens }
}
function score(idx, docId, queryTokens, docIndex) {
  const k1 = 1.2, b = 0.75
  const m = idx.tf.get(docId)
  const dl = idx.lens[docIndex]
  let s = 0
  for (const q of queryTokens) {
    const f = m.get(q) ?? 0
    if (f === 0) continue
    const dfq = idx.df.get(q) ?? 0
    const idf = Math.log(1 + (idx.N - dfq + 0.5) / (dfq + 0.5))
    s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / idx.avgdl))
  }
  return s
}

const skills = loadSkills()
console.log(`=== 语料 A：${skills.length} 个 skill ===`)
console.log(`  其中声明 whenToUse 的：${skills.filter(s => s.whenToUse).length} 个`)
console.log(`=== 语料 B：${cases.length} 个评估轮次（调用了 ${cases.filter(c => c.called.length).length}，仅点名 ${cases.filter(c => !c.called.length).length}）===\n`)

// 每个 skill 两路文本：name 权重高，description 次之
const docs = []
skills.forEach((s, i) => {
  const nameToks = tokenize(s.name.replace(/-/g, ' '))
  const descToks = tokenize(s.description)
  const whenToks = s.whenToUse ? tokenize(s.whenToUse) : []
  docs.push({ id: i, tokens: [...nameToks, ...nameToks, ...nameToks, ...descToks, ...whenToks, ...whenToks] })
})
const idx = buildIndex(docs)

function match(text, topK = 3) {
  const q = tokenize(text)
  const scored = docs.map((d, di) => ({ i: d.id, s: score(idx, d.id, q, di) }))
  scored.sort((a, b) => b.s - a.s)
  return scored.slice(0, topK).map(x => ({ name: skills[x.i].name, score: +x.s.toFixed(2) }))
}

// ─────────── 4. 评估 ───────────
console.log('=== 评估 1：模型真的调用了 skill 的轮次 —— 匹配器能否复现它的选择 ===')
const called = cases.filter(c => c.called.length)
let agreeTop1 = 0, agreeTop3 = 0, evaluated = 0
const disagree = []
for (const c of called) {
  const truth = c.called.filter(n => skills.some(s => s.name === n))
  if (!truth.length) continue
  evaluated++
  const top = match(c.text, 3)
  if (top[0] && truth.includes(top[0].name)) agreeTop1++
  if (top.some(t => truth.includes(t.name))) agreeTop3++
  else disagree.push({ text: c.text.slice(0, 70), truth, top: top.map(t => `${t.name}(${t.score})`) })
}
console.log(`  可评估 ${evaluated} 轮（真值 skill 在语料里的）`)
console.log(`  top-1 与模型选择一致：${agreeTop1}/${evaluated} = ${(agreeTop1 / evaluated * 100).toFixed(1)}%`)
console.log(`  top-3 含模型选择：   ${agreeTop3}/${evaluated} = ${(agreeTop3 / evaluated * 100).toFixed(1)}%`)
console.log(`\n  --- 匹配器没猜中的（前 12）---`)
for (const d of disagree.slice(0, 12)) {
  console.log(`  用户: ${d.text}`)
  console.log(`    模型选了: ${d.truth.join(',')}    匹配器top3: ${d.top.join(' | ')}`)
}

console.log('\n\n=== 评估 2：用户点名但模型没调用的轮次 —— 匹配器会推荐什么 ===')
const missed = cases.filter(c => !c.called.length)
const suggest = new Map()
let withScore = 0
for (const c of missed) {
  const top = match(c.text, 1)[0]
  if (!top) continue
  if (top.score > 0) withScore++
  if (!suggest.has(top.name)) suggest.set(top.name, [])
  suggest.get(top.name).push({ text: c.text.slice(0, 80), score: top.score })
}
console.log(`  ${missed.length} 个漏用轮次中，匹配器给出非零分的：${withScore}`)
console.log(`\n  推荐分布（top-1 落在哪个 skill，只看前 14 个）：`)
for (const [n, list] of [...suggest.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 14)) {
  console.log(`\n  【${n}】 ${list.length} 次  平均分 ${(list.reduce((a, b) => a + b.score, 0) / list.length).toFixed(1)}`)
  for (const x of list.slice(0, 2)) console.log(`      (${x.score}) ${x.text}`)
}

// 分数分布：用来定阈值
console.log('\n\n=== 评估 3：分数分布（定阈值用）===')
const allScoresCalled = called.map(c => match(c.text, 1)[0]?.score ?? 0).sort((a, b) => a - b)
const allScoresMissed = missed.map(c => match(c.text, 1)[0]?.score ?? 0).sort((a, b) => a - b)
const q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0
console.log(`  模型调用过的轮次 top1 分：p10=${q(allScoresCalled, .1)}  p50=${q(allScoresCalled, .5)}  p90=${q(allScoresCalled, .9)}`)
console.log(`  仅点名的轮次   top1 分：p10=${q(allScoresMissed, .1)}  p50=${q(allScoresMissed, .5)}  p90=${q(allScoresMissed, .9)}`)
