/**
 * SSiD shell (SiLing) - Electron main process entry (single-process, learning
 * from anywhere-labs).
 *
 * The DSH kernel boots directly inside the electron main process: DSH's loader
 * probes the standard Node V8 embedder with a native addon, which fails under
 * electron, so module-resolution.ts rewrites the loader's bare specifiers to
 * resolve from the profile directory (anywhere-labs' approach).
 *
 * Window surface: frameless with a self-drawn brand title bar (titleBar
 * BrowserView) and the official DSH web UI full-width below it. All panel
 * functionality (memory / guardian / habit / balances / file tree) lives in
 * DSH plugins — dsh-better-sidebar + @max-null/dsh-ssid-panels — the shell
 * only carries what plugins cannot: window chrome, tray, boot, lifecycle.
 *
 * IMPORTANT: this file is plain ESM JavaScript (.mjs) compiled directly by
 * electron - it must NOT contain any TypeScript syntax (interface / type
 * annotations fail strict-mode compilation).
 */

import { register } from 'tsx/esm/api'
import { app, BrowserView, BrowserWindow, ipcMain, Menu, nativeImage, Notification, Tray } from 'electron'
import { spawn } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// tsx ESM loader: transpiles kernel.ts and resolves @deepseek-ai/dsh-* to the
// adjacent DSH checkout source. Must run before any TS import.
// 打包版（app.isPackaged）改用预编译的 kernel.bundle.mjs，不加载 tsx。
if (!app.isPackaged) {
  register()
}
// 壳版本注入（ssid-panels 的 about API 读取；boot 前设置）。
try {
  const shellPkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  if (typeof shellPkg.version === 'string') process.env.SSID_SHELL_VERSION = shellPkg.version
} catch {
  // 版本缺失不影响启动
}
const { bootKernel } = app.isPackaged
  ? await import('./kernel.bundle.mjs')
  : await import('./kernel.ts')

/** App name / window title. */
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
  // 隐藏 electron 默认菜单栏（File/Edit/...），自绘标题栏接管窗口控制。
  Menu.setApplicationMenu(null)

  // ── splash window: brand boot screen shown while DSH boots ──────────────
  // frame: false = 无边框窗口，顶部自绘标题栏（titleBar BrowserView）。
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 600,
    title: WINDOW_TITLE,
    icon: asset('icon.png'),
    frame: false,
    backgroundColor: '#0f141d',
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  })
  await win.loadFile(fileURLToPath(new URL('./splash.html', import.meta.url)))
  win.show()

  // ── 首次初始化：铺 profile 模板 + 自动安装预制插件（换机开箱即用）───
  // 已初始化（本机 profile 有插件）则直接跳过；否则从安装包模板铺设并
  // 跑系统 pnpm install（约 430MB 依赖，几分钟）。缺失 pnpm 时提示引导。
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const profileDir = join(dshHome, 'profiles', 'ssid')
  const profileReady = () => existsSync(join(profileDir, 'node_modules', '@max-null', 'dsh-memory'))
  const splashStatus = (text) => {
    void win.webContents.executeJavaScript(
      `(() => { const el = document.querySelector('.status'); if (el) el.textContent = ${JSON.stringify(text)} })()`,
    ).catch(() => {})
  }
  const runInstall = (command) => new Promise((resolve, reject) => {
    // shell: true —— Windows 下 .cmd shim 必须经 shell 才能 spawn。
    const child = spawn(command, ['install'], {
      cwd: profileDir,
      stdio: 'ignore',
      windowsHide: true,
      shell: true,
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      code === 0 ? resolve() : reject(new Error(`pnpm install exited with code ${code}`))
    })
  })
  /** pnpm 候选命令：GUI 进程 PATH 常缺用户级 npm 全局目录，补常见安装位。 */
  const pnpmCandidates = () => {
    const commands = ['pnpm', 'pnpm.cmd']
    const userNpm = join(homedir(), 'AppData', 'Roaming', 'npm')
    for (const name of ['pnpm.cmd', 'pnpm.exe', 'pnpm']) {
      const candidate = join(userNpm, name)
      if (existsSync(candidate)) commands.push(candidate)
    }
    return commands
  }
  const ensureProfile = async () => {
    if (profileReady()) return false
    const template = app.isPackaged
      ? join(process.resourcesPath, 'profile-template')
      : fileURLToPath(new URL('./profile-template', import.meta.url))
    try {
      mkdirSync(profileDir, { recursive: true })
      for (const file of ['package.json', 'pnpm-workspace.yaml', 'cordis.patch.yml']) {
        copyFileSync(join(template, file), join(profileDir, file))
      }
      cpSync(join(template, 'vendor'), join(profileDir, 'vendor'), { recursive: true, force: true })
      splashStatus('首次初始化：正在安装预制插件（约 430MB，需要几分钟）…')
      let installed = false
      for (const command of pnpmCandidates()) {
        try {
          await runInstall(command)
          installed = true
          break
        } catch {
          // 尝试下一个候选
        }
      }
      if (!installed) {
        splashStatus('未找到 pnpm：请先安装 pnpm（https://pnpm.io），然后重启思灵')
        await new Promise(() => {})
        return false
      }
      return true
    } catch (cause) {
      process.stderr.write(`ssid: profile init failed: ${cause instanceof Error ? cause.message : String(cause)}\n`)
      return false
    }
  }
  const freshInstall = await ensureProfile()
  if (freshInstall) {
    // 安装子进程完成后的进程状态不适合继续 boot（实测 boot 卡住），
    // 提示用户重启：第二次启动直接进 boot，全链路已验证。
    splashStatus('插件安装完成，请关闭本窗口后重新打开思灵')
    await new Promise(() => {})
    return
  }

  // ── boot DSH kernel (this process) ──────────────────────────────────────
  let kernel
  try {
    kernel = await bootKernel()
  } catch (cause) {
    process.stderr.write(`ssid: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    app.exit(1)
    return
  }

  // ── window + BrowserViews（自绘标题栏 + 官方 UI 全宽）──────────────────
  // BrowserView T: 自绘标题栏（品牌 logo + 窗口控制按钮）。
  const titleBar = new BrowserView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      preload: fileURLToPath(new URL('./titlebar-preload.cjs', import.meta.url)),
    },
  })
  win.addBrowserView(titleBar)
  await titleBar.webContents.loadFile(fileURLToPath(new URL('./titlebar.html', import.meta.url)))

  // 标题栏窗口控制 IPC。
  ipcMain.handle('ssid:title:minimize', () => { win.minimize() })
  ipcMain.handle('ssid:title:toggle-maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('ssid:title:close', () => { win.close() })
  const pushMaximized = () => {
    titleBar.webContents.send('ssid:title:maximized', win.isMaximized())
  }
  win.on('maximize', pushMaximized)
  win.on('unmaximize', pushMaximized)

  // BrowserView A: official DSH loopback UI (replaces the splash page).
  // addBrowserView（不是 setBrowserView）——setBrowserView 会移除上面的 titleBar。
  const mainView = new BrowserView({ webPreferences: { sandbox: true, contextIsolation: true } })
  win.addBrowserView(mainView)

  const TITLEBAR_HEIGHT = 36
  const layout = () => {
    const [width, height] = win.getContentSize()
    titleBar.setBounds({ x: 0, y: 0, width, height: TITLEBAR_HEIGHT })
    mainView.setBounds({ x: 0, y: TITLEBAR_HEIGHT, width, height: height - TITLEBAR_HEIGHT })
  }
  win.on('resize', layout)
  // 关键：loadURL 之前先布局——页面插件 mount 时视口尺寸必须已正确，
  // 否则 better-sidebar 的窄屏判定（mount 时读 innerWidth）会定格在错误值。
  layout()

  // 官方 UI 渲染进程的诊断通道：console 转发到主进程 stderr；
  // [theme-sync] 标记触发标题栏主题即时同步。
  mainView.webContents.on('console-message', (_event, ...args) => {
    const details = typeof args[0] === 'object' && args[0] !== null ? args[0] : { level: args[0], message: args[1] }
    const message = details.message ?? ''
    if (message.includes('[theme-sync]')) {
      requestThemeSync()
      return
    }
    process.stderr.write(`[main-ui:${details.level}] ${message}\n`)
  })
  await mainView.webContents.loadURL(`http://127.0.0.1:${kernel.port}/`)

  // ── 主题跟随：titleBar 是独立 BrowserView，拿不到官方 UI 的 --dsw-* 变量。
  // 实时路径：mainView 注入 MutationObserver，body 样式/主题属性变化时打
  // [theme-sync] 标记（console 转发）→ 主进程防抖同步。5s 轮询兜底。
  let themeSyncTimer = null
  const requestThemeSync = () => {
    if (themeSyncTimer !== null) return
    themeSyncTimer = setTimeout(() => {
      themeSyncTimer = null
      void syncTitlebarTheme()
    }, 100)
  }
  const syncTitlebarTheme = async () => {
    try {
      const tokens = await mainView.webContents.executeJavaScript(`(() => {
        // 深色主题变量挂在 body[data-ds-dark-theme]，读 body 的 computed style。
        // 跟随策略：token 优先（官方主题/皮肤插件重写 token 时命中），
        // body 实际计算样式兜底（dsh-skin 这类 inline-style 皮肤直改 body）。
        const readVar = (name) => {
          const value = getComputedStyle(document.body).getPropertyValue(name).trim()
          return value === '' ? null : value
        }
        const bodyStyle = getComputedStyle(document.body)
        return {
          bg: readVar('--dsw-specific-sidebar-fill') ?? bodyStyle.backgroundColor,
          fg: readVar('--dsw-alias-label-primary') ?? bodyStyle.color,
          muted: readVar('--dsw-alias-label-secondary') ?? bodyStyle.color,
          border: readVar('--dsw-alias-border-l2') ?? 'rgba(128, 148, 168, .25)',
        }
      })()`)
      if (tokens !== null && typeof tokens === 'object' && tokens.bg !== null && tokens.bg !== undefined) {
        await titleBar.webContents.executeJavaScript(`(() => {
          const set = (name, value) => {
            if (value !== null && value !== undefined && value !== '') {
              document.documentElement.style.setProperty(name, value)
            }
          }
          set('--titlebar-bg', ${JSON.stringify(tokens.bg)})
          set('--titlebar-fg', ${JSON.stringify(tokens.fg)})
          set('--titlebar-muted', ${JSON.stringify(tokens.muted)})
          set('--titlebar-border', ${JSON.stringify(tokens.border)})
        })()`)
      }
    } catch (error) {
      // UI 未就绪或切换中：下一轮同步再试
      process.stderr.write(`[titlebar-theme] sync failed: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  }
  const injectThemeObserver = () => {
    void mainView.webContents.executeJavaScript(`(() => {
      if (window.__ssidThemeObserver !== undefined) return 'already'
      const flag = () => { console.log('[theme-sync]') }
      const observer = new MutationObserver(flag)
      for (const target of [document.documentElement, document.body]) {
        observer.observe(target, {
          attributes: true,
          attributeFilter: ['style', 'class', 'data-ds-dark-theme'],
        })
      }
      window.__ssidThemeObserver = observer
      return 'installed'
    })()`).then((result) => {
      process.stderr.write(`[theme-observer] ${String(result)}\n`)
    }).catch((error) => {
      process.stderr.write(`[theme-observer] failed: ${error instanceof Error ? error.message : String(error)}\n`)
    })
  }
  // console 转发通道里识别 [theme-sync] 标记 → 防抖同步。
  // dom-ready 监听覆盖后续导航；loadURL 已完成，立即注入一次。
  mainView.webContents.on('dom-ready', () => {
    injectThemeObserver()
    void syncTitlebarTheme()
  })
  injectThemeObserver()
  void syncTitlebarTheme()
  setInterval(() => { void syncTitlebarTheme() }, 5000)

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
  let trayNoticeShown = false
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      win.hide()
      // 首次隐藏时提示去处，之后不再打扰。
      if (!trayNoticeShown && Notification.isSupported()) {
        trayNoticeShown = true
        new Notification({
          title: '思灵仍在运行',
          body: '已最小化到系统托盘，点击托盘图标可恢复窗口',
        }).show()
      }
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
