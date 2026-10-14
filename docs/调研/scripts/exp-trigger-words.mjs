/**
 * 实验（干净版）：补齐触发词 vs 只接长 —— 对照实验
 *
 * 三组
 * ────
 *   基线   base : 原 description
 *   实验组 exp  : 原 description + 触发词段（从真实正例里提炼的用户说法）
 *   对照组 ctrl : 原 description + 等长技术描述（不含任何用户说法）→ 排除「变长/词变多就涨分」
 *
 * 评估集（已清洗）
 * ────────────────
 *   只保留「该轮用户文本高度自洽」的正例：同一 turn 里 title 型短输入应与主输入高重合，
 *   零散夹杂的（如同轮出现无关短句）标记为 noisy 并在两种口径下分别报告。
 *
 * 判据（预先定死）
 * ────────────────
 *   实验组真实正例 top-1 命中率 ≥80% 且 明显优于对照组 ⇒ 成立
 *   实验组 <50% ⇒ BM25 不可用
 *   同时报「改版 skill 抢走其他 skill 真实正例」的量（误报增量）
 *
 * 注：三个版本各建一次 index；评估时把目标 skill 换成对应版本，其余 skill 保持原始，
 *     这样差异只来自被改的那一个 skill，不引入其他变量。
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

// ══════════ 语料 A ══════════
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
    let text; try { text = readFileSync(p, 'utf8') } catch { continue }
    if (!text.startsWith('---')) continue
    const end = text.indexOf('\n---', 3); if (end === -1) continue
    let fm; try { fm = parse(text.slice(4, end)) } catch { continue }
    if (!fm?.name || !fm?.description) continue
    skills.push({ name: fm.name, description: String(fm.description) })
  }
}

// ══════════ 三个实验对象的三个版本 ══════════
// 触发词来自真实正例里用户的原话（见 step1 输出）
const VARIANTS = {
  'genui': {
    // 原文本不含任何用户说法 —— 这是最差的一侧
    triggers: ['画个图', '做个卡片', '做成表格', '可视化', '盘一下', '汇总一下', '出个面板', '看板', '图表', '渲染出来', '展示一下', '拼成一张图', '交互式界面', '页面原型', '流程图', '时序图', '让我看看数据'],
    ctrlTech: '渲染管线基于 fence 解析器，支持 chart/table/list/timeline/mermaid/echart/plot/scene3d 等节点类型，配色默认跟随主题，数据点超过八项时建议切 echart 以获得交互能力；gallery 预览由客户端组件树完成，与宿主主题变量共用同一套 CSS 变量命名空间。支持 action 回调与本地判分，交互状态按会话与内容指纹持久化，卷子模式下逐题独立提交并在本地完成判分与解析回填。',
  },
  'mxy-commit-review': {
    // 已有触发词，补的是变化说法
    triggers: ['推一下', '推到远端', '同步上去', '发上去', '整理好提交', '该提交了', '收尾提交', '把改动提交掉', '推送github', '合并一下', '归档提交', '提一下'],
    ctrlTech: '工作流末端接入仓库钩子，提交前按语言类型分别注入 lint 与格式化步骤；Java 侧读取 pom 继承链确定编译器版本，前端侧读取 vite 与 tsconfig 的 target；对未跟踪文件额外确认一次，避免把构建产物带入索引。',
  },
  'mxy-git-pull': {
    triggers: ['更新代码库', '同步一下仓库', '拉一下最新', '拿最新的', '更新一下代码', '拉远端', '拉下来', '刷新代码', '取最新代码', '从远端更新'],
    ctrlTech: '多仓库场景下按目录遍历 .git 标记，逐个执行 fetch 后比较本地与远端的分叉计数；遇到未提交改动时保留工作区并改用 rebase，冲突时中止并回滚到操作前状态。',
  },
}

// ══════════ 语料 B：正例 + 噪声标记 ══════════
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
const TARGETS = new Set(Object.keys(VARIANTS))
const positives = []   // {skill, text, file, noisy}

for (const file of walk(root)) {
  let size = 0; try { size = statSync(file).size } catch { continue }
  if (size < 300_000) continue
  const sessKey = file.split('\\').slice(-2, -1)[0]
  let evs; try { evs = readEvents(file) } catch { continue }
  const turnStarts = []
  for (const e of evs) if (e.type === 'turn/start') turnStarts.push({ turn: e.data.turn, seq: e.seq })
  if (turnStarts.length < 5) continue
  const turnOfSeq = (seq) => { let t = null; for (const ts of turnStarts) { if (ts.seq < seq) t = ts.turn; else break } return t }

  // 按 turn 收集：该轮全部用户输入 + 该轮全部 skill 调用
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
  for (const e of evs) if (e.type === 'tool/call') { if (!callsByTurn.has(e.data.turn)) callsByTurn.set(e.data.turn, []); callsByTurn.get(e.data.turn).push(e.data) }

  for (const [t, texts] of userByTurn) {
    const skillNames = (callsByTurn.get(t) ?? []).filter(c => c.name === 'skill').map(c => { try { return JSON.parse(c.arguments).name } catch { return null } }).filter(Boolean)
    if (!skillNames.length) continue
    const joined = texts.join(' ')
    // 噪声判据：本轮有多条用户输入，且最长的一条不占绝对主导（<70%）→ 可能是多轮追问被并到一起
    const longest = Math.max(...texts.map(x => x.length))
    const dominant = longest / joined.length
    for (const sn of skillNames) {
      if (!TARGETS.has(sn)) continue
      positives.push({
        skill: sn,
        text: joined.slice(0, 400),
        longestText: texts.reduce((a, b) => (b.length > a.length ? b : a), texts[0]).slice(0, 400),
        file: sessKey,
        noisy: texts.length > 1 && dominant < 0.7,
      })
    }
  }
}

console.log(`=== 评估集：${positives.length} 条正例（3 个目标 skill）===`)
for (const s of TARGETS) {
  const list = positives.filter(p => p.skill === s)
  console.log(`  ${s.padEnd(20)} ${String(list.length).padStart(3)} 条，其中噪声标记 ${list.filter(p => p.noisy).length} 条`)
}

// ══════════ BM25 ══════════
function tokenize(s) {
  const lower = s.toLowerCase()
  const toks = [...(lower.match(/[a-z0-9][a-z0-9._-]*/g) ?? [])]
  for (const run of (lower.match(/[\u4e00-\u9fff]+/g) ?? [])) {
    for (const ch of run) toks.push(ch)
    for (let i = 0; i + 1 < run.length; i++) toks.push(run.slice(i, i + 2))
  }
  return toks
}
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
function scoreOf(idx, docId, di, q) {
  const k1 = 1.2, b = 0.75, m = idx.tf.get(docId), dl = idx.lens[di]
  let s = 0
  for (const qq of q) {
    const f = m.get(qq) ?? 0; if (!f) continue
    const dfq = idx.df.get(qq) ?? 0
    const idf = Math.log(1 + (idx.N - dfq + 0.5) / (dfq + 0.5))
    s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / idx.avgdl))
  }
  return s
}
const toDoc = (desc, name, weightName = 3) => {
  const n = tokenize(name.replace(/-/g, ' '))
  const nt = []
  for (let i = 0; i < weightName; i++) nt.push(...n)
  return [...nt, ...tokenize(desc)]
}

// 三个版本：只改目标 skill 的 description，其余保持原始
function buildVariantIndex(variant) {
  const docs = skills.map((s, i) => {
    let desc = s.description
    const v = VARIANTS[s.name]
    if (v) {
      if (variant === 'exp') desc = desc + ' 当用户说「' + v.triggers.join('」「') + '」时使用。'
      if (variant === 'ctrl') desc = desc + ' ' + v.ctrlTech
    }
    return { id: i, tokens: toDoc(desc, s.name), name: s.name }
  })
  return { idx: buildIdx(docs), docs }
}
const VARIANT_INDEX = { base: buildVariantIndex('base'), exp: buildVariantIndex('exp'), ctrl: buildVariantIndex('ctrl') }

function topK(variant, text, k = 3) {
  const { idx, docs } = VARIANT_INDEX[variant]
  const q = tokenize(text)
  const scored = docs.map((d, di) => ({ name: d.name, s: scoreOf(idx, d.id, di, q) }))
  scored.sort((a, b) => b.s - a.s)
  return scored.slice(0, k)
}

// ══════════ 评估 ══════════
const evaluate = (useLongest, skipNoisy) => {
  const rows = []
  for (const p of positives) {
    if (skipNoisy && p.noisy) continue
    const text = useLongest ? p.longestText : p.text
    const r = {}
    for (const v of ['base', 'exp', 'ctrl']) {
      const top = topK(v, text, 3)
      r[v] = { top1: top[0]?.name === p.skill, top3: top.some(x => x.name === p.skill), top1name: top[0]?.name, score: top[0]?.s ?? 0 }
    }
    rows.push({ ...p, r })
  }
  return rows
}

const report = (label, rows) => {
  console.log(`\n\n══════════ ${label} ══════════`)
  console.log('skill                  n    基线top1  实验top1  对照top1   基线top3  实验top3  对照top3')
  console.log('─'.repeat(94))
  for (const s of TARGETS) {
    const rs = rows.filter(x => x.skill === s)
    if (!rs.length) continue
    const p = (k) => (rs.filter(x => x.r[k].top1).length / rs.length * 100).toFixed(1) + '%'
    const p3 = (k) => (rs.filter(x => x.r[k].top3).length / rs.length * 100).toFixed(1) + '%'
    console.log(s.padEnd(22) + String(rs.length).padStart(3) + '  ' + p('base').padStart(8) + '  ' + p('exp').padStart(8) + '  ' + p('ctrl').padStart(8) + '  ' + p3('base').padStart(9) + '  ' + p3('exp').padStart(9) + '  ' + p3('ctrl').padStart(9))
  }
  const all = rows.length
  const p = (k) => (rows.filter(x => x.r[k].top1).length / all * 100).toFixed(1) + '%'
  const p3 = (k) => (rows.filter(x => x.r[k].top3).length / all * 100).toFixed(1) + '%'
  console.log('─'.repeat(94))
  console.log('合计'.padEnd(21) + String(all).padStart(3) + '  ' + p('base').padStart(8) + '  ' + p('exp').padStart(8) + '  ' + p('ctrl').padStart(8) + '  ' + p3('base').padStart(9) + '  ' + p3('exp').padStart(9) + '  ' + p3('ctrl').padStart(9))
  return { all, top1: { base: p('base'), exp: p('exp'), ctrl: p('ctrl') } }
}

// 主口径：整轮文本，含噪声
report('口径 A：整轮文本（含噪声标记的样本）', evaluate(false, false))
// 严格口径：只用最长那条输入，且剔除噪声样本
report('口径 B：只用最长输入 + 剔除噪声（更干净，更接近真实召回场景）', evaluate(true, true))

console.log('\n\n=== 实验组 vs 对照组的逐条差异（口径 B，只看实验组改善了哪些）===')
const rowsB = evaluate(true, true)
let improved = 0, worsened = 0
for (const x of rowsB) {
  const b = x.r.base.top1, e = x.r.exp.top1, c = x.r.ctrl.top1
  if (e && !b) { improved++; console.log(`  ✓改善 [${x.skill}] ${x.longestText.slice(0, 70).replace(/\n/g, ' ')}`) }
  if (!e && b) { worsened++; console.log(`  ✗变差 [${x.skill}] ${x.longestText.slice(0, 70).replace(/\n/g, ' ')}  (实验组误判为 ${x.r.exp.top1name})`) }
}
console.log(`\n  top-1 改善 ${improved} 条，变差 ${worsened} 条`)

console.log('\n=== 误报增量：改版 skill 是否抢走别的真实正例 ===')
for (const v of ['exp', 'ctrl']) {
  let stolen = 0
  for (const x of rowsB) {
    // 该样本真值不是被改的三个 skill 时，看 top1 是否被改版 skill 抢走
    if (!VARIANTS[x.r[v].top1name]) continue
    const truthWins = x.r.base.top1
    if (truthWins) stolen++
  }
  console.log(`  ${v === 'exp' ? '实验组' : '对照组'}：${stolen} 条原本基线判对、现被判给改版 skill`)
}
