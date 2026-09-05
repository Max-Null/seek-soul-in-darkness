// 大体积会话 v3：展开 deepseek-harness 组（按 aria-expanded）→ 点击旧会话 → 计时渲染
import { chromium } from '@playwright/test'

const browser = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() ?? []
const page = pages.find((p) => /^http(s)?:\/\//.test(p.url()) && !/plugins|mcp|about:/.test(p.url()))
if (!page) throw new Error('no DSH page')

// 展开 deepseek-harness 工作区
const ws = page.locator('[role="treeitem"]').filter({ hasText: /^deepseek-harness$/ }).first()
if ((await ws.getAttribute('aria-expanded')) !== 'true') {
  await ws.click()
  await page.waitForTimeout(600)
}

// 组内旧会话（文本含「天」）
const target = page.locator('[role="treeitem"]').filter({ hasText: /deepseek-harness\s*\d+天/ }).last()
await target.waitFor({ state: 'visible', timeout: 15_000 })
const label = (await target.innerText()).trim().replace(/\s+/g, ' ')
console.log('目标会话:', label)

const t0 = Date.now()
await target.click()
let charCount = 0
let elapsed = -1
for (let i = 0; i < 72; i++) {
  await page.waitForTimeout(500)
  charCount = await page.evaluate(() => document.body.innerText.length)
  if (charCount > 2000) { elapsed = Date.now() - t0; break }
}
if (elapsed < 0) elapsed = Date.now() - t0
const hint = await page.evaluate(() => document.body.innerText.slice(0, 120))
console.log(JSON.stringify({ openedInMs: elapsed, bodyCharCount: charCount, bodyHead: hint }))
console.log(elapsed <= 12_000 ? 'PASS 大体积会话渲染 OK' : 'FAIL 大体积会话渲染超时/未渲染（α.4 同款症状）')
await browser.close()
