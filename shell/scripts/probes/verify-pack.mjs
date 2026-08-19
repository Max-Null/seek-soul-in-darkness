// 打包产物验证:对 win-unpacked 产物跑 worker 链路 probe（模拟 host spawn）。
// 用法:node verify-pack.mjs [exePath]  （默认 dist-electron 的思灵.exe）
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const exe = process.argv[2] ?? fileURLToPath(new URL('../../dist-electron/win-unpacked/思灵.exe', import.meta.url))
const worker = fileURLToPath(new URL('./fake-worker.cjs', import.meta.url))

if (!existsSync(exe)) {
  console.log('[verify-pack] EXE NOT FOUND:', exe)
  process.exit(2)
}
console.log('[verify-pack] exe =', exe)
const env = { ...process.env, DSH_DIALOG_TITLE: 'Verify Pack Dialog' }
const child = spawn(exe, [worker], { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true })
const timer = setTimeout(() => { console.log('[verify-pack] TIMEOUT'); child.kill() }, 15000)
child.on('message', (m) => {
  console.log('[verify-pack] GOT MESSAGE:', JSON.stringify(m))
  if (m?.kind === 'done') {
    console.log('[verify-pack] SUCCESS: done path=', m.path)
    clearTimeout(timer)
    child.kill()
  }
})
child.on('error', (e) => console.log('[verify-pack] spawn error:', e.message))
child.on('exit', (code, signal) => {
  console.log(`[verify-pack] exit code=${code} signal=${signal}`)
  clearTimeout(timer)
})
