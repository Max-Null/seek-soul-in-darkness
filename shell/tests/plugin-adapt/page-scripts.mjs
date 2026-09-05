// 运行时页面脚本清单 + 是否有种子模块脚本
import { chromium } from '@playwright/test'
const b = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const p = (b.contexts()[0]?.pages() ?? []).find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()))
if (!p) throw new Error('no page')
const r = await p.evaluate(() => {
  const scripts = Array.from(document.querySelectorAll('script')).map((s) => ({
    src: (s.src || '').slice(0, 120), type: s.type, text: (s.textContent || '').slice(0, 80),
  }))
  // 种子/基线查找：window 上的 module loader create 相关或 import.meta
  const bodyLen = document.body?.innerText?.length
  return { title: document.title, scripts: scripts.slice(0, 12), bodyLen }
})
console.log(JSON.stringify(r, null, 1))
await b.close()
