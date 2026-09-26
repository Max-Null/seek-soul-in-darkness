/** Windows system tray: the always-present way back to a hidden window and the explicit quit entry. */

import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import type { DesktopLocale } from './locale.ts'

/** Main-process actions the tray triggers; both run the same paths as the window and application menu. */
export interface DesktopTrayOptions {
  /** Multi-size ICO rendered by `scripts/render-tray-icon.ts`; Windows picks the bitmap for the display scale. */
  readonly iconPath: string
  readonly locale: () => DesktopLocale
  /** Show and focus the primary window. */
  readonly open: () => void
  /** Request quit through the same confirmation as every other quit entry. */
  readonly quit: () => void
  /**
   * SSiD 附加的维护项。全部为可选：未提供时菜单保持官方两项 + 分隔线，
   * 因此本文件仍可独立于 SSiD 语义使用。
   */
  readonly extras?: {
    /** 重新加载主文档，等同官方开发菜单的 Reload Page，但不限开发构建。 */
    readonly reload: () => void
    /** 重启 DSH 内核（Host 子进程），不动 Electron 壳；插件配置改动靠它生效。 */
    readonly restartBackend: () => void
    /** 显示 / 解除屏幕遮罩。有口令时只把输入框调出来。 */
    readonly mask: () => void
    /** 对照模式：收起自绘标题栏、放回被接管的页面原件，用来对照 DSH 原样。 */
    readonly contrast: () => void
    /** 重启整个应用（连同 Host），等同官方开发菜单的 Restart App and Host。 */
    readonly restartApplication: () => void
    /** 以纯净模式重启：下次启动只加载官方 bundle 层，不改任何数据。 */
    readonly disablePlugins: () => void
  }
}

/** Tray icon present for the whole run, not only while the window is hidden. */
export class DesktopTray {
  private tray: Tray | undefined

  /** @param options - Icon path, locale reader, and the open and quit actions. */
  constructor(private readonly options: DesktopTrayOptions) {
    const tray = new Tray(nativeImage.createFromPath(options.iconPath))
    this.tray = tray
    tray.on('click', () => { options.open() })
    this.relabel()
  }

  /** Rebuild the tooltip and context menu in the current locale. */
  relabel(): void {
    const tray = this.tray
    if (tray === undefined) return
    const { messages } = this.options.locale()
    const extras = this.options.extras
    tray.setToolTip(messages.aboutProduct)
    const items: MenuItemConstructorOptions[] = [
      { label: messages.openApplication, click: () => { this.options.open() } },
    ]
    // SSiD：官方把「刷新」与「重启」放在开发菜单里，桌面端正式构建下不可达。
    // 这里把它们提升为托盘的常驻项，并补上「以纯净模式重启」这一救援入口
    // ——纯净模式只少加载第三方层、不动数据，与崩溃恢复那个会备份并清空 patch 的
    // 操作语义不同，所以用各自的文案。见 `main.ts` 的 `restartInSafeMode`。
    if (extras !== undefined) {
      items.push(
        { label: messages.reloadPageMenu, click: () => { extras.reload() } },
        { label: messages.restartBackendMenu, click: () => { extras.restartBackend() } },
        { label: messages.trayMaskMenu, click: () => { extras.mask() } },
        { label: messages.trayContrastMenu, click: () => { extras.contrast() } },
        { type: 'separator' },
        { label: messages.restartAppHostMenu, click: () => { extras.restartApplication() } },
        { label: messages.restartInSafeMode, click: () => { extras.disablePlugins() } },
      )
    }
    items.push(
      { type: 'separator' },
      { label: messages.quitApplication, click: () => { this.options.quit() } },
    )
    tray.setContextMenu(Menu.buildFromTemplate(items))
  }

  /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
  dispose(): void {
    const tray = this.tray
    this.tray = undefined
    tray?.destroy()
  }
}
