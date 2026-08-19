// 验证源码 main.mjs 的 worker 模式:spawn dev electron 直跑 main.mjs <fake-worker.cjs>,
// 模拟 host spawn 思灵.exe 的场景（execPath 是 electron）。预期 showing/done 全量转发。
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const electron = fileURLToPath(new URL('../../node_modules/electron/dist/electron.exe', import.meta.url))
const main = fileURLToPath(new URL('../../main.mjs', import.meta.url))
const worker = fileURLToPath(new URL('./fake-worker.cjs', import.meta.url))
const env = { ...process.env, DSH_DIALOG_TITLE: 'Probe2 Test Dialog' }

const child = spawn(electron, [main, worker], { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true })

const timer = setTimeout(() => {
  console.log('[probe-worker-source] TIMEOUT after 12s, killing')
  child.kill()
}, 12000)

child.on('message', (m) => {
  console.log('[probe-worker-source] GOT MESSAGE:', JSON.stringify(m))
  if (m?.kind === 'done') {
    console.log('[probe-worker-source] SUCCESS: done path=', m.path)
    clearTimeout(timer)
    child.kill()
  }
})
child.on('error', (e) => console.log('[probe-worker-source] spawn error:', e.message))
child.on('exit', (code, signal) => {
  console.log(`[probe-worker-source] child exit code=${code} signal=${signal}`)
  clearTimeout(timer)
})
