/**
 * updater-core.mjs — 在线增量更新器纯逻辑（无 Electron/electron-updater 依赖，node --test 可测）。
 *
 * createShellUpdaterCore({ isPackaged, autoUpdater, app })：
 *   - isPackaged=false（dev）：所有方法返回 unavailable，不碰 autoUpdater；
 *   - packaged：状态机与事件分发（checking/available/not-available/downloading/downloaded/error），
 *     install 仅在 downloaded 且存在安装器时以 args 静默拉起安装器后退出；
 *   - onStatus 订阅即回放最近状态（轮询与广播两用）。
 * autoUpdater 接口（与 electron-updater 对齐的最小面）：
 *   { on(event, cb), checkForUpdates(), downloadUpdate(), downloadedUpdateHelper: { file } }
 */

/** 统一文案（对用户可读；未识别原样透传）。 */
export function translateError(err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (/cannot find|latest\.yml/i.test(msg)) return '未找到更新信息，请稍后再试'
  if (/net::|econn|enotfound|network/i.test(msg)) return '网络连接失败，请检查网络后重试'
  if (/401|403|404/i.test(msg)) return '无法访问更新服务器'
  return msg
}

/** releaseNotes 归一为纯文本（string | Note[] → string）。 */
export function extractNotes(notes) {
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((n) => (n && typeof n === 'object' && 'note' in n ? String(n.note) : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

export function createShellUpdaterCore({ isPackaged, autoUpdater, app }) {
  const listeners = new Set()
  let status = { state: 'idle' }
  const emit = (event) => {
    status = { ...status, ...event }
    for (const callback of listeners) {
      try { callback(status) } catch { /* 单个订阅者异常不影响后续 */ }
    }
  }

  if (isPackaged) {
    autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
    autoUpdater.on('update-available', (info) => emit({
      state: 'available',
      version: String(info?.version ?? ''),
      releaseNotes: extractNotes(info?.releaseNotes),
    }))
    autoUpdater.on('update-not-available', (info) => emit({ state: 'not-available', version: String(info?.version ?? '') }))
    autoUpdater.on('download-progress', (p) => emit({
      state: 'downloading',
      percent: Math.round(Number(p?.percent) || 0),
      transferred: Number(p?.transferred) || 0,
      total: Number(p?.total) || 0,
      bytesPerSecond: Number(p?.bytesPerSecond) || 0,
    }))
    autoUpdater.on('update-downloaded', (info) => emit({ state: 'downloaded', version: String(info?.version ?? '') }))
    autoUpdater.on('error', (err) => emit({ state: 'error', message: translateError(err) }))
  } else {
    status = { state: 'unavailable', message: '开发模式（未打包）：在线更新不可用' }
  }

  return {
    check: async () => {
      if (!isPackaged) return status
      try {
        await autoUpdater.checkForUpdates()
      } catch (err) {
        emit({ state: 'error', message: translateError(err) })
      }
      return status
    },
    download: async () => {
      if (!isPackaged) return { ok: false, error: status.message }
      try {
        await autoUpdater.downloadUpdate()
        return { ok: status.state === 'downloaded' }
      } catch (err) {
        return { ok: false, error: translateError(err) }
      }
    },
    install: async () => {
      if (!isPackaged) return { ok: false, error: status.message }
      const installer = autoUpdater.downloadedUpdateHelper?.file
      if (status.state !== 'downloaded' || typeof installer !== 'string' || installer === '') {
        return { ok: false, error: '尚未完成下载' }
      }
      try {
        // assisted 安装器静默升级（保留安装路径/配置；数据在 %APPDATA% 与 ~/.dsh 不受影响）
        autoUpdater.spawnInstaller(installer)
        setTimeout(() => { app.quit() }, 500)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err instanceof Error ? err.message : err) }
      }
    },
    onStatus: (callback) => {
      listeners.add(callback)
      try { callback(status) } catch { /* 初始回放失败不影响订阅 */ }
      return () => { listeners.delete(callback) }
    },
  }
}
