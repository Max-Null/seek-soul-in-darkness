/**
 * 重打 SSiD 定制的 open-sea-skin vendor tgz（默认不开启海洋背景）
 *
 * 背景：安装版 SSiD 通过 profile-template/vendor/open-sea-skin-<ver>.tgz 预置
 * 该 DSH 插件（file: 依赖）。其 browser bundle / native loader 的默认值
 * `enabled: true` 会让首装用户一打开页面就渲染海洋（WebGPU/WebGL2 重负载）。
 * SSiD 侧固化：默认不开启，用户想要时在设置面板手动启用。
 *
 * 做法：解包现有 tgz → 对 plugin/client.js 与 native-dist/loader.js 应用
 * 幂等补丁（锚点缺失即报错，防离线升级结构漂移）→ 重新 tar（保留 package/
 * 条目前缀）→ 自检。补丁点与 open-sea-skin 的 shared/skin-core.js 对应：
 *   - DEFAULTS.enabled: true          → false
 *   - normalize: raw.enabled !== false → raw.enabled === true（严格 opt-in）
 *   - resetNote 文案同步提示「默认关闭」
 *
 * 跑法：node scripts/repack-open-sea-skin-vendor.mjs [tgz 路径]
 * 跑完再执行 node scripts/prepare-runtime.mjs 重建 dsh-runtime.tar.gz。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const shellDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tgz = process.argv[2] ?? join(shellDir, 'profile-template', 'vendor', 'open-sea-skin-1.2.1.tgz')
if (!existsSync(tgz)) {
  console.error(`tgz not found: ${tgz}`)
  process.exit(1)
}

/** 幂等替换：锚点必须恰好出现一次；已应用过（出现在 after 状态）则跳过。
 *  eol 由文件实际行尾决定（tgz 内为 CRLF，构建产物随宿主平台）。 */
function patchOnce(text, before, after, label, eol) {
  if (text.includes(after)) return { text, applied: false }
  const b = before.replace(/\n/g, eol)
  const a = after.replace(/\n/g, eol)
  const count = text.split(b).length - 1
  if (count !== 1) throw new Error(`[${label}] anchor not unique (${count}x): ${before.slice(0, 60)}`)
  return { text: text.replace(b, a), applied: true }
}

const PATCHES = [
  // DEFAULTS 默认关闭
  {
    before: '    enabled: true,\n    sea: 45,',
    after: '    enabled: false,\n    sea: 45,',
    label: 'defaults.enabled',
  },
  // 严格 opt-in：只有显式 true 才开启
  {
    before: 'enabled: raw.enabled !== false,',
    after: 'enabled: raw.enabled === true,',
    label: 'normalize.enabled',
  },
  // 恢复默认文案同步（中/英）
  {
    before: "恢复全部默认设置（波浪 45 / 日光 55 / 玻璃 72 / 自动循环开）",
    after: "恢复全部默认设置（皮肤默认关闭 / 波浪 45 / 日光 55 / 玻璃 72 / 自动循环开）",
    label: 'resetNote.zh',
  },
  {
    before: 'Restore all defaults (sea 45 / daylight 55 / glass 72 / auto cycle on)',
    after: 'Restore all defaults (skin off by default / sea 45 / daylight 55 / glass 72 / auto cycle on)',
    label: 'resetNote.en',
  },
]

const work = join(shellDir, '.oss-repack')
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
const extract = spawnSync('tar', ['-xzf', tgz, '-C', work], { encoding: 'utf8' })
if (extract.status !== 0) {
  console.error('extract failed:', extract.stderr)
  process.exit(1)
}

let changed = 0
for (const rel of ['package/plugin/client.js', 'package/native-dist/loader.js']) {
  const file = join(work, rel)
  if (!existsSync(file)) throw new Error(`missing in tgz: ${rel}`)
  let text = readFileSync(file, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  let applied = 0
  for (const p of PATCHES) {
    const r = patchOnce(text, p.before, p.after, `${rel}:${p.label}`, eol)
    if (r.applied) applied++
    text = r.text
  }
  if (applied > 0) {
    writeFileSync(file, text)
    changed++
    console.log(`patched ${rel} (${applied} substitutions)`)
  } else {
    console.log(`unchanged ${rel} (already SSiD-defaulted)`)
  }
}

if (changed > 0) {
  rmSync(tgz, { force: true })
  const pack = spawnSync('tar', ['-czf', tgz, '-C', work, 'package'], { encoding: 'utf8' })
  if (pack.status !== 0) {
    console.error('repack failed:', pack.stderr)
    process.exit(1)
  }
  console.log(`repacked ${tgz} (${(statSync(tgz).size / 1024).toFixed(1)} KB)`)
}

// 自检：产物里两个入口都应是默认关闭
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
spawnSync('tar', ['-xzf', tgz, '-C', work])
for (const rel of ['package/plugin/client.js', 'package/native-dist/loader.js']) {
  const text = readFileSync(join(work, rel), 'utf8')
  if (!text.includes('enabled: false')) {
    console.error(`SELF-CHECK FAILED: ${rel} still defaults to enabled`)
    process.exit(1)
  }
  if (!text.includes('raw.enabled === true')) {
    console.error(`SELF-CHECK FAILED: ${rel} normalize not strict`)
    process.exit(1)
  }
}
console.log('self-check OK: both entries default to disabled')
rmSync(work, { recursive: true, force: true })
