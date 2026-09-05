// 定位 sidebar.settings 崩溃归属：抓当前 bundle，找注册该 slot 的模块与可疑 import
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const browser = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() ?? []
const page = pages.find((p) => /^http(s)?:\/\//.test(p.url()) && !/plugins|mcp|about:/.test(p.url()))
if (!page) throw new Error('no DSH page')

const urls = await page.evaluate(() =>
  performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.includes('/plugins/??') && u.length > 1000),
)
const text = await page.evaluate(async (u) => await (await fetch(u)).text(), urls[0])
writeFileSync('.tmp-client-bundle.js', text, 'utf8')
console.log('saved', text.length)

// sidebar.settings 注册点与所在模块（//#region 头注释 = 源文件路径）
const out = {}
for (const key of ["sidebar.settings", "agent-terminals/ws", "agent-opens/ws"]) {
  const i = text.indexOf(key)
  if (i === -1) { out[key] = '未找到'; continue }
  const ctx = text.slice(Math.max(0, i - 500), i + 300)
  const regions = ctx.match(/\/\/#region [^\n]+/g) ?? []
  out[key] = { region: regions.slice(-2), snippet: ctx.replace(/\t/g, ' ').replace(/\n/g, '⏎').slice(-260) }
}
console.log(JSON.stringify(out, null, 2))
await browser.close()
