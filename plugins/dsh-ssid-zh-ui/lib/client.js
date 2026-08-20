/**
 * @max-null/dsh-ssid-zh-ui — browser half.
 *
 * 把 DSH Web GUI 输入框的英文展示中文化（SSiD 非开发用户向）。翻译在
 * **展示层**完成（v2 决策）：host 数据保持英文原文，本插件按当前界面语言
 * 替换渲染文本——locale 事件驱动，切换即时生效，不依赖 host 数据重推。
 *
 * 覆盖内容（文本全等匹配，官方中文子串与消息正文不受影响）：
 * - 权限模式名：`Read Only` / `Workspace Write` / `Full access` / `Custom`
 * - `/` 命令弹窗与 `/permission` 弹窗：命令描述（`role="option"` 行）
 *
 * 覆盖位置（css-modules 原始段 + role 语义，升级只要不改类名即有效）：
 * - 输入框权限触发器：`[class*="triggerLabel"]`
 * - 设置页权限选择器：`[class*="selector"]`
 * - 权限菜单项：`[role="menuitem"]`
 * - 命令/权限弹窗选项：`[role="option"]`
 *
 * 适配 DSH locale 机制：跟随 `ctx.locale`（`locale/change` 事件）。中文
 * 界面正向替换并记录原文；切英文反向恢复（只恢复本插件替换过的节点）。
 * MutationObserver 兜底 React 重渲染；替换后无残留目标文本，观察循环
 * 自然收敛。
 */

window.__ModuleLoader__.load({
  id: '@max-null/dsh-ssid-zh-ui',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    /** 英文原文 → 中文（文本全等匹配；与 DSH rc.8 产物原文一致）。 */
    var TEXT_ZH = {
      // 权限模式名（客户端 displayName 结果 / 产品名硬编码）
      'Read Only': '只读',
      'Workspace Write': '工作区写入',
      'Full access': '完全访问',
      'Custom': '自定义',
      // 官方命令描述（rc.8 注册原文）
      'Compact older conversation history': '压缩当前会话的历史记录，释放上下文空间',
      'set or view the goal for a long-running task': '为当前会话设置长期执行目标',
      'Enter or leave plan mode': '进入或退出计划模式',
      'Switch the permission preset (sandbox mode + approval policy)': '切换权限模式（沙箱范围 + 审批策略）',
      'Download this Session log as a ZIP archive': '导出当前会话日志为文件',
      'record feedback about this session': '对当前会话或消息提交反馈',
      // /model 命令描述（ui-model-selection 注册时快照 locale，切语言不刷新；
      // 双向表覆盖，见 ZH_TO_EN）
      'Select the model for this conversation': '选择本会话使用的模型',
    }
    /** 中文 → 英文原文（英文界面恢复官方文案；键集与 TEXT_ZH 互斥）。 */
    var ZH_TO_EN = {
      '选择本会话使用的模型': 'Select the model for this conversation',
    }
    /** Full access 的 aria-label 修正（「访问模式 Full access」→ 完全访问）。 */
    var ARIA_TEXT = 'Full access'

    /** 权限控件选择器：css-modules 原始段（哈希前缀无关）+ role 语义。 */
    var SCOPED_SELECTOR = [
      '[class*="triggerLabel"]',
      '[class*="selector"]',
      '[role="menuitem"]',
      '[role="option"]',
    ].join(',')

    /** 中文界面标记；无 locale 服务时按中文处理（SSiD 中文产品）。 */
    var zhMode = true
    /** 中文界面替换过的文本节点 → 英文原文（切英文时恢复）。 */
    var replacedTexts = new Map()
    /** 英文界面替换过的文本节点 → 中文原文（切中文时恢复）。 */
    var replacedEn = new Map()
    /** 本插件修正过 aria-label 的按钮（英文界面恢复时只动这些）。 */
    var replacedAria = new Set()

    /** 按翻译表正向替换元素内命中的文本节点（递归，不动子结构）。 */
    function replaceInElement(el, table, record) {
      var walk = function (node) {
        var children = node.childNodes
        for (var i = 0; i < children.length; i++) {
          var child = children[i]
          if (child.nodeType === 3) {
            var target = table[child.nodeValue]
            if (target !== undefined) {
              // 记录原文（重渲染重置后再次命中时覆盖旧记录）。
              record.set(child, child.nodeValue)
              child.nodeValue = target
            }
          } else if (child.nodeType === 1) {
            walk(child)
          }
        }
      }
      walk(el)
    }

    /** 恢复一张替换记录（清空记录集）。 */
    function restoreRecord(record) {
      for (var entry of record) {
        entry[0].nodeValue = entry[1]
      }
      record.clear()
    }

    /** 恢复 aria-label（英文界面）。 */
    function restoreAria() {
      for (var button of replacedAria) {
        var label = button.getAttribute('aria-label')
        if (typeof label === 'string' && label.indexOf('完全访问') !== -1) {
          button.setAttribute('aria-label', label.split('完全访问').join(ARIA_TEXT))
        }
      }
      replacedAria = new Set()
    }

    /** 中文界面：修正权限触发器的 aria-label（「访问模式 Full access」→ 完全访问）。 */
    function fixAriaLabels() {
      var buttons = document.querySelectorAll('button[aria-label*="' + ARIA_TEXT + '"]')
      for (var i = 0; i < buttons.length; i++) {
        var label = buttons[i].getAttribute('aria-label')
        buttons[i].setAttribute('aria-label', label.split(ARIA_TEXT).join('完全访问'))
        replacedAria.add(buttons[i])
      }
    }

    /** 一轮替换：按当前语言恢复另一侧的记录，再执行本侧正向替换。 */
    function sweep() {
      var scoped = document.querySelectorAll(SCOPED_SELECTOR)
      if (zhMode) {
        restoreRecord(replacedEn)
        for (var i = 0; i < scoped.length; i++) replaceInElement(scoped[i], TEXT_ZH, replacedTexts)
        fixAriaLabels()
      } else {
        restoreRecord(replacedTexts)
        restoreAria()
        for (var i = 0; i < scoped.length; i++) replaceInElement(scoped[i], ZH_TO_EN, replacedEn)
      }
    }

    exports.inject = []

    exports.apply = function (ctx) {
      // 防重守卫：DSH 插件热重载/重复加载时避免重复挂观察器。
      if (window.__dshSsidZhUiInstalled === true) return
      window.__dshSsidZhUiInstalled = true

      // 跟随 DSH locale 服务：初始语言 + 切换事件。
      var locale = ctx !== null && typeof ctx.get === 'function' ? ctx.get('locale') : undefined
      if (locale !== undefined && typeof locale.getLocale === 'function') {
        zhMode = locale.getLocale().active === 'zh'
        if (typeof ctx.on === 'function') {
          ctx.on('locale/change', function (snapshot) {
            zhMode = snapshot.active === 'zh'
            sweep()
          })
        }
      }

      sweep()

      var observer = new MutationObserver(function () {
        sweep()
      })
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      })
    }

    return module.exports
  },
})
