/**
 * SSiD shell (SiLing) - Electron main process entry (single-process, learning
 * from anywhere-labs).
 *
 * The DSH kernel boots directly inside the electron main process: DSH's loader
 * probes the standard Node V8 embedder with a native addon, which fails under
 * electron, so module-resolution.ts rewrites the loader's bare specifiers to
 * resolve from the profile directory (anywhere-labs' approach).
 *
 * Single-process benefit: the memory panel reads host services in-process via
 * kernel.get('memory').
 *
 * IMPORTANT: this file is plain ESM JavaScript (.mjs) compiled directly by
 * electron - it must NOT contain any TypeScript syntax (interface / type
 * annotations fail strict-mode compilation).
 */

import { register } from 'tsx/esm/api'
import { app, BrowserView, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// tsx ESM loader: transpiles kernel.ts and resolves @deepseek-ai/dsh-* to the
// adjacent DSH checkout source. Must run before any TS import.
register()
const { bootKernel } = await import('./kernel.ts')

/** Side rail width (px) when expanded / collapsed. */
const SIDE_RAIL_WIDTH = 320
const SIDE_RAIL_COLLAPSED_WIDTH = 36

/** Current side rail state; toggled via ssid:rail:toggle. */
let railCollapsed = false

/** Internal app id (ASCII for userData paths); window title carries the brand. */
const PRODUCT_NAME = 'SSiD'
const WINDOW_TITLE = '思灵 (SSiD)'

const asset = (name) => fileURLToPath(new URL(`./assets/${name}`, import.meta.url))

async function start() {
  app.setName(PRODUCT_NAME)
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  await app.whenReady()

  // ── splash window: brand boot screen shown while DSH boots ──────────────
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: WINDOW_TITLE,
    icon: asset('icon.png'),
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  })
  await win.loadFile(fileURLToPath(new URL('./splash.html', import.meta.url)))
  win.show()

  // ── boot DSH kernel (this process) ──────────────────────────────────────
  let kernel
  try {
    kernel = await bootKernel()
  } catch (cause) {
    process.stderr.write(`ssid: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    app.exit(1)
    return
  }

  // ── IPC: memory panel data bridge - in-process host service reads ───────
  // MemoryEngine API: list / search / setStatus(id, status) / forget(id).
  const memory = kernel.get('memory')
  ipcMain.handle('ssid:memory:list', () => memory?.list?.() ?? [])
  ipcMain.handle('ssid:memory:search', (_event, query) => memory?.search?.(query) ?? [])
  ipcMain.handle('ssid:memory:confirm', (_event, id) => memory?.setStatus?.(id, 'auto') ?? null)
  ipcMain.handle('ssid:memory:forget', (_event, id) => memory?.forget?.(id) ?? false)

  // ── IPC: guardian state panel - in-process engine snapshot ──────────────
  const guardian = kernel.get('guardian')
  ipcMain.handle('ssid:guardian:snapshot', () => guardian?.snapshot?.() ?? { session: null, reviewQueue: [] })

  // ── IPC: habit candidates - first-level human gate ──────────────────────
  // 确认候选 → 写入 dsh-memory（suggested 状态，第二级闸门在记忆面板）。
  const habit = kernel.get('habit')
  ipcMain.handle('ssid:habit:snapshot', () => habit?.snapshot?.() ?? [])
  ipcMain.handle('ssid:habit:confirm', async (_event, id) => {
    const candidate = habit?.confirm?.(id)
    if (candidate !== undefined && candidate !== null && memory !== undefined) {
      await memory.remember?.({ content: `[习惯] ${candidate.habit}` })
    }
    return candidate ?? null
  })
  ipcMain.handle('ssid:habit:discard', (_event, id) => habit?.discard?.(id) ?? null)

  // ── IPC: balance panel - DS/K3 account balances（分形计费迭代同款）──────
  // key 由主进程从 DSH credentials 解析（回退进程环境变量），渲染层零接触。
  const credentials = kernel.get('credentials')
  const resolveKey = async (name) => {
    const cred = credentials !== undefined ? await credentials.resolve(name) : undefined
    if (cred !== undefined && cred.value !== '') return cred.value
    const fromEnv = process.env[name]
    return fromEnv !== undefined && fromEnv !== '' ? fromEnv : undefined
  }
  const fetchBalance = async (url, apiKey) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) return { ok: false, message: `余额查询失败（HTTP ${res.status}）` }
    return { ok: true, data: await res.json() }
  }
  const balanceResult = (ok, isAvailable, balanceInfos, message) =>
    ({ ok, isAvailable, balanceInfos, ...(message === undefined ? {} : { message }) })

  ipcMain.handle('ssid:balance:deepseek', async () => {
    const key = await resolveKey('DEEPSEEK_API_KEY')
    if (key === undefined) return balanceResult(false, false, [], '未配置 DEEPSEEK_API_KEY')
    const r = await fetchBalance('https://api.deepseek.com/user/balance', key)
    if (!r.ok) return balanceResult(false, false, [], r.message)
    const infos = (r.data.balance_infos ?? []).map(b => ({ currency: b.currency ?? 'CNY', totalBalance: b.total_balance ?? '0' }))
    return balanceResult(true, r.data.is_available === true, infos)
  })
  ipcMain.handle('ssid:balance:kimi', async () => {
    const key = await resolveKey('MOONSHOT_API_KEY')
    if (key === undefined) return balanceResult(false, false, [], '未配置 MOONSHOT_API_KEY')
    const r = await fetchBalance('https://api.moonshot.cn/v1/users/me/balance', key)
    if (!r.ok) return balanceResult(false, false, [], r.message)
    const available = r.data?.data?.available_balance
    const value = typeof available === 'number' ? available : 0
    return balanceResult(true, value > 0, [{ currency: 'CNY', totalBalance: String(value) }])
  })

  // ── IPC: file preview panel - produced-file tracking + read/open ───────
  // 来源：write/edit 工具调用的 file_path（会话日志事件流）。
  // 运行时事件增量维护 + 首次打开文件 tab 时全量扫描存量会话。
  const producedFiles = new Map() // absPath -> { path, seq, time }
  const PRODUCED_CAP = 500

  const safeJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  }
  const noteProduced = (event, cwd) => {
    const data = event?.data ?? {}
    if (event?.type !== 'tool/call') return
    const name = data.name
    if (name !== 'write' && name !== 'edit') return
    const args = typeof data.arguments === 'string' ? safeJson(data.arguments) : data.arguments
    const filePath = args?.file_path
    if (typeof filePath !== 'string' || filePath === '') return
    const abs = isAbsolute(filePath) ? filePath : join(cwd ?? '', filePath)
    const entry = producedFiles.get(abs)
    if (entry !== undefined) {
      entry.seq = Math.max(entry.seq, event.seq ?? 0)
      entry.time = Date.now()
      return
    }
    producedFiles.set(abs, { path: abs, seq: event.seq ?? 0, time: Date.now() })
    if (producedFiles.size > PRODUCED_CAP) {
      let oldest = null
      for (const value of producedFiles.values()) {
        if (oldest === null || value.time < oldest.time) oldest = value
      }
      if (oldest !== null) producedFiles.delete(oldest.path)
    }
  }

  // 运行时事件火线（live 会话；存量由 scanProducedFiles 全量补）。
  kernel.ctx.on('session/event', (session, event) => {
    noteProduced(event, session?.header?.cwd)
  })

  let filesScanned = false
  let filesScanning = null
  const scanProducedFiles = async () => {
    if (filesScanned || filesScanning !== null) return filesScanning
    filesScanning = (async () => {
      const persistence = kernel.get('sessionPersistence')
      const headers = persistence !== undefined ? await persistence.list() : []
      for (const header of headers) {
        try {
          const inspection = await persistence.inspect(header.id)
          for (const event of inspection.events) noteProduced(event, header.cwd)
        } catch {
          // 跳过不可读会话（坏尾等），不阻塞其余扫描
        }
      }
      filesScanned = true
      filesScanning = null
    })()
    return filesScanning
  }

  ipcMain.handle('ssid:files:list', async () => {
    await scanProducedFiles()
    return [...producedFiles.values()].sort((a, b) => b.time - a.time).slice(0, 100)
  })
  ipcMain.handle('ssid:files:read', (_event, filePath) => {
    if (typeof filePath !== 'string') return { ok: false, message: '路径无效' }
    try {
      const content = readFileSync(filePath)
      return { ok: true, size: content.length, buffer: content }
    } catch (cause) {
      return { ok: false, message: cause?.message ?? '读取失败' }
    }
  })
  ipcMain.handle('ssid:files:open', async (_event, filePath) => {
    if (typeof filePath !== 'string') return '路径无效'
    return shell.openPath(filePath)
  })

  // ── window + dual BrowserView (official UI + side rail) ────────────────
  // BrowserView A: official DSH loopback UI (replaces the splash page).
  const mainView = new BrowserView({ webPreferences: { sandbox: true, contextIsolation: true } })
  win.setBrowserView(mainView)
  await mainView.webContents.loadURL(`http://127.0.0.1:${kernel.port}/`)

  // BrowserView B: SSiD side rail (memory panel).
  const sideRail = new BrowserView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
    },
  })
  win.addBrowserView(sideRail)
  await sideRail.webContents.loadFile(fileURLToPath(new URL('./side-rail/index.html', import.meta.url)))

  const layout = () => {
    const [width, height] = win.getContentSize()
    const railWidth = railCollapsed ? SIDE_RAIL_COLLAPSED_WIDTH : SIDE_RAIL_WIDTH
    mainView.setBounds({ x: 0, y: 0, width: width - railWidth, height })
    sideRail.setBounds({ x: width - railWidth, y: 0, width: railWidth, height })
  }
  win.on('resize', layout)
  layout()

  // 侧栏收起/展开：主进程改布局，侧栏页面同步 UI 状态。
  ipcMain.handle('ssid:rail:toggle', () => {
    railCollapsed = !railCollapsed
    layout()
    sideRail.webContents.send('ssid:rail-state', railCollapsed)
    return railCollapsed
  })

  // ── tray: close-to-tray, tray menu (show / quit) ────────────────────────
  const tray = new Tray(nativeImage.createFromPath(asset('tray.png')))
  tray.setToolTip(WINDOW_TITLE)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示思灵', click: () => { win.show(); win.focus() } },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]))
  tray.on('click', () => { win.show(); win.focus() })

  let quitting = false
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      win.hide()
    }
  })
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    // shutdown(0) awaits the cordis fiber dispose, then exits via app.exit.
    void kernel.shutdown(0).catch(() => app.exit(0))
  })

  // 第二实例启动：聚焦现有窗口。
  app.on('second-instance', () => {
    win.show()
    win.focus()
  })

  win.show()
}

void start()
