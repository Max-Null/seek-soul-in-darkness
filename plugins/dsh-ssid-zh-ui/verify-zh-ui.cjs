// @max-null/dsh-ssid-zh-ui 运行时验证（node 模拟，仿 verify-header-unify.cjs）
// 断言：翻译表覆盖 / 中文替换 / 切英文恢复 / 重渲染收敛 / 防误伤 / apply 防重。
const assert = require('node:assert')

async function main() {
  const fs = require('node:fs')
  const path = require('node:path')

  // ── 0. host half 结构断言（v2：no-op 占位） ──────────────────────────
  const hostSource = fs.readFileSync(path.join(__dirname, 'lib', 'index.mjs'), 'utf8')
  const checks = []
  const check = (name, ok, extra) => { checks.push({ name, ok: !!ok, extra }) }
  check('host 导出 name', /export const name = '@max-null\/dsh-ssid-zh-ui'/.test(hostSource))
  check('host 导出 apply（no-op）', /export function apply\(\) \{\}/.test(hostSource))
  check('host 不再承载翻译表', !hostSource.includes('COMMAND_ZH'))

  // ── 1. client.js：翻译表与替换逻辑（模拟浏览器环境） ────────────────────
  const clientSource = fs.readFileSync(path.join(__dirname, 'lib', 'client.js'), 'utf8')

  // 从 client.js 源码提取翻译表做覆盖断言（键即英文原文）
  const tableMatch = clientSource.match(/var TEXT_ZH = \{([\s\S]*?)\n    \}/)
  check('client 声明 TEXT_ZH 翻译表', tableMatch !== null)
  const zhKeys = tableMatch !== null
    ? [...tableMatch[1].matchAll(/'([^']+)':/g)].map(m => m[1])
    : []
  for (const key of ['Read Only', 'Workspace Write', 'Full access', 'Custom',
    'Compact older conversation history', 'set or view the goal for a long-running task',
    'Enter or leave plan mode', 'Switch the permission preset (sandbox mode + approval policy)',
    'Download this Session log as a ZIP archive', 'record feedback about this session',
    'Select the model for this conversation']) {
    check(`翻译表覆盖「${key}」`, zhKeys.includes(key), String(zhKeys.length))
  }
  check('翻译表 11 条键', zhKeys.length === 11, String(zhKeys.length))
  check('client 声明 ZH_TO_EN（/model 描述反向表）', /var ZH_TO_EN = \{[\s\S]*?'选择本会话使用的模型': 'Select the model for this conversation'/.test(clientSource))

  const mkText = (value) => ({ nodeType: 3, nodeValue: value })
  const mkEl = (opts) => ({
    nodeType: 1,
    tag: opts.tag || 'span',
    class: opts.class || '',
    role: opts.role || '',
    ariaLabel: opts.ariaLabel || '',
    childNodes: opts.children || [],
    setAttribute(name, value) { if (name === 'aria-label') this.ariaLabel = value },
    getAttribute(name) { return name === 'aria-label' ? this.ariaLabel : null },
  })
  const matches = (el, sel) => {
    if (sel.includes('triggerLabel')) return (el.class || '').includes('triggerLabel')
    if (sel.includes('selector')) return (el.class || '').includes('selector')
    if (sel.includes('menuitem')) return el.role === 'menuitem'
    if (sel.includes('option')) return el.role === 'option'
    if (sel.includes('aria-label')) return el.tag === 'button' && (el.ariaLabel || '').includes('Full access')
    return false
  }
  const mockQueryAll = (root, sel) => {
    const out = []
    const selectors = sel.split(',').map(s => s.trim())
    const walk = (node) => {
      if (node !== root && selectors.some(s => matches(node, s))) out.push(node)
      for (const child of node.childNodes || []) walk(child)
    }
    walk(root)
    return out
  }

  // 预置 DOM：权限触发器 / 权限菜单项 / 命令弹窗选项 / 官方中文子串 / 消息正文（英文防误伤）
  // /model 行两种初始态：官方注册时 zh 快照（切英文要转英）、注册时 en 快照（切中文要转中）
  const triggerButton = mkEl({
    tag: 'button',
    ariaLabel: '访问模式 Full access',
    children: [mkEl({ class: 'nArs4W_triggerLabel', children: [mkText('Workspace Write')] })],
  })
  const menuItem = mkEl({ role: 'menuitem', children: [mkEl({ children: [mkText('Read Only')] })] })
  const optionRow = mkEl({ role: 'option', children: [mkEl({ class: 'x_itemDescription', children: [mkText('Enter or leave plan mode')] })] })
  const modelRowZh = mkEl({ role: 'option', children: [mkEl({ class: 'x_itemDescription', children: [mkText('选择本会话使用的模型')] })] })
  const modelRowEn = mkEl({ role: 'option', children: [mkEl({ class: 'x_itemDescription', children: [mkText('Select the model for this conversation')] })] })
  const customRow = mkEl({ role: 'option', children: [mkEl({ children: [mkText('Custom')] })] })
  const officialCopy = mkEl({ class: 'y_confirmBtn', children: [mkText('启用 Full access')] })
  const messageBody = mkEl({ class: 'z_message', children: [mkText('Read Only')] })
  const body = mkEl({ tag: 'body', children: [triggerButton, menuItem, optionRow, modelRowZh, modelRowEn, customRow, officialCopy, messageBody] })

  let observerCallback = null
  let observeCalls = 0
  global.MutationObserver = class {
    constructor(cb) { observerCallback = cb }
    observe() { observeCalls += 1 }
    disconnect() {}
  }
  let activeLocale = 'zh'
  let localeChangeHandler = null
  let currentCtx = null
  const fakeCtx = {
    get(name) {
      if (name === 'locale') return { getLocale: () => ({ active: activeLocale }) }
      return undefined
    },
    on(name, cb) {
      if (name === 'locale/change') localeChangeHandler = cb
    },
  }
  currentCtx = fakeCtx
  global.window = {
    __ModuleLoader__: {
      load(handoff) {
        const exportsObj = handoff.factory(() => { throw new Error('unexpected require') })
        exportsObj.apply(currentCtx)
        global.__zhUiHandoff = { id: handoff.id, exports: exportsObj }
      },
    },
  }
  global.document = {
    body,
    querySelectorAll(sel) { return mockQueryAll(body, sel) },
  }

  // eslint-disable-next-line no-eval
  eval(clientSource)

  const textOf = (el) => {
    let out = ''
    const walk = (node) => {
      if (node.nodeType === 3) out += node.nodeValue
      for (const child of node.childNodes || []) walk(child)
    }
    walk(el)
    return out
  }
  check('client handoff.id 正确', global.__zhUiHandoff?.id === '@max-null/dsh-ssid-zh-ui')
  check('client inject 为空数组', Array.isArray(global.__zhUiHandoff?.exports.inject) && global.__zhUiHandoff.exports.inject.length === 0)
  check('observer 已挂载（1 次）', observeCalls === 1, String(observeCalls))
  check('初始中文：权限名替换', textOf(triggerButton.childNodes[0]) === '工作区写入', textOf(triggerButton.childNodes[0]))
  check('初始中文：菜单项替换', textOf(menuItem) === '只读', textOf(menuItem))
  check('初始中文：命令描述替换', textOf(optionRow) === '进入或退出计划模式', textOf(optionRow))
  check('初始中文：/model zh 快照保持中文', textOf(modelRowZh) === '选择本会话使用的模型', textOf(modelRowZh))
  check('初始中文：/model en 快照转中文', textOf(modelRowEn) === '选择本会话使用的模型', textOf(modelRowEn))
  check('初始中文：Custom 替换', textOf(customRow) === '自定义', textOf(customRow))
  check('触发器 aria-label 修正', triggerButton.ariaLabel === '访问模式 完全访问', triggerButton.ariaLabel)
  check('官方中文子串不动', textOf(officialCopy) === '启用 Full access', textOf(officialCopy))
  check('消息正文英文不动（防误伤）', textOf(messageBody) === 'Read Only', textOf(messageBody))

  // React 重渲染模拟：重置文本 → observer 回调再替换
  triggerButton.childNodes[0].childNodes[0].nodeValue = 'Workspace Write'
  observerCallback()
  check('重渲染后再次替换收敛', textOf(triggerButton.childNodes[0]) === '工作区写入', textOf(triggerButton.childNodes[0]))

  // 切英文：反向恢复本插件替换过的所有文本 + aria；重渲染后英文保持
  activeLocale = 'en'
  localeChangeHandler({ active: 'en' })
  check('切英文：权限名恢复', textOf(triggerButton.childNodes[0]) === 'Workspace Write', textOf(triggerButton.childNodes[0]))
  check('切英文：菜单项恢复', textOf(menuItem) === 'Read Only', textOf(menuItem))
  check('切英文：命令描述恢复', textOf(optionRow) === 'Enter or leave plan mode', textOf(optionRow))
  check('切英文：/model zh 快照转英文', textOf(modelRowZh) === 'Select the model for this conversation', textOf(modelRowZh))
  check('切英文：/model en 快照保持英文', textOf(modelRowEn) === 'Select the model for this conversation', textOf(modelRowEn))
  check('切英文：Custom 恢复', textOf(customRow) === 'Custom', textOf(customRow))
  check('切英文：aria-label 恢复', triggerButton.ariaLabel === '访问模式 Full access', triggerButton.ariaLabel)
  triggerButton.childNodes[0].childNodes[0].nodeValue = 'Workspace Write'
  observerCallback()
  check('英文模式重渲染保持英文', textOf(triggerButton.childNodes[0]) === 'Workspace Write', textOf(triggerButton.childNodes[0]))

  // 切回中文：再次替换
  activeLocale = 'zh'
  localeChangeHandler({ active: 'zh' })
  check('切回中文：权限名再次替换', textOf(triggerButton.childNodes[0]) === '工作区写入', textOf(triggerButton.childNodes[0]))
  check('切回中文：命令描述再次替换', textOf(optionRow) === '进入或退出计划模式', textOf(optionRow))
  check('切回中文：/model 恢复中文', textOf(modelRowZh) === '选择本会话使用的模型' && textOf(modelRowEn) === '选择本会话使用的模型', `${textOf(modelRowZh)} / ${textOf(modelRowEn)}`)

  // 防重守卫：二次 apply 不重复挂观察器
  global.__zhUiHandoff.exports.apply(fakeCtx)
  check('apply 防重（observer 仍 1 次）', observeCalls === 1, String(observeCalls))

  // ── 2. 无 locale 服务时默认中文 ────────────────────────────────────────
  const freshSource = fs.readFileSync(path.join(__dirname, 'lib', 'client.js'), 'utf8')
  const body2 = mkEl({ tag: 'body', children: [mkEl({ role: 'menuitem', children: [mkText('Read Only')] })] })
  global.document = { body: body2, querySelectorAll(sel) { return mockQueryAll(body2, sel) } }
  window.__dshSsidZhUiInstalled = false // 重置防重守卫，让新实例 apply
  currentCtx = { get() { return undefined }, on() {} } // 无 locale 服务
  // eslint-disable-next-line no-eval
  eval(freshSource)
  check('无 locale 服务：默认中文替换', textOf(body2.childNodes[0]) === '只读', textOf(body2.childNodes[0]))

  let failed = 0
  for (const c of checks) {
    console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.ok ? '' : ` — ${String(c.extra ?? '')}`}`)
    if (!c.ok) failed += 1
  }
  if (failed > 0) {
    console.error(`\n${failed} 项失败`)
    process.exitCode = 1
  } else {
    console.log(`\n${checks.length} 项全部通过`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
