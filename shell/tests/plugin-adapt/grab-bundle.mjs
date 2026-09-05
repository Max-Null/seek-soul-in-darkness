// 抓完整聚合 client.js 并落盘（供 grep 事实核查）
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const browser = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() ?? []
const page = pages.find((p) => /^http(s)?:\/\//.test(p.url()) && !/plugins|mcp|about:/.test(p.url()))
if (!page) throw new Error('no DSH page')

const urls = await page.evaluate(() =>
  performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.includes('/plugins/??') && u.length > 1000),
)
console.log('聚合 bundle:', urls.length)
const text = await page.evaluate(async (u) => await (await fetch(u)).text(), urls[0])
writeFileSync('.tmp-client-bundle.js', text, 'utf8')
console.log('saved bytes:', text.length)
// 模块命名空间与 diffTotals 出现情况
const idx = text.indexOf('dsh-client-ui-primitives')
console.log('"dsh-client-ui-primitives" firstIndex:', idx)
const snippets = []
let searchFrom = 0
while (true) {
  const i = idx === -1 ? -1 : text.indexOf('dsh-client-ui-primitives', searchFrom)
  if (i === -1) break
  snippets.push(text.slice(Math.max(0, i - 60), i + 120).replace(/\n/g, ' '))
  searchFrom = i + 10
  if (snippets.length > 6) break
}
console.log('contexts:', JSON.stringify(snippets, null, 2))
await browser.close()
