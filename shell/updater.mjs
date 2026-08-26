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

const { autoUpdater } = electronUpdater

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
      autoUpdater: {
        ...autoUpdater,
        // install 静默拉起安装器（assisted NSIS /S）；detached 后主进程退出接管；
        // 子进程 exit/error 记日志（诊断安装器失败）。
        spawnInstaller: (installer) => {
          const child = spawn(installer, ['/S'], { detached: true, stdio: 'ignore' })
          child.on('error', (err) => log(`installer: spawn error ${err.message}`))
          child.on('exit', (code, signal) => log(`installer: exit code=${code} signal=${signal ?? 'none'}`))
          child.unref()
        },
      },
      app,
      log,
    })
  } catch (err) {
    updaterLog(`init: failed ${err instanceof Error ? err.stack : String(err)}`)
    throw err
  }
}
