/**
 * @max-null/dsh-header-unify — browser half.
 *
 * SSiD 标题栏统一按钮组的 DSH 侧执行器（v0.2.0）：
 *
 * 1. 隐藏 DSH 内的原按钮（插件中心 header 按钮 + better-sidebar 的
 *    toggleCluster），消除双入口与错位——统一由自绘标题栏按钮组接管。
 * 2. 监听 main 进程经 `mainView.webContents.executeJavaScript` 派发的
 *    `ssid:titlebar` CustomEvent：
 *      detail = 'plugin-center' → window.__pluginCenterToggle?.()
 *                                （plugin-center v0.1.7+ 全局控制器：再点关闭；
 *                                  老版回退 __pluginCenterOpen）
 *      detail = 'sidebar'       → 先 __pluginCenterClose?.()（互斥：模态让位
 *                                工具面板），再 click toggleCluster 最后一个按钮
 *      detail = 'bottom'        → 同上，click 第一个按钮（窄屏无底栏则跳过）
 *
 * 选择器只用 CSS Modules 的原始段（编译后如 nArs4W_toggleCluster），
 * 与哈希前缀无关：better-sidebar / plugin-center 升级只要不改类名即有效。
 * 隐藏元素仍可被 JS 的 .click() 触发（无需可见），与壳已有的
 * 「侧边栏自动诊断」同模式。
 */

window.__ModuleLoader__.load({
  id: '@max-null/dsh-header-unify',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var HIDE_CSS = [
      '/* SSiD 标题栏统一按钮组：隐藏 DSH 内原按钮，避免双入口与错位 */',
      '[class*="pc-headerbtn"] { display: none !important; }',
      '[class*="toggleCluster"] { display: none !important; }',
    ].join('\n')

    /** 程序化点击 toggleCluster 内的按钮（display:none 不影响 click）。 */
    function clickClusterButton(fromEnd) {
      var cluster = document.querySelector('[class*="toggleCluster"]')
      if (cluster === null) return
      var buttons = cluster.querySelectorAll('button')
      var button = fromEnd ? buttons[buttons.length - 1] : buttons[0]
      if (button !== undefined && button !== null && !button.disabled) button.click()
    }

    exports.inject = []

    exports.apply = function (ctx) {
      var style = document.createElement('style')
      style.setAttribute('data-dsh-header-unify', '')
      style.textContent = HIDE_CSS
      document.head.appendChild(style)

      window.addEventListener('ssid:titlebar', function (event) {
        var detail = event !== null && typeof event === 'object' ? event.detail : undefined
        if (detail === 'plugin-center') {
          // 优先 toggle（再点关闭）；老版 plugin-center（无 toggle）回退 open
          var toggle = window.__pluginCenterToggle
          if (typeof toggle === 'function') {
            toggle()
          } else {
            var open = window.__pluginCenterOpen
            if (typeof open === 'function') open()
          }
          return
        }
        if (detail === 'sidebar' || detail === 'bottom') {
          // 互斥：侧栏/底栏打开时，插件中心模态让位（若开着先关闭）。
          var close = window.__pluginCenterClose
          if (typeof close === 'function') close()
          clickClusterButton(detail === 'sidebar')
        }
      })
    }

    return module.exports
  },
})
