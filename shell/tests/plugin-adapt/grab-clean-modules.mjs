// 对照：rc1-clean（3083）聚合 bundle 的 id 列表（是否含 primitives 定义块）
import { chromium } from '@playwright/test'
const b = await chromium.launch({ headless: true })
const p = await b.newPage()
await p.goto('http://127.0.0.1:3083/?token=vU5K_2TREzaaWRSMAi-LOWMciB3QOOarlmbkCtwHNzQ', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
await p.waitForTimeout(2500)
const urls = await p.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.includes('/plugins/??')).slice(0, 2))
console.log('bundle urls:', urls.length)
if (urls.length) {
  for (const u of urls.slice(0, 1)) {
    const text = await p.evaluate(async (url) => await (await fetch(url)).text(), u)
    const ids = [...text.matchAll(/id: "@deepseek-ai\/dsh-client-([a-z-]+)"/g)].map((m) => m[1])
    console.log('模块数:', ids.length, '| 含 primitives:', ids.includes('ui-primitives'), '| 含 store:', ids.includes('client-store') ? '?' : '?', '| ui-slots:', ids.includes('ui-slots'))
    console.log('missing 全表:', ids.join(', ').slice(0, 200))
  }
}
await b.close()
