/**
 * 比对外快照 `seek-soul-in-darkness/ssid-desktop/` 与开发主轴 `.ssid-build/checkout/` 的壳源码。
 *
 * 用法：node compare-shell-copies.mjs
 *
 * 判据（记忆与手册一致）：对壳的源码与脚本**逐文件比 SHA256**；**`lib/` 是构建产物，不参与比对**
 * （它残留着上游早删的模块产物，拿它判断必然错）。这里连整个 `apps/desktop` 与 `apps/desktop-host`
 * 一起比，只排除构建产物与依赖目录 —— 版本号在 `package.json` 里，只比 `src/` 会漏掉它。
 *
 * 输出三类差异：只在主轴有过、只在快照有过、两边都有但内容不同。
 * 快照是 tag 指向的内容，发版前必须与主轴一致 —— 否则装出来的包与仓库对不上。
 *
 * `*.log` 是 dev 跑出来的运行残留（不是源码、也从不进快照），不参与比对：
 * 留在里面只会制造假红，而假红会训练人忽略这个工具（同手册坑 #36 的教训）。
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'

const CHECKOUT = 'H:/MaxNull/WorkStation/.ssid-build/checkout'
const SNAPSHOT = 'H:/MaxNull/WorkStation/seek-soul-in-darkness/ssid-desktop'

const RELATIVE_TREES = ['apps/desktop', 'apps/desktop-host']

/** 不参与比对的目录名：构建产物与依赖。 */
const IGNORED = new Set(['lib', 'node_modules', '.desktop-build', 'dist', '.turbo'])

/** 递归列出目录下所有文件（相对 base 的路径，正斜杠）。 */
function walk(directory, base = directory, out = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue
    const full = join(directory, entry.name)
    if (entry.isDirectory()) walk(full, base, out)
    // 运行残留不参与比对（见文件头）：它既不是快照内容，也不该让发版门报红。
    else if (!entry.name.endsWith('.log')) out.push(relative(base, full).split('\\').join('/'))
  }
  return out
}

const hashOf = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12)

let totalDiff = 0
for (const tree of RELATIVE_TREES) {
  const a = join(CHECKOUT, tree)
  const b = join(SNAPSHOT, tree)
  if (!existsSync(a) || !existsSync(b)) {
    console.log(`SKIP ${tree}（${existsSync(a) ? '快照' : '主轴'}缺该目录）`)
    continue
  }
  const filesA = new Set(walk(a))
  const filesB = new Set(walk(b))
  const onlyA = [...filesA].filter((x) => !filesB.has(x))
  const onlyB = [...filesB].filter((x) => !filesA.has(x))
  const changed = [...filesA].filter((x) => filesB.has(x)).filter((x) => {
    const fa = join(a, x)
    const fb = join(b, x)
    return statSync(fa).size !== statSync(fb).size || hashOf(fa) !== hashOf(fb)
  })
  const diff = onlyA.length + onlyB.length + changed.length
  totalDiff += diff
  console.log(`=== ${tree} ===`)
  console.log(`  主轴 ${filesA.size} 文件 / 快照 ${filesB.size} 文件  →  只在主轴 ${onlyA.length} · 只在快照 ${onlyB.length} · 内容不同 ${changed.length}`)
  onlyA.slice(0, 10).forEach((x) => console.log(`    只在主轴: ${x}`))
  onlyB.slice(0, 10).forEach((x) => console.log(`    只在快照: ${x}`))
  changed.slice(0, 15).forEach((x) => console.log(`    内容不同: ${x}`))
}

console.log('')
console.log(totalDiff === 0
  ? '✓ 快照与主轴一致（lib/ 与 node_modules 等产物除外）'
  : `✗ 共 ${totalDiff} 处差异 —— 发版前需同步`)
process.exitCode = totalDiff === 0 ? 0 : 1
