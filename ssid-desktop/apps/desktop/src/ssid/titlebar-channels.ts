/**
 * SSiD 自绘标题栏的窗口控件通道。
 *
 * 独立成不依赖 Electron 的模块：主进程注册处理器，页面 preload 按同一份白名单转发，
 * 两边共用一份名单才不会各自漂移。官方把最小化 / 最大化 / 关闭交给原生
 * `titleBarOverlay` 绘制，自绘之后只能由页面主动发指令，preload 因此需要一个受限的转发口。
 */

/** 控件通道名。用 `ssid:title:` 前缀与官方 `dsh-desktop:` 区分开，便于排查。 */
export const SSID_TITLEBAR_CHANNELS = {
  minimize: 'ssid:title:minimize',
  toggleMaximize: 'ssid:title:toggle-maximize',
  close: 'ssid:title:close',
} as const

/** 白名单集合：页面能触达的通道仅限这三个，拿不到任意 IPC 通道。 */
const CHANNEL_SET: ReadonlySet<string> = new Set(Object.values(SSID_TITLEBAR_CHANNELS))

/**
 * 判定一个来路不可信的值是否为允许的窗口控件通道。
 * @param channel - 页面请求的通道名。
 * @returns 该通道是否在白名单内。
 */
export function isSsidTitlebarChannel(channel: unknown): channel is string {
  return typeof channel === 'string' && CHANNEL_SET.has(channel)
}
