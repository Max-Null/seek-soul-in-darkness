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
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// ── stderr/stdout 管道防护 ───────────────────────────────────────────────
// GUI 启动时 stderr 可能挂在一个已关闭的管道上（启动终端关闭 / 双击 exe）：
// 继续写入抛 EPIPE，无人监听 error 事件会升级为未捕获异常，Electron 弹
// 「A JavaScript error occurred」错误框。全局吞掉 error + safeLog 一次失败
// 即静默，杜绝 EPIPE 崩溃。所有日志写入一律走 safeLog（见下方调用点）。
let stdioDead = false
process.stderr.on('error', () => { stdioDead = true })
process.stdout.on('error', () => { stdioDead = true })
// 日志双写：stderr（命令行启动可见）+ 文件（GUI 双击启动时 stderr 管道已死，
// 文件日志是唯一诊断通道；SSID_LOG_FILE 可覆盖路径）。
const LOG_PATH = process.env.SSID_LOG_FILE ?? join(homedir(), '.ssid', 'ssid.log')
let logFileDead = false
const safeLog = (text) => {
  if (!stdioDead) {
    try {
      process.stderr.write(text)
    } catch {
      stdioDead = true
    }
  }
  if (!logFileDead) {
    try {
      appendFileSync(LOG_PATH, text)
    } catch {
      logFileDead = true
    }
  }
}

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
const { bootKernel, bundledRuntimeDir } = app.isPackaged
  ? await import('./kernel.bundle.mjs')
  : await import('./kernel.ts')

/** App name / window title. */
const PRODUCT_NAME = 'SSiD'
const WINDOW_TITLE = '思灵 (SSiD)'

const asset = (name) => fileURLToPath(new URL(`./assets/${name}`, import.meta.url))

async function start() {
  app.setName(PRODUCT_NAME)

  // ── DSH 目录选择器 worker 模式 ──────────────────────────────────────────
  // DSH host 层（dsh-host-directory-picker-native）用 process.execPath spawn 子
  // 进程执行 worker.cjs 弹 Win32 文件夹对话框。打包版下 execPath = 思灵.exe，
  // 新实例会加载本文件而非 worker.cjs，且 requestSingleInstanceLock 因主实例
  // 存在而返回 false → 秒退 → 主进程收到「worker exited before reporting a
  // result」，对话框永远打不开。此分支绕过单例锁与全部 UI 初始化，直接把
  // worker.cjs 当脚本执行（其 IPC 结果发给父进程后进程自然退出）。
  const workerScript = process.argv.find((arg) => arg.endsWith('worker.cjs'))
  if (workerScript !== undefined) {
    await import(pathToFileURL(workerScript).href)
    return
  }

  safeLog('ssid: phase single-instance check\n')
  if (!app.requestSingleInstanceLock()) {
    safeLog('ssid: single-instance lock FAILED -> quit\n')
    app.quit()
    return
  }
  safeLog('ssid: single-instance lock OK\n')

  await app.whenReady()
  safeLog('ssid: phase whenReady ok\n')
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
  const splashProgress = (pct, text) => {
    void win.webContents.executeJavaScript(
      `window.__setProgress(${Number(pct)}, ${JSON.stringify(text ?? null)})`,
    ).catch(() => {})
  }
  const splashError = (text) => {
    void win.webContents.executeJavaScript(
      `window.__showError(${JSON.stringify(text)})`,
    ).catch(() => {})
  }
  /**
   * 安装插件并回传进度。pnpm 的 --reporter=ndjson 把每个事件打成一行
   * JSON（写到 stderr），事件种类（@pnpm/core-loggers 契约，已查证）：
   *   pnpm:stage    阶段标记（resolution_started / fetching / linking...）
   *   pnpm:progress 逐包状态（status: resolved/fetched/found_in_store/imported，
   *                 fetched/found_in_store 有 packageId）
   *   pnpm:summary  安装结束标记
   * pnpm 没有总进度（并行下载，官方 issue #3822 确认），用「阶段权重 +
   * 已处理包计数」近似：解析 5% → 下载 5~70%（每包 +0.4）→ 链接 70~92%
   * （每包 +0.3）→ summary 100%。
   */
  const runInstall = (command, onProgress) => new Promise((resolve, reject) => {
    // shell: true —— Windows 下 .cmd shim 必须经 shell 才能 spawn。
    const child = spawn(command, ['install', '--reporter=ndjson'], {
      cwd: profileDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: true,
    })
    let buf = ''
    const onData = (chunk) => {
      buf += chunk.toString()
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line === '') continue
        try {
          onProgress?.(JSON.parse(line))
        } catch {
          // 非 JSON 行（pnpm 输出偶有杂讯）忽略
        }
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
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
  /**
   * 递归复制目录并回调进度（字节数）。同步复制：主进程阻塞期间渲染进程
   * 仍可处理 executeJavaScript 的进度更新消息。
   */
  const copyDirWithProgress = (src, dst, onProgress) => {
    // 先统计总字节（进度分母）
    let total = 0
    const count = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name)
        if (entry.isDirectory()) count(p)
        else total += statSync(p).size
      }
    }
    count(src)
    // 逐文件复制，每 ~4MB 回调一次进度
    let copied = 0
    let lastReport = 0
    const copy = (dir, to) => {
      mkdirSync(to, { recursive: true })
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const sp = join(dir, entry.name)
        const dp = join(to, entry.name)
        if (entry.isDirectory()) {
          copy(sp, dp)
          continue
        }
        copyFileSync(sp, dp)
        copied += statSync(sp).size
        if (copied - lastReport > 4 * 1024 * 1024) {
          lastReport = copied
          onProgress?.(copied, total)
        }
      }
    }
    copy(src, dst)
    onProgress?.(total, total)
  }
  /**
   * 首次初始化 profile。返回：
   * - 'skipped'：已就绪（老用户），无需初始化
   * - 'bundled'：内置闭包部署完成，可继续 boot
   * - 'installed'：pnpm 安装完成（兜底路径），需重启后 boot
   * - 'failed'：初始化失败（继续 boot 会在 splash 显示错误）
   */
  const ensureProfile = async () => {
    if (profileReady()) return 'skipped'
    // 内置 runtime（安装包自带）优先：直接复制闭包，无需 pnpm/网络。
    const bundledRoot = bundledRuntimeDir()
    try {
      mkdirSync(profileDir, { recursive: true })
      if (bundledRoot !== null) {
        splashStatus('首次初始化：正在部署内置运行环境（约 600MB）…')
        for (const file of ['package.json', 'pnpm-workspace.yaml', 'cordis.patch.yml']) {
          copyFileSync(join(bundledRoot, file), join(profileDir, file))
        }
        cpSync(join(bundledRoot, 'vendor'), join(profileDir, 'vendor'), { recursive: true, force: true })
        await new Promise((resolve) => {
          copyDirWithProgress(
            join(bundledRoot, 'node_modules'),
            join(profileDir, 'node_modules'),
            (done, all) => {
              const pct = all > 0 ? (done / all) * 100 : 100
              splashProgress(
                Math.min(100, Math.round(pct)),
                `首次初始化：正在部署内置运行环境（${(done / 1024 / 1024).toFixed(0)}/${(all / 1024 / 1024).toFixed(0)} MB）…`,
              )
              if (done >= all) resolve()
            },
          )
        })
        safeLog(`ssid: bundled runtime deployed to ${profileDir}\n`)
        return 'bundled'
      }
      // 无内置 runtime（旧安装包 / 开发裸跑）：兜底走系统 pnpm 安装。
      const template = app.isPackaged
        ? join(process.resourcesPath, 'profile-template')
        : fileURLToPath(new URL('./profile-template', import.meta.url))
      for (const file of ['package.json', 'pnpm-workspace.yaml', 'cordis.patch.yml']) {
        copyFileSync(join(template, file), join(profileDir, file))
      }
      cpSync(join(template, 'vendor'), join(profileDir, 'vendor'), { recursive: true, force: true })
      splashStatus('首次初始化：正在安装预制插件（约 430MB，需要几分钟）…')
      // 进度近似：见 runInstall 注释（阶段权重 + 包计数）。
      let pct = 4
      const seenFetch = new Set()
      let importedCount = 0
      let lastStage = ''
      const onProgress = (evt) => {
        if (evt.name === 'pnpm:stage') {
          lastStage = String(evt.stage ?? '')
          // 阶段名是 resolution_started / fetching / linking 等前缀
          if (lastStage.includes('resolution')) pct = Math.max(pct, 4)
          else if (lastStage.includes('fetch')) pct = Math.max(pct, 8)
          else if (lastStage.includes('link') || lastStage.includes('import')) pct = Math.max(pct, 70)
        } else if (evt.name === 'pnpm:progress') {
          if (evt.status === 'fetched' || evt.status === 'found_in_store') {
            seenFetch.add(String(evt.packageId))
            pct = Math.max(pct, 8 + Math.min(seenFetch.size, 155) * 0.4) // 上限 ~70%
          } else if (evt.status === 'imported') {
            importedCount++
            pct = Math.max(pct, 70 + Math.min(importedCount, 74) * 0.3) // 上限 ~92%
          }
        } else if (evt.name === 'pnpm:summary') {
          pct = 100
        }
        splashProgress(Math.min(100, Math.round(pct)), '首次初始化：正在安装预制插件（约 430MB）…')
      }
      let installed = false
      for (const command of pnpmCandidates()) {
        try {
          await runInstall(command, onProgress)
          installed = true
          break
        } catch {
          // 尝试下一个候选
        }
      }
      if (!installed) {
        splashStatus('未找到 pnpm：请先安装 pnpm（https://pnpm.io），然后重启思灵')
        await new Promise(() => {})
        return 'failed'
      }
      return 'installed'
    } catch (cause) {
      safeLog(`ssid: profile init failed: ${cause instanceof Error ? cause.message : String(cause)}\n`)
      return 'failed'
    }
  }
  const initResult = await ensureProfile()
  safeLog(`ssid: phase initResult=${initResult}\n`)
  if (initResult === 'installed') {
    // pnpm 兜底路径：安装子进程完成后的进程状态不适合继续 boot（实测 boot
    // 卡住），提示用户重启。内置闭包路径（'bundled'）无此问题，直接继续。
    splashStatus('插件安装完成，请关闭本窗口后重新打开思灵')
    await new Promise(() => {})
    return
  }

  // ── boot DSH kernel (this process) ──────────────────────────────────────
  let kernel
  try {
    safeLog('ssid: phase bootKernel start\n')
    kernel = await bootKernel()
    safeLog(`ssid: phase bootKernel ok port=${kernel.port}\n`)
  } catch (cause) {
    // 不直接 app.exit(1)（窗口一闪而逝、错误不可见）：把错误详情显示在
    // splash 上，用户点右上角 ✕ 关闭后自行处理（如配置 DSH_CHECKOUT）。
    const message = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)
    safeLog(`ssid: ${message}\n`)
    splashStatus('启动失败：见下方错误详情')
    splashError(`思灵启动失败\n\n${message}\n\n可尝试：设置环境变量 DSH_CHECKOUT 指向 DeepSeek Harness 仓库，然后重新打开思灵。`)
    await new Promise(() => {})
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
    safeLog(`[main-ui:${details.level}] ${message}\n`)
  })
  await mainView.webContents.loadURL(`http://127.0.0.1:${kernel.port}/`)
  safeLog('ssid: phase loadURL ok\n')

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
      safeLog(`[titlebar-theme] sync failed: ${error instanceof Error ? error.message : String(error)}\n`)
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
      safeLog(`[theme-observer] ${String(result)}\n`)
    }).catch((error) => {
      safeLog(`[theme-observer] failed: ${error instanceof Error ? error.message : String(error)}\n`)
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
  safeLog('ssid: phase tray create start\n')
  const tray = new Tray(nativeImage.createFromPath(asset('tray.png')))
  safeLog('ssid: phase tray ok\n')
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
  safeLog('ssid: phase start() completed\n')
}

// ── 全局异常监听：定位任何未捕获的退出路径 ────────────────────────────────
process.on('uncaughtException', (error) => {
  safeLog(`ssid: UNCAUGHT ${error?.stack ?? String(error)}\n`)
})
process.on('unhandledRejection', (reason) => {
  safeLog(`ssid: UNHANDLED_REJECTION ${reason instanceof Error ? reason.stack : String(reason)}\n`)
})
process.on('exit', (code) => {
  try { appendFileSync(LOG_PATH, `ssid: PROCESS_EXIT code=${code}\n`) } catch {}
  try { appendFileSync(join(homedir(), '.ssid', 'heartbeat.log'), `exit code=${code}\n`) } catch {}
})
// 心跳：外部可观测的存活证据（独立文件，排除 LOG_PATH 写失败干扰）
setInterval(() => {
  try { appendFileSync(join(homedir(), '.ssid', 'heartbeat.log'), `alive ${Date.now()}\n`) } catch {}
}, 5000)
app.on('will-quit', () => {
  safeLog('ssid: will-quit\n')
})

void start()
