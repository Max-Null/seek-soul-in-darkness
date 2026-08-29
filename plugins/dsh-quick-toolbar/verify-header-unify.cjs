// dsh-quick-toolbar client.js 运行时验证（node 模拟浏览器环境）
// 用法: node verify-header-unify.cjs
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const clientPath = path.join(__dirname, 'lib', 'client.js')
const source = fs.readFileSync(clientPath, 'utf8')

let failures = 0
const check = (name, cond, extra) => {
  if (cond) console.log(`  ok   ${name}`)
  else { failures++; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`) }
}

// ── 模拟浏览器环境 ─────────────────────────────────────────────
// better-sidebar 按钮：aria-label 语义（locales.ts 实证）
//   侧栏：开着='折叠侧边栏'(collapse) / 关着='展开侧边栏'(expand)
//   底栏：开着='折叠底部面板'(collapseBottomPanel) / 关着='展开底部面板'(expandBottomPanel)
const mkBtn = (label) => ({
  disabled: false,
  clicked: 0,
  _label: label,
  click() { this.clicked++ },
  getAttribute(name) { return name === 'aria-label' ? this._label : null },
})
const fakeCluster = {
  buttons: [mkBtn('展开底部面板'), mkBtn('展开侧边栏')], // [0]=底栏 [1]=侧栏
  querySelectorAll(sel) { return sel === 'button' ? this.buttons : [] },
}
const setLabels = (sidebar, bottom) => { fakeCluster.buttons[1]._label = sidebar; fakeCluster.buttons[0]._label = bottom }
const clickedOf = () => JSON.stringify(fakeCluster.buttons.map((b) => b.clicked))
const resetClicked = () => fakeCluster.buttons.forEach((b) => { b.clicked = 0 })

let injectedStyle = null
let titlebarHandler = null
let titlebarListenerCount = 0
let pcOpen = 0, pcToggle = 0, pcClose = 0

global.window = {
  __pluginCenterOpen: () => { pcOpen++ },
  __pluginCenterToggle: () => { pcToggle++ },
  __pluginCenterClose: () => { pcClose++ },
  __ModuleLoader__: {
    load(handoff) {
      const exportsObj = handoff.factory(() => { throw new Error('unexpected require') })
      const ctx = {
        inject(names, cb) { /* 懒注入：只记录不执行 */ },
      }
      exportsObj.apply(ctx)
      global.__handoff = { id: handoff.id, exports: exportsObj }
    },
  },
  addEventListener(name, fn) {
    if (name === 'ssid:titlebar') { titlebarHandler = fn; titlebarListenerCount++ }
  },
}
global.document = {
  createElement(tag) {
    if (tag === 'style') return { setAttribute() {}, set textContent(v) { injectedStyle = v } }
    return {}
  },
  head: { appendChild() {} },
  querySelector(sel) {
    if (sel.includes('toggleCluster')) return fakeCluster
    return null
  },
  querySelectorAll() { return [] },
}

// 执行 client.js（触发 __ModuleLoader__.load）
// eslint-disable-next-line no-eval
eval(source)

// ── 基础断言 ────────────────────────────────────────────────────
check('handoff.id 为 @max-null/dsh-quick-toolbar', global.__handoff.id === '@max-null/dsh-quick-toolbar', global.__handoff?.id)
check('exports.inject 为空数组', Array.isArray(global.__handoff.exports.inject) && global.__handoff.exports.inject.length === 0)
check('已注册 ssid:titlebar 监听', typeof titlebarHandler === 'function')

// 防重守卫：重复 apply（DSH 插件热重载）不重复注册监听器
global.__handoff.exports.apply({ inject() {} })
check('重复 apply 不重复注册 ssid:titlebar 监听器', titlebarListenerCount === 1, `count=${titlebarListenerCount}`)

// 隐藏 CSS 断言
check('隐藏 CSS 含 pc-headerbtn', injectedStyle !== null && injectedStyle.includes('pc-headerbtn'), injectedStyle)
check('隐藏 CSS 含 toggleCluster', injectedStyle !== null && injectedStyle.includes('toggleCluster'), injectedStyle)

// ── plugin-center：toggle 优先 ──────────────────────────────────
setLabels('展开侧边栏', '展开底部面板') // 面板都关着
titlebarHandler({ detail: 'plugin-center' })
check('plugin-center 事件调 toggle（不再直接 open）', pcToggle === 1, `toggle=${pcToggle} open=${pcOpen}`)
check('plugin-center 事件未调 open', pcOpen === 0)

// 回退：老版 plugin-center 无 toggle 时走 open
delete window.__pluginCenterToggle
titlebarHandler({ detail: 'plugin-center' })
check('无 toggle 时回退 open', pcOpen === 1, `open=${pcOpen}`)
window.__pluginCenterToggle = () => { pcToggle++ }
titlebarHandler({ detail: 'plugin-center' })
check('恢复 toggle 后继续用 toggle', pcToggle === 2)

// ── plugin-center：反向互斥（2026-08-19 用户补充）────────────────
// 侧栏开着（label=折叠侧边栏）→ 先点侧栏按钮收起，再 toggle
resetClicked()
setLabels('折叠侧边栏', '展开底部面板')
const pcToggleBefore = pcToggle
titlebarHandler({ detail: 'plugin-center' })
check('侧栏开着时 plugin-center 事件先收起侧栏（点侧栏按钮）', fakeCluster.buttons[1].clicked === 1, clickedOf())
check('侧栏开着时未点底栏按钮', fakeCluster.buttons[0].clicked === 0)
check('侧栏开着时仍 toggle 插件中心', pcToggle === pcToggleBefore + 1, `toggle=${pcToggle}`)

// 底栏开着（label=折叠底部面板）、侧栏关着 → 先点底栏按钮收起
resetClicked()
setLabels('展开侧边栏', '折叠底部面板')
const pcToggleBefore2 = pcToggle
titlebarHandler({ detail: 'plugin-center' })
check('底栏开着时 plugin-center 事件先收起底栏（点底栏按钮）', fakeCluster.buttons[0].clicked === 1, clickedOf())
check('底栏开着时未点侧栏按钮', fakeCluster.buttons[1].clicked === 0)
check('底栏开着时仍 toggle 插件中心', pcToggle === pcToggleBefore2 + 1)

// 右栏+底栏同时开着 → 两个都收起（不能用 if/else if 短路漏掉一个）
resetClicked()
setLabels('折叠侧边栏', '折叠底部面板')
const pcToggleBefore5 = pcToggle
titlebarHandler({ detail: 'plugin-center' })
check('双开时 plugin-center 事件同时收起侧栏和底栏', fakeCluster.buttons[0].clicked === 1 && fakeCluster.buttons[1].clicked === 1, clickedOf())
check('双开时仍 toggle 插件中心', pcToggle === pcToggleBefore5 + 1)

// 都关着 → 不点任何按钮，仅 toggle
resetClicked()
setLabels('展开侧边栏', '展开底部面板')
const pcToggleBefore3 = pcToggle
titlebarHandler({ detail: 'plugin-center' })
check('面板都关着时不点按钮', fakeCluster.buttons.every((b) => b.clicked === 0))
check('面板都关着时仍 toggle 插件中心', pcToggle === pcToggleBefore3 + 1)

// 英文文案变体（collapse/expand 语义）同样识别
resetClicked()
setLabels('collapse', 'expand bottom panel')
const pcToggleBefore4 = pcToggle
titlebarHandler({ detail: 'plugin-center' })
check('英文 collapse 语义识别侧栏开着并收起', fakeCluster.buttons[1].clicked === 1, clickedOf())
check('英文场景仍 toggle 插件中心', pcToggle === pcToggleBefore4 + 1)

// ── sidebar/bottom：先关插件中心（互斥）再点对应按钮 ────────────
resetClicked()
setLabels('展开侧边栏', '展开底部面板')
const closeBefore = pcClose
titlebarHandler({ detail: 'sidebar' })
check('sidebar 事件先调 __pluginCenterClose（互斥）', pcClose === closeBefore + 1, `close=${pcClose}`)
check('sidebar 事件点侧栏按钮（label 无 bottom）', fakeCluster.buttons[1].clicked === 1, clickedOf())
check('sidebar 事件未点底栏按钮', fakeCluster.buttons[0].clicked === 0)

resetClicked()
const closeBefore2 = pcClose
titlebarHandler({ detail: 'bottom' })
check('bottom 事件先调 __pluginCenterClose', pcClose === closeBefore2 + 1)
check('bottom 事件点底栏按钮（label 含 bottom）', fakeCluster.buttons[0].clicked === 1, clickedOf())
check('bottom 事件未点侧栏按钮', fakeCluster.buttons[1].clicked === 0)

// ── 未知 detail 不抛错、无副作用 ────────────────────────────────
resetClicked()
const pcSnapshot = { o: pcOpen, t: pcToggle, c: pcClose }
titlebarHandler({ detail: 'unknown' })
check('未知 detail 静默', JSON.stringify(pcSnapshot) === JSON.stringify({ o: pcOpen, t: pcToggle, c: pcClose }) && fakeCluster.buttons.every((b) => b.clicked === 0))

// ── disabled 按钮不点击（hero 页 noSession 场景；close 仍执行）──
fakeCluster.buttons[0].disabled = true
resetClicked()
const closeBefore3 = pcClose
titlebarHandler({ detail: 'bottom' })
check('disabled 按钮不点击', fakeCluster.buttons[0].clicked === 0)
check('disabled 时互斥 close 仍执行', pcClose === closeBefore3 + 1)
fakeCluster.buttons[0].disabled = false

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
