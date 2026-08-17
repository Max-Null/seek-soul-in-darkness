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

/** 缺失 peer 清单（pnpm peers check 实测：官方包的 peer 依赖，pnpm 不自动装） */
const MISSING_PEERS = [
  // 官方运行时 peer（版本与闭包一致，DSH 源码 tsconfig 同源）
  '@deepseek-ai/dsh-fs@0.1.0-rc.6',
  '@deepseek-ai/dsh-invariants@0.1.0-rc.6',
  '@deepseek-ai/dsh-scope@0.1.0-rc.6',
  '@deepseek-ai/dsh-timeout@0.1.0-rc.6',
  '@deepseek-ai/dsh-code-runtime@0.1.0-rc.6',
  '@deepseek-ai/dsh-atomic-write@0.1.0-rc.6',
  '@deepseek-ai/dsh-bash-local@0.1.0-rc.6',
  '@deepseek-ai/dsh-sandbox@0.1.0-rc.6',
  '@deepseek-ai/dsh-shell@0.1.0-rc.6',
  '@deepseek-ai/dsh-anonymous-user-id@0.1.0-rc.6',
  '@deepseek-ai/dsh-session-telemetry@0.1.0-rc.6',
  '@deepseek-ai/dsh-session-title-llm@0.1.0-rc.6',
  '@deepseek-ai/dsh-spill@0.1.0-rc.6',
  '@deepseek-ai/dsh-output-retention@0.1.0-rc.6',
  '@deepseek-ai/dsh-subagent-in-process-driver@0.1.0-rc.6',
  '@deepseek-ai/dsh-subprocess@0.1.0-rc.6',
  '@deepseek-ai/dsh-compaction@0.1.0-rc.6',
  '@deepseek-ai/dsh-workflow@0.1.0-rc.6',
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
  console.log('[2/5] 已复制 profile-template')

  // 3. 注入 @deepseek-ai/dsh 聚合包（boot 的 installAnchor + 官方闭包来源）
  //    精确 pin（无 ^）：rc 阶段 ^ 会悄悄升级到未回归验证的版本，DSH 跟进必须是显式决策
  const pkgPath = join(runtimeDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.dependencies['@deepseek-ai/dsh'] = '0.1.0-rc.6'
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
  console.log('[3/5] 已注入 @deepseek-ai/dsh 0.1.0-rc.6（精确 pin）')

  // 3.5 扁平布局（electron-builder 26 不复制 pnpm symlink 节点，必须 hoisted）
  writeFileSync(join(runtimeDir, '.npmrc'), 'node-linker=hoisted\n')
  console.log('[3.5/5] 已写入 .npmrc（node-linker=hoisted）')

  // 4. pnpm install + 补 peer
  const nodeCandidates = [
    process.env.DSH_NODE,
    'D:\\Program Files\\nvm\\v22.22.2\\node.exe',
  ].filter(Boolean)
  const node = nodeCandidates.find((c) => existsSync(c))
  if (!node) {
    console.error('缺少 Node（DSH 要求 ≥22.13），可用环境变量 DSH_NODE 指定')
    process.exit(1)
  }
  const pnpmCandidates = [
    process.env.PNPM_CMD,
    join(dirname(node), 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
  ].filter(Boolean)
  const pnpm = pnpmCandidates.find((p) => existsSync(p)) || null
  if (!pnpm) {
    console.error('缺少 pnpm 11.x，可用环境变量 PNPM_CMD 指定')
    process.exit(1)
  }
  console.log(`[4/5] node=${node}\n      pnpm=${pnpm}`)

  const runPnpm = (label, args) => {
    console.log(`      → ${label}`)
    // timeout 防止 ERESOLVE 类解析死循环挂住（实测 npm --force 卡死数十分钟）
    const r = spawnSync(node, [pnpm, ...args], {
      cwd: runtimeDir,
      stdio: 'inherit',
      timeout: 10 * 60 * 1000,
      env: {
        ...process.env,
        PATH: dirname(node) + ';' + process.env.PATH,
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
  // pnpm 11 不自动装 peer（auto-install-peers 配置实测失效），显式补装
  // 成功后这些 peer 会写进 package.json dependencies，后续重跑 install 天然自愈
  runPnpm(`pnpm add 缺失 peer（${MISSING_PEERS.length} 个）`, ['add', ...MISSING_PEERS])
  console.log('[5/5] pnpm install 完成')

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
  const deps = JSON.parse(readFileSync(join(runtimeDir, 'package.json'), 'utf8')).dependencies ?? {}
  const depFingerprint = createHash('md5').update(JSON.stringify(deps)).digest('hex').slice(0, 8)
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
