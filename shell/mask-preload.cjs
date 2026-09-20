// SSiD 执行中遮罩的 preload：只把「长按达标」这一个动作送回主进程。
// 遮罩窗口是 sandbox + contextIsolation，渲染层拿不到 ipcRenderer，
// 与标题栏 / 截图浮层走同一套 contextBridge 桥。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ssidMask', {
  /** 长按满 2 秒后请求解除遮罩（主进程据此关闭窗口并释放保活）。 */
  release: () => ipcRenderer.send('ssid:mask:release'),
})
