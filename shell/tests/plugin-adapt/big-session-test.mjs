// 大体积历史会话渲染专项（α.4 翻车点复测）：定位目标会话 → 打开 → 计时渲染
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const TARGET_ID_PREFIX = '353b45ea' // 23.94MB，deepseek-harness 工作区

// 1. 从投影缓存读标题（递归搜索，不假设结构）
let title = null
try {
  const cache = JSON.parse(readFileSync(join(process.env.USERPROFILE, '.dsh', 'storages', 'session_projcache.json'), 'utf8'))
  const find = (node) => {
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (typeof k === 'string' && k.includes(TARGET_ID_PREFIX)) { title = typeof v === 'object' && v ? (v.val ?? v.title ?? null) : null; return true }
        if (find(v)) return true
      }
    }
    return false
  }
  find(cache)
} catch { /* ignore */ }
console.log('target title:', title)

// 2. 连 UI
const browser = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() ?? []
const page = pages.find((p) => /^http(s)?:\/\//.test(p.url()) && !/plugins|mcp|about:/.test(p.url()))
if (!page) throw new Error('no DSH page')
await page.waitForTimeout(800)

// 3. 先列出全部树项（区分 projectRow/sessionRow），并展开可能折叠的工作区
const items = page.locator('[role="treeitem"]')
const count = await items.count()
const rows = []
for (let i = 0; i < count; i++) {
  const el = items.nth(i)
  const cls = (await el.getAttribute('class')) ?? ''
  const text = (await el.innerText()).trim().replace(/\s+/g, ' ')
  rows.push({ kind: cls.includes('sessionRow') ? 'session' : 'project', text: text.slice(0, 30) })
}
console.log('tree:', JSON.stringify(rows))
if (process.argv[2] === '--list') { await browser.close(); process.exit(0) }
// 目标：deepseek-harness 组下的会话（cwd 名显示；项目行点击展开）
const wsRow = page.locator('[role="treeitem"]:has-text("deepseek-harness")').first()
await wsRow.click()
await page.waitForTimeout(800)
const items2 = page.locator('[role="treeitem"]')
const n2 = await items2.count()
const sessions = []
for (let i = 0; i < n2; i++) {
  const el = items2.nth(i)
  const cls = (await el.getAttribute('class')) ?? ''
  if (!cls.includes('sessionRow')) continue
  sessions.push({ text: (await el.innerText()).trim().replace(/\s+/g, ' '), el })
}
console.log('sessions in deepseek-harness group:', JSON.stringify(sessions.map((s) => s.text.slice(0, 24))))
if (sessions.length === 0) throw new Error('no sessions under deepseek-harness')
const target = sessions[sessions.length - 1].el // 列表尾部通常为旧会话

// 4. 点击并计时：历史内容渲染 = body 文本增长（α.4 崩在「载入历史…」后 ~20s 无消息行，此时 body 文本很短）
const t0 = Date.now()
await target.click()
let charCount = 0
let elapsed = -1
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(500)
  charCount = await page.evaluate(() => document.body.innerText.length)
  if (charCount > 2000) { elapsed = Date.now() - t0; break }
}
if (elapsed < 0) elapsed = Date.now() - t0
const errors = await page.evaluate(() => document.body.innerText.includes('400') ? 'has-400-text' : 'no-400-text')
console.log(JSON.stringify({ openedInMs: elapsed, bodyCharCount: charCount, bodyHint: errors }))
console.log(elapsed <= 12_000 ? 'PASS 大体积会话渲染 OK' : 'FAIL 大体积会话渲染超时（α.4 同款问题）')
await browser.close()
