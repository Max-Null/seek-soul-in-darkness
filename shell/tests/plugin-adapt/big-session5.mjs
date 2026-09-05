// 大体积会话 v5：完整用户路径（欢迎态→新建→选工作区→切旧会话）计时
import { chromium } from '@playwright/test'

const browser = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() ?? []
const page = pages.find((p) => /^http(s)?:\/\//.test(p.url()) && !/plugins|mcp|about:/.test(p.url()))
if (!page) throw new Error('no DSH page')

// 0. 进入会话态
if ((await page.locator('[contenteditable="true"]').count()) === 0) {
  await page.locator('button[aria-label="新建会话"]').last().click()
  await page.waitForTimeout(600)
  // 欢迎态会弹「选择工作区」模态：点第一个工作区（web）
  const wsModal = page.locator('text=选择一个工作区开始').first()
  if (await wsModal.isVisible().catch(() => false)) {
    const wsItem = page.locator('button, [role="button"]').filter({ hasText: /^web$/ }).first()
    if (await wsItem.count()) await wsItem.click()
  }
  await page.waitForSelector('[contenteditable="true"]', { timeout: 30_000 })
}
console.log('已进入会话态')

// 1. 展开 deepseek-harness 工作区
const ws = page.locator('[role="treeitem"]').filter({ hasText: /^deepseek-harness$/ }).first()
if ((await ws.getAttribute('aria-expanded')) !== 'true') { await ws.click(); await page.waitForTimeout(600) }

// 2. 目标会话（row div 点击）
const target = page.locator('[role="treeitem"]').filter({ hasText: /deepseek-harness\s*\d+天/ }).last()
await target.waitFor({ state: 'visible', timeout: 15_000 })
console.log('目标:', (await target.innerText()).trim())

// 3. 点击计时
const t0 = Date.now()
await target.click({ position: { x: 40, y: 15 } })
let charCount = 0
let elapsed = -1
for (let i = 0; i < 72; i++) {
  await page.waitForTimeout(500)
  charCount = await page.evaluate(() => document.body.innerText.length)
  if (charCount > 2000) { elapsed = Date.now() - t0; break }
}
if (elapsed < 0) elapsed = Date.now() - t0
const head = await page.evaluate(() => document.body.innerText.slice(0, 100))
console.log(JSON.stringify({ openedInMs: elapsed, bodyCharCount: charCount, bodyHead: head }))
console.log(elapsed <= 12_000 ? 'PASS 大体积会话渲染 OK' : 'FAIL 大体积会话渲染超时/未渲染（α.4 同款症状）')
await browser.close()
