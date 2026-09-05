// 查看 loader 的 load/create 源码签名（找补模块 API）
import { chromium } from '@playwright/test'
const b = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const p = (b.contexts()[0]?.pages() ?? []).find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()))
if (!p) throw new Error('no page')
const r = await p.evaluate(() => {
  const l = window.__ModuleLoader__
  return {
    loadSrc: String(l.load).slice(0, 400),
    createSrc: String(l.create).slice(0, 200),
  }
})
console.log(JSON.stringify(r, null, 1))
await b.close()
