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

    /**
     * 从 toggleCluster 按钮的 aria-label 反推面板状态——不依赖 CSS 类名
     * 通配（DSH 官方 UI 也有 css.panel 类，[class*="panel"] 会误匹配，
     * 2026-08-19 用户实测「打开插件中心同时打开右栏」）。
     * better-sidebar 按钮语义（src/client/locales.ts 实证）：
     *   侧栏按钮 aria-label：开着='折叠侧边栏'(collapse) / 关着='展开侧边栏'(expand)
     *   底栏按钮 aria-label：开着='折叠底部面板'(collapseBottomPanel) / 关着='展开底部面板'(expandBottomPanel)
     * 面板开着 = 对应按钮 label 是「折叠」语义（collapse/折叠）。
     */
    function clusterSideButtons() {
      var cluster = document.querySelector('[class*="toggleCluster"]')
      if (cluster === null) return { sidebar: null, bottom: null }
      var buttons = cluster.querySelectorAll('button')
      var sidebar = null, bottom = null
      for (var i = 0; i < buttons.length; i++) {
        // 底栏按钮：label 含 bottom（en）或 底部（zh）
        var label = (buttons[i].getAttribute('aria-label') || '').toLowerCase()
        if (label.indexOf('bottom') !== -1 || label.indexOf('底部') !== -1) bottom = buttons[i]
        else sidebar = buttons[i]
      }
      return { sidebar: sidebar, bottom: bottom }
    }
    function isPanelOpen(button) {
      if (button === null || button === undefined) return false
      var label = (button.getAttribute('aria-label') || '').toLowerCase()
      return label.indexOf('collapse') !== -1 || label.indexOf('折叠') !== -1
    }
    function clickButton(button) {
      if (button !== null && button !== undefined && !button.disabled) button.click()
    }

    /**
     * 反向互斥（2026-08-19 用户补充）：打开插件中心前，若侧栏/底栏
     * 开着则先收起（点其 toggleCluster 按钮），避免弹窗被面板遮挡。
     * 两个独立判断：右栏+底栏同时开着时都要收起（不能用 if/else if，
     * 否则短路漏掉一个——用户实测「双开时底栏保持打开」）。
     */
    function closeSidePanelsBeforePluginCenter() {
      var btns = clusterSideButtons()
      if (isPanelOpen(btns.sidebar)) clickButton(btns.sidebar)
      if (isPanelOpen(btns.bottom)) clickButton(btns.bottom)
    }

    exports.inject = []

    exports.apply = function (ctx) {
      // 防重守卫：DSH 插件热重载/重复加载时避免重复注册 ssid:titlebar
      // 监听器与重复注入 CSS——否则一次标题栏点击会触发多次处理
      // （toggle 被抵消、互斥按钮被点多次），2026-08-19 用户提示
      // 「事件传递导致的问题」的排查项之一。
      if (window.__dshHeaderUnifyInstalled === true) return
      window.__dshHeaderUnifyInstalled = true

      var style = document.createElement('style')
      style.setAttribute('data-dsh-header-unify', '')
      style.textContent = HIDE_CSS
      document.head.appendChild(style)

      window.addEventListener('ssid:titlebar', function (event) {
        var detail = event !== null && typeof event === 'object' ? event.detail : undefined
        if (detail === 'plugin-center') {
          // 反向互斥：侧栏/底栏开着先收起，再打开插件中心
          closeSidePanelsBeforePluginCenter()
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
        if (detail === 'open-sea-skin') {
          // 标题栏「海洋皮肤」按钮 → 点击 open-sea-skin 自建设置按钮
          // （id=__open-sea-skin-btn__，fixed 定位，无需可见即可触发）。
          var ossBtn = document.getElementById('__open-sea-skin-btn__')
          if (ossBtn !== null && ossBtn !== undefined && !ossBtn.disabled) ossBtn.click()
          return
        }
        if (detail === 'sidebar' || detail === 'bottom') {
          // 互斥：侧栏/底栏打开时，插件中心模态让位（若开着先关闭）。
          var close = window.__pluginCenterClose
          if (typeof close === 'function') close()
          // 按钮按 aria-label 语义定位（不依赖按钮顺序）
          var btns = clusterSideButtons()
          clickButton(detail === 'sidebar' ? btns.sidebar : btns.bottom)
        }
      })
    }

    return module.exports
  },
})
