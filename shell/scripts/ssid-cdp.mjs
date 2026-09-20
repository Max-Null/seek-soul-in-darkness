#!/usr/bin/env node
/**
 * ssid-cdp —— 通过 CDP 连上**正在运行的** SSiD/Electron，读页面状态、发真实鼠标与键盘输入。
 *
 * **为什么需要它**：想对一个活着的 SSiD 会话做端到端验证（比如确认某个工具真的注册进了
 * 真实会话），只有两条路——驱动 GUI，或者让内核自己报告。而 Playwright MCP **连不上外部
 * CDP**（它只驱动自己启动的浏览器，`browser_run_code_unsafe` 里又是 ESM 上下文、拿不到
 * `require`）。所以这里用 Node 22+ 的全局 `WebSocket` 手搓 CDP。
 *
 * **为什么点击要单独一条命令**：`element.click()` 是合成事件，React 不认——
 * 实测点「新建会话」毫无反应。必须走 CDP 的 `Input.dispatchMouseEvent` 发真实鼠标事件。
 *
 * **为什么打字也要单独一条命令**：输入框是自带 selection model 的富文本编辑器，三种
 * 常规写法全都无效——`document.execCommand('selectAll')` 不选中编辑区（内容是追加而非
 * 替换）、DOM `Range` 的选区不被认、CDP `Input.insertText` 走 IME 提交路径被静默丢弃。
 * 只有逐字符发 `Input.dispatchKeyEvent` 的 `char` 事件有效（中英文都行）。
 *
 * **前提**：目标实例启动时带了 `--remote-debugging-port`（SSiD 的 main.mjs 无需改动，
 * 参数直接透传给 Electron）。
 *
 * 用法：
 *   node ssid-cdp.mjs list                      列出 targets
 *   node ssid-cdp.mjs page                      打印 DSH 页面的 target
 *   node ssid-cdp.mjs eval "<表达式>"           在 DSH 页面里求值（awaitPromise + returnByValue）
 *   node ssid-cdp.mjs eval-file <文件路径>      从文件读表达式再求值
 *   node ssid-cdp.mjs click-button "<aria-label 或文本>"   发真实鼠标点击
 *   node ssid-cdp.mjs type <文本文件路径>       往输入框打文本（会先清空；打完校验一致性）
 *
 * 环境变量：`SSID_CDP_PORT`（默认 9333）、`SSID_CDP_TIMEOUT`（默认 60000 ms）。
 *
 * 退出码：0 成功 / 1 出错（连不上、无 DSH 页面、表达式抛错、超时、找不到按钮）。
 */
import { setMaxListeners } from 'node:events'
import fs from 'node:fs'

const PORT = process.env.SSID_CDP_PORT ?? '9333'
const BASE = `http://127.0.0.1:${PORT}`
const TIMEOUT_MS = Number(process.env.SSID_CDP_TIMEOUT ?? 60000)

async function listTargets() {
  const res = await fetch(`${BASE}/json/list`)
  if (!res.ok) throw new Error(`/json/list 返回 ${res.status}`)
  return await res.json()
}

/** DSH 页面：Electron 里唯一那个 http://127.0.0.1:<port> 的 page（splash/titlebar 是 file://）。 */
function dshPage(targets) {
  return targets.find(t => t.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+/.test(t.url))
}

/** 开一条 CDP 连接，把一个 `send(method, params)` 交给回调，结束后关闭。 */
async function cdpSession(wsUrl, run) {
  const ws = new WebSocket(wsUrl)
  // type 逐字符发 char 事件，每个字符挂一个一次性 listener，会顶破默认的 10 个上限
  setMaxListeners(0, ws)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')), { once: true })
  })

  let nextId = 1
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => reject(new Error(`${method} 超时（${TIMEOUT_MS} ms）`)), TIMEOUT_MS)
    const onMessage = event => {
      let msg
      try { msg = JSON.parse(event.data) } catch { return }
      if (msg.id !== id) return
      clearTimeout(timer)
      ws.removeEventListener('message', onMessage)
      if (msg.error) reject(new Error(`${method} 失败：${JSON.stringify(msg.error)}`))
      else resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })

  try {
    return await run(send)
  } finally {
    ws.close()
  }
}

async function evalIn(send, expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) {
    const d = result.exceptionDetails
    throw new Error(`表达式抛错：${d.exception?.description ?? d.text}`)
  }
  return result.result?.value
}

/** 按 aria-label / 文本找按钮，量出中心坐标，再发真实鼠标按下+抬起。 */
async function clickButton(send, label) {
  const at = await evalIn(send, `(() => {
    const el = [...document.querySelectorAll('button')].find(b => ((b.getAttribute('aria-label') || b.textContent || '').trim()) === ${JSON.stringify(label)})
    if (!el) return { error: '没有这个按钮' }
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return { error: '按钮不可见（宽或高为 0）' }
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (at?.error) throw new Error(`找不到可点击的「${label}」：${at.error}`)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 })
  }
  return `已点击「${label}」@ (${at.x}, ${at.y})`
}

/**
 * 往输入框打一段文本：点进去聚焦 → Ctrl+A 全选 → Backspace 清空 → 逐字符发 char 事件。
 *
 * 聚焦后必须等一帧再发第一个字符，否则首字符被吞（实测 `Read` 会变成 `ead`）。
 * 打完比对回读文本，不一致就报错——静默少字比直接失败更难查。
 */
async function typeIntoComposer(send, text) {
  const box = await evalIn(send, `(() => {
    const el = document.querySelector('[contenteditable="true"]')
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 20)) }
  })()`)
  if (box === null || box === undefined) throw new Error('没有找到 contenteditable 输入框')

  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
  }
  await new Promise(resolve => setTimeout(resolve, 150))

  const CTRL = 2
  await send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', modifiers: CTRL, key: 'a', code: 'KeyA',
    windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', modifiers: CTRL, key: 'a', code: 'KeyA',
    windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key: 'Backspace', code: 'Backspace',
    windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Backspace', code: 'Backspace',
    windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8,
  })
  await new Promise(resolve => setTimeout(resolve, 80))

  let last
  for (const ch of text) {
    last = send('Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch })
  }
  await last
  await new Promise(resolve => setTimeout(resolve, 400))

  const after = await evalIn(send, `(() => {
    const el = document.querySelector('[contenteditable="true"]')
    const btn = [...document.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '').trim() === '发送消息')
    return { composerText: (el.innerText || '').trim(), sendDisabled: btn ? btn.disabled : 'no-button' }
  })()`)
  if (after.composerText !== text) {
    throw new Error(`输入框内容与预期不符：期望 ${text.length} 字符，实际 ${after.composerText.length} 字符`)
  }
  return `已输入 ${text.length} 字符，发送按钮${after.sendDisabled ? '仍禁用' : '已可用'}`
}

const [command, ...rest] = process.argv.slice(2)

try {
  if (command === 'list') {
    for (const t of await listTargets()) console.log(`${t.type.padEnd(6)} ${t.url}\n       ${t.title}`)
    process.exit(0)
  }

  if (command === 'page') {
    const page = dshPage(await listTargets())
    if (page === undefined) throw new Error('没有找到 DSH 页面（实例是否带了 --remote-debugging-port？）')
    console.log(JSON.stringify(page, null, 2))
    process.exit(0)
  }

  if (!['eval', 'eval-file', 'click-button', 'type'].includes(command)) {
    console.error('用法：node ssid-cdp.mjs list | page | eval "<表达式>" | eval-file <路径> | click-button "<标签>" | type <文本文件路径>')
    process.exit(1)
  }

  const page = dshPage(await listTargets())
  if (page === undefined) throw new Error('没有找到 DSH 页面')

  const output = await cdpSession(page.webSocketDebuggerUrl, async send => {
    if (command === 'click-button') return await clickButton(send, rest.join(' '))

    if (command === 'type') {
      if (!rest[0]) throw new Error('用法：node ssid-cdp.mjs type <文本文件路径>')
      const text = fs.readFileSync(rest[0], 'utf8').replace(/\r\n/g, '\n').trimEnd()
      if (text === '') throw new Error(`文本文件是空的：${rest[0]}`)
      return await typeIntoComposer(send, text)
    }

    const expression = command === 'eval' ? rest.join(' ') : fs.readFileSync(rest[0], 'utf8')
    if (expression.trim() === '') throw new Error('表达式为空')
    const value = await evalIn(send, expression)
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  })

  console.log(output)
} catch (error) {
  console.error(`✗ ${error.message}`)
  process.exit(1)
}
