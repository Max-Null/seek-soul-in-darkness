#!/usr/bin/env node
/**
 * bump-pin.mjs —— 把 profile / profile-template 里某个包的精确版本 pin 改到目标版本。
 *
 * ## 为什么需要它
 * 「插件升级到 profile 的完整链条」第 2 步要求改**三处**精确版本 pin：
 * `~/.dsh/profiles/ssid`、`~/.dsh/profiles/web`、`seek-soul-in-darkness/shell/profile-template`。
 * 漏一处，`pnpm install` 会**安安静静地什么都不做**——它只满足 pin，不追 latest；
 * 2026-09-18 就这么白跑过一轮（install 输出 `Packages: -71`，installed 版本没变）。
 *
 * ## 为什么不能顺手用别的方式改
 * - `JSON.parse` + `stringify` 会重排整个文件（丢格式与键序），diff 变得没法读；
 * - PowerShell 5.1 的 `Set-Content -Encoding UTF8` 会写 BOM，而 DSH 的 `JSON.parse`
 *   **不剥离 BOM**（启动即失败）；
 * - PS 里内嵌 `node -e` 传含引号的 JS，会被 PowerShell 先解析一遍。
 * 所以：逐字节字符串替换 + 输出前查 BOM + 独立 `.mjs` 文件。
 *
 * ## 用法
 *   node bump-pin.mjs <包名> <旧版本> <新版本> <文件...>
 *   node bump-pin.mjs --help
 *
 * ## 退出码
 *   0 = 全部替换成功
 *   1 = 有文件被跳过（未找到唯一匹配，或写入前检出 BOM）
 *   2 = 用法错误
 *
 * ## 答不了什么
 * - 只改**声明**，不动 node_modules——实体仍要另装（手册 §4 第 6 条：`pnpm install
 *   --lockfile-only` 重算 lock，再从 tarball 解包覆盖实体）；
 * - 不做 lockfile 更新——改完要跑 `pnpm install --lockfile-only`；
 * - 只认 `"<包名>": "<精确版本>"` 这一种写法；范围 / `link:` / `file:` 形式不匹配即跳过
 *   （跳过会以退出码 1 报出来，不会静默略过）。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const USAGE = [
  '用法：node bump-pin.mjs <包名> <旧版本> <新版本> <文件...>',
  '',
  '示例：',
  '  node bump-pin.mjs "@max-null/dsh-memory" "0.11.1" "0.12.0" \\',
  '    "C:/Users/<you>/.dsh/profiles/ssid/package.json" \\',
  '    "C:/Users/<you>/.dsh/profiles/web/package.json" \\',
  '    "H:/.../shell/profile-template/package.json"',
  '',
  '退出码：0 全部成功 / 1 有文件被跳过 / 2 用法错误',
].join('\n')

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

const [pkg, from, to, ...files] = argv
if (!pkg || !from || !to || files.length === 0) {
  console.error(USAGE)
  process.exit(2)
}

let failed = false
for (const file of files) {
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (err) {
    console.error(`SKIP  ${file} — 读不到：${err.message}`)
    failed = true
    continue
  }

  // 输入文件本身若带 BOM，先摘掉，避免把既有问题原样写回去
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)

  const needle = `"${pkg}": "${from}"`
  const hits = raw.split(needle).length - 1
  if (hits !== 1) {
    console.error(`SKIP  ${file} — 期望 1 处匹配，实得 ${hits}：${needle}`)
    failed = true
    continue
  }

  const out = raw.replace(needle, `"${pkg}": "${to}"`)
  if (out.charCodeAt(0) === 0xfeff) {
    console.error(`SKIP  ${file} — 输出带 BOM，已中止`)
    failed = true
    continue
  }

  writeFileSync(file, out, 'utf8')
  console.log(`OK    ${file} — ${from} -> ${to}`)
}

if (failed) {
  console.error('\n有文件被跳过：修掉上面列出的问题再重跑（退出码 1）')
}
process.exit(failed ? 1 : 0)
