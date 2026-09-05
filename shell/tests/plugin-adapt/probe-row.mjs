// 探针：sessionRow 内部结构与可点击元素
import { chromium } from '@playwright/test'

const browser = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() ?? []
const page = pages.find((p) => /^http(s)?:\/\//.test(p.url()) && !/plugins|mcp|about:/.test(p.url()))
if (!page) throw new Error('no DSH page')

const info = await page.evaluate(() => {
  const row = Array.from(document.querySelectorAll('[role="treeitem"]')).find((el) => /ssid\s*5天/.test(el.textContent ?? ''))
  if (!row) return { err: 'no row' }
  const clickable = Array.from(row.querySelectorAll('button, a, [role="link"], [role="button"]')).map((el) => ({
    tag: el.tagName, role: el.getAttribute('role'), cls: String(el.className).slice(0, 40),
  })).slice(0, 6)
  return {
    outer: row.outerHTML.slice(0, 600),
    ariaSelected: row.getAttribute('aria-selected'),
    tabindex: row.getAttribute('tabindex'),
    clickable,
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
