// 捕获会话列表接口响应（title 实际值）→ 判断投影行是否被采用
import { chromium } from '@playwright/test'

const b = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const p = (b.contexts()[0]?.pages() ?? []).find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()))
if (!p) throw new Error('no page')

let captured = null
p.on('response', async (resp) => {
  const url = resp.url()
  if (/list|session/i.test(url) && resp.request().method() === 'POST') {
    try {
      const json = await resp.json()
      if (Array.isArray(json) || (json && (json.items || json.sessions))) captured = { url: url.slice(0, 90), sample: JSON.stringify(Array.isArray(json) ? json.slice(0, 2) : (json.items ?? json.sessions ?? json).slice?.(0, 2)).slice(0, 700) }
    } catch { /* non-json */ }
  }
})
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForTimeout(6000)
console.log(captured ? JSON.stringify(captured, null, 2) : '未捕获到列表响应')
await b.close()
