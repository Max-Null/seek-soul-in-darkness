/**
 * SSiD 壳（思灵）—— Electron 补丁层入口。
 *
 * 架构：electron 主进程 spawn 一个纯 node 子进程 boot DSH 官方 web profile
 * （内核必须跑在标准 node 下——DSH 的 loader 用 native addon 探测标准 Node
 * 的 V8 embedder，electron 是另一个 embedder），然后双 BrowserView 加载：
 *   A：官方 UI（loopback URL）
 *   B：SSiD 侧栏（第四列，DSH 的 slot 系统给不了）
 *
 * 内核零改动，只 spawn；退出时 kill 子进程。本文件是纯 ESM JS，electron
 * 直接加载，不经过任何转译。
 */

import { app, BrowserView, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** 侧栏宽度（px）。 */
const SIDE_RAIL_WIDTH = 320

/** 应用名 / 窗口标题。 */
const PRODUCT_NAME = '思灵'
const WINDOW_TITLE = '思灵（SSiD）'

/** 子进程就绪标记前缀。 */
const READY_PREFIX = 'SSID_READY port='

/**
 * 找系统 node 可执行文件。electron 主进程不能用 `process.execPath`（那是
 * electron.exe），要用真正的 node 来跑内核。候选依次为：`$SSID_NODE`、
 * `$npm_node_execpath`、PATH 里的 `node`。
 */
function resolveNodeExec() {
  if (process.env.SSID_NODE) return process.env.SSID_NODE
  if (process.env.npm_node_execpath) return process.env.npm_node_execpath
  return 'node'
}

/**
 * 启动内核子进程，解析其 `SSID_READY port=<n>` 行。
 * @returns 子进程句柄和监听端口。
 */
function spawnKernel() {
  return new Promise((resolve, reject) => {
    const shellDir = fileURLToPath(new URL('.', import.meta.url))
    const child = spawn(resolveNodeExec(), ['--import', 'tsx/esm', 'boot-child.ts'], {
      cwd: shellDir,
      stdio: ['ignore', 'pipe', 'inherit'],
      windowsHide: true,
    })

    let settled = false
    let buffer = ''
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error('ssid: kernel child did not report readiness in time'))
    }, 60_000)

    child.stdout.on('data', (chunk) => {
      if (settled) return
      buffer += chunk.toString()
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith(READY_PREFIX)) continue
        const port = Number(line.slice(READY_PREFIX.length))
        if (!Number.isInteger(port) || port <= 0) continue
        settled = true
        clearTimeout(timer)
        resolve({ child, webPort: port })
        return
      }
    })
    child.once('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.once('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`ssid: kernel child exited early (code ${code})`))
    })
  })
}

async function start() {
  app.setName(PRODUCT_NAME)
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  await app.whenReady()

  // ── spawn 内核（纯 node 子进程 boot DSH）───────────────────────────────
  let child
  let webPort
  try {
    ;({ child, webPort } = await spawnKernel())
  } catch (cause) {
    process.stderr.write(`ssid: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    app.exit(1)
    return
  }
  // 退出时回收子进程。
  app.on('will-quit', () => { child.kill() })

  // ── IPC：记忆面板（侧栏）的数据桥 ──────────────────────────────────────
  // 第一版：侧栏先自举空态，memory 数据通道后续接子进程的 host ctx（见 README）。
  ipcMain.handle('ssid:memory:list', () => [])
  ipcMain.handle('ssid:memory:search', () => [])
  ipcMain.handle('ssid:memory:confirm', () => null)
  ipcMain.handle('ssid:memory:forget', () => false)

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
  await mainView.webContents.loadURL(`http://127.0.0.1:${webPort}/`)

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
