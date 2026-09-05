// 观察模式：检测「载入历史…」出现 → 计时到消息渲染完成（body 文本增长 / 消息块出现）
// 用法：先在 SSiD 窗口手动点开大体积旧会话（deepseek-harness 组），再运行本脚本（或先运行后点开均可）。
import { chromium } from '@playwright/test'

const browser = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() ?? []
const page = pages.find((p) => /^http(s)?:\/\//.test(p.url()) && !/plugins|mcp|about:/.test(p.url()))
if (!page) throw new Error('no DSH page')

console.log('观察中：请用鼠标在 SSiD 窗口点开「deepseek-harness」组的旧会话（14/16 天，大体积）……')
let loadingSeen = false
let t0 = 0
let done = false
for (let i = 0; i < 240; i++) {
  await page.waitForTimeout(250)
  const s = await page.evaluate(() => ({
    len: document.body.innerText.length,
    loading: /载入历史|Loading history/.test(document.body.innerText),
    hint: document.body.innerText.slice(0, 60),
  }))
  if (!loadingSeen && s.loading) { loadingSeen = true; t0 = Date.now(); console.log(`[${t0.toISOString()}] 检测到「载入历史…」开始计时`, JSON.stringify(s.hint)) }
  if (!loadingSeen && s.len > 2000) { t0 = Date.now(); loadingSeen = true; console.log(`[${t0.toISOString()}] 检测到内容渲染开始计时`) }
  if (loadingSeen && (s.len > 2000)) { done = true; console.log(JSON.stringify({ elapsedMs: Date.now() - t0, bodyCharCount: s.len })); break }
}
if (done) {
  console.log(Date.now() - t0 <= 12_000 ? 'PASS 大体积会话渲染 ≤12s' : 'FAIL 大体积会话渲染 >12s（α.4 同款症状）')
} else {
  console.log('90s 内未观测到「载入历史」或渲染完成——请确认已在窗口内点开会话')
}
await browser.close()
