// 大体积会话 v4：先进入会话态（新建会话）→ 再切旧会话（deepseek-harness 14天）→ 计时渲染
import { chromium } from '@playwright/test'

const browser = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() ?? []
const page = pages.find((p) => /^http(s)?:\/\//.test(p.url()) && !/plugins|mcp|about:/.test(p.url()))
if (!page) throw new Error('no DSH page')

// 0. 自愈：无活动会话则新建会话，进入会话视图
if ((await page.locator('[contenteditable="true"]').count()) === 0) {
  await page.locator('button[aria-label="新建会话"]').last().click()
  await page.waitForSelector('[contenteditable="true"]', { timeout: 30_000 })
}

// 1. 展开 deepseek-harness 工作区
const ws = page.locator('[role="treeitem"]').filter({ hasText: /^deepseek-harness$/ }).first()
if ((await ws.getAttribute('aria-expanded')) !== 'true') {
  await ws.click()
  await page.waitForTimeout(600)
}

// 2. 组内旧会话
const target = page.locator('[role="treeitem"]').filter({ hasText: /deepseek-harness\s*\d+天/ }).last()
await target.waitFor({ state: 'visible', timeout: 15_000 })
const label = (await target.innerText()).trim().replace(/\s+/g, ' ')
console.log('目标会话:', label)

// 3. 点击并计时：等待 URL 切到该会话 + 内容渲染（body 文本增长）
const t0 = Date.now()
const urlBefore = page.url()
await target.click()
let charCount = 0
let urlChanged = false
let elapsed = -1
for (let i = 0; i < 72; i++) {
  await page.waitForTimeout(500)
  charCount = await page.evaluate(() => document.body.innerText.length)
  if (page.url() !== urlBefore) urlChanged = true
  if (charCount > 2000) { elapsed = Date.now() - t0; break }
}
if (elapsed < 0) elapsed = Date.now() - t0
const head = await page.evaluate(() => document.body.innerText.slice(0, 80))
console.log(JSON.stringify({ urlChanged, openedInMs: elapsed, bodyCharCount: charCount, url: page.url().slice(0, 60), bodyHead: head }))
console.log(elapsed <= 12_000 ? 'PASS 大体积会话渲染 OK' : 'FAIL 大体积会话渲染超时/未渲染（α.4 同款症状）')
await browser.close()
