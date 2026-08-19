// dsh-header-unify client.js 运行时验证（node 模拟浏览器环境）
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
const fakeCluster = {
  buttons: [
    { disabled: false, clicked: 0, click() { this.clicked++ } },
    { disabled: false, clicked: 0, click() { this.clicked++ } },
  ],
  querySelectorAll(sel) { return sel === 'button' ? this.buttons : [] },
}
let injectedStyle = null
let titlebarHandler = null
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
  addEventListener(name, fn) { if (name === 'ssid:titlebar') titlebarHandler = fn },
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

// ── 断言 ────────────────────────────────────────────────────────
check('handoff.id 为 @max-null/dsh-header-unify', global.__handoff.id === '@max-null/dsh-header-unify', global.__handoff?.id)
check('exports.inject 为空数组', Array.isArray(global.__handoff.exports.inject) && global.__handoff.exports.inject.length === 0)
check('已注册 ssid:titlebar 监听', typeof titlebarHandler === 'function')

// 隐藏 CSS 断言
check('隐藏 CSS 含 pc-headerbtn', injectedStyle !== null && injectedStyle.includes('pc-headerbtn'), injectedStyle)
check('隐藏 CSS 含 toggleCluster', injectedStyle !== null && injectedStyle.includes('toggleCluster'), injectedStyle)

// ── plugin-center：toggle 优先 ──────────────────────────────────
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

// ── sidebar：先关插件中心（互斥）再点最后一个按钮 ────────────────
fakeCluster.buttons.forEach((b) => { b.clicked = 0 })
const closeBefore = pcClose
titlebarHandler({ detail: 'sidebar' })
check('sidebar 事件先调 __pluginCenterClose（互斥）', pcClose === closeBefore + 1, `close=${pcClose}`)
check('sidebar 事件点击最后一个按钮', fakeCluster.buttons[1].clicked === 1, JSON.stringify(fakeCluster.buttons.map((b) => b.clicked)))
check('sidebar 事件未点第一个按钮', fakeCluster.buttons[0].clicked === 0)

// ── bottom：先关插件中心再点第一个按钮 ──────────────────────────
fakeCluster.buttons.forEach((b) => { b.clicked = 0 })
const closeBefore2 = pcClose
titlebarHandler({ detail: 'bottom' })
check('bottom 事件先调 __pluginCenterClose', pcClose === closeBefore2 + 1)
check('bottom 事件点击第一个按钮', fakeCluster.buttons[0].clicked === 1, JSON.stringify(fakeCluster.buttons.map((b) => b.clicked)))

// ── 未知 detail 不抛错、无副作用 ────────────────────────────────
fakeCluster.buttons.forEach((b) => { b.clicked = 0 })
const pcSnapshot = { o: pcOpen, t: pcToggle, c: pcClose }
titlebarHandler({ detail: 'unknown' })
check('未知 detail 静默', JSON.stringify(pcSnapshot) === JSON.stringify({ o: pcOpen, t: pcToggle, c: pcClose }) && fakeCluster.buttons.every((b) => b.clicked === 0))

// ── disabled 按钮不点击（hero 页 noSession 场景；close 仍执行）──
fakeCluster.buttons[0].disabled = true
fakeCluster.buttons.forEach((b) => { b.clicked = 0 })
const closeBefore3 = pcClose
titlebarHandler({ detail: 'bottom' })
check('disabled 按钮不点击', fakeCluster.buttons[0].clicked === 0)
check('disabled 时互斥 close 仍执行', pcClose === closeBefore3 + 1)
fakeCluster.buttons[0].disabled = false

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
