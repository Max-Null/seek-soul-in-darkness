/**
 * updater.mjs — SSiD 在线增量更新（electron-updater + NSIS blockmap 差分）。
 *
 * 设计参照 fractal electron/main/updater.ts（已验证链路）：
 *   - 仅打包版（app.isPackaged）可用；dev 下所有方法返回 unavailable
 *     （无发布地址，静默检查无意义）；
 *   - autoDownload=false：先提示再下载（带宽自律）；
 *   - 启动 10s 后静默检查，无新版不打扰（only status 记录）；
 *   - 下载完成（update-downloaded）后 install：以 /S 静默拉起安装器
 *     （assisted NSIS 同路径升级，保留配置与数据），然后退出接管。
 *
 * 状态流（订阅 onStatus 或轮询 check 返回值）：
 *   idle → checking → available(version, releaseNotes)
 *                 ↘ not-available(version) → downloading(percent…)
 *                                                 ↘ downloaded → (install → 进程退出)
 *   error(message) 任一环节
 */
import { app } from 'electron'
import { spawn } from 'node:child_process'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

function extractNotes(notes) {
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((n) => (n && typeof n === 'object' && 'note' in n ? String(n.note) : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function translateError(err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (/cannot find|latest\.yml/i.test(msg)) return '未找到更新信息，请稍后再试'
  if (/net::|econn|enotfound|network/i.test(msg)) return '网络连接失败，请检查网络后重试'
  if (/401|403|404/i.test(msg)) return '无法访问更新服务器'
  return msg
}

export function createShellUpdater() {
  const listeners = new Set()
  let status = { state: 'idle' }
  const emit = (event) => {
    status = { ...status, ...event }
    for (const callback of listeners) {
      try { callback(status) } catch { /* 单个订阅者异常不影响后续 */ }
    }
  }

  if (app.isPackaged) {
    autoUpdater.autoDownload = false
    autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
    autoUpdater.on('update-available', (info) => emit({
      state: 'available',
      version: String(info.version ?? ''),
      releaseNotes: extractNotes(info.releaseNotes),
    }))
    autoUpdater.on('update-not-available', (info) => emit({ state: 'not-available', version: String(info.version ?? '') }))
    autoUpdater.on('download-progress', (p) => emit({
      state: 'downloading',
      percent: Math.round(Number(p.percent) || 0),
      transferred: Number(p.transferred) || 0,
      total: Number(p.total) || 0,
      bytesPerSecond: Number(p.bytesPerSecond) || 0,
    }))
    autoUpdater.on('update-downloaded', (info) => emit({ state: 'downloaded', version: String(info.version ?? '') }))
    autoUpdater.on('error', (err) => emit({ state: 'error', message: translateError(err) }))
    // 启动静默检查：延迟 10s 不打扰启动流程；无新版不弹任何东西
    setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}) }, 10_000)
  } else {
    status = { state: 'unavailable', message: '开发模式（未打包）：在线更新不可用' }
  }

  return {
    check: async () => {
      if (!app.isPackaged) return status
      try {
        await autoUpdater.checkForUpdates()
      } catch (err) {
        emit({ state: 'error', message: translateError(err) })
      }
      return status
    },
    download: async () => {
      if (!app.isPackaged) return { ok: false, error: status.message }
      try {
        await autoUpdater.downloadUpdate()
        return { ok: status.state === 'downloaded' }
      } catch (err) {
        return { ok: false, error: translateError(err) }
      }
    },
    install: async () => {
      if (!app.isPackaged) return { ok: false, error: status.message }
      const installer = autoUpdater.downloadedUpdateHelper?.file
      if (status.state !== 'downloaded' || installer === undefined || installer === '') {
        return { ok: false, error: '尚未完成下载' }
      }
      try {
        // assisted 安装器静默升级（保留安装路径/配置；数据在 %APPDATA% 与 ~/.dsh 不受影响）
        spawn(installer, ['/S'], { detached: true, stdio: 'ignore' }).unref()
        setTimeout(() => { app.quit() }, 500)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err instanceof Error ? err.message : err) }
      }
    },
    onStatus: (callback) => {
      listeners.add(callback)
      callback(status)
      return () => { listeners.delete(callback) }
    },
  }
}
