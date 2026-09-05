// 大体积历史会话渲染专项（α.4 翻车点复测）：探会话列表 DOM 结构
import { chromium } from '@playwright/test'

const browser = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() ?? []
const page = pages.find((p) => /^http(s)?:\/\//.test(p.url()) && !/plugins|mcp|about:/.test(p.url()))
if (!page) throw new Error('no DSH page')
await page.waitForTimeout(1000)

const items = await page.evaluate(() => {
  const walk = (root) => Array.from(root.querySelectorAll('button, a, [role="button"], [role="listitem"], [role="treeitem"]'))
    .map((el) => ({
      role: el.getAttribute('role') ?? el.tagName,
      label: el.getAttribute('aria-label') ?? '',
      text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: String(el.className).slice(0, 40),
    }))
    .filter((x) => x.text.length > 0 || x.label.length > 0)
  // 侧栏区域：找包含“会话”文本的容器
  return walk(document.body).slice(0, 40)
})
console.log(JSON.stringify(items, null, 2))
await browser.close()
