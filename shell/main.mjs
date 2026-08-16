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
import { app, BrowserView, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'

// tsx ESM loader: transpiles kernel.ts and resolves @deepseek-ai/dsh-* to the
// adjacent DSH checkout source. Must run before any TS import.
register()
const { bootKernel } = await import('./kernel.ts')

/** Side rail width (px). */
const SIDE_RAIL_WIDTH = 320

/** App name / window title. */
const PRODUCT_NAME = 'SiLing'
const WINDOW_TITLE = 'SiLing (SSiD)'

async function start() {
  app.setName(PRODUCT_NAME)
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  await app.whenReady()

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
  // Empty until dsh-memory is added to the profile; method shape mirrors the
  // dsh-memory host service.
  const memory = kernel.get('memory')
  ipcMain.handle('ssid:memory:list', () => memory?.list?.() ?? [])
  ipcMain.handle('ssid:memory:search', (_event, query) => memory?.search?.(query) ?? [])
  ipcMain.handle('ssid:memory:confirm', (_event, id) => memory?.confirm?.(id) ?? null)
  ipcMain.handle('ssid:memory:forget', (_event, id) => memory?.forget?.(id) ?? false)

  // ── window + dual BrowserView (official UI + side rail) ────────────────
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: WINDOW_TITLE,
    show: false,
  })

  // BrowserView A: official DSH loopback UI.
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
    mainView.setBounds({ x: 0, y: 0, width: width - SIDE_RAIL_WIDTH, height })
    sideRail.setBounds({ x: width - SIDE_RAIL_WIDTH, y: 0, width: SIDE_RAIL_WIDTH, height })
  }
  win.on('resize', layout)
  layout()
  win.show()
}

void start()
