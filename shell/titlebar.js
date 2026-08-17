// SSiD 自绘标题栏：窗口控制按钮 + 最大化状态切换。
document.getElementById('btn-min').addEventListener('click', () => { void window.ssidTitle.minimize() })
document.getElementById('btn-max').addEventListener('click', () => { void window.ssidTitle.toggleMaximize() })
document.getElementById('btn-close').addEventListener('click', () => { void window.ssidTitle.close() })

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
