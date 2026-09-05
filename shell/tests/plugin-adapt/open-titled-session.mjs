// 打开 ssid 组第一会话（c22e1d99=SKILL&MCP），抓页面标题与 header
import { chromium } from '@playwright/test'

const b = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const p = (b.contexts()[0]?.pages() ?? []).find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()))
if (!p) throw new Error('no page')
await p.waitForTimeout(800)

// 展开 ssid 组如果有折叠标识（无则直接点第一会话项）
const items = p.locator('[role="treeitem"]')
const sessions = p.locator('[role="treeitem"].YDXeBa_sessionRow')
const n = await sessions.count()
console.log('sessionRows:', n)
for (let i = 0; i < n; i++) {
  const text = (await sessions.nth(i).innerText()).trim().replace(/\s+/g, ' ')
  console.log(i, text.slice(0, 30))
}
if (n > 0) {
  await sessions.first().click()
  await p.waitForSelector('[contenteditable="true"]', { timeout: 30_000 }).catch(() => {})
  await p.waitForTimeout(2500)
  const info = await p.evaluate(() => ({
    title: document.title,
    head: (document.querySelector('[data-slot*="session"]')?.textContent ?? '').slice(0, 60),
    bodyHead: document.body.innerText.slice(0, 120),
  }))
  console.log(JSON.stringify(info))
}
await b.close()
