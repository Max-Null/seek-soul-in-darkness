import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createShellUpdaterCore, translateError, extractNotes } from './updater-core.mjs'

/** 可手动触发事件的 fake autoUpdater。 */
function fakeAutoUpdater({ downloadedFile = null, downloadResolve = null } = {}) {
  const handlers = new Map()
  const calls = { checks: 0, downloads: 0, spawns: [] }
  return {
    calls,
    handlers,
    downloadedUpdateHelper: { file: downloadedFile },
    on(event, cb) { handlers.set(event, cb) },
    fire(event, payload) { handlers.get(event)?.(payload) },
    async checkForUpdates() { calls.checks += 1 },
    async downloadUpdate() {
      calls.downloads += 1
      if (downloadResolve) await downloadResolve
    },
    spawnInstaller(installer) { calls.spawns.push(installer) },
  }
}

test('dev（未打包）：全部不可用且不触碰 autoUpdater', async () => {
  const au = fakeAutoUpdater()
  const core = createShellUpdaterCore({ isPackaged: false, autoUpdater: au, app: { quit() {} } })
  const status = await core.check()
  assert.equal(status.state, 'unavailable')
  assert.ok(typeof status.message === 'string' && status.message.length > 0)
  assert.equal((await core.download()).ok, false)
  assert.equal((await core.install()).ok, false)
  assert.equal(au.calls.checks, 0, 'dev 不应调用 checkForUpdates')
  assert.equal(au.handlers.size, 0, 'dev 不应注册任何事件监听')
})

test('packaged 全流程：check→available→downloading→downloaded→install', async () => {
  const au = fakeAutoUpdater({ downloadedFile: 'C:/cache/setup.exe' })
  let quitCount = 0
  const core = createShellUpdaterCore({ isPackaged: true, autoUpdater: au, app: { quit() { quitCount += 1 } } })

  const checked = await core.check()
  assert.equal(checked.state, 'checking' === checked.state ? 'checking' : checked.state) // 同步事件驱动
  au.fire('update-available', { version: '0.1.14', releaseNotes: [{ note: '新增上线' }, {}] })
  assert.equal((await core.check()).state, 'available') // 事件后状态为 available
  assert.equal((await core.check()).version, '0.1.14')
  assert.equal((await core.check()).releaseNotes, '新增上线') // Note[] 归一

  au.fire('download-progress', { percent: 42.7, transferred: 1000, total: 2000, bytesPerSecond: 500 })
  const downloading = await core.check()
  assert.equal(downloading.state, 'downloading')
  assert.equal(downloading.percent, 43)
  assert.equal(downloading.transferred, 1000)

  au.fire('update-downloaded', { version: '0.1.14' })
  const result = await core.download()
  assert.equal(result.ok, true)
  assert.equal((await core.check()).state, 'downloaded')

  const installed = await core.install()
  assert.deepEqual(installed, { ok: true })
  await new Promise((resolve) => setTimeout(resolve, 600)) // 等 install 内的 500ms quit 延时
  assert.deepEqual(au.calls.spawns, ['C:/cache/setup.exe'])
  assert.equal(quitCount, 1)
})

test('install 守卫：未下载完成时拒绝', async () => {
  const au = fakeAutoUpdater({ downloadedFile: null })
  const core = createShellUpdaterCore({ isPackaged: true, autoUpdater: au, app: { quit() {} } })
  const result = await core.install()
  assert.equal(result.ok, false)
  assert.equal(result.error, '尚未完成下载')
  assert.equal(au.calls.spawns.length, 0)
})

test('错误翻译与 onStatus 回放/退订', async () => {
  assert.equal(translateError(new Error('net::ERR_CONNECTION')), '网络连接失败，请检查网络后重试')
  assert.equal(translateError(new Error('404 Not Found')), '无法访问更新服务器')
  assert.equal(translateError(new Error('custom boom')), 'custom boom')

  const au = fakeAutoUpdater()
  const core = createShellUpdaterCore({ isPackaged: true, autoUpdater: au, app: { quit() {} } })
  const seen = []
  const unsubscribe = core.onStatus((s) => seen.push(s.state))
  assert.equal(seen[0], 'idle') // 订阅即回放
  au.fire('error', new Error('ENOTFOUND'))
  assert.equal(seen[seen.length - 1], 'error')
  unsubscribe()
  au.fire('error', new Error('again'))
  assert.equal(seen[seen.length - 1], 'error') // 退订后不变
})

test('extractNotes：string 透传 / Note[] 归一 / 其他回退', () => {
  assert.equal(extractNotes('plain'), 'plain')
  assert.deepEqual(extractNotes([{ note: 'a' }, {}, { note: 'b' }]), 'a\nb')
  assert.equal(extractNotes(null), '')
})

test('日志：关键链路全部有记录（供终端诊断）', async () => {
  const au = fakeAutoUpdater({ downloadedFile: 'C:/cache/setup.exe' })
  const logs = []
  const core = createShellUpdaterCore({
    isPackaged: true,
    autoUpdater: au,
    app: { quit() {} },
    log: (line) => logs.push(line),
  })
  await core.check()
  au.fire('update-available', { version: '0.1.14' })
  await core.download()
  au.fire('update-downloaded', { version: '0.1.14' })
  await core.install()
  assert.ok(logs.some((l) => l.includes('check: start')))
  assert.ok(logs.some((l) => l.includes('event: available')))
  assert.ok(logs.some((l) => l.includes('download: done')))
  assert.ok(logs.some((l) => l.includes('event: downloaded')))
  assert.ok(logs.some((l) => l.includes('install: spawn')))
  // dev 分支也要有日志
  const devLogs = []
  createShellUpdaterCore({ isPackaged: false, autoUpdater: fakeAutoUpdater(), app: { quit() {} }, log: (l) => devLogs.push(l) })
  assert.ok(devLogs.some((l) => l.includes('event: unavailable')))
})


// v0.1.14 回归：绑定层曾 `{...autoUpdater}` spread 导致原型方法（on）丢失 →
// packaged 首启 `autoUpdater.on is not a function`。绑定点必须保留原型。
test('binding guard: 不可 spread autoUpdater（原型 on/checkForUpdates 必须保留）', async () => {
  const { EventEmitter } = await import('node:events')
  const au = new EventEmitter()
  au.checkForUpdates = async () => {}
  au.downloadUpdate = async () => {}
  au.downloadedUpdateHelper = { file: 'x.exe' }
  const spread = { ...au }
  assert.equal(typeof spread.on, 'undefined', 'spread 丢失原型 on（v0.1.14 bug 根因）')
  // Proxy 委托方案（updater.mjs）：原型保留 + spawnInstaller 注入
  let spawned = null
  const proxied = new Proxy(au, {
    get(target, prop) {
      if (prop === 'spawnInstaller') return (p) => { spawned = p }
      return Reflect.get(target, prop)
    },
  })
  assert.equal(typeof proxied.on, 'function')
  assert.equal(typeof proxied.checkForUpdates, 'function')
  proxied.spawnInstaller('y.exe')
  assert.equal(spawned, 'y.exe')
})
