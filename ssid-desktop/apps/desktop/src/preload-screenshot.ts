/**
 * SSiD 截图浮层 preload：框选结果回主进程。
 *
 * 与思灵壳 `shell/screenshot-preload.cjs` 同语义（通道名与载荷格式都保持不变，
 * 因为浮层页面 `screenshot.html` 是同一份）。
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('ssidCapture', {
  /** 确认框选：payload 为 `{ source, annotated? }` 两张 PNG data URL（协议 v2）。 */
  confirm: (payload: unknown) => { ipcRenderer.send('ssid:shot:confirm', payload) },
  /** 取消本次截图。 */
  cancel: () => { ipcRenderer.send('ssid:shot:cancel') },
  /** 浮层侧错误上报（裁剪/解码失败等，主进程记日志）。 */
  error: (message: string) => { ipcRenderer.send('ssid:shot:error', message) },
})
