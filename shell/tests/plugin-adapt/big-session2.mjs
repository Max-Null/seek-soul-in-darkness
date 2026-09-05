// 大体积会话 v2：直接文本定位 deepseek-harness 组旧会话 → 点击 → 计时内容渲染
import { chromium } from '@playwright/test'

const browser = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() ?? []
const page = pages.find((p) => /^http(s)?:\/\//.test(p.url()) && !/plugins|mcp|about:/.test(p.url()))
if (!page) throw new Error('no DSH page')

const state0 = await page.evaluate(() => document.body.innerText.slice(0, 200))
console.log('当前页面:', JSON.stringify(state0))

// 目标：文本含「deepseek-harness 」且含「天」的会话项（14/16 天，即 8 月中下旬大会话）
const target = page.locator('[role="treeitem"]:has-text("deepseek-harness ")').filter({ hasText: /天/ }).last()
const t0 = Date.now()
await target.click()
let charCount = 0
let msgCount = 0
let elapsed = -1
for (let i = 0; i < 72; i++) {
  await page.waitForTimeout(500)
  const s = await page.evaluate(() => ({
    len: document.body.innerText.length,
    msgs: document.querySelectorAll('[data-slot*="message"], [data-message], .msg-row, [class*="message"]').length,
    hint: document.body.innerText.includes('400'),
  }))
  charCount = s.len; msgCount = s.msgs
  if (s.len > 2000 || s.msgs > 10) { elapsed = Date.now() - t0; break }
}
if (elapsed < 0) elapsed = Date.now() - t0
console.log(JSON.stringify({ openedInMs: elapsed, bodyCharCount: charCount, msgHits: msgCount }))
console.log(elapsed <= 12_000 ? 'PASS 大体积会话渲染 OK' : 'FAIL 大体积会话渲染超时/未渲染（α.4 同款症状）')
await browser.close()
