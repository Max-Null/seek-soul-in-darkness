/**
 * SSiD 截图引用。
 *
 * 与思灵壳 `shell/main.mjs:1880-2075` 同语义：逐屏抓帧 → 每屏盖一个全屏浮层 → 用户框选
 * （可标注）→ 确认后把图**插进输入框**。
 *
 * 「插进输入框」这一步由页面侧的 `dsh-capture` 插件完成：本模块只负责派发
 * `ssid:screenshot` 事件，与自建壳走的是同一个事件契约（协议 v2，detail 为
 * `{ uid, source, annotated? }`），所以插件一行都不用改。自建壳当初要经主进程
 * `mainView.executeJavaScript` 派发，是因为它的标题栏/浮层在别的 BrowserView 里；
 * 这里没有那层差别。
 *
 * 几处实测结论沿用了自建壳的注释，别当成可随意化简的细节：
 * - **逐屏单独请求抓帧**：`desktopCapturer` 单次调用的 `thumbnailSize` 作用于全部源，
 *   两屏会被各自缩放变形，所以每屏按自身物理分辨率请求一次。
 * - **全屏覆盖不用 `fullscreen`**：它与构造尺寸互相覆盖，inner 会出现怪异尺寸导致坐标错位；
 *   改用普通窗口 + 创建后 `setBounds` 二次钉位。
 * - **先摘 `session` 再逐个 destroy**：destroy 会同步触发 `closed` 重入本模块。
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, desktopCapturer, globalShortcut, ipcMain, screen } from 'electron'

/** 截图配置；字段与 `~/.ssid/screenshot.json` 对应。 */
export interface SsidScreenshotConfig {
  /** 截图前是否隐藏主窗口（关掉后可框选 DSH 自身的内容用于引用）。 */
  readonly hideWindow: boolean
  /** 全局快捷键；空串表示不注册。 */
  readonly hotkey: string
}

/** 缺省配置，与思灵壳一致。 */
const DEFAULT_SCREENSHOT: SsidScreenshotConfig = { hideWindow: true, hotkey: 'Control+Shift+A' }

/** 浮层页面：与 `lib/main.js` 同目录，由 `tsdown.config.ts` 从 `resources/` 复制进来。 */
const OVERLAY_PAGE = fileURLToPath(new URL('./screenshot.html', import.meta.url))

/** 浮层 preload：与浮层页面配对，桥名 `ssidCapture`。 */
const OVERLAY_PRELOAD = fileURLToPath(new URL('./preload-screenshot.cjs', import.meta.url))

/** 确认载荷：原图必带，编辑图仅在实际标注过时才有（空标注不传，免得插入两张一样的图）。 */
interface CapturePayload {
  readonly uid: string
  readonly source: string
  readonly annotated?: string
}

/**
 * 截图配置文件路径。
 *
 * 与通知配置同模式：`SSID_SCREENSHOT_CONFIG` 可整体覆盖，供并行实例（隔离测试）用独立
 * 配置，免得与正在运行的思灵抢同一个全局热键。
 * @returns 配置文件绝对路径。
 */
export function ssidScreenshotConfigPath(): string {
  const override = process.env.SSID_SCREENSHOT_CONFIG
  if (override !== undefined && override.trim() !== '') return override.trim()
  return join(homedir(), '.ssid', 'screenshot.json')
}

/**
 * 读取截图配置。
 * @param path - 配置文件路径，默认 {@link ssidScreenshotConfigPath}。
 * @returns 截图配置；任何读取或解析失败都退化为缺省值。
 */
export function readSsidScreenshotConfig(path: string = ssidScreenshotConfigPath()): SsidScreenshotConfig {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    return {
      // 只有显式 false 才不隐藏：字段缺失或写坏都按缺省处理。
      hideWindow: parsed['hideWindow'] !== false,
      hotkey: typeof parsed['hotkey'] === 'string' && parsed['hotkey'].trim() !== ''
        ? parsed['hotkey']
        : DEFAULT_SCREENSHOT.hotkey,
    }
  } catch {
    return DEFAULT_SCREENSHOT
  }
}

/** 一次截图会话：浮层集合与「结束后是否恢复主窗口」。 */
interface CaptureSession {
  overlays: BrowserWindow[]
  restoreOnFinish: boolean
}

/**
 * 截图引用的持有者。一次只允许一个会话，重复触发直接忽略。
 */
export class SsidScreenshot {
  private session: CaptureSession | null = null

  /** 本实例当前占用的全局热键；空串表示未占用。见 {@link apply}。 */
  private registeredHotkey = ''

  /**
   * @param mainWindow - 主窗口取值器；窗口可能被重建，故用惰性取值而非捕获实例。
   */
  constructor(private readonly mainWindow: () => BrowserWindow | undefined) {
    // 浮层确认：关全部 → 恢复主窗口 → 派发给页面。
    ipcMain.on('ssid:shot:confirm', (_event, payload: unknown) => {
      if (this.session === null) return
      // 兼容旧版字符串载荷；新版是 { source, annotated? }。
      const record = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : null
      const source = record !== null
        ? (typeof record['source'] === 'string' ? record['source'] : '')
        : (typeof payload === 'string' ? payload : '')
      const annotated = record !== null && typeof record['annotated'] === 'string' ? record['annotated'] : undefined
      this.closeOverlays(true)
      this.deliver({
        uid: `shot-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`,
        source,
        ...(annotated === undefined ? {} : { annotated }),
      })
    })
    ipcMain.on('ssid:shot:cancel', () => { this.closeOverlays(true) })
    ipcMain.on('ssid:shot:error', (_event, message: unknown) => {
      console.warn('[screenshot] overlay error:', typeof message === 'string' ? message : String(message))
    })
  }

  /** 开始一次截图；已有会话进行中时忽略。 */
  async start(): Promise<boolean> {
    if (this.session !== null) return false
    const win = this.target()
    const displays = screen.getAllDisplays()
    if (displays.length === 0) return false
    const config = readSsidScreenshotConfig()
    const restoreOnFinish = config.hideWindow && win !== undefined && win.isVisible()
    const session: CaptureSession = { overlays: [], restoreOnFinish }
    this.session = session
    if (restoreOnFinish) win?.hide()
    // 隐藏后要等一帧，否则冻结帧里还带着主窗口。
    await delay(restoreOnFinish ? 250 : 50)

    const frames: { display: Electron.Display; source: Electron.DesktopCapturerSource }[] = []
    for (const display of displays) {
      const scale = display.scaleFactor === 0 ? 1 : display.scaleFactor
      const physicalWidth = Math.round(display.bounds.width * scale)
      const physicalHeight = Math.round(display.bounds.height * scale)
      let sources: Electron.DesktopCapturerSource[] = []
      try {
        sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: physicalWidth, height: physicalHeight },
        })
      } catch (error) {
        console.warn('[screenshot] desktopCapturer failed:', error instanceof Error ? error.message : String(error))
        continue
      }
      const matched = sources.find(candidate => String(candidate.display_id) === String(display.id)) ?? sources[0]
      if (matched === undefined || matched.thumbnail.isEmpty()) continue
      frames.push({ display, source: matched })
    }

    for (const { display, source } of frames) {
      if (this.session !== session) break
      const physical = source.thumbnail.getSize()
      const overlay = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        show: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        backgroundColor: '#000000',
        webPreferences: { sandbox: true, contextIsolation: true, preload: OVERLAY_PRELOAD },
      })
      // 见文件头：普通窗口 + 二次钉位，覆盖含任务栏的整块显示器。
      overlay.setBounds({ x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height })
      // 强置顶：hideWindow=false 时主窗口可见并参与层级，普通置顶会被它压住。
      overlay.setAlwaysOnTop(true, 'screen-saver')
      session.overlays.push(overlay)
      overlay.on('closed', () => {
        // 任一浮层被外部关闭（如系统强制销毁）：视为取消整次截图。
        this.closeOverlays(true)
      })
      overlay.webContents.on('render-process-gone', (_event, details) => {
        console.warn(`[screenshot] overlay renderer gone displayId=${String(display.id)} reason=${String(details.reason)}`)
      })
      // 无边框窗口右键会弹 Windows 系统菜单（抢焦点、外观异常）；DOM 层已挡，这里兜底。
      overlay.webContents.on('context-menu', (event) => { event.preventDefault() })
      overlay.webContents.once('did-finish-load', () => {
        if (overlay.isDestroyed()) return
        const frame = {
          dataUrl: source.thumbnail.toDataURL(),
          logicalW: display.bounds.width,
          logicalH: display.bounds.height,
          physicalW: physical.width,
          physicalH: physical.height,
        }
        void overlay.webContents
          .executeJavaScript(`window.__setFrame(${JSON.stringify(frame)})`)
          .then(() => {
            if (overlay.isDestroyed()) return
            overlay.show()
            overlay.focus()
          })
          .catch((error: unknown) => {
            console.warn('[screenshot] overlay frame inject failed:', error instanceof Error ? error.message : String(error))
          })
      })
      void overlay.loadFile(OVERLAY_PAGE)
    }

    if (session.overlays.length === 0) {
      console.warn('[screenshot] no screen sources matched')
      this.closeOverlays(true)
      return false
    }
    return true
  }

  /**
   * 按配置文件注册全局热键（Shell 启动时调用一次）。
   *
   * 与 {@link apply} 分开：启动时还没有「已占用的键位」要注销，而 apply 是配置变更后的
   * 重注册路径。两者都走 `registeredHotkey` 记账，所以 apply 不会误伤遮罩的键位。
   * @returns 是否成功占用；空键位视为成功（用户主动不设快捷键）。
   */
  registerHotkeyAtStartup(): boolean {
    return this.apply()
  }

  /**
   * SSiD screenshot service `trigger`：开一次截图浮层。
   *
   * 供 Host（`dsh-capture` 的 trigger 路由）经 IPC 调用；结果经
   * {@link deliver} 直接派发给主窗口页面，**不**回传调用方。
   */
  trigger(): void {
    void this.start().catch((error: unknown) => {
      console.warn('[screenshot] trigger failed:', error instanceof Error ? error.message : String(error))
    })
  }

  /**
   * SSiD screenshot service `apply`：改配置后重注册全局热键，让新键位立即生效。
   *
   * 与 Shell 启动时的注册同源（读同一份 `screenshot.json`）。不能直接用
   * `globalShortcut.register`——Electron 对**已注册的**键位返回 false，那样每次
   * 用户点「保存」都会看到「保存失败」。所以先注销后注册；把当前键位记在
   * `registeredHotkey` 里，是为了不让这条路径把遮罩的键位一起注销掉。
   * @returns 是否成功占用新键位；空键位视为成功（用户主动不设快捷键）。
   */
  apply(): boolean {
    const { hotkey } = readSsidScreenshotConfig()
    if (this.registeredHotkey !== '') {
      globalShortcut.unregister(this.registeredHotkey)
      this.registeredHotkey = ''
    }
    if (hotkey === '') return true
    this.registeredHotkey = hotkey
    const ok = globalShortcut.register(hotkey, () => { this.trigger() })
    if (!ok) this.registeredHotkey = ''
    return ok
  }

  /** 移除 IPC 监听（仅在整体销毁时调用；本模块的监听是全局单份）。 */
  dispose(): void {
    this.closeOverlays(true)
    ipcMain.removeAllListeners('ssid:shot:confirm')
    ipcMain.removeAllListeners('ssid:shot:cancel')
    ipcMain.removeAllListeners('ssid:shot:error')
  }

  /**
   * 关闭全部浮层并（可选）恢复主窗口。
   *
   * 先摘走 `session` 再逐个 destroy：destroy 同步触发 `closed` 事件重入本方法，
   * 若 session 仍挂着，递归层会把它置空，回到外层再访问就抛异常
   * （自建壳 2026-08-23 实测：confirm 后崩溃导致截图进不了输入框）。
   * @param restore - 是否恢复被隐藏的主窗口。
   */
  private closeOverlays(restore: boolean): void {
    const session = this.session
    if (session === null) return
    this.session = null
    for (const overlay of session.overlays) {
      if (!overlay.isDestroyed()) overlay.destroy()
    }
    if (restore && session.restoreOnFinish) {
      const win = this.target()
      win?.show()
      win?.focus()
    }
  }

  /**
   * 把截图交给页面，由 `dsh-capture` 插件插入输入框。
   * @param payload - 协议 v2 载荷：原图，以及仅在标注过时存在的编辑图。
   */
  private deliver(payload: CapturePayload): void {
    const win = this.target()
    if (win === undefined) return
    const script = `window.dispatchEvent(new CustomEvent('ssid:screenshot', { detail: ${JSON.stringify(payload)} }))`
    void win.webContents.executeJavaScript(script).catch((error: unknown) => {
      console.warn('[screenshot] deliver failed:', error instanceof Error ? error.message : String(error))
    })
  }

  private target(): BrowserWindow | undefined {
    const candidate = this.mainWindow()
    return candidate === undefined || candidate.isDestroyed() ? undefined : candidate
  }
}

/**
 * 等待若干毫秒。
 * @param ms - 毫秒数。
 * @returns 到期后兑现的 Promise。
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}
