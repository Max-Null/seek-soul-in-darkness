/**
 * updater.mjs — 绑定层：把 electron-updater 接到 updater-core 纯逻辑。
 * 仅由 main.mjs（Electron 主进程）加载；单测走 updater-core.test.mjs。
 *
 * 日志：同步写 ~/.ssid/updater.log（诊断通道，不依赖主进程日志 flush；
 * 主进程退出前每次 appendFileSync 已落盘）+ console（命令行启动时可见）。
 */
import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import electronUpdater from 'electron-updater'
import { createShellUpdaterCore } from './updater-core.mjs'

const { autoUpdater: rawAutoUpdater } = electronUpdater

/**
 * 注入 spawnInstaller（NSIS /S 静默拉起）但不展开对象：
 * `{...autoUpdater}` 会丢失 EventEmitter 原型方法（on/checkForUpdates…），
 * packaged 首启即 `autoUpdater.on is not a function`。Proxy 委托保留原型，
 * 仅拦截 spawnInstaller 一个键。
 */
const spawnInstaller = (installer) => {
  const child = spawn(installer, ['/S'], { detached: true, stdio: 'ignore' })
  child.on('error', (err) => updaterLog(`installer: spawn error ${err.message}`))
  child.on('exit', (code, signal) => updaterLog(`installer: exit code=${code} signal=${signal ?? 'none'}`))
  child.unref()
}
const autoUpdater = new Proxy(rawAutoUpdater, {
  get(target, prop, receiver) {
    if (prop === 'spawnInstaller') return spawnInstaller
    return Reflect.get(target, prop, receiver)
  },
})

const UPDATER_LOG = join(homedir(), '.ssid', 'updater.log')
const updaterLog = (message) => {
  const line = `${new Date().toISOString()} [updater] ${message}\n`
  try {
    mkdirSync(join(homedir(), '.ssid'), { recursive: true })
    appendFileSync(UPDATER_LOG, line)
  } catch { /* 日志失败不阻塞更新流程 */ }
  try { console.log(line.trimEnd()) } catch { /* stdout 已死时忽略 */ }
}

export function createShellUpdater() {
  updaterLog(`init: isPackaged=${app.isPackaged}`)
  const log = (message) => updaterLog(message)
  try {
    return createShellUpdaterCore({
      isPackaged: app.isPackaged,
      // 直接传 autoUpdater（原型保留）；spawnInstaller 走 Proxy 注入
      autoUpdater,
      app,
      log,
    })
  } catch (err) {
    updaterLog(`init: failed ${err instanceof Error ? err.stack : String(err)}`)
    throw err
  }
}
