/**
 * 实验 2：独立模型（换厂商）能否做 skill 路由？
 *
 * 判据（文档 §十一 T1，事先定死）：
 *   top-1 ≥ 85% 且误报 ≤ 10%  ⇒ 方案成立
 *   top-1 < 70%                ⇒ 这条路也不通
 *
 * 对照组：给完整 description vs 只给 name —— 回答「description 到底还有没有用」。
 *
 * ⚠️ API key 从 ~/.dsh/.credentials.yaml 读，**不落盘、不进仓库**。
 * 运行：node exp2-router.mjs --dir <评估集目录> [--model qwen3.8-flash] [--limit N]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const argOf = (n, d) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1] }
const DIR = argOf('--dir', '.')
const MODEL = argOf('--model', 'qwen3.8-flash')
const LIMIT = Number(argOf('--limit', '0')) || Infinity
const BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

// ── key：从凭据文件读，不写进任何输出 ──
function readKey() {
  const p = join(process.env.USERPROFILE ?? '', '.dsh/.credentials.yaml')
  if (!existsSync(p)) throw new Error('找不到凭据文件：' + p)
  const m = readFileSync(p, 'utf8').match(/QWEN_TOKEN_PLAN_API_KEY:\s*(\S+)/)
  if (!m) throw new Error('凭据文件里没有 QWEN_TOKEN_PLAN_API_KEY')
  return m[1]
}
const KEY = readKey()

const skills = JSON.parse(readFileSync(join(DIR, 'skills.json'), 'utf8'))
const payloads = JSON.parse(readFileSync(join(DIR, 'payloads.json'), 'utf8')).slice(0, LIMIT)

const catFull = skills.map(s => `- ${s.name}：${s.description.slice(0, 420)}`).join('\n')
const catName = skills.map(s => `- ${s.name}`).join('\n')

const buildPrompt = (catalog, userTurn) => [
  'You are a skill router. Given ONE user turn and a catalog of available skills, decide which single skill should be loaded before acting.',
  '',
  'CATALOG:',
  catalog,
  '',
  'USER TURN:',
  userTurn,
  '',
  'Rules:',
  '- Answer with the exact skill name, or exactly none (lowercase) if no skill matches.',
  '- Output ONLY that token. No punctuation, no explanation, no quotes.',
].join('\n')

async function ask(prompt) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: 'You are a precise skill router. Output only the skill name or none.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    max_tokens: 24,
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const t = await r.text()
        if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 800 * (attempt + 1))); continue }
        return `(http ${r.status}: ${t.slice(0, 120)})`
      }
      const j = await r.json()
      const txt = (j.choices?.[0]?.message?.content ?? '').trim()
      return txt.replace(/[`"'。，,\s]/g, '').slice(0, 60)
    } catch (e) {
      if (attempt === 2) return `(error: ${String(e.message ?? e).slice(0, 80)})`
      await new Promise(s => setTimeout(s, 600 * (attempt + 1)))
    }
  }
  return '(failed)'
}

// 并发闸：8 路
async function pooled(jobs, size = 8) {
  const out = []
  let idx = 0
  async function worker() {
    while (idx < jobs.length) {
      const my = idx++
      out[my] = await jobs[my]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, worker))
  return out
}

console.log(`模型 ${MODEL}｜评估集 ${payloads.length} 条 × 2 组 = ${payloads.length * 2} 次调用`)

const jobs = []
for (const p of payloads) {
  jobs.push(async () => ({ id: p.id, group: 'withDesc', truth: p.truth, pick: await ask(buildPrompt(catFull, p.userTurn)) }))
  jobs.push(async () => ({ id: p.id, group: 'nameOnly', truth: p.truth, pick: await ask(buildPrompt(catName, p.userTurn)) }))
}

const t0 = Date.now()
const results = await pooled(jobs, 8)
console.log(`完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)

writeFileSync(join(DIR, `results-${MODEL}.json`), JSON.stringify(results, null, 2), 'utf8')

const stat = (g) => {
  const rs = results.filter(r => r.group === g)
  const bad = rs.filter(r => r.pick.startsWith('(')).length
  const good = rs.filter(r => !r.pick.startsWith('('))
  const correct = good.filter(r => r.pick === r.truth).length
  const none = good.filter(r => r.pick === 'none').length
  const wrong = good.length - correct - none
  const pct = (n) => (n / good.length * 100).toFixed(1)
  return { group: g, n: rs.length, apiFail: bad, top1: `${pct(correct)}%`, noneRate: `${pct(none)}%`, wrongRate: `${pct(wrong)}%`, _c: correct, _g: good.length }
}

console.log('\n=== 总览 ===')
const wd = stat('withDesc'), no = stat('nameOnly')
for (const s of [wd, no]) {
  console.log(`  ${s.group.padEnd(10)} n=${s.n}  API失败=${s.apiFail}  top1=${s.top1}  判none=${s.noneRate}  判错=${s.wrongRate}`)
}

console.log('\n=== 按 skill（给 description 组）===')
const per = {}
for (const r of results.filter(x => x.group === 'withDesc' && !x.pick.startsWith('('))) {
  if (!per[r.truth]) per[r.truth] = { n: 0, hit: 0, wrong: {} }
  per[r.truth].n++
  if (r.pick === r.truth) per[r.truth].hit++
  else per[r.truth].wrong[r.pick] = (per[r.truth].wrong[r.pick] ?? 0) + 1
}
for (const [k, v] of Object.entries(per).sort((a, b) => b[1].n - a[1].n)) {
  const top = Object.entries(v.wrong).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p, c]) => `${p}×${c}`).join(' ')
  console.log(`  ${k.padEnd(24)} ${String(v.hit).padStart(3)}/${String(v.n).padEnd(3)} ${(v.hit / v.n * 100).toFixed(0).padStart(4)}%   ${top}`)
}

console.log('\n=== 判据 ===')
const acc = wd._c / wd._g * 100
const verdict = acc >= 85 ? '成立（≥85%）' : acc < 70 ? '不成立（<70%）' : '灰区（70-85%）'
console.log(`  top-1 = ${acc.toFixed(1)}%  ⇒ ${verdict}`)
console.log(`  对照组（只给 name）top-1 = ${(no._c / no._g * 100).toFixed(1)}%`)
console.log(`\n结果已写入 results-${MODEL}.json`)
