/**
 * 生成 dsh-runtime.tar.gz（打包内置的 DSH 运行时闭包归档）
 *
 * 做法：复制 profile-template → 注入 @deepseek-ai/dsh 聚合包（精确 pin）→ pnpm install
 *       （node-linker=hoisted 扁平布局，electron-builder 26 不复制 pnpm symlink）
 *       → 显式补充缺失 peer（pnpm 11 不自动装 peer，实测 auto-install-peers 配置不生效）
 *       → 写 .runtime-version（SSiD 版本-DSH 版本-依赖指纹）→ tar 单归档 → 删源目录
 * 产物：shell/dsh-runtime.tar.gz（NSIS 只写 1 个文件，首启解压部署；归档带版本，启动对比驱动升级）
 *
 * 跑法：node scripts/prepare-runtime.mjs
 * 前置：构建机 Node ≥22.13（DSH engines，可用 DSH_NODE 指定），pnpm 11.x（可用 PNPM_CMD 指定）
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const shellDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeDir = join(shellDir, 'dsh-runtime')

/** 目录体积统计（MB） */
function dirSizeMB(dir) {
  let bytes = 0
  const walk = (d) => {
    for (const entry of readdirSafe(d)) {
      const p = join(d, entry.name)
      const st = statSync(p, { throwIfNoEntry: false })
      if (!st) continue
      if (st.isDirectory()) walk(p)
      else bytes += st.size
    }
  }
  walk(dir)
  return bytes / 1024 / 1024
}

/** 带 try 的 readdir（跳过无权限/链接失效项） */
function readdirSafe(d) {
  try {
    return readdirSync(d, { withFileTypes: true })
  } catch {
    return []
  }
}

/**
 * DSH 运行时版本：单一来源，不再手改。
 * 优先从本地 deepseek-harness checkout 的聚合包（apps/cli = @deepseek-ai/dsh）
 * 读取版本号（打包机与源码同源，rc 升级后归档自动跟进）；
 * checkout 缺失/读取失败时回退到显式常量（升 rc 只改这一处）。
 */
const DSH_CHECKOUT = process.env.DSH_CHECKOUT ?? 'H:/MaxNull/WorkStation/deepseek-harness'
const DSH_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(DSH_CHECKOUT, 'apps', 'cli', 'package.json'), 'utf8'))
    if (typeof pkg.version === 'string' && pkg.version !== '') return pkg.version
  } catch {
    // fall through to the explicit constant
  }
  return '0.1.0-rc.8'
})()

/** 缺失 peer 清单（pnpm peers check 实测：官方包的 peer 依赖，pnpm 不自动装） */
const MISSING_PEERS = [
  // 官方运行时 peer（版本与闭包一致 = DSH_VERSION，DSH 源码 tsconfig 同源）
  `@deepseek-ai/dsh-fs@${DSH_VERSION}`,
  `@deepseek-ai/dsh-invariants@${DSH_VERSION}`,
  `@deepseek-ai/dsh-scope@${DSH_VERSION}`,
  `@deepseek-ai/dsh-timeout@${DSH_VERSION}`,
  `@deepseek-ai/dsh-code-runtime@${DSH_VERSION}`,
  `@deepseek-ai/dsh-atomic-write@${DSH_VERSION}`,
  `@deepseek-ai/dsh-bash-local@${DSH_VERSION}`,
  `@deepseek-ai/dsh-sandbox@${DSH_VERSION}`,
  `@deepseek-ai/dsh-shell@${DSH_VERSION}`,
  `@deepseek-ai/dsh-anonymous-user-id@${DSH_VERSION}`,
  `@deepseek-ai/dsh-session-telemetry@${DSH_VERSION}`,
  `@deepseek-ai/dsh-session-title-llm@${DSH_VERSION}`,
  `@deepseek-ai/dsh-spill@${DSH_VERSION}`,
  `@deepseek-ai/dsh-output-retention@${DSH_VERSION}`,
  `@deepseek-ai/dsh-subagent-in-process-driver@${DSH_VERSION}`,
  `@deepseek-ai/dsh-subprocess@${DSH_VERSION}`,
  `@deepseek-ai/dsh-compaction@${DSH_VERSION}`,
  `@deepseek-ai/dsh-workflow@${DSH_VERSION}`,
  // @huanlin / dsh-ssid-panels 声明 cordis 本体（官方闭包用 @deepseek-ai/cordis fork，双实例共存）
  '@deepseek-ai/cordis-plugin-group@1.0.1',
  'cordis@4.0.0-rc.8',
]

function main() {
  // 1. 清空重建 runtime 目录
  rmSync(runtimeDir, { recursive: true, force: true })
  mkdirSync(runtimeDir, { recursive: true })
  console.log('[1/5] 已重建', runtimeDir)

  // 2. 复制 profile-template（package.json / pnpm-workspace.yaml / cordis.patch.yml / vendor/）
  cpSync(join(shellDir, 'profile-template'), runtimeDir, { recursive: true })
  // 2.1 防御性剔除 vendor 副本的 node_modules：内置插件的源码目录带开发构建
  //     依赖（实测 dsh-ssid-panels 894MB：rolldown/esbuild/typescript 等），一旦
  //     被 /MIR 同步进 vendor 会让归档与安装包暴涨（0.1.7 起 253MB→469MB 的根因）。
  //     归档只带运行时产物，开发依赖不进闭包。
  const vendorRoot = join(runtimeDir, 'vendor')
  if (existsSync(vendorRoot)) {
    for (const entry of readdirSafe(vendorRoot)) {
      // 只处理目录：vendor/README.md 等文件跳过（darwin 上对
      // '文件/node_modules' 的 rmSync 会抛 ENOTDIR——Windows 静默跳过、
      // mac 直接崩溃，2026-08-27 macos runner 首跑实测）
      if (!entry.isDirectory()) continue
      rmSync(join(vendorRoot, entry.name, 'node_modules'), { recursive: true, force: true })
    }
  }
  console.log('[2/5] 已复制 profile-template')

  // 3. 注入 @deepseek-ai/dsh 聚合包（boot 的 installAnchor + 官方闭包来源）
  //    精确 pin（无 ^）：rc 阶段 ^ 会悄悄升级到未回归验证的版本，DSH 跟进必须是显式决策；
  //    版本取自 DSH_VERSION（本地 deepseek-harness checkout 自动读取）。
  //    同时把 MISSING_PEERS 作为显式依赖注入（版本随 DSH_VERSION 动态对齐）：
  //    pnpm 11 不自动装 peer（auto-install-peers 实测失效），且 pnpm add 在
  //    慢网络 + supply-chain 全量验证下会卡住超时（2026-08-22 实测 10 分钟
  //    ETIMEDOUT；add 实际已写入依赖与 lockfile 但进程不退出）。
  //    注入后 install 一步到位，无需再跑 add。
  const pkgPath = join(runtimeDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.dependencies['@deepseek-ai/dsh'] = DSH_VERSION
  for (const spec of MISSING_PEERS) {
    const at = spec.lastIndexOf('@')
    pkg.dependencies[spec.slice(0, at)] = spec.slice(at + 1)
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
  console.log(`[3/5] 已注入 @deepseek-ai/dsh ${DSH_VERSION} + ${MISSING_PEERS.length} 个缺失 peer（精确 pin）`)

  // 3.5 扁平布局（electron-builder 26 不复制 pnpm symlink 节点，必须 hoisted）
  writeFileSync(join(runtimeDir, '.npmrc'), 'node-linker=hoisted\n')
  console.log('[3.5/5] 已写入 .npmrc（node-linker=hoisted）')

  // 4. pnpm install + 补 peer（2026-08-27 跨平台：win32 找 node.exe/NVM/APPDATA；
  // darwin 找 /opt/homebrew 与 /usr/local/Homebrew 节点与全局 pnpm）
  const isWin = process.platform === 'win32'
  const nodeName = isWin ? 'node.exe' : 'node'
  const nodeCandidates = [
    process.env.DSH_NODE,
    isWin ? 'D:\\Program Files\\nvm\\v22.22.2\\node.exe' : '',
    // nvm 路径漂移后仍可用——2026-08-22 D 盘 nvm 目录消失导致「缺少 Node」
    // 失败；构建机 Node ≥22.13 即可（macos runner 预装 node 于
    // /opt/homebrew/bin 或 /usr/local/bin，或经 actions/setup-node 入 PATH）
    !isWin ? '/opt/homebrew/bin/node' : '',
    !isWin ? '/usr/local/bin/node' : '',
    process.env.PATH?.split(isWin ? ';' : ':').map(p => join(p, nodeName)).find(p => existsSync(p)),
  ].filter(Boolean)
  const node = nodeCandidates.find((c) => existsSync(c))
  if (!node) {
    console.error('缺少 Node（DSH 要求 ≥22.13），可用环境变量 DSH_NODE 指定')
    process.exit(1)
  }
  const pnpmCandidates = [
    process.env.PNPM_CMD,
    join(dirname(node), 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    // 用户级 npm 全局（win32：%APPDATA%\npm；darwin：/usr/local 或
    // /opt/homebrew 下的 lib/node_modules——homebrew 安装 npm 的默认位置）
    isWin ? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs') : '',
    !isWin ? '/usr/local/lib/node_modules/pnpm/bin/pnpm.cjs' : '',
    !isWin ? '/opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs' : '',
  ].filter(Boolean)
  const pnpm = pnpmCandidates.find((p) => existsSync(p)) || null
  if (!pnpm) {
    console.error('缺少 pnpm 11.x，可用环境变量 PNPM_CMD 指定')
    process.exit(1)
  }
  console.log(`[4/5] node=${node}\n      pnpm=${pnpm}`)

  const runPnpm = (label, args) => {
    console.log(`      → ${label}`)
    // 执行方式按扩展名判定（2026-08-27 macos runner 实测）：
    //   - .cjs/.mjs/.js：真实 Node 脚本 → node 执行（Windows 本机习惯；
    //     且 .cjs 直接 spawn 会被 cmd 按文件关联假执行，必须 node）
    //   - 其他（如 pnpm/action-setup 的 .bin/pnpm bash shim）→ 直接
    //     spawn，让 shim 自带的解释器（#!/bin/sh）接管；node 解析 bash
    //     会 SyntaxError（macos runner 实测）
    const useNode = /\.(cjs|mjs|js)$/i.test(pnpm)
    const cmd = useNode ? node : pnpm
    const cmdArgs = useNode ? [pnpm, ...args] : args
    // timeout 防止 ERESOLVE 类解析死循环挂住（实测 npm --force 卡死数十分钟）
    const r = spawnSync(cmd, cmdArgs, {
      cwd: runtimeDir,
      stdio: 'inherit',
      timeout: 30 * 60 * 1000,
      env: {
        ...process.env,
        PATH: dirname(node) + (isWin ? ';' : ':') + process.env.PATH,
      },
    })
    if (r.error) {
      console.error(`${label} 异常：`, r.error.message)
      process.exit(1)
    }
    if (r.status !== 0) {
      console.error(`${label} 失败，status =`, r.status)
      process.exit(1)
    }
  }

  runPnpm('pnpm install（完整依赖，hoisted 布局）', ['install', '--no-frozen-lockfile'])
  // 缺失 peer 已在第 3 步注入 dependencies，install 一步到位，无需再 pnpm add
  // （pnpm add 慢网络 + supply-chain 全量验证下会卡住进程不退出，2026-08-22 实测）

  // 4.5 vendor 插件实体兜底：pnpm 对 file:./vendor/* 依赖不感知源目录变化
  //    且可能复用 store 中的损坏/空副本（2026-08-22 实测 dsh-header-unify
  //    的 node_modules 副本是空目录，rc.8 归档正常）。install 后校验
  //    package.json 实体，缺失则删除后从 vendor 源重新复制（幂等防御）。
  for (const entry of readdirSafe(vendorRoot)) {
    const src = join(vendorRoot, entry.name)
    const dst = join(runtimeDir, 'node_modules', '@max-null', entry.name)
    if (!existsSync(join(dst, 'package.json'))) {
      console.log(`      → 修复 vendor 副本 ${entry.name}（pnpm 产物缺失，从源目录复制）`)
      rmSync(dst, { recursive: true, force: true })
      cpSync(src, dst, { recursive: true })
    }
  }
  console.log('[5/5] pnpm install 完成（含 vendor 副本校验）')

  // 5. 体积报告
  const nm = join(runtimeDir, 'node_modules')
  const total = dirSizeMB(runtimeDir)
  const nmSize = existsSync(nm) ? dirSizeMB(nm) : 0
  console.log(`\n=== dsh-runtime 体积 ===`)
  console.log(`node_modules: ${nmSize.toFixed(1)} MB`)
  console.log(`合计:         ${total.toFixed(1)} MB`)

  // 6. 版本标记 + tar 单归档（NSIS 阶段 6 万次写入 → 1 次顺序写入；归档带版本驱动首启升级）
  const ssidVer = JSON.parse(readFileSync(join(shellDir, 'package.json'), 'utf8')).version
  const dshPkgPath = join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  if (!existsSync(dshPkgPath)) {
    console.error('缺少 @deepseek-ai/dsh，无法生成版本标记')
    process.exit(1)
  }
  const dshVer = JSON.parse(readFileSync(dshPkgPath, 'utf8')).version
  // 依赖清单指纹（md5 前 8 位）：同版本号下插件增删（如 v0.1.4 追加
  // plugin-center）也能让首启版本对比不一致 → 触发重部署。实测教训：
  // 只靠 ssid/dsh 版本号，同版本归档内容变化对老 profile 不生效。
  // 指纹覆盖 pnpm-lock.yaml：插件版本漂移（0.1.0→0.1.1）同样触发
  // 重部署——只 hash package.json 时版本漂移是盲区（2026-08-17 同批修复）。
  const deps = JSON.parse(readFileSync(join(runtimeDir, 'package.json'), 'utf8')).dependencies ?? {}
  const lockPath = join(runtimeDir, 'pnpm-lock.yaml')
  const lockText = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : ''
  // vendor 目录清单指纹（相对路径+文件大小）：vendor 插件更新（如
  // dsh-ssid-panels 0.1.0→0.1.1）不改 package.json/lock，此前是盲区——
  // 老 profile 指纹一致跳过重部署，vendor 更新永远到不了用户
  // （2026-08-18 用户实测「关于 SSiD 无中英切换」定案）。
  const vendorLines = []
  const walkVendor = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      const r = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) { walkVendor(p, r); continue }
      vendorLines.push(`${r}:${statSync(p).size}`)
    }
  }
  const vendorDir = join(runtimeDir, 'vendor')
  if (existsSync(vendorDir)) walkVendor(vendorDir, '')
  // 出厂技能目录同样纳入指纹（v0.2.0）：技能内容/增减变化（不改版本号）
  // 也必须触发重部署，否则新技能到不了老用户（skills 由 kernel 启动时
  // 非覆盖合并到 $DSH_HOME/skills，源在 profileDir 内）。
  const skillsDir = join(runtimeDir, 'skills')
  if (existsSync(skillsDir)) walkVendor(skillsDir, 'skills')
  const depFingerprint = createHash('md5')
    .update(JSON.stringify(deps))
    .update(lockText)
    .update(vendorLines.sort().join('\n'))
    .digest('hex').slice(0, 8)
  const runtimeVer = `${ssidVer}-${dshVer}-${depFingerprint}`
  writeFileSync(join(runtimeDir, '.runtime-version'), runtimeVer + '\n')
  console.log(`[6/7] .runtime-version = ${runtimeVer}`)

  const archivePath = join(shellDir, 'dsh-runtime.tar.gz')
  console.log(`      tar -czf（${total.toFixed(0)} MB 压缩，约 1-3 分钟）…`)
  const tarR = spawnSync('tar', ['-czf', archivePath, '-C', runtimeDir, '.'], {
    stdio: 'inherit',
    timeout: 15 * 60 * 1000,
  })
  if (tarR.error || tarR.status !== 0) {
    console.error('tar 归档失败：', tarR.error?.message ?? `status=${tarR.status}`)
    process.exit(1)
  }
  console.log(`      归档: ${archivePath}（${(statSync(archivePath).size / 1024 / 1024).toFixed(1)} MB）`)

  // 7. 删除源目录（释放 ~600MB 磁盘；归档是唯一产物，随时可重跑本脚本重建）
  rmSync(runtimeDir, { recursive: true, force: true })
  console.log('[7/7] 已删除 dsh-runtime/ 源目录（产物仅剩 dsh-runtime.tar.gz）')
}

main()
