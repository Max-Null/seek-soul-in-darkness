/**
 * 实验 2 第一步：重建评估集 + 生成并行调用所需的载荷。
 *
 * 评估集定义（照实验 1 的口径 B，保持可比）：
 *   - 只取 ≥5 轮的会话
 *   - 只取「模型真的调用了 skill」的轮次（有真值标签）
 *   - 只用该轮**最长的那条**用户输入（剔除噪声样本：同轮多条输入且最长者不占 70% 以上）
 *
 * 输出：
 *   1) eval-set.json     —— 完整评估集（真值 + 输入文本）
 *   2) payloads.json     —— 每条一个 {id, userTurn}，供并行调用读取
 *   3) skills.json       —— 31 个 skill 的 name + description（调用时要喂给判断者）
 *
 * 运行：node build-eval-set.mjs --root <会话根> --out <输出目录>
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

async function loadYaml() {
  const cands = [
    join(process.env.USERPROFILE ?? '', '.dsh/profiles/ssid/node_modules/yaml'),
    'D:/Project/deepseek-harness/node_modules/yaml',
    join(process.env.LOCALAPPDATA ?? '', 'Programs/ssid-shell/resources/ssid-plugins/node_modules/yaml'),
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

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? dflt : process.argv[i + 1]
}
const root = argOf('--root', join(process.env.USERPROFILE ?? '', '.dsh/sessions-ssid'))
const outDir = argOf('--out', '.')
mkdirSync(outDir, { recursive: true })

// ───────── 语料 A：31 个 skill ─────────
const skillRoots = [
  { src: 'pkg', dir: join(process.env.LOCALAPPDATA ?? '', 'Programs/ssid-shell/resources/ssid-plugins/node_modules/@max-null/dsh-skills/skills') },
  { src: 'user', dir: join(process.env.USERPROFILE ?? '', '.dsh/skills') },
  { src: 'proj', dir: 'D:/Project/ai-platform/.dsh/skills' },
]
const skills = []
for (const b of skillRoots) {
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
skills.sort((a, b) => (a.name < b.name ? -1 : 1))

// ───────── 语料 B：正例 ─────────
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

const known = new Map(skills.map(s => [s.name, s]))
const rows = []
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

  const userByTurn = new Map()
  for (const e of evs) {
    if (e.type !== 'user/message' || e.data?.source?.kind !== 'user') continue
    const txt = (Array.isArray(e.data.content) ? e.data.content : []).map(c => c.text ?? '').join(' ').trim()
    if (!txt) continue
    const t = turnOfSeq(e.seq)
    if (t === null) continue
    if (!userByTurn.has(t)) userByTurn.set(t, [])
    userByTurn.get(t).push(txt)
  }
  const callsByTurn = new Map()
  for (const e of evs) if (e.type === 'tool/call') {
    if (!callsByTurn.has(e.data.turn)) callsByTurn.set(e.data.turn, [])
    callsByTurn.get(e.data.turn).push(e.data)
  }

  for (const [t, texts] of userByTurn) {
    const called = (callsByTurn.get(t) ?? []).filter(c => c.name === 'skill')
      .map(c => { try { return JSON.parse(c.arguments).name } catch { return null } })
      .filter(n => n && known.has(n))
    if (!called.length) continue
    const joined = texts.join(' ')
    const longest = texts.reduce((a, b) => (b.length > a.length ? b : a), texts[0])
    const noisy = texts.length > 1 && longest.length / joined.length < 0.7
    for (const truth of called) {
      rows.push({ truth, userTurn: longest.slice(0, 1200), fullText: joined.slice(0, 1200), noisy, session: file.split('\\').slice(-2, -1)[0] })
    }
  }
}

// 与实验 1 口径 B 对齐：剔除噪声
const clean = rows.filter(r => !r.noisy)
const bySkill = new Map()
for (const r of clean) { if (!bySkill.has(r.truth)) bySkill.set(r.truth, 0); bySkill.set(r.truth, bySkill.get(r.truth) + 1) }

writeFileSync(join(outDir, 'eval-set.json'), JSON.stringify(clean, null, 2), 'utf8')
writeFileSync(join(outDir, 'skills.json'), JSON.stringify(skills, null, 2), 'utf8')
const payloads = clean.map((r, i) => ({ id: i, truth: r.truth, userTurn: r.userTurn }))
writeFileSync(join(outDir, 'payloads.json'), JSON.stringify(payloads, null, 2), 'utf8')

console.log(`skill 语料：${skills.length} 个`)
console.log(`评估集（口径 B 清洗后）：${clean.length} 条正例，涉及 ${bySkill.size} 个 skill`)
console.log('分布（前 12）：')
for (const [n, c] of [...bySkill.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${n.padEnd(26)} ${c}`)
console.log(`\n已写出：eval-set.json / payloads.json / skills.json → ${outDir}`)
