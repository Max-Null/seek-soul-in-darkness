// 访问纯净 rc.1 web 并抓 UI 状态（设置按钮/布局）
import { chromium } from '@playwright/test'
const b = await chromium.launch({ headless: true })
const p = await b.newPage()
await p.goto('http://127.0.0.1:3083/?token=vU5K_2TREzaaWRSMAi-LOWMciB3QOOarlmbkCtwHNzQ', { waitUntil: 'domcontentloaded', timeout: 30000 })
await p.waitForTimeout(3500)
const r = await p.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button')).map((x) => x.getAttribute('aria-label')).filter(Boolean).slice(0, 24)
  const setBtn = document.querySelector('[aria-label*="设置"], [aria-label*="Settings"], [aria-label*="settings"]')
  return { body: document.body.innerText.slice(0, 300), settingsBtn: setBtn ? setBtn.getAttribute('aria-label') : '无', btns }
})
console.log(JSON.stringify(r, null, 1))
await b.close()
