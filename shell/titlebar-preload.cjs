// SSiD 标题栏 preload：窗口控制按钮（自绘标题栏专用）。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ssidTitle', {
  minimize: () => ipcRenderer.invoke('ssid:title:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('ssid:title:toggle-maximize'),
  close: () => ipcRenderer.invoke('ssid:title:close'),
  onMaximized: (callback) => {
    ipcRenderer.on('ssid:title:maximized', (_event, maximized) => callback(maximized))
  },
})
