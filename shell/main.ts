/**
 * SSiD 壳（思灵）—— Electron 补丁层。
 *
 * 三件事：
 * 1. boot DSH 官方 web profile（内核，零改动）；
 * 2. 外挂一根侧栏 BrowserView（第四列，DSH 的 slot 系统给不了）；
 * 3. 通过 IPC 桥，把 host 的 ctx.memory 数据喂给侧栏（绕开 Typert remote）。
 *
 * 参考 anywhere-labs 的 boot 骨架（boot + loadProfile + provideCmdline），
 * 但去掉 desktop 专属逻辑，只保留 SSiD 需要的补丁层能力。
 */

import { app, BrowserView, BrowserWindow, ipcMain } from 'electron'
import { boot, loadProfile, type Profile } from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

/** 侧栏宽度（px）。 */
const SIDE_RAIL_WIDTH = 320
/** 根配置文件名（写空 entries，真正的树由 patches 组合）。 */
const ROOT_CONFIG_FILENAME = 'ssid-root.yml'

/** 应用名 / 窗口标题。 */
const PRODUCT_NAME = '思灵'
const WINDOW_TITLE = '思灵（SSiD）'

/** Memory 服务的结构性接口（避免直接 import dsh-memory 的类型）。 */
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

  // ── boot DSH web profile ──────────────────────────────────────────────
  const home = resolveDshHome()
  // installAnchor：本包所在目录，bundle 解析从这里的 node_modules 找 dsh-web-app。
  const installAnchor = fileURLToPath(new URL('.', import.meta.url))
  const profile: Profile = loadProfile('ssid', 'web', installAnchor, home)

  const rootConfig = join(profile.dir, ROOT_CONFIG_FILENAME)
  writeFileSync(rootConfig, '[]\n')
  const bareModuleBaseUrl = pathToFileURL(join(profile.dir, 'package.json')).href

  const patches = [
    ...profile.layers.flatMap(layer => layer.patches),
    ...profile.patches,
  ]

  let ctx: Context
  try {
    ctx = await boot(
      'ssid',
      rootConfig,
      patches,
      async (hostCtx) => {
        provideCmdline(hostCtx, {
          args: ['--host', '127.0.0.1', '--port', '0'],
        })
      },
      bareModuleBaseUrl,
    )
  } catch (cause) {
    process.stderr.write(`ssid: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    app.exit(1)
    return
  }

  // ── IPC：把 host 的 memory 服务喂给侧栏 ───────────────────────────────
  const memory = ctx.get('memory') as MemoryService | undefined
  ipcMain.handle('ssid:memory:list', () => memory?.list() ?? [])
  ipcMain.handle('ssid:memory:search', (_event, query: string) => memory?.search(query) ?? [])
  ipcMain.handle('ssid:memory:confirm', (_event, id: string) => memory?.confirm(id) ?? null)
  ipcMain.handle('ssid:memory:forget', (_event, id: string) => memory?.forget(id) ?? false)

  // ── 窗口 + 双 BrowserView（官方 UI + 侧栏）─────────────────────────────
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: WINDOW_TITLE,
    show: false,
  })

  const webPort = (ctx as Context & { webServer?: { port: number } }).webServer?.port
  if (webPort === undefined) {
    process.stderr.write('ssid: booted tree has no webServer port\n')
    app.exit(1)
    return
  }

  // BrowserView A：DSH 官方 loopback UI。
  const mainView = new BrowserView({ webPreferences: { sandbox: true, contextIsolation: true } })
  win.setBrowserView(mainView)
  await mainView.webContents.loadURL(`http://127.0.0.1:${webPort}/`)

  // BrowserView B：SSiD 侧栏（记忆面板）。
  const sideRail = new BrowserView({ webPreferences: { sandbox: true, contextIsolation: true, preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)) } })
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
