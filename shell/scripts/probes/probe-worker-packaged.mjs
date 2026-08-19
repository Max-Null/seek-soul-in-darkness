// 模拟 DSH host (win32-dialog-host) spawn 思灵.exe 跑 worker.cjs。
// 验证:打包版思灵.exe 的 worker 分支是否触发、是否 spawn 内置 node.exe、
// IPC 消息是否原样转发回 host。需先 `npm run pack` 产出 win-unpacked。
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const exe = fileURLToPath(new URL('../../dist-electron/win-unpacked/思灵.exe', import.meta.url))
const worker = fileURLToPath(new URL('./fake-worker.cjs', import.meta.url))
const env = { ...process.env, DSH_DIALOG_TITLE: 'Probe Test Dialog' }

const child = spawn(exe, [worker], { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true })

const timer = setTimeout(() => {
  console.log('[probe-worker-packaged] TIMEOUT after 12s, killing')
  child.kill()
}, 12000)

child.on('message', (m) => {
  console.log('[probe-worker-packaged] GOT MESSAGE:', JSON.stringify(m))
  if (m?.kind === 'done') {
    console.log('[probe-worker-packaged] SUCCESS: worker done path=', m.path)
    clearTimeout(timer)
    child.kill()
  }
})
child.on('error', (e) => console.log('[probe-worker-packaged] spawn error:', e.message))
child.on('exit', (code, signal) => {
  console.log(`[probe-worker-packaged] child exit code=${code} signal=${signal}`)
  clearTimeout(timer)
})
