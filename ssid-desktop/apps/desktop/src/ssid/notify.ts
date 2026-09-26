/**
 * SSiD 原生通知投递。
 *
 * 与思灵壳 `shell/main.mjs:1537-1557` 的 `maybeNotify` 同语义：失焦才打扰、配置驱动、
 * 音效由本模块显式播放（因此 Electron 通知本身用 `silent: true`，避免与系统音效双响）。
 * 配置沿用既有路径 `~/.ssid/notify.json`，与现装思灵共用一份，用户升级后不必重设。
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, Notification } from 'electron'

/** 通知场景。字段名与配置项一一对应。 */
export type SsidNotifyScene = 'replyDone' | 'approval' | 'question'

/**
 * Host 经 private IPC 上报的一条通知事实。
 *
 * 与 `apps/desktop-host/src/ssid-notify.ts` 的 `SsidNotifyEvent` 必须保持一致；
 * 两个应用各自独立编译，故此处重复声明而非跨包引用。
 */
export interface SsidNotifyEvent {
  readonly scene: SsidNotifyScene
  readonly toolName?: string
  readonly startedAt?: number
  readonly endedAt?: number
}

/** 通知开关；文件不存在或损坏时四项全开，与思灵壳一致。 */
export interface SsidNotifyConfig {
  readonly enabled: boolean
  readonly replyDone: boolean
  readonly approval: boolean
  readonly question: boolean
}

const ALL_ON: SsidNotifyConfig = { enabled: true, replyDone: true, approval: true, question: true }

/**
 * 通知配置文件路径。
 *
 * `SSID_NOTIFY_CONFIG` 可整体覆盖路径：并行实例（隔离测试）用它指向独立配置，免得与
 * 正在运行的思灵抢同一份开关与全局热键 —— 两个实例注册同一个热键时后一个必然失败。
 * @param home - 家目录，仅为测试可注入，正常调用不传。
 * @returns 配置文件绝对路径。
 */
export function ssidNotifyConfigPath(home: string = homedir()): string {
  const override = process.env.SSID_NOTIFY_CONFIG
  if (override !== undefined && override.trim() !== '') return override.trim()
  return join(home, '.ssid', 'notify.json')
}

/**
 * 读取通知配置。
 * @param path - 配置文件路径，默认 {@link ssidNotifyConfigPath}。
 * @returns 四项开关；任何读取或解析失败都退化为全开。
 */
export function readSsidNotifyConfig(path: string = ssidNotifyConfigPath()): SsidNotifyConfig {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Record<keyof SsidNotifyConfig, unknown>>
    // 只有显式 false 才关闭：字段缺失、类型不对都按开处理，避免配置写坏就静默失效。
    const on = (value: unknown): boolean => value !== false
    return {
      enabled: on(parsed.enabled),
      replyDone: on(parsed.replyDone),
      approval: on(parsed.approval),
      question: on(parsed.question),
    }
  } catch {
    return ALL_ON
  }
}

/** 通知标题与正文。 */
export interface SsidNotifyMessage {
  readonly title: string
  readonly body: string
}

/**
 * 把一条 Host 事件翻成用户可读文案。
 * @param event - Host 上报的事件。
 * @param productName - 应用显示名，取自 `app.name`。
 * @returns 该场景的通知标题与正文。
 */
export function describeSsidNotify(event: SsidNotifyEvent, productName: string): SsidNotifyMessage {
  if (event.scene === 'replyDone') {
    const seconds = Math.max(0, Math.round(((event.endedAt ?? Date.now()) - (event.startedAt ?? Date.now())) / 1000))
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
    const ss = String(seconds % 60).padStart(2, '0')
    return { title: productName, body: `会话已完成，用时 ${mm}:${ss}` }
  }
  if (event.scene === 'approval') {
    return { title: productName, body: `工具「${event.toolName ?? '?'}」请求授权，请回到${productName}处理` }
  }
  return { title: productName, body: `AI 向你提出了一个问题，请回到${productName}回答` }
}

/** 播放系统提示音。失败不影响通知本身。 */
function playNotificationSound(): void {
  try {
    spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command',
      '[System.Media.SystemSounds]::Asterisk.Play()'], { windowsHide: true, stdio: 'ignore' })
  } catch {
    // 音效是增强项：任何失败都只损失声音。
  }
}

/**
 * 投递一条通知：按配置与焦点状态决定是否打扰。
 * @param window - 主窗口取值器；未创建或已销毁时仍发通知。
 * @param message - 已本地化的标题与正文。
 * @param scene - 场景，用于查配置开关。
 * @param configPath - 配置文件路径，默认 {@link ssidNotifyConfigPath}。
 * @returns 是否真的弹出了通知（供诊断与测试断言）。
 */
export function deliverSsidNotify(
  window: () => BrowserWindow | undefined,
  message: SsidNotifyMessage,
  scene: SsidNotifyScene,
  configPath: string = ssidNotifyConfigPath(),
): boolean {
  const config = readSsidNotifyConfig(configPath)
  if (!config.enabled || !config[scene]) return false
  const target = window()
  // 用户正看着窗口时不打扰——与思灵壳同一条判据。
  if (target !== undefined && !target.isDestroyed() && target.isFocused()) return false
  if (Notification.isSupported()) {
    new Notification({ title: message.title, body: message.body, silent: true }).show()
  }
  playNotificationSound()
  return true
}
