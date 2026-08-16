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
