// SSiD 截图浮层 preload：框选结果回主进程（标题栏 preload 同款桥）。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ssidCapture', {
  /** 确认框选：detail 为裁剪结果 PNG data URL。 */
  confirm: (dataUrl) => ipcRenderer.send('ssid:shot:confirm', dataUrl),
  /** 取消本次截图。 */
  cancel: () => ipcRenderer.send('ssid:shot:cancel'),
  /** 浮层侧错误上报（裁剪/解码失败等，主进程记日志）。 */
  error: (message) => ipcRenderer.send('ssid:shot:error', message),
})
