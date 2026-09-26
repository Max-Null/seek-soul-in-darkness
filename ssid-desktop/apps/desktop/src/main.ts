import { applySsidTitlebarTheme, installSsidTitlebar, toggleSsidContrast } from './ssid/titlebar.ts'

/**
 * 纯净模式命令行标志：托盘「以纯净模式重启」把它拼进重启参数，下次启动时 Host
 * 只加载官方 bundle 层（见 `desktop-host/src/index.ts`）。必须在拉起 Host 之前生效，
 * 故在模块顶层解析——Host 是子进程，继承这份环境变量。
 */
const SAFE_MODE_FLAG = '--ssid-safe-mode'
if (process.argv.includes(SAFE_MODE_FLAG)) process.env.SSID_SAFE_MODE = '1'
/** Electron shell: desktop project ownership, custom protocol, windows, and lifecycle. */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  powerMonitor,
  powerSaveBlocker,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron'
import { SsidMask, readSsidMaskConfig } from './ssid/mask.ts'
import { SsidScreenshot, readSsidScreenshotConfig } from './ssid/screenshot.ts'
import { createKeepAwake, readKeepAwakeConfig, type KeepAwake } from './ssid/keep-awake.ts'
import { recordCodeGraphDecision, shouldGuideCodeGraph } from './ssid/codegraph-guide.ts'
import { installSsidMcpEnv } from './ssid/mcp-env.ts'
import { resolveProfileName } from './ssid/profile-name.ts'
import { seedSsidProfile } from './ssid/profile-seed.ts'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { resolveDesktopPaths } from './paths.ts'
import { DesktopProjectManager } from './project-manager.ts'
import { DesktopHostFatalError, DesktopHostProcess, DesktopHostUncleanExitError } from './host-process.ts'
import { DesktopPlatformView, PLATFORM_IPC, platformBounds } from './platform-view.ts'
import { installDesktopDirectoryPicker } from './directory-picker.ts'
import { installMicrophonePermissions } from './microphone-permissions.ts'
import { DesktopBackendController } from './backend-controller.ts'
import { deliverSsidNotify, describeSsidNotify } from './ssid/notify.ts'
import { DSH_PRODUCT_NAME, SSID_PRODUCT_NAME } from './ssid/product.ts'
import { DESKTOP_IPC, SCHEME, assertDesktopSender, type DesktopUpdateState } from './ipc.ts'
import { desktopUpdateReadyConfirmation, formatDesktopMessage, resolveDesktopLocale, resolveDesktopStartupLocale } from './locale.ts'
import { claimDesktopSingleInstance } from './single-instance.ts'
import { DesktopUpdateCoordinator } from './update-coordinator.ts'
import { serveWebDocument, authenticateWebHost, forwardWebRequest } from './web-document.ts'
import { DesktopFatalRecovery } from './fatal-recovery.ts'
import { pruneCrashReports, RendererConsoleTail, writeCrashReport, type CrashReportSource } from './crash-report.ts'
import { openWelcomeWindow } from './welcome-window.ts'
import { WELCOME_IPC, needsWelcome, type WelcomeNotice } from './welcome-api.ts'
import { connectDesktopWelcome, type DesktopWelcomeBackend } from './welcome-backend.ts'
import { DesktopUpdateJournal } from './update-journal.ts'
import { DesktopUpdatePreparationError } from './update-error.ts'
import { DesktopUpdateSchedule, resolveDesktopUpdateScheduleConfig } from './update-schedule.ts'
import { desktopUpdateErrorSummary, presentDesktopUpdate } from './update-presentation.ts'
import { desktopErrorState } from './startup-error.ts'
import { DesktopMandatoryUpdatePolicy, resolveDesktopPolicyConfig, type DesktopPolicyState } from './mandatory-update-policy.ts'
import { desktopClientMetadata } from './client-metadata.ts'
import { DesktopMandatoryUpdateWindow } from './mandatory-update-window.ts'
import { DesktopPolicyTestAuth } from './policy-test-auth.ts'
import { DesktopUpdateDialog, type UpdateDialogOptions } from './update-dialog.ts'
import { readDesktopRuntime } from './runtime-tree.ts'
import { DesktopBrowserGuests } from './browser-guests.ts'
import { installDesktopShortcuts } from './keyboard.ts'
import { DesktopUpdateOverlays } from './update-overlay.ts'
import { DesktopQuitConfirmation } from './quit-confirmation.ts'
import { DesktopTray } from './tray.ts'
import { DesktopBackgroundNotice } from './background-notice.ts'

let focusPrimaryWindow = (): void => {}
let stopForRecovery = async (): Promise<void> => {}
let shuttingDown = false
/**
 * Set by quit entries that must not ask: crash recovery exit and restart, and the
 * development restart command. The installer handoff has its own before-quit branch.
 */
let skipQuitConfirmation = false
let windowsLanguage: string | undefined
/**
 * Whether the backend has reached ready: false until the first ready, back to
 * false when a restart returns it to starting, frozen during shutdown so a
 * failure while tearing down a ready backend still reads as `running`.
 */
let backendReady = false
/** Error-level console output of the primary window, attached to crash reports. */
const rendererConsole = new RendererConsoleTail()

// Platform-conventional logs directory (macOS ~/Library/Logs/<name>, otherwise under userData);
// set before ready so the first fatal report already resolves under it.
app.setAppLogsPath()

function currentDesktopLocale(): ReturnType<typeof resolveDesktopLocale> {
  return resolveDesktopLocale(windowsLanguage ?? app.getLocale())
}
/** Quit without the task confirmation; the caller has already decided the application must stop. */
function quitWithoutConfirmation(): void {
  skipQuitConfirmation = true
  app.quit()
}
/**
 * 备份 profile patch 并禁用全部第三方 bundle。
 *
 * 崩溃恢复对话框与托盘「禁用第三方插件并重启」共用同一条路径 —— 它调的是 app-boot 的共享
 * recovery 函数，本身不要求进程处于崩溃状态，因此在正常运行中调用同样成立。
 * 注意与既有思灵壳的「纯净模式」语义不同：那个只少加载层、不改 profile（去掉环境变量即恢复），
 * 这个会真的备份并清空 patch，恢复需要人工处理。
 *
 * 托盘已改用非破坏的 `restartInSafeMode`，本函数现在只由崩溃恢复对话框调用。
 */
async function disableThirdPartyPlugins(): Promise<void> {
  const manager = new DesktopProjectManager(resolveDesktopPaths(), runtimeResources())
  const backupPath = await manager.disableAllPlugins()
  console.info('Desktop profile recovery completed:', { profilePatchBackup: backupPath ?? null, homePatch: 'unchanged' })
}

/**
 * 以纯净模式重启。
 *
 * 只让下次启动少加载第三方层，**不碰任何数据**（会话 / 设置 / 记忆 / storage 原样），
 * 去掉标志即恢复 —— 与上面那个会备份并清空 patch 的 `disableThirdPartyPlugins` 语义不同，
 * 后者现在只由崩溃恢复对话框使用。Host 侧按层过滤，见 `desktop-host/src/index.ts`。
 */
function restartInSafeMode(): void {
  app.relaunch({ args: [...process.argv.slice(1), SAFE_MODE_FLAG] })
  quitWithoutConfirmation()
}

const recovery = new DesktopFatalRecovery({
  messages: () => currentDesktopLocale().messages,
  show: options => dialog.showMessageBox(options),
  stop: () => { shuttingDown = true; return stopForRecovery() },
  disablePlugins: () => disableThirdPartyPlugins(),
  exit: () => { quitWithoutConfirmation() },
  restart: () => { app.relaunch(); quitWithoutConfirmation() },
  writeReport: (error, source) => persistCrashReport(error, source),
})

function persistCrashReport(error: unknown, source: CrashReportSource): Promise<string | undefined> {
  return writeCrashReport(app.getPath('logs'), {
    source,
    phase: backendReady ? 'running' : 'startup',
    error,
    ...(error instanceof DesktopHostFatalError && error.diagnostic !== undefined ? { hostDiagnostic: error.diagnostic } : {}),
    rendererConsole: rendererConsole.snapshot(),
    app: {
      name: app.name, version: app.getVersion(), platform: process.platform, arch: process.arch,
      electron: process.versions.electron, node: process.versions.node, locale: currentDesktopLocale().id,
    },
    time: new Date(),
  })
}

function reportFatal(error: unknown, source: CrashReportSource): void {
  console.error(error)
  if (shuttingDown) {
    // No dialog during shutdown, but the report still records what failed on the way out.
    void persistCrashReport(error, source)
    return
  }
  void recovery.report(error, source).catch((failure: unknown) => { console.error(failure); app.exit(1) })
}

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
    codeCache: true,
  },
}])

interface RuntimeResources {
  readonly nodeBin: string
  readonly node: string
  readonly pnpm: string
  readonly dsh: string
}

function runtimeResources(): RuntimeResources {
  const development = !app.isPackaged
  const node = process.execPath
  const nodeBin = development ? join(app.getAppPath(), 'scripts', 'node-bin') : join(process.resourcesPath, 'runtime', 'bin')
  const pnpm = (development ? process.env.DSH_DESKTOP_PNPM_ENTRY : undefined)
    ?? (development ? join(app.getAppPath(), 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
      : join(process.resourcesPath, 'runtime', 'pnpm', 'bin', 'pnpm.mjs'))
  const dsh = (development ? process.env.DSH_DESKTOP_DSH_DIR : undefined)
    ?? (development ? join(app.getAppPath(), '.desktop-build', 'development', 'project') : join(app.getAppPath(), 'dsh'))
  return { node, nodeBin, pnpm, dsh }
}

/**
 * 随包插件集根目录（A′ 交付形态的实体来源）。
 *
 * 打包版固定在 `resources/ssid-plugins`；开发期用 `SSID_PLUGIN_SET_DIR` 覆盖 ——
 * dev 的 `process.resourcesPath` 指向 Electron 自带的 resources，那里没有插件集。
 * @returns 插件集根目录（可能不存在，调用方按「没有插件集」处理）。
 */
function resolvePluginSetRoot(): string {
  const override = process.env.SSID_PLUGIN_SET_DIR
  if (override !== undefined && override !== '') return override
  return join(process.resourcesPath, 'ssid-plugins')
}

/**
 * 把随包插件集接入 profile（实现见 `ssid/profile-seed.ts`）。
 *
 * 失败不阻断启动：插件集缺失或链接失败时，应用仍按官方骨架起来，只是没有思灵插件。
 * 但 `missing` 必须报出来 —— 内核遇到解析不到的插件是**静默跳过**的
 * （实测：只有渲染进程的 client 清单里少一行，`Failed to load plugins` 一次都不出现）。
 * @param profileDir - 当前 profile 目录。
 */
function seedProfilePlugins(profileDir: string): void {
  try {
    const summary = seedSsidProfile({
      profileDir,
      pluginSetRoot: resolvePluginSetRoot(),
      log: (text: string) => { console.log(`ssid: ${text}`) },
    })
    if (summary.missing.length > 0) {
      console.error(`ssid: plugin set incomplete — declared but not shipped: ${summary.missing.join(', ')}`)
    }
  } catch (error) {
    console.error(`ssid: plugin set seed failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * CodeGraph 索引目录首次引导：目录解析不出来、且用户从未表过态时问一次。
 *
 * **只在窗口可见之后调用，且调用方不 await** —— 早先它挂在 MCP env 注入的 await 链上，
 * 会把 Host 启动**永久卡在等待点击**上（2026-09-26 用全新 DSH_HOME 实测：没有会话可探测、
 * `~/.ssid/codegraph.json` 又缺席，日志停在 `mcp codegraph cli missing` 之后不再前进，
 * 进程活着但 Host 永不 spawn）。窗口不可见时直接返回：那是无人值守启动，问了也没人答。
 *
 * 结果写进 `~/.ssid/codegraph.json`，**下次启动生效** —— env 必须在 Host 起来前定，
 * 本次已经来不及了。
 * @param win - 主窗口；未创建、已销毁或不可见时直接返回。
 */
async function guideCodeGraphWorkspace(win: BrowserWindow | undefined): Promise<void> {
  try {
    if (win === undefined || win.isDestroyed() || !win.isVisible()) return
    if (!shouldGuideCodeGraph({ dshHome: resolveDshHome(), profileName: resolveProfileName() })) return
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['选择项目目录…', '暂不启用'],
      defaultId: 0,
      cancelId: 1,
      title: `${SSID_PRODUCT_NAME} · CodeGraph 代码索引`,
      message: 'CodeGraph 需要指定一个项目目录才能建立代码图谱。',
      detail: '不指定时代码索引工具保持停用，不会扫描你的用户主目录。选好后重启思灵生效，'
        + '以后也可在「设置 → MCP」里修改。',
    })
    let workspace: string | null = null
    if (response === 0) {
      const picked = await dialog.showOpenDialog(win, {
        title: '选择要建立代码图谱的项目目录',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (!picked.canceled && picked.filePaths.length > 0) workspace = picked.filePaths[0] ?? null
    }
    recordCodeGraphDecision(workspace)
    console.log(`ssid: codegraph workspace decided (${workspace ?? 'disabled'}); applies on next launch`)
  } catch (error) {
    console.error(`ssid: codegraph guide failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function developmentPrimaryRuntime(): string {
  const directory = process.env.DSH_DESKTOP_PRIMARY_RUNTIME_DIR
  if (directory === undefined || directory === '') {
    throw new Error('dsh desktop: DSH_DESKTOP_PRIMARY_RUNTIME_DIR is required for an unpackaged launch')
  }
  return directory
}

function developmentHostInspectPort(enabled: boolean): number | undefined {
  const configured = process.env.DSH_DESKTOP_HOST_INSPECT_PORT
  if (!enabled || configured === undefined || configured === '') return undefined
  const port = Number(configured)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('dsh desktop: DSH_DESKTOP_HOST_INSPECT_PORT must be an integer from 1 through 65535')
  }
  return port
}

/**
 * Opaque chrome fallback matching the built-in sidebar palette (the resolved
 * `--dsw-static-neutral-bluish-900` / `-50` tokens). An approximation for
 * custom themes: Windows swaps in the renderer's measured palette over the
 * windowsAppearance IPC, and macOS shows it only while minimized or hidden.
 * @returns the sidebar fill hex for the active system color scheme.
 */
function chromeFallbackFill(): string {
  return nativeTheme.shouldUseDarkColors ? '#1b1b1c' : '#f9fafb'
}

/**
 * Add the effective Desktop palette to a Platform authorization URL so the
 * login page opens in the application's theme. `system` resolves through
 * `nativeTheme.shouldUseDarkColors`, which follows the theme source the
 * application preload publishes.
 * @param authorizeUrl - validated Platform authorization URL.
 * @returns the authorization URL carrying `theme=light` or `theme=dark`.
 */
function platformLoginUrl(authorizeUrl: string): string {
  const url = new URL(authorizeUrl)
  url.searchParams.set('theme', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
  return url.href
}

/** SSiD 遮罩的持有者。状态只有一份，托盘项与全局快捷键共用它。 */
let ssidMask: SsidMask | undefined

/** SSiD 截图引用的持有者。一次只允许一个会话，重复触发会被它自己忽略。 */
let ssidScreenshot: SsidScreenshot | undefined

/**
 * SSiD 保活状态机。纯逻辑在 `ssid/keep-awake.ts`，这里只接 Electron 的 blocker
 * 与 `~/.ssid/notify.json` 的读取。
 *
 * 持有来源有三个（并发 turn 计数 / 遮罩开启 / 结束后的尾巴窗口），任一需要就持有。
 * turn 事实来自 Host 子进程（见 `createWindow` 里 host 的 `onKeepAwake`），
 * 遮罩事实来自 `SsidMask` 的状态回调。
 */
const keepAwake: KeepAwake = createKeepAwake({
  start: () => powerSaveBlocker.start('prevent-display-sleep'),
  stop: (id) => { powerSaveBlocker.stop(id) },
  readConfig: readKeepAwakeConfig,
  log: (text) => { console.log(`ssid: ${text.trim()}`) },
})

function createWindow(preload: string, show = false, primary = false): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 520,
    minHeight: 600,
    show,
    ...(process.platform === 'win32' && primary ? {
      titleBarStyle: 'hidden' as const,
    } : {}),
    // SSiD：任务栏与 Alt+Tab 显示的是窗口标题，而窗口标题默认由页面 <title> 派生 ——
    // 页面用的是 DSH 的品牌名，于是自绘标题栏写着「思灵」、任务栏却写着「DeepSeek Harness」。
    // 这里给出初值，页面标题的持续处理见下面 `page-title-updated`。
    ...(primary ? { title: SSID_PRODUCT_NAME } : {}),
    // SSiD：窗口图标。官方不设（打包后由 exe 自带图标），但源码裸跑时任务栏会显示
    // Electron 的默认图标 —— dev 与打包产物看起来是同一个应用更省心。
    ...(process.platform === 'darwin' ? {} : {
      icon: app.isPackaged
        ? join(process.resourcesPath, 'icon.png')
        : join(app.getAppPath(), 'resources', 'icon-windows.png'),
    }),
    // hiddenInset places traffic lights inside the sidebar; sidebar vibrancy
    // needs a transparent window background to show through the page.
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar' as const,
      // 'active' keeps the vibrancy material stable when the window blurs;
      // 'followWindow' washes the sidebar out behind an unfocused window.
      visualEffectState: 'active' as const,
      backgroundColor: '#00000000',
    } : {}),
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: primary,
      devTools: true,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (['http:', 'https:'].includes(new URL(url).protocol)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // SSiD：把 Windows 的原生窗口控件换成自绘标题栏（同时也是插件按钮的载体）。
  if (process.platform === 'win32' && primary) {
    installSsidTitlebar(window, {
      productName: SSID_PRODUCT_NAME,
      dshVersion: app.getVersion(),
      // 运行形态徽章只在非打包运行时出现，正式版不给自己加噪。
      shellMode: app.isPackaged ? undefined : 'DEV',
    })
  }
  // SSiD：页面 <title> 是 DSH 的品牌名，它经 `page-title-updated` 覆盖窗口标题，于是任务栏
  // 和 Alt+Tab 显示「DeepSeek Harness」，而自绘标题栏写着「思灵」。官方两端同名，看不出差异，
  // 因此上游只在 `policy-test-auth.ts` 那种自建窗口里阻止覆盖。这里做同样的事，但不止阻止：
  // 页面若在标题里带了别的信息（DSH 以后可能用标题显示会话名），原样保留，只把品牌串换掉，
  // 免得顺手把页面的这项能力一并吃掉。
  if (primary) {
    window.on('page-title-updated', (event, title) => {
      event.preventDefault()
      const branded = title.replaceAll(DSH_PRODUCT_NAME, SSID_PRODUCT_NAME)
      window.setTitle(branded === '' ? SSID_PRODUCT_NAME : branded)
    })
  }
  // SSiD 屏幕遮罩：只装主窗口。注入式实现依附页面，所以每次加载完成后按状态补回；
  // 解除信号由页面经 console 回传（毛玻璃必须在同一页面内，见 `ssid/mask.ts`）。
  if (primary) {
    const mask = new SsidMask(
      () => (window.isDestroyed() ? undefined : window),
      // 遮罩开着时屏幕不能黑——黑了挂着的提示就白挂了。
      (active) => { keepAwake.setMask(active) },
    )
    ssidMask = mask
    window.webContents.on('did-finish-load', () => { mask.restore(window) })
    window.webContents.on('console-message', (event) => {
      if (SsidMask.isReleaseSignal(event.message)) mask.hide()
    })
  }
  // SSiD 截图引用：浮层是独立窗口（每屏一个），与主窗口无关；但确认后要把图派发给
  // 主窗口里的 dsh-capture 插件，所以仍要拿到主窗口。
  if (primary) {
    ssidScreenshot = new SsidScreenshot(() => (window.isDestroyed() ? undefined : window))
  }
  if (process.platform === 'darwin') {
    // macOS hides the traffic lights in fullscreen; the page drops its
    // clearance for them off the html[data-fullscreen] flag this feeds.
    const sendFullscreen = (): void => {
      if (!window.isDestroyed()) window.webContents.send(DESKTOP_IPC.windowFullscreen, window.isFullScreen())
    }
    window.on('enter-full-screen', sendFullscreen)
    window.on('leave-full-screen', sendFullscreen)
    // Reloads and navigations re-register the preload listener; resend the
    // current state so a fullscreen reload does not fall back to windowed CSS.
    window.webContents.on('did-finish-load', sendFullscreen)
    // Deminiaturize reattaches the NSVisualEffectView material late
    // (electron/electron#25368), so a transparent window shows the desktop
    // through the sidebar until then. Paint an opaque base while minimized or
    // hidden so the deminiaturize animation and the reattachment gap show a
    // solid fill; restoring flips back, and the null -> 'sidebar' transition
    // forces the material to reattach.
    const applyBackdrop = (): void => {
      if (window.isDestroyed()) return
      if (window.isMinimized() || !window.isVisible()) {
        window.setVibrancy(null)
        window.setBackgroundColor(chromeFallbackFill())
      } else {
        window.setVibrancy('sidebar')
        window.setBackgroundColor('#00000000')
      }
    }
    window.on('minimize', applyBackdrop)
    window.on('hide', applyBackdrop)
    window.on('restore', applyBackdrop)
    window.on('show', applyBackdrop)
  }
  window.webContents.on('context-menu', (_event, { isEditable, selectionText, editFlags }) => {
    const items: MenuItemConstructorOptions[] = []
    if (isEditable) {
      items.push(
        { role: 'undo', enabled: editFlags.canUndo },
        { role: 'redo', enabled: editFlags.canRedo },
        { type: 'separator' },
        { role: 'cut', enabled: editFlags.canCut },
        { role: 'copy', enabled: editFlags.canCopy },
        { role: 'paste', enabled: editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', enabled: editFlags.canSelectAll },
      )
    } else if (selectionText.length > 0) {
      items.push({ role: 'copy', enabled: editFlags.canCopy })
    }
    // Empty accelerators suppress Electron's default shortcut labels for native roles.
    if (items.length > 0) {
      const messages = currentDesktopLocale().messages
      Menu.buildFromTemplate(items.map(item => ({
        ...item,
        ...(process.platform === 'win32' && item.role !== undefined && item.role in messages
          ? { label: messages[item.role as keyof typeof messages] } : {}),
        accelerator: '',
      }))).popup({ window })
    }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const destination = new URL(url)
    const current = new URL(window.webContents.getURL())
    if (destination.protocol !== `${SCHEME}:`
      && !(destination.protocol === 'http:' && destination.origin === current.origin)) {
      event.preventDefault()
      if (['http:', 'https:'].includes(destination.protocol)) void shell.openExternal(url)
    }
  })
  return window
}

async function main(): Promise<void> {
  void pruneCrashReports(app.getPath('logs'))
  const journalDirectory = process.env.DSH_DESKTOP_UPDATE_JOURNAL_DIR
  const updateJournal = journalDirectory === undefined ? undefined : new DesktopUpdateJournal(journalDirectory, app.getVersion())
  const resources = runtimeResources()
  const paths = resolveDesktopPaths()
  const development = !app.isPackaged
  const primaryRuntime = development
    ? developmentPrimaryRuntime()
    : join(process.resourcesPath, 'runtime', 'primary-runtime')
  const activeProject = paths.profile
  const manager = new DesktopProjectManager(paths, resources)
  let quitting = false
  let startup: Promise<void> | undefined
  let workspaceRecovery: Promise<void> | undefined
  let mainWindow: BrowserWindow | undefined
  let welcomeWindow: BrowserWindow | undefined
  let enteredWorkspace = false
  // NSIS passes --updated when it launches the application after installation.
  let raiseAfterUpdate = process.platform === 'win32' && process.argv.includes('--updated')
  let shellInstallerOwnsQuit = false
  let requireCleanStop = false
  let updateStoppedHost = false
  let updateStopFailure: DesktopHostUncleanExitError | undefined
  let updateState: DesktopUpdateState = { phase: 'idle' }
  const systemLanguages = app.getPreferredSystemLanguages()
  let locale = resolveDesktopStartupLocale(null, systemLanguages)
  windowsLanguage = locale.id
  let mandatoryPolicy: DesktopMandatoryUpdatePolicy | undefined
  let mandatoryUI: DesktopMandatoryUpdateWindow | undefined
  let policyAuth: DesktopPolicyTestAuth | undefined
  let tray: DesktopTray | undefined
  /**
   * The operating system is ending the session: the quit skips its confirmation. Windows sets it
   * on the definitive session-end message. macOS sets it on the power-off notification, which
   * another application can still cancel, so the next focus or show of the main window clears it.
   */
  let sessionEnding = false
  const isQuitting = (): boolean => quitting
  const currentMainWindow = (): BrowserWindow | undefined => mainWindow
  const ordinaryDialogs = new Set<AbortController>()
  const currentDialogWindow = (): BrowserWindow | undefined => welcomeWindow ?? mainWindow
  const updateOverlays = new DesktopUpdateOverlays()
  const updateDialog = new DesktopUpdateDialog(fileURLToPath(new URL('./preload-update-dialog.cjs', import.meta.url)), () => locale, updateOverlays)
  const isMandatory = (): boolean => mandatoryPolicy?.state.blocking === true
  const ordinaryMessageBox = async (options: UpdateDialogOptions): Promise<Electron.MessageBoxReturnValue> => {
    const controller = new AbortController()
    ordinaryDialogs.add(controller)
    try {
      const parent = currentDialogWindow()
      if (parent === undefined) return { response: options.cancelId ?? 0, checkboxChecked: false }
      return await updateDialog.show(parent, { ...options, signal: controller.signal })
    }
    finally { ordinaryDialogs.delete(controller) }
  }
  // Copy comes from the same locale as the update prompts so the dialog
  // chrome and its content never mix languages.
  const showAbout = async (): Promise<void> => {
    await ordinaryMessageBox({ type: 'info', title: locale.messages.aboutMenu, message: locale.messages.aboutProduct,
      detail: formatDesktopMessage(locale.messages.aboutVersion, { version: app.getVersion() }),
      buttons: [locale.messages.updateAcknowledge], cancelId: 0 })
  }
  const appPreload = fileURLToPath(new URL('./preload-app.cjs', import.meta.url))
  const applicationUrl = `${SCHEME}://app/`
  let hostUrl: string | undefined
  let hostCookie: string | undefined
  const browserGuests = new DesktopBrowserGuests(() => hostUrl)
  let injections: readonly unknown[] = []
  let welcomeBackend: DesktopWelcomeBackend | undefined
  let stopAccount: (() => void) | undefined
  let openedAttempt: string | undefined
  let returnedAttempt: string | undefined
  let pendingWelcomeNotice: WelcomeNotice | undefined
  let previousAccountStatus: string | undefined
  const assertProductSender = (event: IpcMainInvokeEvent): void => {
    assertDesktopSender(event, ['app'])
    if (mainWindow === undefined || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents
      || event.senderFrame === null || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error('dsh desktop: rejected IPC from an unowned renderer')
    }
  }
  let navigation: { window: BrowserWindow; url: string; promise: Promise<void> } | undefined
  const navigateMain = (url: string): Promise<void> => {
    const window = mainWindow
    if (quitting || window === undefined || window.isDestroyed()) return Promise.resolve()
    if (navigation?.window === window && navigation.url === url) return navigation.promise
    const next = { window, url, promise: Promise.resolve() }
    next.promise = window.loadURL(url).catch((error: unknown) => {
      if (quitting || shuttingDown || window.isDestroyed() || navigation !== next
        || (error instanceof Error && 'code' in error && error.code === 'ERR_ABORTED')) return
      navigation = undefined
      throw error
    })
    navigation = next
    return next.promise
  }
  const platformView = new DesktopPlatformView(join(app.getAppPath(), 'lib', 'preload-platform-account.cjs'),
    () => locale.id === 'zh-CN' ? 'zh_CN' : 'en_US', process.platform === 'win32' ? 'win32' : 'darwin')
  const backend = new DesktopBackendController((onFailure) => {
    const hostInspectPort = developmentHostInspectPort(development)
    const host = new DesktopHostProcess(resources.node, resources.dsh, activeProject,
      hostInspectPort, process.env, onFailure,
      primaryRuntime,
      resources, (next) => { platformView.setSession(next) },
      (event) => { deliverSsidNotify(() => mainWindow, describeSsidNotify(event, SSID_PRODUCT_NAME), event.scene) },
      // SSiD 截图：Host 侧的 dsh-capture 经 `ssid.shell.screenshot` 发起动作，
      // 浮层与全局快捷键都在主进程，所以在这里执行。两个动作分开写而不是
      // 三元，是为了让返回类型保持 boolean（trigger 恒 true——截图结果走页面事件）。
      async (action) => {
        if (action === 'trigger') {
          // 用 Promise 包一层收窄栈：SsidScreenshot.trigger 内部是 fire-and-forget，
          // 同步抛出的 RangeError（如递归）会直接穿透到 Host 路由变成 500。
          try {
            ssidScreenshot?.trigger()
            return true
          } catch (error) {
            console.error('[screenshot] main-process trigger threw:', error instanceof Error ? error.stack ?? error.message : String(error))
            return false
          }
        }
        try {
          return ssidScreenshot?.apply() ?? false
        } catch (error) {
          console.error('[screenshot] main-process apply threw:', error instanceof Error ? error.stack ?? error.message : String(error))
          return false
        }
      },
      // SSiD 保活：Host 上报的 turn 事实驱动状态机。**任何** turn/end 都要递减
      // （含被中断的回合），这是它与通知分道的原因——见 ssid-keep-awake.ts。
      (phase) => {
        if (phase === 'turnStart') keepAwake.noteTurnStart()
        else keepAwake.noteTurnEnd()
      })
    return {
      start: async () => {
        // SSiD 预制 MCP：env 必须在 `host.start()` 之前注入 —— Host 子进程继承 process.env，
        // 而 profile 里那四条 mcp-client 条目的 command/args 全靠这些 env 求值。
        // 缺失即条目自动停用（patch 的 `disabled` 表达式），不会让内核起不来。
        // 这里**不弹任何对话框**：env 必须在 host.start() 之前定，而等人点击的对话框
        // 会把启动永久卡住（全新 DSH_HOME 下实测过）。CodeGraph 的首次引导挪到
        // Host 就绪之后，见 guideCodeGraphWorkspace()。
        const mcpEnv = await installSsidMcpEnv({
          profileDir: activeProject,
          dshHome: resolveDshHome(),
          profileName: resolveProfileName(),
          log: (text) => { console.log(`ssid: ${text}`) },
        })
        console.log(`ssid: mcp ready (playwright=${String(mcpEnv.playwrightCli)}`
          + ` codegraph=${String(mcpEnv.codegraphCli)} ws=${mcpEnv.codegraphWorkspace ?? '(none)'}`
          + ` enabled=${mcpEnv.codegraphEnabled})`)
        const ready = await host.start()
        hostCookie = await authenticateWebHost(ready.url)
        hostUrl = ready.url
        if (ready.injections === undefined) throw new Error('Desktop Host did not provide boot injections')
        injections = ready.injections
        welcomeBackend = await connectDesktopWelcome(ready.url, (input, init) => net.fetch(input, init), async () => (await session.defaultSession.cookies.get({ url: ready.url })).map(cookie => `${cookie.name}=${cookie.value}`).join('; '))
        stopAccount?.()
        const accountBackend = welcomeBackend.account
        stopAccount = accountBackend.watch((state) => {
          if (quitting) return
          if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state)
          const attempt = state.attempt
          if (attempt?.phase === 'waiting-browser' && attempt.authorizeUrl !== undefined && openedAttempt !== attempt.id) {
            openedAttempt = attempt.id
            void shell.openExternal(platformLoginUrl(attempt.authorizeUrl)).catch(() => undefined)
          }
          if ((attempt?.phase === 'failed' || attempt?.phase === 'expired') && returnedAttempt !== attempt.id) {
            returnedAttempt = attempt.id
            focusPrimaryWindow()
          }
          if (state.status === 'credential-stored' && attempt?.phase === 'succeeded' && welcomeWindow !== undefined) void enterWorkspace({ activate: false }).catch(() => undefined)
          if (previousAccountStatus === 'credential-stored' && state.status === 'signed-out') {
            void readWelcomeState().then(async (value) => {
              if (needsWelcome(value) && !quitting) {
                enteredWorkspace = false
                await showWelcome()
                if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state)
              }
              return undefined
            }).catch(() => undefined)
          }
          previousAccountStatus = state.status
        }, () => {
          // The stream reconnects; a transport failure does not change account state.
        }, () => {
          void readWelcomeState().then(async (value) => {
            if (!needsWelcome(value) || quitting) return
            pendingWelcomeNotice = 'session-expired'
            enteredWorkspace = false
            await showWelcome()
            const state = await accountBackend.state()
            if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state)
          }).catch(() => undefined)
        })
      },
      stop: async () => {
        try { await host.stop(requireCleanStop) }
        catch (error) {
          if (!requireCleanStop || !(error instanceof DesktopHostUncleanExitError)) throw error
          // Backend cleanup succeeded; installation still rejects the unsuccessful task teardown.
          updateStopFailure = error
        }
      },
      updateTasks: (action: 'inspect' | 'lock' | 'unlock') => host.updateTasks(action),
      inspectQuit: () => host.inspectQuit(),
    }
  }, (state) => {
    if (state.phase === 'error') reportFatal(state.failure, 'host')
    else if (!shuttingDown) backendReady = state.phase === 'ready'
  })

  const updateErrors = new WeakMap<DesktopUpdateState, Promise<void>>()
  const showUpdateFailure = (state: DesktopUpdateState): Promise<void> => {
    if (state.phase !== 'error') return Promise.resolve()
    if (isMandatory()) { mandatoryUI?.sync(); return Promise.resolve() }
    let shown = updateErrors.get(state)
    if (shown === undefined) {
      shown = ordinaryMessageBox({ type: 'error', title: locale.messages.updateFailedTitle,
        message: desktopUpdateErrorSummary(state, locale.messages),
        technicalDetails: state.technicalDetails ?? state.message ?? '' }).then(() => {})
      updateErrors.set(state, shown)
    }
    return shown
  }
  const publishUpdate = (state: DesktopUpdateState): DesktopUpdateState => {
    updateJournal?.state(state)
    updateState = state
    mandatoryUI?.sync()
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(DESKTOP_IPC.updatesPresentation, presentDesktopUpdate(state))
    }
    if (state.phase === 'error' && state.failedOperation !== 'check') {
      const restoreHost = state.failedOperation === 'install' && updateStoppedHost && !quitting
      shellInstallerOwnsQuit = false
      updateStoppedHost = false
      if (restoreHost) {
        // Only confirmed process exit permits replacement before another installation confirmation.
        const hostReady = backend.start(async () => {})
        startup = hostReady
        const recovery = hostReady.then(async () => {
          if (quitting) return
          // A replacement Host can have a new port, cookie, or boot injections even at the same URL.
          navigation = undefined
          await navigateMain(applicationUrl)
          if (backend.host !== undefined) updateJournal?.action('workspace-ready')
        })
        workspaceRecovery = recovery
        void recovery.catch((error: unknown) => { reportFatal(error, 'main') }).finally(() => {
          if (startup === hostReady) startup = undefined
          if (workspaceRecovery === recovery) workspaceRecovery = undefined
        })
      }
      void showUpdateFailure(state).catch((error: unknown) => { console.error(error) })
    }
    return state
  }

  const readWelcomeState = async () => {
    if (backend.host === undefined || welcomeBackend === undefined) throw new Error('desktop welcome: backend unavailable')
    return welcomeBackend.read()
  }
  stopForRecovery = () => backend.close()

  const reconcileBackend = (): Promise<void> => {
    startup ??= (async () => {
      await navigateMain(applicationUrl)
      await backend.start(async () => {
        await manager.applyRelease()
        // 官方这一步只建 profile 骨架（不装包），思灵的插件集由 seed 接入。
        seedProfilePlugins(manager.paths.profile)
      })
      if (backend.host !== undefined) await openInitialWindow()
      // 窗口真的显示出来之后再问 CodeGraph 目录；**不 await** —— 它只影响下次启动，
      // 而等它会把启动路径重新变成「等人点击」。
      void guideCodeGraphWorkspace(mainWindow)
      if (backend.host !== undefined) updateJournal?.action('workspace-ready')
      // The existing Web document resumes through the boot IPC response.
    })().catch((error: unknown) => {
      updateJournal?.action('workspace-failed')
      reportFatal(error, 'main')
      throw error
    }).finally(() => { startup = undefined })
    return startup
  }

  /**
   * 重启 DSH 内核（Host 子进程），不重启 Electron 壳。
   *
   * 走与启动同一条 `reconcileBackend` 路径：停掉 Host，再重新 prepare + start —— 端口、
   * cookie 与 boot injections 都可能变，所以它内部连导航一起重来。插件配置改动靠它生效，
   * 代价是工作区重新加载。
   */
  const restartBackend = async (): Promise<void> => {
    await backend.stop()
    await reconcileBackend()
  }

  const updates = new DesktopUpdateCoordinator(
    publishUpdate,
    async () => {
      await workspaceRecovery
      await startup?.catch(() => undefined)
      const host = backend.host
      if (host === undefined) throw new DesktopUpdatePreparationError('tasks-unavailable', locale.messages.updateTasksUnavailable)
      const active = await host.updateTasks('inspect')
      const ready = desktopUpdateReadyConfirmation(locale.messages, updates.state.version ?? '', process.platform)
      const confirmation: Electron.MessageBoxOptions = {
        type: active ? 'warning' : 'info', title: locale.messages.updateTitle,
        message: active ? locale.messages.updateActiveTasks : ready.message,
        detail: active ? locale.messages.updateActiveTasksDetail : ready.detail,
        buttons: active ? [locale.messages.updateStopTasks, locale.messages.updateLater] : [locale.messages.installAndRestart],
        defaultId: 1, cancelId: 1,
      }
      if (isMandatory()) {
        if (!await mandatoryUI?.confirm(updates.state.version ?? '', active)) return false
      } else {
        const parent = currentDialogWindow()
        if (parent === undefined) return false
        const result = await updateDialog.show(parent, confirmation)
        if (result.response !== 0 || isMandatory()) return false
      }
      if (backend.host !== host) throw new DesktopUpdatePreparationError('tasks-unavailable', locale.messages.updateTasksUnavailable)
      try {
        const stillActive = await host.updateTasks('lock')
        if (stillActive && !active) throw new DesktopUpdatePreparationError('tasks-changed', locale.messages.updateTasksChanged)
        mandatoryUI?.preparingRestart(stillActive)
        // The embedded Platform document holds credentials issued by the Host that is about to stop.
        await platformView.closeAndWait()
        requireCleanStop = true
        updateStopFailure = undefined
        await backend.stop()
        updateStoppedHost = true
        // The backend's async cleanup callback can assign this after the reset above.
        const stopFailure = updateStopFailure as DesktopHostUncleanExitError | undefined
        if (stopFailure !== undefined) throw new DesktopUpdatePreparationError('stop-failed', locale.messages.updateStopFailed, stopFailure.message)
        updateJournal?.action('install-confirmed')
        shellInstallerOwnsQuit = true
      } catch (error) {
        if (!updateStoppedHost) await host.updateTasks('unlock').catch((unlockError: unknown) => { console.error(unlockError) })
        throw error
      } finally {
        requireCleanStop = false
      }
      return true
    },
  )

  const updateSchedule = new DesktopUpdateSchedule(updates, resolveDesktopUpdateScheduleConfig(process.env))

  const downloadUpdate = async (version: string): Promise<DesktopUpdateState> => {
    updateJournal?.action('download-requested')
    const state = await updates.download(version)
    if (state.phase !== 'ready' || quitting) return state
    // Only a completed user-driven download opens this prompt; cancelling installation does not reopen it.
    // A confirmation on a hidden window would go unseen, so it waits for the next show; the mandatory
    // flow keeps its own taskbar and Dock attention instead.
    if (!isMandatory()) await windowShown()
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- A quit can begin while the show is awaited.
    if (quitting) return state
    return updates.install(version)
  }
  const windowShown = (): Promise<void> => new Promise((resolve) => {
    const window = currentDialogWindow()
    if (window === undefined || window.isDestroyed() || window.isVisible()) { resolve(); return }
    window.once('show', () => { resolve() })
    window.once('closed', () => { resolve() })
  })

  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    // Shell-owned documents live in the application bundle and never pass through the Host.
    if (url.hostname === 'shell') return serveWebDocument(request, join(app.getAppPath(), 'renderer'))
    if (url.hostname === 'app') {
      if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/assets/')
        || ['/favicon.svg', '/manifest.webmanifest'].includes(url.pathname)) {
        return serveWebDocument(request, join(resources.dsh, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist'))
      }
      if (backend.host === undefined || hostUrl === undefined || hostCookie === undefined) {
        return Promise.resolve(new Response(null, { status: 503 }))
      }
      return forwardWebRequest(request, hostUrl, hostCookie)
    }
    return Promise.resolve(new Response(null, { status: 404 }))
  })

  installDesktopDirectoryPicker(() => mainWindow)
  installMicrophonePermissions(session.defaultSession, () => mainWindow?.webContents)
  const shortcuts = installDesktopShortcuts(() => mainWindow, app.getPath('userData'),
    process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux', () => { refreshApplicationMenu() }, window => updateOverlays.input(window))
  app.on('will-quit', () => { shortcuts.dispose() })

  ipcMain.handle(DESKTOP_IPC.boot, async (event) => {
    assertDesktopSender(event, ['app'])
    await startup
    if (backend.host === undefined || hostUrl === undefined) throw new Error('Desktop Host is unavailable')
    return { injections, streamBaseUrl: new URL(hostUrl).origin }
  })

  ipcMain.handle(DESKTOP_IPC.bootFailed, (event, message: unknown) => {
    assertDesktopSender(event, ['app'])
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('dsh desktop: rejected startup failure from a non-primary frame')
    }
    if (typeof message !== 'string') throw new Error('dsh desktop: startup failure must be text')
    reportFatal(new Error(message), 'web-boot')
  })

  ipcMain.handle(DESKTOP_IPC.browserAcquire, (event, workspace: unknown) => {
    assertProductSender(event)
    return browserGuests.acquire(event.sender, workspace)
  })
  ipcMain.handle(DESKTOP_IPC.browserRelease, (event, lease: unknown) => {
    assertProductSender(event)
    return browserGuests.release(event.sender, lease)
  })

  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*'] }, (details, callback) => {
    if (hostUrl === undefined || hostCookie === undefined || details.webContentsId !== mainWindow?.webContents.id) {
      callback({})
      return
    }
    const target = new URL(hostUrl)
    const requested = new URL(details.url)
    if (requested.host !== target.host) { callback({}); return }
    const headers = Object.fromEntries(Object.entries(details.requestHeaders).map(([name, value]) => [name.toLowerCase(), value]))
    if (headers.origin !== 'dsh-app://app') { callback({ cancel: true }); return }
    callback({ requestHeaders: { ...headers, origin: target.origin, cookie: hostCookie, 'sec-fetch-site': 'same-origin' } })
  })

  const assertMainApplication = (event: IpcMainInvokeEvent): BrowserWindow => {
    const owner = mainWindow
    if (owner === undefined || event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame
      || !event.senderFrame.url.startsWith('dsh-app://app/')) throw new Error('Rejected Platform command')
    return owner
  }
  ipcMain.on(PLATFORM_IPC.bootstrap, (event) => {
    try { event.returnValue = platformView.bootstrap(event) }
    catch { event.returnValue = null }
  })
  ipcMain.handle(PLATFORM_IPC.open, (event, page: unknown, bounds: unknown) => {
    const owner = assertMainApplication(event)
    if (page !== 'usage' && page !== 'top-up') throw new Error('Invalid Platform page')
    return platformView.open(owner, page, platformBounds(bounds))
  })
  ipcMain.handle(PLATFORM_IPC.bounds, (event, bounds: unknown) => {
    assertMainApplication(event)
    platformView.setBounds(platformBounds(bounds))
  })
  ipcMain.handle(PLATFORM_IPC.close, (event) => { assertMainApplication(event); platformView.close() })
  // Only the main window may synchronize its palette with the native material.
  ipcMain.on(DESKTOP_IPC.nativeThemeSet, (event, source: unknown) => {
    if (mainWindow === undefined || event.sender !== mainWindow.webContents) return
    if (source === 'light' || source === 'dark' || source === 'system') nativeTheme.themeSource = source
  })
  ipcMain.handle(DESKTOP_IPC.localeBootstrap, async (event) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame
      || new URL(event.senderFrame.url).origin !== new URL(applicationUrl).origin) {
      throw new Error('desktop welcome: rejected locale request from an unowned frame')
    }
    if (welcomeBackend === undefined) throw new Error('desktop welcome: backend unavailable')
    return { languages: systemLanguages, preference: await welcomeBackend.readLocalePreference() }
  })
  ipcMain.on(DESKTOP_IPC.localeChanged, (event, next: unknown) => {
    const window = mainWindow
    if (window === undefined || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || typeof next !== 'string') return
    const current = resolveDesktopStartupLocale(next, systemLanguages)
    if (current.id === locale.id) return
    locale = current
    platformView.notifyLocaleChanged()
    windowsLanguage = locale.id
    refreshApplicationMenu()
  })
  ipcMain.handle(DESKTOP_IPC.updatesStatus, (event) => {
    assertProductSender(event)
    return presentDesktopUpdate(updates.state)
  })
  ipcMain.handle(DESKTOP_IPC.onboardingApiKey, async (event) => {
    assertProductSender(event)
    return (await readWelcomeState()).hasApiKey
  })
  ipcMain.on(DESKTOP_IPC.onboardingActive, (event, active: unknown) => {
    const window = mainWindow
    if (window === undefined || window.isDestroyed() || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame
      || !event.senderFrame.url.startsWith(`${SCHEME}://app/`) || typeof active !== 'boolean') return
    window.setMinimumSize(active ? 960 : 520, 600)
    if (active) {
      const { width, height } = window.getBounds()
      if (width < 960) window.setSize(960, height)
    }
  })
  ipcMain.handle(DESKTOP_IPC.updatesOpen, async (event) => {
    assertProductSender(event)
    await openUpdatePrompt()
  })

  let promptOperation: Promise<void> | undefined
  let policyAuthenticationQueued = false
  const openUpdatePrompt = (manual = false): Promise<void> => {
    if (authenticationOperation !== undefined) {
      policyAuth?.focus(); updateDialog.focus()
    }
    let failedOperation: 'check' | 'download' | 'install' = 'check'
    promptOperation ??= Promise.resolve().then(async () => {
      if (manual) updateJournal?.action('check-requested')
      const joinedPolicyAuthentication = authenticationOperation !== undefined
      if (joinedPolicyAuthentication) await authenticatePolicy()
      if (isMandatory()) {
        mandatoryUI?.focus()
        if (manual) await Promise.all([checkPolicyManually(), updateSchedule.check(true)])
        return
      }
      let controller: AbortController | undefined
      let progress: Promise<unknown> | undefined
      try {
        let state = updates.state
        if (manual || state.phase === 'idle' || (state.phase === 'error' && state.failedOperation === 'check')) {
          controller = new AbortController()
          ordinaryDialogs.add(controller)
          const parent = currentDialogWindow()
          progress = parent === undefined ? Promise.resolve() : updateDialog.show(parent, { type: 'info', title: locale.messages.updateCheckTitle,
            message: locale.messages.updateChecking, buttons: [locale.messages.later], cancelId: 0, signal: controller.signal })
          if (!joinedPolicyAuthentication) {
            void checkPolicyManually('deferred').catch((error: unknown) => { console.error(error) })
          }
          state = await updateSchedule.check(true)
        }
        if (isMandatory()) { mandatoryUI?.focus(); return }
        if (state.phase === 'error' && state.failedOperation === 'check') { await showUpdateFailure(state); return }
        if (state.phase === 'idle') {
          await ordinaryMessageBox({ type: 'info', title: locale.messages.updateCheckTitle,
            message: formatDesktopMessage(locale.messages.updateCurrent, { version: app.getVersion() }) })
          return
        }
        if (state.phase === 'ready' || (state.phase === 'error' && state.failedOperation === 'install')) {
          if (state.version !== undefined) {
            failedOperation = 'install'
            await showUpdateFailure(await updates.install(state.version))
          }
          return
        }
        if (state.phase !== 'available' && !(state.phase === 'error' && state.failedOperation === 'download')) return
        if (manual) {
          const result = await ordinaryMessageBox({ title: locale.messages.updateCheckTitle, message: locale.messages.updateAvailable,
            detail: formatDesktopMessage(locale.messages.updateDetail, { version: state.version ?? '' }),
            buttons: [locale.messages.updateDownload], cancelId: 1 })
          if (result.response !== 0) return
        }
        if (!isMandatory() && state.version !== undefined) {
          controller?.abort()
          failedOperation = 'download'
          await showUpdateFailure(await downloadUpdate(state.version))
        }
      } finally {
        controller?.abort()
        if (controller !== undefined) ordinaryDialogs.delete(controller)
        await progress
      }
    }).catch((error: unknown) => showUpdateFailure({ phase: 'error', failedOperation,
      message: desktopErrorState(error).message }))
      .finally(() => { promptOperation = undefined; flushQueuedPolicyAuthentication() })
    return promptOperation
  }

  let authenticationOperation: Promise<DesktopPolicyState | undefined> | undefined
  const authenticatePolicy = () => {
    if (authenticationOperation !== undefined) { policyAuth?.focus(); updateDialog.focus() }
    authenticationOperation ??= runPolicyAuthentication().finally(() => { authenticationOperation = undefined })
    return authenticationOperation
  }
  const flushQueuedPolicyAuthentication = (): void => {
    if (!policyAuthenticationQueued || promptOperation !== undefined || authenticationOperation !== undefined
      || isMandatory() || quitting) return
    policyAuthenticationQueued = false
    void authenticatePolicy().catch((error: unknown) => { console.error(error) })
  }
  const queuePolicyAuthentication = (): void => {
    if (authenticationOperation !== undefined) {
      policyAuth?.focus(); updateDialog.focus()
      return
    }
    policyAuthenticationQueued = true
    flushQueuedPolicyAuthentication()
  }
  const runPolicyAuthentication = async () => {
    if (policyAuth === undefined || mandatoryPolicy === undefined || quitting) return undefined
    const parent = mandatoryUI?.confirmationWindow ?? currentDialogWindow()
    if (parent === undefined) return undefined
    const consent = await updateDialog.show(parent, { type: 'info', title: locale.messages.policyLoginTitle,
      message: locale.messages.policyLoginRequired, buttons: [locale.messages.policyLogin, locale.messages.later], cancelId: 1 })
    if (consent.response !== 0 || isQuitting()) return undefined
    const outcome = await policyAuth.login()
    if (isQuitting() || outcome === 'cancelled') return undefined
    if (outcome === 'failed') {
      await updateDialog.show(parent, { type: 'error', title: locale.messages.policyLoginTitle,
        message: locale.messages.policyLoginFailed, buttons: [locale.messages.updateAcknowledge], cancelId: 0 })
      return undefined
    }
    // Drain a pre-login request before asking the server to evaluate the new cookies.
    await mandatoryPolicy.check('login-return')
    if (isQuitting()) return undefined
    return mandatoryPolicy.check('login-return', true)
  }

  const checkPolicyManually = async (authentication: 'immediate' | 'deferred' = 'immediate') => {
    if (authenticationOperation !== undefined) return authenticatePolicy()
    const policy = await mandatoryPolicy?.check('manual', true)
    if (policy?.error !== 'authentication-required') return policy
    if (authentication === 'immediate') return authenticatePolicy()
    queuePolicyAuthentication()
    return policy
  }

  const automaticCheck = (): void => {
    if (!quitting) void mandatoryPolicy?.check('foreground-or-resume').catch((error: unknown) => { console.error(error) })
    if (!quitting) void updateSchedule.check().catch((error: unknown) => { console.error(error) })
  }
  powerMonitor.on('resume', automaticCheck)
  app.on('will-quit', () => {
    updateSchedule.dispose()
    powerMonitor.off('resume', automaticCheck)
    updates.dispose()
  })

  const applicationIconPath = development ? join(app.getAppPath(), 'resources', 'icon-windows.png')
    : join(process.resourcesPath, 'icon.png')
  app.setAboutPanelOptions({
    applicationName: SSID_PRODUCT_NAME,
    applicationVersion: app.getVersion(),
    // The release has no separate build number; omit Electron's bundle version.
    version: '',
    copyright: '',
    iconPath: applicationIconPath,
  })
  // A custom application menu replaces Electron's default menu, so macOS needs
  // its standard menus and application hide commands declared explicitly.
  // Keep app.name stable: Electron derives its default userData directory from it.
  const darwin = process.platform === 'darwin'
  const platformMenus = (): MenuItemConstructorOptions[] => darwin
    ? [shortcuts.fileMenu(currentDesktopLocale().messages), { role: 'editMenu' }, { role: 'windowMenu' }]
    : [{ role: 'editMenu' }]
  const hideCommands: MenuItemConstructorOptions[] = darwin
    ? [{ role: 'hide', label: currentDesktopLocale().messages.hideApplication },
      { role: 'hideOthers', label: currentDesktopLocale().messages.hideOtherApplications },
      { role: 'unhide', label: currentDesktopLocale().messages.showAllApplications }, { type: 'separator' }]
    : []
  const applicationItems = (): MenuItemConstructorOptions[] => [
    // Windows has no system About panel; Electron's fallback is a plain
    // message box, so the shell shows its own dimmed dialog instead.
    process.platform === 'win32'
      ? { label: currentDesktopLocale().messages.aboutMenu,
        click: () => { void showAbout().catch((error: unknown) => { console.error(error) }) } }
      : { label: currentDesktopLocale().messages.aboutMenu, role: 'about' },
    { type: 'separator' },
    { label: currentDesktopLocale().messages.checkUpdatesMenu, click: () => { void openUpdatePrompt(true) } },
    ...development ? [
      { type: 'separator' as const },
      { label: currentDesktopLocale().messages.reloadPageMenu, role: 'reload' as const },
      { label: currentDesktopLocale().messages.restartAppHostMenu, click: () => {
        if (quitting) return
        app.relaunch()
        quitWithoutConfirmation()
      } },
    ] : [],
    { type: 'separator' },
    ...hideCommands,
    { role: 'quit', ...(darwin ? { label: currentDesktopLocale().messages.quitApplication }
      : process.platform === 'win32' ? { label: currentDesktopLocale().messages.exitApplication } : {}) },
  ]
  const devToolsItems: MenuItemConstructorOptions[] = [
    { role: 'toggleDevTools', visible: false },
    { role: 'toggleDevTools', visible: false, accelerator: 'F12' },
  ]
  const refreshApplicationMenu = (): void => {
    Menu.setApplicationMenu(Menu.buildFromTemplate(process.platform === 'win32' ? devToolsItems : [{
      label: darwin ? app.name : currentDesktopLocale().messages.application,
      submenu: [...applicationItems(), ...devToolsItems],
    }, ...platformMenus()]))
    tray?.relabel()
  }
  refreshApplicationMenu()
  const trayIconPath = development ? join(app.getAppPath(), 'resources', 'tray-windows.ico') : join(process.resourcesPath, 'tray.ico')
  if (process.platform === 'win32') {
    // The tray is the way back to a hidden window; without it, relaunching the application still focuses it.
    try {
      tray = new DesktopTray({ iconPath: trayIconPath, locale: currentDesktopLocale,
        open: () => { focusPrimaryWindow() }, quit: () => { app.quit() },
        extras: {
          // 官方的 Reload Page 与 Restart App and Host 只在开发菜单里，正式构建下不可达；
          // 这里提升为托盘的常驻项，并补上「禁用第三方插件并重启」这个救援入口。
          reload: () => { currentMainWindow()?.webContents.reload() },
          restartBackend: () => {
            void restartBackend().catch((failure: unknown) => { console.error('desktop tray: restart backend failed', failure) })
          },
          mask: () => { ssidMask?.toggle() },
          // 对照模式：收起自绘标题栏、放回被接管的页面原件，用来看 DSH 原样。
          contrast: () => {
            const target = currentMainWindow()
            if (target !== undefined) toggleSsidContrast(target)
          },
          restartApplication: () => { app.relaunch(); quitWithoutConfirmation() },
          // SSiD：换成非破坏的纯净模式重启（官方那一版会备份并清空 profile patch，
          // 恢复需要人工处理；这里只少加载层，数据一律不动）。
          disablePlugins: () => { restartInSafeMode() },
        } })
    } catch (error) { console.warn('desktop tray: unavailable', error) }
  }
  // SSiD 全局快捷键：遮罩与截图，键位取自 `~/.ssid/notify.json`、`~/.ssid/screenshot.json`。
  // 官方壳的 shortcuts 模块管窗口内快捷键，与全局键不重叠；这里只注册这两个，
  // 因此退出时整体注销是安全的。快捷键是便利功能而非启动前提——键位被占、配置读不出来、
  // 或运行环境根本没有这个 API 时都只降级：托盘里都有等价入口，不该拖着整个启动一起失败。
  if (process.platform === 'win32') {
    try {
      const { hotkey } = readSsidMaskConfig()
      if (hotkey !== '' && !globalShortcut.register(hotkey, () => { ssidMask?.toggle() })) {
        console.warn(`desktop mask: hotkey ${hotkey} is already taken; use the tray item instead`)
      }
      const { hotkey: shotHotkey } = readSsidScreenshotConfig()
      if (shotHotkey !== '' && ssidScreenshot?.registerHotkeyAtStartup() !== true) {
        console.warn(`desktop screenshot: hotkey ${shotHotkey} is already taken`)
      }
      app.on('will-quit', () => { globalShortcut.unregisterAll() })
    } catch (error) { console.warn('desktop shortcuts: global hotkeys unavailable', error) }
  }
  const backgroundNotice = process.platform === 'win32'
    ? new DesktopBackgroundNotice({ markerPath: join(app.getPath('userData'), 'background-close-confirmed'),
      locale: () => locale, show: ordinaryMessageBox, focus: () => { updateDialog.focus() } })
    : undefined
  const quitConfirmation = new DesktopQuitConfirmation({
    locale: () => locale,
    inspect: () => backend.host?.inspectQuit(),
    // No owner window: a hidden window stays hidden and the native box is its own top-level window.
    show: options => dialog.showMessageBox(options),
    // macOS raises the open alert with the application; Electron exposes no handle to the Windows task
    // dialog, so a repeated request there only joins the open decision.
    focus: () => { if (process.platform === 'darwin') app.focus({ steal: true }) },
    // The task dialog draws its main icon at the system icon size; the multi-size ICO yields that
    // size directly, where the 1024 px PNG would be scaled down by GDI.
    ...(process.platform === 'win32' ? { icon: nativeImage.createFromPath(trayIconPath) } : {}),
  })

  if (process.platform === 'win32') {
    ipcMain.handle(DESKTOP_IPC.windowsMenu, (event, name: unknown, x: unknown, y: unknown) => {
      assertDesktopSender(event, ['app'])
      if (mainWindow === undefined || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('desktop menu: rejected sender')
      if ((name !== 'application' && name !== 'edit')
        || typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)
        || x < 0 || y < 0 || x > 100_000 || y > 100_000) throw new Error('desktop menu: invalid popup request')
      const window = mainWindow
      // Editor-owned history listens to key events rather than Chromium's native undo stack.
      const editItem = (label: string, keyCode: string, modifiers: Array<'control'>, accelerator?: string): MenuItemConstructorOptions => ({
        label,
        ...(accelerator === undefined ? {} : { accelerator }),
        click: () => {
          shortcuts.sendEditingKey(keyCode, modifiers)
        },
      })
      const items: MenuItemConstructorOptions[] = name === 'application' ? applicationItems() : [
        editItem(currentDesktopLocale().messages.undo, 'Z', ['control'], 'Ctrl+Z'),
        editItem(currentDesktopLocale().messages.redo, 'Y', ['control'], 'Ctrl+Y'),
        { type: 'separator' },
        editItem(currentDesktopLocale().messages.cut, 'X', ['control'], 'Ctrl+X'),
        editItem(currentDesktopLocale().messages.copy, 'C', ['control'], 'Ctrl+C'),
        editItem(currentDesktopLocale().messages.paste, 'V', ['control'], 'Ctrl+V'),
        editItem(currentDesktopLocale().messages.delete, 'Delete', []),
        { type: 'separator' },
        editItem(currentDesktopLocale().messages.selectAll, 'A', ['control'], 'Ctrl+A'),
      ]
      const zoom = mainWindow.webContents.getZoomFactor()
      return new Promise<void>((resolve) => {
        Menu.buildFromTemplate(items).popup({ window, x: Math.round(x * zoom), y: Math.round(y * zoom), callback: resolve })
      })
    })
    ipcMain.on(DESKTOP_IPC.windowsAppearance, (event, language: unknown, color: unknown, symbolColor: unknown) => {
      if (mainWindow === undefined || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame) return
      if (!event.senderFrame.url.startsWith(`${SCHEME}://app/`)) return
      if (typeof language === 'string' && /^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*$/u.test(language)) {
        windowsLanguage = language
      }
      // Empty colors precede client stylesheet installation; only CSS color values cross IPC.
      const validColor = (value: unknown): value is string => typeof value === 'string'
        && /^(?:#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/iu.test(value)
      // SSiD：没有 titleBarOverlay 可更新（上游在此调 `setTitleBarOverlay`，删掉 overlay 后
      // 该调用会抛 `Titlebar overlay is not enabled`），页面实测的调色板改为刷新自绘标题栏。
      if (validColor(color) && validColor(symbolColor)) applySsidTitlebarTheme(mainWindow, color, symbolColor)
    })
  }

  const hideMainWindow = (window: BrowserWindow): void => {
    if (process.platform === 'darwin' && window.isFullScreen()) {
      // Hiding a fullscreen window leaves an empty black space; leave fullscreen first.
      window.once('leave-full-screen', () => { if (!window.isDestroyed()) window.hide() })
      window.setFullScreen(false)
    } else {
      window.hide()
    }
  }
  const createMainWindow = (): BrowserWindow => {
    const window = createWindow(appPreload, false, true)
    mainWindow = window
    browserGuests.bind(window, (guest, name) => shortcuts.attachGuest(window, guest, name))
    shortcuts.attach(window)
    window.on('focus', automaticCheck)
    // Closing hides: the page and the Host keep running, and the next show resumes the same document.
    window.on('close', (event) => {
      if (quitting || shellInstallerOwnsQuit || sessionEnding) return
      event.preventDefault()
      if (updateDialog.isOpen) { updateDialog.focus(); return }
      const hide = (): void => {
        if (!quitting && !shellInstallerOwnsQuit && !sessionEnding && !window.isDestroyed()) hideMainWindow(window)
      }
      if (backgroundNotice === undefined) hide()
      else backgroundNotice.close(hide)
    })
    if (process.platform === 'win32') {
      // Shutdown, restart, and log-off must not wait on a confirmation. query-session-end is only a
      // question that another application can veto without any follow-up message, so it does not count.
      window.on('session-end', () => { sessionEnding = true })
    } else {
      // The macOS power-off notification arrives before the terminate request; a cancelled shutdown
      // leaves the process running, and user attention on the window shows the session continues.
      window.on('focus', () => { sessionEnding = false })
      window.on('show', () => { sessionEnding = false })
    }
    window.on('closed', () => { if (mainWindow === window) mainWindow = undefined })
    window.webContents.on('console-message', (details) => {
      if (details.level !== 'error') return
      rendererConsole.push(`${details.sourceId}:${String(details.lineNumber)} ${details.message}`)
    })
    window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && !quitting && !window.isDestroyed()) {
        reportFatal(new Error(`Desktop page failed to load: ${url} (${String(code)}: ${description})`), 'renderer')
      }
    })
    window.webContents.on('preload-error', (_event, _path, error) => {
      if (!quitting && !window.isDestroyed()) reportFatal(error, 'renderer')
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      navigation = undefined
      if (!quitting && !window.isDestroyed() && details.reason !== 'clean-exit') {
        reportFatal(new Error(`Desktop renderer exited: ${details.reason}`), 'renderer')
      }
    })
    return window
  }
  const enterWorkspace = async ({ activate = true }: { activate?: boolean } = {}): Promise<void> => {
    if (quitting) return
    const window = mainWindow ?? createMainWindow()
    await navigateMain(applicationUrl)
    if (isQuitting() || recovery.active || window.isDestroyed()) return
    if (activate) window.show()
    else window.showInactive()
    enteredWorkspace = true
    if (welcomeWindow !== undefined) {
      welcomeWindow.close()
      window.webContents.send(DESKTOP_IPC.enterWorkspace)
    }
    welcomeWindow = undefined
    if (raiseAfterUpdate) {
      raiseAfterUpdate = false
      window.moveTop()
      window.focus()
    }
    if (activate && development && process.env.DSH_DESKTOP_OPEN_DEVTOOLS !== '0') {
      window.webContents.openDevTools({ mode: 'detach' })
    }
  }
  let openingWelcome: Promise<void> | undefined
  const showWelcome = (): Promise<void> => {
    if (quitting) return Promise.resolve()
    if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) {
      welcomeWindow.show()
      welcomeWindow.focus()
      return Promise.resolve()
    }
    openingWelcome ??= (async () => {
      welcomeWindow = await openWelcomeWindow(locale, {
        takeNotice: () => {
          const notice = pendingWelcomeNotice
          pendingWelcomeNotice = undefined
          return Promise.resolve(notice)
        },
        startSignIn: async () => {
          if (welcomeBackend === undefined) throw new Error('desktop welcome: backend unavailable')
          return welcomeBackend.account.start(desktopClientMetadata(locale.id))
        },
        cancelSignIn: async (id) => {
          if (welcomeBackend === undefined) throw new Error('desktop welcome: backend unavailable')
          return welcomeBackend.account.cancel(id)
        },
        copySignInLink: async (id) => {
          const state = await welcomeBackend?.account.state()
          if (state?.attempt?.id !== id || state.attempt.phase !== 'waiting-browser' || state.attempt.authorizeUrl === undefined) {
            throw new Error('desktop welcome: login link is unavailable')
          }
          await clipboard.writeText(platformLoginUrl(state.attempt.authorizeUrl))
        },
        saveApiKey: async (apiKey) => {
          if (backend.host === undefined || welcomeBackend === undefined) return { ok: false }
          const saved = await welcomeBackend.save(apiKey)
          if (!saved.ok) return saved
          await enterWorkspace()
          return { ok: true }
        },
        skip: enterWorkspace,
      })
      const window = welcomeWindow
      window.once('closed', () => {
        void welcomeBackend?.account.state().then((state) => {
          if (state.attempt !== null && !enteredWorkspace) return welcomeBackend?.account.cancel(state.attempt.id)
          return undefined
        }).catch(() => undefined)
      })
      window.once('closed', () => {
        if (welcomeWindow === window) welcomeWindow = undefined
        if (enteredWorkspace || recovery.active) return
        // Nothing runs before the workspace opens. macOS keeps the Dock convention and drops the
        // unused main window so the next activation rebuilds the welcome; elsewhere the close quits.
        if (process.platform === 'darwin') mainWindow?.destroy()
        else app.quit()
      })
      if (isQuitting() || recovery.active || enteredWorkspace) window.close()
      else mainWindow?.hide()
    })().finally(() => { openingWelcome = undefined })
    return openingWelcome
  }
  const openInitialWindow = async (): Promise<void> => {
    if (quitting || recovery.active) return
    const state = await readWelcomeState()
    if (isQuitting() || backend.state.phase !== 'ready') return
    locale = resolveDesktopStartupLocale(state.localePreference, systemLanguages)
    windowsLanguage = locale.id
    refreshApplicationMenu()
    if (!enteredWorkspace && needsWelcome({ loggedIn: state.loggedIn, hasApiKey: state.hasApiKey })) {
      // A later login must retain its own activation policy instead of replaying startup focus.
      raiseAfterUpdate = false
      await showWelcome()
    } else {
      await enterWorkspace()
    }
  }
  focusPrimaryWindow = () => {
    if (quitting) return
    if (isMandatory()) { mandatoryUI?.focus(); return }
    const window = welcomeWindow ?? mainWindow
    if (window === undefined || window.isDestroyed()) {
      try { createMainWindow() } catch (error) { reportFatal(error, 'main'); return }
      void (backend.state.phase === 'ready' ? openInitialWindow() : navigateMain(applicationUrl)).catch((error: unknown) => { reportFatal(error, 'main') })
      return
    }
    // Startup and sign-out select the visible window before activation may reveal the workspace.
    if (window === mainWindow && !enteredWorkspace) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  if (app.isPackaged || process.env.DSH_DESKTOP_DEV_APP === '1') app.setAsDefaultProtocolClient('dsh')
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (url === 'dsh://open' || url === 'dsh://open/') focusPrimaryWindow()
  })

  app.on('activate', (_event, hasVisibleWindows) => {
    if (!hasVisibleWindows) focusPrimaryWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  if (process.platform !== 'win32') powerMonitor.on('shutdown', () => { sessionEnding = true })
  const finishQuit = (): void => {
    quitting = true
    shuttingDown = true
    updateJournal?.action('quit-requested')
    quitConfirmation.dispose()
    backgroundNotice?.dispose()
    tray?.dispose()
    stopAccount?.()
    if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.hide()
    if (mainWindow !== undefined && !mainWindow.isDestroyed()) mainWindow.hide()
    updateSchedule.dispose()
    updateDialog.dispose()
    mandatoryUI?.dispose()
    void Promise.all([Promise.resolve(mandatoryPolicy?.dispose()).then(() => policyAuth?.dispose()), backend.close(),
      // A Platform cleanup failure is logged without cutting the remaining Host shutdown short.
      platformView.dispose().catch((error: unknown) => { console.error(error) })])
      .catch((error: unknown) => { console.error(error) }).finally(() => { app.quit() })
  }
  app.on('before-quit', (event) => {
    if (shellInstallerOwnsQuit) {
      shuttingDown = true
      quitConfirmation.dispose()
      backgroundNotice?.dispose()
      updateJournal?.action('quit-requested')
      tray?.dispose()
      updateDialog.dispose()
      mandatoryUI?.dispose()
      // Installation preparation already awaited Platform storage cleanup.
      void platformView.dispose().catch((error: unknown) => { console.error(error) })
      return
    }
    if (quitting) return
    event.preventDefault()
    if (skipQuitConfirmation || sessionEnding) { finishQuit(); return }
    void quitConfirmation.confirm().then((approved) => {
      if (quitting || shellInstallerOwnsQuit) return
      if (approved) { finishQuit(); return }
      // A quit that started from closing the welcome window destroyed it; a cancelled quit needs it back.
      if (!enteredWorkspace && !recovery.active) void showWelcome().catch((error: unknown) => { reportFatal(error, 'main') })
    }).catch((error: unknown) => { console.error(error); if (!quitting && !shellInstallerOwnsQuit) finishQuit() })
  })

  mainWindow = createMainWindow()
  const manifest: unknown = JSON.parse(await readFile(join(app.getAppPath(), 'package.json'), 'utf8'))
  if (typeof manifest !== 'object' || manifest === null) throw new Error('desktop policy: invalid application manifest')
  const developmentPolicy = app.isPackaged ? undefined : process.env.DSH_DESKTOP_MANDATORY_UPDATE_CONFIG
  const policyInput: unknown = app.isPackaged
    ? ('dshMandatoryUpdatePolicy' in manifest ? manifest.dshMandatoryUpdatePolicy : undefined)
    : developmentPolicy === undefined ? undefined : JSON.parse(developmentPolicy) as unknown
  const policyConfig = resolveDesktopPolicyConfig(policyInput, !app.isPackaged)
  if (policyConfig !== undefined) {
    if (policyConfig.authentication === 'feishu-test') {
      policyAuth = new DesktopPolicyTestAuth(policyConfig.origin, policyConfig.allowedAuthOrigins, locale,
        () => mandatoryUI?.confirmationWindow ?? currentDialogWindow(),
        (event) => { console.info(`desktop policy authentication: ${event}`); updateJournal?.action(`policy-login-${event}`) })
    }
    if (!['win32', 'darwin'].includes(process.platform) || !['x64', 'arm64'].includes(process.arch)) throw new Error('desktop policy: unsupported platform')
    let wasBlocking = false
    mandatoryPolicy = new DesktopMandatoryUpdatePolicy(policyConfig, {
      platform: process.platform as 'win32' | 'darwin', arch: process.arch as 'x64' | 'arm64',
      bundledDshVersion: app.isPackaged ? readDesktopRuntime(resources.dsh).release.version : app.getVersion(),
    }, (state) => {
      if (state.error !== 'authentication-required') policyAuthenticationQueued = false
      if (state.blocking) {
        for (const controller of ordinaryDialogs) controller.abort()
        if (!wasBlocking) updateDialog.cancel()
      }
      mandatoryUI?.sync()
      if (state.blocking && !wasBlocking) void updateSchedule.check(false, true).catch((error: unknown) => { console.error(error) })
      wasBlocking = state.blocking
    }, policyAuth?.request, () => desktopClientMetadata(locale.id))
    const policy = mandatoryPolicy
    mandatoryUI = new DesktopMandatoryUpdateWindow({
      overlays: updateOverlays,
      preload: fileURLToPath(new URL('./preload-mandatory.cjs', import.meta.url)), locale,
      allowedPageOrigins: policyConfig.allowedPageOrigins, parent: () => mainWindow,
      policy: () => policy.state, update: () => updates.state,
      refresh: async () => { await Promise.all([checkPolicyManually(), updateSchedule.check(true)]) },
      download: downloadUpdate, install: version => updates.install(version),
    })
    void mandatoryPolicy.check('launch').then((state) => {
      if (app.isPackaged && state.error === 'authentication-required' && !isQuitting()) queuePolicyAuthentication()
    }).catch((error: unknown) => { console.error(error) })
  }
  automaticCheck()
  await reconcileBackend().catch(() => undefined)
  // Window lifecycle callbacks run while backend startup is pending.
  if (isQuitting()) return
  const window = currentMainWindow()
  if (window !== undefined && development && process.env.DSH_DESKTOP_OPEN_DEVTOOLS !== '0') {
    window.webContents.openDevTools({ mode: 'detach' })
  }
  publishUpdate(updateState)
}

const ownsDesktopInstance = claimDesktopSingleInstance(app, () => { focusPrimaryWindow() })

if (ownsDesktopInstance) void app.whenReady().then(main).catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(error)
  const diagnosticFile = process.env.DSH_DESKTOP_DIAGNOSTIC_FILE
  if (diagnosticFile !== undefined) {
    await writeFile(diagnosticFile, `${error instanceof Error ? error.stack ?? message : message}\n`).catch(() => undefined)
  }
  reportFatal(error, 'main')
}).catch((error: unknown) => {
  console.error(error)
  app.exit(1)
})
