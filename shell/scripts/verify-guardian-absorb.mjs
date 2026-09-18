/**
 * guardian 写失败兜底的**内核级**验证：在隔离实例里注入真实的 Windows 独占锁。
 *
 * 与单测的区别：单测用假 KvUnit 直接抛错；这里走完整链路——真实内核 + 真实
 * storage-json + 真实的进程外独占句柄（另一个进程用 FileShare.None 占住
 * guardian.json），因此同时验证两件事：故障是真的（绕过兜底裸写会抛 EPERM）、
 * 兜底是真的（guardian 的写链与事件入口都不让失败逃逸到进程）。
 *
 * 跑法（隔离环境，不碰真实 profile；`SSID_PROFILE_NAME` 见手册 §3）：
 *   $env:DSH_HOME='<隔离 home>'; $env:SSID_PROFILE_NAME='ssid-dev'
 *   $env:SSID_MCP_CG_WS='<空目录>'
 *   node --import tsx/esm scripts/verify-guardian-absorb.mjs
 *
 * 退出码：0 = 故障成立且未逃逸；1 = 任一条不成立。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { bootKernel } from '../kernel.ts'

const home = process.env.DSH_HOME
if (home === undefined || home === '') throw new Error('需要 DSH_HOME')
const guardianFile = join(home, 'storages', 'guardian', 'guardian.json')
const lines = []
const log = (text) => {
  const line = `[verify] ${text}`
  console.log(line)
  lines.push(line)
}

const kernel = await bootKernel()
log(`内核 boot ok，port=${kernel.port}`)

const guardian = kernel.get('guardian')
if (guardian === undefined) {
  log('FAIL：guardian 服务未加载')
  await kernel.shutdown(1)
  process.exit(1)
}
log('guardian 服务已加载（隔离 profile 的 junction 指向真实插件实体）')

const state = guardian.snapshot().session

// ── 1. 对照组：无故障时写入应当成功 ────────────────────────────────────────
await guardian.flushSession('verify-healthy', state)
log(`对照组（无故障）写入完成 → guardian.json 存在=${existsSync(guardianFile)}`)

// ── 2. 注入故障：另一个进程以 FileShare.None 占住目标文件 ───────────────────
const holder = spawn(
  'pwsh',
  ['-NoProfile', '-NonInteractive', '-Command',
    `$fs=[System.IO.File]::Open('${guardianFile}','Open','ReadWrite','None');`
    + ` Write-Output 'LOCKED'; Start-Sleep -Seconds 120`],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
await new Promise((resolve) => {
  holder.stdout.on('data', (chunk) => { if (String(chunk).includes('LOCKED')) resolve() })
  setTimeout(resolve, 10_000)
})
log('已用 FileShare.None 占住目标文件（模拟进程外瞬时锁）')

// ── 3. 自证故障成立：绕过兜底裸写一次，必须抛 ──────────────────────────────
let injected = false
try {
  await guardian.unit.putRecord('sessions', 'verify-raw', state)
  log('⚠️ 裸写入也成功 —— 这次没撞上锁，实验无效')
} catch (error) {
  injected = true
  log(`故障注入成立：裸写入抛 ${error?.code ?? ''} ${error?.message ?? error}`)
}

// ── 4. 实验组：guardian 的写链不得让失败逃逸 ──────────────────────────────
let escaped = false
try {
  await guardian.flushSession('verify-locked', state)
  log('实验组（撞锁）flushSession 正常返回 → 写链兜底生效')
} catch (error) {
  escaped = true
  log(`FAIL：flushSession 抛出了 ${error?.message ?? error} —— 兜底未生效`)
}

// ── 5. 事件入口兜底：让 handleEvent 内部抛错，验证不逃逸 ───────────────────
try {
  await guardian.handleEventSafely({ id: 'verify-session' }, { type: 'tool/call', data: null })
  log('事件入口（内部抛错）正常返回 → handleEventSafely 兜底生效')
} catch (error) {
  escaped = true
  log(`FAIL：handleEventSafely 抛出了 ${error?.message ?? error}`)
}

// ── 6. 自愈：释放句柄后，写链必须仍然可用 ─────────────────────────────────
holder.kill()
await sleep(800)
try {
  await guardian.flushSession('verify-recovered', state)
  log('释放句柄后再次写入成功 → writeChain 未被毒化')
} catch (error) {
  escaped = true
  log(`FAIL：释放后写入仍失败 ${error?.message ?? error}`)
}

// ── 7. 内核存活 ───────────────────────────────────────────────────────────
const res = await fetch(`http://127.0.0.1:${kernel.port}/`)
log(`内核仍存活：HTTP ${res.status}`)

await kernel.shutdown(0)

console.log('\n================ 结论 ================')
console.log(`故障注入成立 : ${injected ? '是' : '否'}`)
console.log(`失败逃逸进程 : ${escaped ? '是（兜底失效）' : '否（兜底生效）'}`)
process.exit(injected && !escaped ? 0 : 1)
