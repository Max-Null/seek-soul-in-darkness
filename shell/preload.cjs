// SSiD 壳 preload：把 host 的 memory IPC 和侧栏开关暴露给侧栏 BrowserView。
// CommonJS —— Electron 的 sandboxed preload 直接加载，不走构建。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ssid', {
  listMemories: () => ipcRenderer.invoke('ssid:memory:list'),
  searchMemories: (query) => ipcRenderer.invoke('ssid:memory:search', query),
  confirmMemory: (id) => ipcRenderer.invoke('ssid:memory:confirm', id),
  forgetMemory: (id) => ipcRenderer.invoke('ssid:memory:forget', id),
  guardianSnapshot: () => ipcRenderer.invoke('ssid:guardian:snapshot'),
  toggleRail: () => ipcRenderer.invoke('ssid:rail:toggle'),
  onRailState: (callback) => {
    ipcRenderer.on('ssid:rail-state', (_event, collapsed) => callback(collapsed))
  },
})
