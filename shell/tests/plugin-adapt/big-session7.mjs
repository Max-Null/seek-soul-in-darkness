// 大体积会话 v7：点工作区行左侧展开箭头 → 长等懒加载 → 点会话计时；失败则输出观察模式结论
import { chromium } from '@playwright/test'

const browser = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() ?? []
const page = pages.find((p) => /^http(s)?:\/\//.test(p.url()) && !/plugins|mcp|about:/.test(p.url()))
if (!page) throw new Error('no DSH page')

if ((await page.locator('[contenteditable="true"]').count()) === 0) {
  await page.locator('button[aria-label="新建会话"]').last().click()
  await page.waitForTimeout(600)
  const wsModal = page.locator('text=选择一个工作区开始').first()
  if (await wsModal.isVisible().catch(() => false)) {
    const wsItem = page.locator('button, [role="button"]').filter({ hasText: /^web$/ }).first()
    if (await wsItem.count()) await wsItem.click()
  }
  await page.waitForSelector('[contenteditable="true"]', { timeout: 30_000 })
}

const ws = page.locator('[role="treeitem"]').filter({ hasText: /^deepseek-harness$/ }).first()
await ws.click({ position: { x: 16, y: 12 } }) // 展开箭头区
await page.waitForTimeout(1500)
const found = await page.locator('[role="treeitem"]').filter({ hasText: /deepseek-harness\s*\d+天/ }).count()
console.log('展开后 deepseek-harness 会话项:', found)
if (found > 0) {
  const target = page.locator('[role="treeitem"]').filter({ hasText: /deepseek-harness\s*\d+天/ }).last()
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
  console.log(JSON.stringify({ openedInMs: elapsed, bodyCharCount: charCount }))
  console.log(elapsed <= 12_000 ? 'PASS 大体积会话渲染 OK' : 'FAIL')
} else {
  console.log('CONCLUSION: UI 无法自动展开 deepseek-harness 组（懒加载/交互未命中）——转为「观察模式」：由人工点开会话，脚本读渲染信号计时。')
}
await browser.close()
