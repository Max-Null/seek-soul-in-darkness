// SSiD 自绘标题栏：窗口控制按钮 + 最大化状态切换 + 统一按钮组（插件中心/侧栏/底栏）。
document.getElementById('btn-min').addEventListener('click', () => { void window.ssidTitle.minimize() })
document.getElementById('btn-max').addEventListener('click', () => { void window.ssidTitle.toggleMaximize() })
document.getElementById('btn-close').addEventListener('click', () => { void window.ssidTitle.close() })

// ── SSiD 标题栏统一按钮组 ──────────────────────────────────────────────
// 插件中心 / 侧栏 / 底栏：经 IPC 通知主进程，主进程在 DSH UI（mainView）
// 内派发 `ssid:titlebar` CustomEvent，由内置插件 dsh-header-unify 执行
// （hero 页无 session header，标题栏按钮是唯一常驻入口）。
document.getElementById('btn-plugins').addEventListener('click', () => { void window.ssidTitle.action('plugin-center') })
document.getElementById('btn-sidebar').addEventListener('click', () => { void window.ssidTitle.action('sidebar') })
document.getElementById('btn-bottom').addEventListener('click', () => { void window.ssidTitle.action('bottom') })

const iconMax = document.getElementById('icon-max')
const iconRestore = document.getElementById('icon-restore')
window.ssidTitle.onMaximized((maximized) => {
  iconMax.style.display = maximized ? 'none' : ''
  iconRestore.style.display = maximized ? '' : 'none'
})

// DSH 版本副标题（主进程 boot 后注入；官方 host.describe 是占位符 0.0.1）。
window.__setDshVersion = (version) => {
  const el = document.getElementById('dsh-ver')
  if (el !== null && typeof version === 'string' && version !== '' && version !== 'unknown') {
    el.textContent = `DSH ${version}`
    el.hidden = false
  }
}
