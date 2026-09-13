// SSiD 自绘标题栏：窗口控制按钮 + 最大化状态切换 + 统一按钮组（插件中心/侧栏/底栏）。
document.getElementById('btn-min').addEventListener('click', () => { void window.ssidTitle.minimize() })
document.getElementById('btn-max').addEventListener('click', () => { void window.ssidTitle.toggleMaximize() })
document.getElementById('btn-close').addEventListener('click', () => { void window.ssidTitle.close() })

// ── SSiD 标题栏统一按钮组 ──────────────────────────────────────────────
// 会话管理 / 插件中心 / 侧栏 / 底栏：经 IPC 通知主进程，主进程在
// DSH UI（mainView）内派发 `ssid:titlebar` CustomEvent，由内置插件
// dsh-quick-toolbar 执行（hero 页无 session header，标题栏按钮是唯一常驻入口）。
document.getElementById('btn-session-manager').addEventListener('click', () => { void window.ssidTitle.action('session-manager') })
document.getElementById('btn-plugins').addEventListener('click', () => { void window.ssidTitle.action('plugin-center') })
document.getElementById('btn-sidebar').addEventListener('click', () => { void window.ssidTitle.action('sidebar') })
document.getElementById('btn-bottom').addEventListener('click', () => { void window.ssidTitle.action('bottom') })

// ── 悬浮球开关（圆圈+圆点：开启有点 / 关闭空圈；乐观切换 + 主进程初始同步）──
const floatBtn = document.getElementById('btn-qt-float')
const setFloatState = (on) => {
  floatBtn.classList.toggle('float-on', on === true)
  floatBtn.title = on === true ? '悬浮球（开）' : '悬浮球（关）'
}
floatBtn.addEventListener('click', () => {
  const on = !floatBtn.classList.contains('float-on')
  setFloatState(on) // 图标即时反馈（DSH 侧 toggle 由 quick-toolbar 执行）
  void window.ssidTitle.action('quick-toolbar-toggle')
})
// 初始状态同步（主进程从 DSH 页面 localStorage 读取后下发——跨重启保持一致）
window.ssidTitle.onFloatState((on) => setFloatState(on))

const iconMax = document.getElementById('icon-max')
const iconRestore = document.getElementById('icon-restore')
window.ssidTitle.onMaximized((maximized) => {
  iconMax.style.display = maximized ? 'none' : ''
  iconRestore.style.display = maximized ? '' : 'none'
})

// 运行形态徽章（主进程按 app.isPackaged 注入）：dev 与安装版外观完全一致，
// 没有它就无法区分手上这个是源码裸跑还是装出来的（2026-09-14 用户提出）。
// 只在 dev 显示 —— 正式版不需要给自己加噪。
window.__setShellMode = (mode) => {
  const el = document.getElementById('shell-mode')
  if (el !== null && mode === 'dev') {
    el.textContent = 'DEV'
    // 内联样式：避免为一个徽章再动 titlebar.html 的样式表
    el.style.cssText = 'margin-left:5px;padding:0 4px;border:1px solid currentColor;'
      + 'border-radius:3px;font-size:9px;line-height:13px;opacity:.65;letter-spacing:.5px'
    el.hidden = false
  }
}

// DSH 版本副标题（主进程 boot 后注入；官方 host.describe 是占位符 0.0.1）。
window.__setDshVersion = (version) => {
  const el = document.getElementById('dsh-ver')
  if (el !== null && typeof version === 'string' && version !== '' && version !== 'unknown') {
    el.textContent = `DSH ${version}`
    el.hidden = false
  }
}
