// 抓全套界面：会话树文本 + 设置按钮存在性
import { chromium } from '@playwright/test'
const b = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const p = (b.contexts()[0]?.pages() ?? []).find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()))
if (!p) throw new Error('no page')
await p.waitForTimeout(2200)
const r = await p.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button')).map((x) => x.getAttribute('aria-label')).filter(Boolean).slice(0, 24)
  const setBtn = document.querySelector('[aria-label*="设置"], [aria-label*="Settings"], [aria-label*="settings"]')
  return { body: document.body.innerText.slice(0, 340), settingsBtn: setBtn ? setBtn.getAttribute('aria-label') : '无', btns }
})
console.log(JSON.stringify(r, null, 1))
await b.close()
