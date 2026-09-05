// 抓取运行时 client bundle → 检查 diffTotals 定义/使用与模块来源
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const browser = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() ?? []
const page = pages.find((p) => /^http(s)?:\/\//.test(p.url()) && !/plugins|mcp|about:/.test(p.url()))
if (!page) throw new Error('no DSH page')

const shownPage = page
const res = await shownPage.evaluate(() =>
  performance.getEntriesByType('resource')
    .map((r) => r.name)
    .filter((u) => /client\.js|bundle|modules|plugins/.test(u) && !/\.png|\.svg|\.woff/.test(u))
    .slice(0, 10),
)
console.log(JSON.stringify(res, null, 2))
await browser.close()
