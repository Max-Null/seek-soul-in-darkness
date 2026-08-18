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
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
const { bootKernel } = app.isPackaged
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
  // 而 worker 的 koffi.view() 读 COM 内存时，Electron 进程（V8 memory cage）
  // 禁止 external buffers 会 FATAL 崩溃（koffi.dev 文档明确注明），所以
  // worker 必须交给纯 node.exe 执行。worker 内的 koffi 是 Node ABI 的 prebuild，
  // 与系统 Node 22 / 内置 v22.22.2 匹配；用 electron.exe（Node 24 ABI）跑会
  // 直接崩 → 「worker exited before reporting a result」。
  // 孙进程的 IPC 消息原样转发给父进程（DSH host），退出码透传。
  const workerScript = process.argv.find((arg) => arg.endsWith('worker.cjs'))
  if (workerScript !== undefined) {
    safeLog(`[worker] script=${workerScript}\n`)
    // node 候选链：打包版内置 node.exe（afterPack 注入）→ NVM v22.22.2
    // （开发机）→ PATH 上的 node.exe（交给 spawn 解析，开发裸跑兜底）。
    // 刻意不放 process.execPath：electron 跑 worker 必崩（ABI 不匹配）。
    const candidates = [
      process.resourcesPath ? join(process.resourcesPath, 'node', 'node.exe') : '',
      process.env.NVM_HOME ? join(process.env.NVM_HOME, 'v22.22.2', 'node.exe') : '',
      'node.exe',
    ]
    const nodeExe = candidates.find((c) => c !== '' && existsSync(c)) ?? 'node.exe'
    safeLog(`[worker] node=${nodeExe}\n`)
    const worker = spawn(nodeExe, [workerScript], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    })
    worker.stdout.on('data', (d) => safeLog(`[worker:out] ${d}\n`))
    worker.stderr.on('data', (d) => safeLog(`[worker:err] ${d}\n`))
    worker.on('message', (message) => {
      if (typeof process.send === 'function') process.send(message)
    })
    worker.on('error', (e) => {
      safeLog(`[worker] spawn error: ${e.message}\n`)
      process.exit(1)
    })
    worker.on('exit', (code, signal) => {
      safeLog(`[worker] exit code=${code} signal=${signal}\n`)
      process.exit(code ?? (signal !== null ? 1 : 0))
    })
    return
  }

  // ── 启动阶段埋点（保留勿删）──
  // 所有 `ssid: phase <name>` 日志标记主流程关键节点：single-instance /
  // whenReady / initResult / bootKernel / loadURL / tray / start completed。
  // 排查启动卡死、闪退、boot 失败时，对照 phase 序列即可定位卡在哪一步。
  // 全局未捕获异常监听（文件末尾）会记录 UNCAUGHT / UNHANDLED_REJECTION，
  // 与 phase 日志配合还原崩溃现场。日志文件 ~/.ssid/ssid.log（SSID_LOG_FILE
  // 可覆盖）；5 秒心跳在 ~/.ssid/heartbeat.log，作外部存活证据。
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
  // 步骤清单（v0.1.4）：splash 展示待办，卡住时高亮行即卡点。主清单贯穿
  // 整个启动；部署阶段切换为部署子清单（解压/校验/替换/收尾），完成后
  // 切回主清单。全部完成时 current 传 items.length（全项打勾）。
  const STARTUP_STEPS = [
    '初始化运行环境检查',
    '部署内置运行环境',
    '启动 DSH 内核',
    '加载思灵界面',
    '就绪',
  ]
  const DEPLOY_STEPS = [
    '解压内置运行环境',
    '校验完整性',
    '替换旧版本',
    '收尾落位',
  ]
  let stepList = STARTUP_STEPS
  const splashSteps = (current) => {
    void win.webContents.executeJavaScript(
      `window.__setStepList(${JSON.stringify(stepList)}, ${Number(current)})`,
    ).catch(() => {})
  }
  const setStepList = (items, current) => {
    stepList = items
    splashSteps(current)
  }
  const splashStep = (current) => splashSteps(current)
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
  setStepList(STARTUP_STEPS, 0)
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
  // ── v0.1.3 归档部署：dsh-runtime.tar.gz 单文件，首启/升级原子解压 ──────
  /** 部署取消信号（splash「取消更新」按钮 → window.__cancelRequested）。 */
  class DeployCanceled extends Error {}

  /** dsh-runtime 归档路径：打包版在 resources/，开发版在 shell/ 下。 */
  const runtimeArchivePath = () => {
    const candidates = app.isPackaged
      ? [join(process.resourcesPath, 'dsh-runtime.tar.gz')]
      : [fileURLToPath(new URL('./dsh-runtime.tar.gz', import.meta.url))]
    return candidates.find((p) => existsSync(p)) ?? null
  }
  /** 读归档内的 .runtime-version（tar -xzOf 单文件输出，无需整体解压）。 */
  const readArchiveVersion = (archive) => {
    try {
      const r = spawnSync('tar', ['-xzOf', archive, '.runtime-version'], { timeout: 30_000 })
      if (r.error !== undefined || r.status !== 0) return null
      const v = String(r.stdout).trim()
      return v === '' ? null : v
    } catch {
      return null
    }
  }
  /** 读 profile 当前部署版本（无 .runtime-version = 旧版安装产物）。 */
  const readProfileVersion = () => {
    try {
      const v = readFileSync(join(profileDir, '.runtime-version'), 'utf8').trim()
      return v === '' ? null : v
    } catch {
      return null
    }
  }
  /**
   * 解压归档到 dst。bsdtar（Win10+ 自带）：-t 预统计条目总数做进度分母，
   * -x 流式读 stderr 逐行计数（每行一个条目）。返回 { done, total }。
   * onCancel 注册取消回调（kill 子进程，供取消轮询使用）。
   */
  const extractArchive = (archive, dst, onProgress, onCancel) =>
    new Promise((resolve, reject) => {
      const list = spawnSync('tar', ['-tzf', archive], { timeout: 120_000 })
      const total =
        list.error === undefined && list.status === 0
          ? String(list.stdout).split('\n').filter((l) => l.trim() !== '').length
          : -1
      const child = spawn('tar', ['-xzvf', archive, '-C', dst], { windowsHide: true })
      let done = 0
      let buf = ''
      child.stderr.on('data', (d) => {
        buf += d.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        done += lines.length
        onProgress?.(done, total)
      })
      child.on('error', reject)
      child.on('exit', (code) => {
        // 取消（kill）导致的非 0 退出由 deployRuntime 按 cancelRequested 区分
        code === 0 ? resolve({ done, total }) : reject(new Error(`tar 解压失败（exit ${code}）`))
      })
      onCancel?.(() => {
        try {
          child.kill()
        } catch {
          // 已退出
        }
      })
    })
  /** splash「取消更新」按钮轮询：部署期间每 400ms 检查一次，命中即回调。 */
  const pollCancel = (onCancelRequested) => {
    const timer = setInterval(() => {
      void win.webContents
        .executeJavaScript('window.__cancelRequested === true')
        .then((v) => {
          if (v === true) onCancelRequested()
        })
        .catch(() => {})
    }, 400)
    return () => clearInterval(timer)
  }
  /**
   * 部署后校正 node_modules/.modules.yaml（pnpm 元数据）。归档在构建机生成，
   * 记录的是构建机绝对路径：storeDir = 构建 cwd 盘符的 .pnpm-store\v<major>，
   * virtualStoreDir = 构建目录（dsh-runtime）的 node_modules\.pnpm。部署到本机
   * profile 后两者都不成立，pnpm 任何操作（含插件中心应用内更新）都会
   * ERR_PNPM_UNEXPECTED_STORE / _VIRTUAL_STORE。改写为部署机路径后 pnpm 直接
   * 可用（2026-08-18 跨盘部署实验验证：改写后 pnpm add 成功）。
   * @param {string} dir - profile 目录（部署落位后）。
   */
  const rewritePnpmMeta = (dir) => {
    const metaPath = join(dir, 'node_modules', '.modules.yaml')
    let text
    try {
      text = readFileSync(metaPath, 'utf8')
    } catch {
      return // 非常规 node_modules（无元数据）：不处理，避免误伤
    }
    // store 的 pnpm major 版本后缀（v11）取自原 storeDir 尾段，随 pnpm 升级自适应
    const oldStore = /"storeDir":\s*"([^"]+)"/.exec(text)?.[1] ?? ''
    const storeVersion = oldStore.split(/[\\/]/).filter(Boolean).pop() ?? 'v11'
    const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
    const storeDir = join(localAppData, 'pnpm', 'store', storeVersion)
    const virtualStoreDir = join(dir, 'node_modules', '.pnpm')
    text = text.replace(/"storeDir":\s*"[^"]+"/, `"storeDir": ${JSON.stringify(storeDir)}`)
    text = text.replace(/"virtualStoreDir":\s*"[^"]+"/, `"virtualStoreDir": ${JSON.stringify(virtualStoreDir)}`)
    writeFileSync(metaPath, text, 'utf8')
    safeLog(`ssid: pnpm meta rewired (store=${storeDir})\n`)
  }
  /**
   * 从归档部署/更新 profile 闭包（v0.1.3）。
   * - 解压到 profile/.deploy.new：取消/失败只删临时目录，旧版无损（原子替换）
   * - 校验 @max-null/dsh-memory 在 → 删旧 node_modules + 改名（毫秒级）→ 其余
   *   条目（package.json/.runtime-version 等）逐个落位
   * - isUpgrade（有旧版可回退）时显示「取消更新」按钮；首启无旧版不可取消
   */
  const deployRuntime = async (archive, { isUpgrade }) => {
    // 归档顶层 = profile 根内容（node_modules/、package.json、.runtime-version、
    // vendor/…），所以解压到 profile 内的隐藏临时目录，交换时把各条目落位到
    // profileDir——直接解压到 node_modules.new 会嵌套错位（node_modules/node_modules）。
    const tmpDir = join(profileDir, '.deploy.new')
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
    let cancelRequested = false
    let cancelTar = () => {}
    const stopPolling = pollCancel(() => {
      cancelRequested = true
      cancelTar()
    })
    if (isUpgrade) {
      void win.webContents.executeJavaScript('window.__setCancelVisible(true)').catch(() => {})
    }
    splashStatus(
      isUpgrade ? '检测到新版运行环境，正在更新（约 30 秒）…' : '首次初始化：正在部署内置运行环境（约 600MB）…',
    )
    setStepList(DEPLOY_STEPS, 0)
    try {
      await extractArchive(
        archive,
        tmpDir,
        (done, total) => {
          if (cancelRequested) return
          if (total > 0) {
            splashProgress(
              Math.min(100, Math.round((done / total) * 100)),
              `正在部署内置运行环境（${done}/${total} 文件）…`,
            )
          } else {
            splashStatus(`正在部署内置运行环境（${done} 文件）…`)
          }
        },
        (kill) => {
          cancelTar = kill
        },
      )
      if (cancelRequested) throw new DeployCanceled()
      // 校验闭包完整性（解压半截/损坏立即失败，不碰旧版）
      splashStep(1)
      if (!existsSync(join(tmpDir, 'node_modules', '@max-null', 'dsh-memory'))) {
        throw new Error('解压结果缺少 @max-null/dsh-memory，部署中止')
      }
      // 原子落位：node_modules 先删旧再改名（毫秒级窗口，无并发）；
      // 其余条目（package.json/.runtime-version/vendor 等）逐个覆盖。
      splashStep(2)
      rmSync(join(profileDir, 'node_modules'), { recursive: true, force: true })
      renameSync(join(tmpDir, 'node_modules'), join(profileDir, 'node_modules'))
      for (const entry of readdirSync(tmpDir)) {
        if (entry === 'node_modules') continue
        rmSync(join(profileDir, entry), { recursive: true, force: true })
        renameSync(join(tmpDir, entry), join(profileDir, entry))
      }
      splashStep(3)
      // 校正 pnpm 元数据：归档在构建机生成，.modules.yaml 里是构建机绝对路径
      // （storeDir=构建 cwd 盘符的 .pnpm-store，virtualStoreDir=dsh-runtime 目录）。
      // 部署到本机后不改写，pnpm 任何操作（含插件中心应用内更新）都报
      // ERR_PNPM_UNEXPECTED_STORE / _VIRTUAL_STORE——2026-08-18 跨盘部署实验确认。
      rewritePnpmMeta(profileDir)
      safeLog(`ssid: runtime deployed (${readProfileVersion() ?? '?'}) to ${profileDir}\n`)
      return 'bundled'
    } catch (cause) {
      if (cancelRequested || cause instanceof DeployCanceled) {
        // 用户取消：升级回退旧版；首启（无旧版）只能挂起提示
        safeLog('ssid: runtime deploy canceled by user\n')
        if (isUpgrade) {
          splashStatus('已取消更新，继续使用当前版本启动…')
          return 'skipped'
        }
        splashError('内置运行环境首次部署已被取消，思灵无法启动。\n\n请重新打开思灵以继续部署。')
        await new Promise(() => {})
        return 'failed'
      }
      safeLog(`ssid: runtime deploy failed: ${cause instanceof Error ? cause.message : String(cause)}\n`)
      if (isUpgrade) {
        splashStatus('更新失败，继续使用当前版本启动…')
        return 'skipped'
      }
      splashError(`内置运行环境部署失败\n\n${cause instanceof Error ? cause.message : String(cause)}\n\n请重新安装思灵后再试。`)
      await new Promise(() => {})
      return 'failed'
    } finally {
      stopPolling()
      void win.webContents.executeJavaScript('window.__setCancelVisible(false)').catch(() => {})
      // 取消/失败后的残留清理（成功时 tmpDir 已被 rename，force 无害）
      rmSync(tmpDir, { recursive: true, force: true })
    }
  }
  /**
   * 首次初始化 profile。返回：
   * - 'skipped'：已就绪（老用户，版本一致），无需初始化
   * - 'bundled'：内置闭包部署完成，可继续 boot
   * - 'installed'：pnpm 安装完成（兜底路径，仅无归档时），需重启后 boot
   * - 'failed'：初始化失败（继续 boot 会在 splash 显示错误）
   */
  const ensureProfile = async () => {
    // 上次部署残留（取消/崩溃）先清理
    rmSync(join(profileDir, '.deploy.new'), { recursive: true, force: true })
    mkdirSync(profileDir, { recursive: true })
    // 归档部署优先：首启（无 node_modules）或版本不一致（新安装包升级）
    const archive = runtimeArchivePath()
    if (archive !== null) {
      const archiveVer = readArchiveVersion(archive)
      const profileVer = readProfileVersion()
      const hasModules = profileReady()
      // 版本对得上且模块在 → 跳过；否则（首启/老版本/模块丢失）重新部署。
      // archiveVer 为 null（异常归档）也部署：部署后版本文件落位，下次可对比。
      const deployNeeded = !hasModules || (archiveVer !== null && profileVer !== archiveVer)
      if (!deployNeeded) return 'skipped'
      safeLog(
        `ssid: runtime deploy needed (archive=${archiveVer ?? '?'} profile=${profileVer ?? '?'} hasModules=${hasModules})\n`,
      )
      return deployRuntime(archive, { isUpgrade: hasModules })
    }
    // 无归档（旧安装包 / 开发裸跑）：兜底走系统 pnpm 安装。
    try {
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
  splashStep(1)
  const initResult = await ensureProfile()
  safeLog(`ssid: phase initResult=${initResult}\n`)
  if (initResult === 'installed') {
    // pnpm 兜底路径：安装子进程完成后的进程状态不适合继续 boot（实测 boot
    // 卡住），提示用户重启。内置闭包路径（'bundled'）无此问题，直接继续。
    splashStatus('插件安装完成，请关闭本窗口后重新打开思灵')
    await new Promise(() => {})
    return
  }
  // 部署/检查阶段完成（skipped / bundled；failed 已在内部挂起）
  setStepList(STARTUP_STEPS, 2)

  // ── boot DSH kernel (this process) ──────────────────────────────────────
  let kernel
  try {
    safeLog('ssid: phase bootKernel start\n')
    splashStep(2)
    kernel = await bootKernel()
    safeLog(`ssid: phase bootKernel ok port=${kernel.port}\n`)
    splashStep(3)
  } catch (cause) {
    // 不直接 app.exit(1)（窗口一闪而逝、错误不可见）：把错误详情显示在
    // splash 上，用户点右上角 ✕ 关闭后自行处理（如配置 DSH_CHECKOUT）。
    const message = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)
    // 临时诊断：递归展开嵌套 cause（DSH loader 的 AggregateError 常被 Error 包一层）
    const expandCause = (c, depth) => {
      if (depth > 4 || c === undefined || c === null) return
      if (c instanceof AggregateError && Array.isArray(c.errors)) {
        for (const e of c.errors) {
          safeLog(`ssid: BOOT-AGG[${depth}]: ${e instanceof Error ? (e.message ?? String(e)) : String(e)}\n`)
          expandCause(e, depth + 1)
        }
      } else if (c instanceof Error && c.cause !== undefined && c.cause !== null) {
        expandCause(c.cause, depth + 1)
      }
    }
    expandCause(cause, 0)
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
  // DSH 版本副标题（官方 host.describe 通道是占位符 '0.0.1'，壳层自读真实值）。
  void titleBar.webContents.executeJavaScript(
    `window.__setDshVersion(${JSON.stringify(kernel.dshVersion)})`,
  ).catch(() => {})

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
  // F12 打开官方 UI 的 devtools（打包版默认禁用，排查问题时需要）。
  mainView.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainView.webContents.toggleDevTools()
    }
  })
  await mainView.webContents.loadURL(`http://127.0.0.1:${kernel.port}/`)
  safeLog('ssid: phase loadURL ok\n')
  splashStep(4)
  // ── 侧边栏自动诊断：探测 toggle 按钮 + 模拟点击 + 对比面板 class 变化 ──
  // better-sidebar 的 toggleCluster 固定在视口右上角；面板 hidden 态有
  // nArs4W_panelHidden class。点击前后 class 变化 = store 正常响应。
  setTimeout(async () => {
    try {
      const diag = await mainView.webContents.executeJavaScript(`(async () => {
        const out = { toggle: null, buttons: 0, disabled: [], before: null, after: null, changed: null, titleBarCompat: null }
        const cluster = document.querySelector('.nArs4W_toggleCluster')
        const panel = document.querySelector('.nArs4W_panel')
        out.toggle = cluster !== null
        out.titleBarCompat = document.body?.dataset?.dshTitleBarCompat ?? null
        if (cluster) {
          const btns = cluster.querySelectorAll('button')
          out.buttons = btns.length
          btns.forEach((b, i) => { if (b.disabled) out.disabled.push(i) })
          out.before = panel?.className ?? 'no-panel'
          if (btns[0]) btns[0].click()
          await new Promise((r) => setTimeout(r, 700))
          out.after = panel?.className ?? 'no-panel'
          out.changed = out.before !== out.after
        }
        return out
      })()`)
      safeLog(`[sidebar-diag] ${JSON.stringify(diag)}\n`)
    } catch (error) {
      safeLog(`[sidebar-diag] failed: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  }, 8000)

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

  // ── 通知体系（2026-08-18）：窗口失焦时 Windows 通知 + 音效，配置驱动 ────
  // 配置 ~/.ssid/notify.json：{ enabled, replyDone, question, approval }；
  // 文件不存在 = 默认全开。场景：
  //   replyDone：session/event 的 turn/end（completed，事件自带 time 计时）
  //   approval：session/event 的 approval/asked（授权审计事件）
  //   question：userQuestions.ask 包装（同进程服务，无 session 事件可监听）
  const NOTIFY_CONFIG_PATH = join(homedir(), '.ssid', 'notify.json')
  const DEFAULT_NOTIFY = { enabled: true, replyDone: true, question: true, approval: true }
  const readNotifyConfig = () => {
    try {
      const parsed = JSON.parse(readFileSync(NOTIFY_CONFIG_PATH, 'utf8'))
      return { ...DEFAULT_NOTIFY, ...(typeof parsed === 'object' && parsed !== null ? parsed : {}) }
    } catch {
      return { ...DEFAULT_NOTIFY }
    }
  }
  const playNotificationSound = () => {
    try {
      spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', '[System.Media.SystemSounds]::Asterisk.Play()'], {
        windowsHide: true,
        stdio: 'ignore',
      })
    } catch {
      // 音效失败不影响通知
    }
  }
  const maybeNotify = (scene, title, body) => {
    const config = readNotifyConfig()
    if (!config.enabled || !config[scene]) return
    if (win.isFocused()) return // 用户正看着窗口：不打扰
    if (Notification.isSupported()) {
      // silent: 音效由 playNotificationSound 显式播放，避免与系统音效双响。
      new Notification({ title, body, silent: true }).show()
    }
    playNotificationSound()
    safeLog(`ssid: notify ${scene} (${body})\n`)
  }
  const turnStartTimes = new Map()
  kernel.ctx.on('session/event', (_session, event) => {
    const type = event?.type
    const data = event?.data
    if (type === 'turn/start') {
      turnStartTimes.set(String(data?.turn ?? ''), event.time)
      return
    }
    if (type === 'turn/end' && data?.reason?.kind === 'completed') {
      const start = turnStartTimes.get(String(data?.turn ?? ''))
      turnStartTimes.delete(String(data?.turn ?? ''))
      if (start === undefined) return
      const seconds = Math.max(0, Math.round((event.time - start) / 1000))
      const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
      const ss = String(seconds % 60).padStart(2, '0')
      maybeNotify('replyDone', WINDOW_TITLE, `会话已完成，用时 ${mm}:${ss}`)
      return
    }
    if (type === 'approval/asked') {
      maybeNotify('approval', WINDOW_TITLE, `工具「${String(data?.toolName ?? '?')}」请求授权，请回到思灵处理`)
    }
  })
  // 提问：包装 userQuestions 服务实例（纯服务调用，无 session 事件可监听）。
  const userQuestions = kernel.get('userQuestions')
  if (userQuestions !== null && userQuestions !== undefined && typeof userQuestions.ask === 'function') {
    const originalAsk = userQuestions.ask.bind(userQuestions)
    userQuestions.ask = async (request) => {
      maybeNotify('question', WINDOW_TITLE, 'AI 向你提出了一个问题，请回到思灵回答')
      return originalAsk(request)
    }
  }

  // ── tray: close-to-tray, tray menu (show / quit) ────────────────────────
  safeLog('ssid: phase tray create start\n')
  const tray = new Tray(nativeImage.createFromPath(asset('tray.png')))
  safeLog('ssid: phase tray ok\n')
  tray.setToolTip(WINDOW_TITLE)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示思灵', click: () => { win.show(); win.focus() } },
    { type: 'separator' },
    {
      label: '重启',
      click: () => {
        // 先标记 relaunch 再优雅退出：shutdown 内部 await fiber.dispose 后
        // app.exit(0)，Electron 检测到 relaunch 标志自动以新进程重启。
        // 过滤 worker.cjs：worker 模式（argv 含 worker.cjs）relaunch 不能
        // 沿用原始 argv，否则会再次走 worker 分支而不是启动壳。
        app.relaunch({ args: process.argv.slice(1).filter((arg) => !arg.endsWith('worker.cjs')) })
        quitting = true
        void kernel.shutdown(0).catch(() => app.exit(0))
      },
    },
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

  splashStep(STARTUP_STEPS.length)
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
