/**
 * SSiD 壳（思灵）—— Electron 主进程入口（单进程，学习 anywhere-labs）。
 *
 * DSH 内核直接在 electron 主进程里 boot：DSH 的 loader 用 native addon 探测
 * 标准 Node 的 V8 embedder，electron 里拿不到内部 loader，所以靠
 * `module-resolution.ts` 的 registerHooks 把 loader 的 bare specifier 改写到
 * profile 目录解析（anywhere-labs 的做法）。
 *
 * 单进程的收益：memory 面板直接 `kernel.get('memory')` 同进程读 host 服务。
 */

import { register } from 'tsx/esm/api'
import { app, BrowserView, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'

// tsx 的 ESM loader：转译 kernel.ts 并把 @deepseek-ai/dsh-* 解析到相邻的
// DSH checkout 源码。必须先于任何 TS import。
register()
const { bootKernel } = await import('./kernel.ts')

/** 侧栏宽度（px）。 */
const SIDE_RAIL_WIDTH = 320

/** 应用名 / 窗口标题。 */
const PRODUCT_NAME = '思灵'
const WINDOW_TITLE = '思灵（SSiD）'

/** Memory 服务的结构性接口（dsh-memory 的 host 服务）。 */
interface MemoryService {
  list(filter?: { namespace?: 'global' | 'project'; status?: 'suggested' | 'auto' | 'suggest' }): unknown[]
  search(query: string, filter?: object): unknown[]
  confirm(id: string): Promise<unknown>
  forget(id: string): Promise<boolean>
}

async function start(): Promise<void> {
  app.setName(PRODUCT_NAME)
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  await app.whenReady()

  // ── boot DSH 内核（本进程）─────────────────────────────────────────────
  let kernel: Awaited<ReturnType<typeof bootKernel>>
  try {
    kernel = await bootKernel()
  } catch (cause) {
    process.stderr.write(`ssid: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    app.exit(1)
    return
  }

  // ── IPC：记忆面板（侧栏）的数据桥 —— 同进程直读 host 服务 ─────────────
  const memory = kernel.get('memory') as MemoryService | undefined
  ipcMain.handle('ssid:memory:list', () => memory?.list() ?? [])
  ipcMain.handle('ssid:memory:search', (_event, query: string) => memory?.search(query) ?? [])
  ipcMain.handle('ssid:memory:confirm', (_event, id: string) => memory?.confirm(id) ?? null)
  ipcMain.handle('ssid:memory:forget', (_event, id: string) => memory?.forget(id) ?? false)

  // ── 窗口 + 双 BrowserView（官方 UI + 侧栏）──────────────────────────────
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: WINDOW_TITLE,
    show: false,
  })

  // BrowserView A：DSH 官方 loopback UI。
  const mainView = new BrowserView({ webPreferences: { sandbox: true, contextIsolation: true } })
  win.setBrowserView(mainView)
  await mainView.webContents.loadURL(`http://127.0.0.1:${kernel.port}/`)

  // BrowserView B：SSiD 侧栏（记忆面板）。
  const sideRail = new BrowserView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
    },
  })
  win.addBrowserView(sideRail)
  await sideRail.webContents.loadFile(fileURLToPath(new URL('./side-rail/index.html', import.meta.url)))

  const layout = (): void => {
    const [width, height] = win.getContentSize()
    mainView.setBounds({ x: 0, y: 0, width: width - SIDE_RAIL_WIDTH, height })
    sideRail.setBounds({ x: width - SIDE_RAIL_WIDTH, y: 0, width: SIDE_RAIL_WIDTH, height })
  }
  win.on('resize', layout)
  layout()
  win.show()
}

void start()
