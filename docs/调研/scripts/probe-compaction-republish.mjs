/**
 * 探针：跨会话找「压缩事件」与「skill 目录重发」的关系。
 *
 * 要回答的问题（不靠推断）：
 *   压缩把 skill 目录消息从可见 surface 上摘掉之后，插件会不会重新发布一条？
 *
 * 判据：
 *   - 若某会话有 compaction/start 且 skill-catalog 消息数 ≥ 2，且第二条出现在压缩之后 → 会自愈
 *   - 若 skill-catalog 只有 1 条而压缩发生在它之后 → 目录被摘掉且不再补发（永久失效）
 *
 * 运行：<壳自带 node24> probe-compaction-republish.mjs --root <会话根> [--all]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { join } from 'node:path'

const argv = process.argv
const rootIdx = argv.indexOf('--root')
const root = argv[rootIdx + 1]
const showAll = argv.includes('--all')

function readSession(file) {
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

function walkSessions(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walkSessions(p, out)
    else if (e.name.endsWith('.jsonl.zstd')) out.push(p)
  }
  return out
}

const files = walkSessions(root)
console.log(`扫描 ${files.length} 个会话文件…\n`)

const rows = []
for (const file of files) {
  let size = 0
  try { size = statSync(file).size } catch { continue }
  let evs
  try { evs = readSession(file) } catch { continue }

  const compactions = evs.filter(e => e.type === 'compaction/start' || e.type === 'compaction/end')
  const catalogs = evs.filter(e => e.type === 'user/message' && e.data?.source?.kind === 'skill-catalog')
  const instrs = evs.filter(e => e.type === 'user/message' && e.data?.source?.kind === 'agent-instructions')
  const rtc = evs.filter(e => e.type === 'user/message' && e.data?.source?.kind === 'runtime-context')
  const turns = evs.filter(e => e.type === 'turn/start').length

  if (compactions.length === 0 && !showAll) continue

  rows.push({
    file: file.replace(root, '').replace(/\\/g, '/'),
    sizeMB: (size / 1048576).toFixed(1),
    turns,
    compStart: compactions.filter(e => e.type === 'compaction/start').map(e => e.seq),
    compEnd: compactions.filter(e => e.type === 'compaction/end').map(e => e.seq),
    catalogSeqs: catalogs.map(e => e.seq),
    instrSeqs: instrs.map(e => e.seq),
    rtSeqs: rtc.map(e => e.seq),
  })
}

console.log('=== 有压缩事件的会话 ===')
console.log('会话                                     大小   轮次  压缩(seq)       skill目录(seq)        AGENTS(seq)     runtimeCtx(次数)')
console.log('─'.repeat(140))
for (const r of rows) {
  console.log(
    r.file.padEnd(40).slice(0, 40) + ' ' +
    (r.sizeMB + 'MB').padStart(6) + ' ' +
    String(r.turns).padStart(4) + '  ' +
    (r.compStart.join(',') || '-').padEnd(14) + '  ' +
    (r.catalogSeqs.join(',') || '-').padEnd(18) + '  ' +
    (r.instrSeqs.join(',') || '-').padEnd(14) + '  ' +
    String(r.rtSeqs.length).padStart(4)
  )
}

console.log('\n\n=== 关键判据汇总 ===')
let selfHeal = 0, dead = 0
for (const r of rows) {
  const firstComp = r.compStart[0]
  if (firstComp === undefined || r.catalogSeqs.length === 0) continue
  const after = r.catalogSeqs.filter(s => s > firstComp)
  if (after.length > 0) { selfHeal++; console.log(`  ✓ 压缩后重发：${r.file}  压缩@${firstComp} → 新目录@${after.join(',')}`) }
  else { dead++; console.log(`  ✗ 压缩后无重发：${r.file}  压缩@${firstComp}，目录只在 ${r.catalogSeqs.join(',')}`) }
}
console.log(`\n  压缩后会重发：${selfHeal} 个会话    压缩后不再出现：${dead} 个会话`)
