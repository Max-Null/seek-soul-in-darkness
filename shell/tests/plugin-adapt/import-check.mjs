// 页面内动态 import ui-primitives（判定模块可解析性与导出）
import { chromium } from '@playwright/test'
const b = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const p = (b.contexts()[0]?.pages() ?? []).find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()))
if (!p) throw new Error('no page')
const r = await p.evaluate(async () => {
  try {
    const m = await import('@deepseek-ai/dsh-client-ui-primitives')
    const keys = Object.keys(m)
    return { ok: true, hasFish: 'FISH_LOGO_VIEWBOX' in m, hasDiff: 'diffTotals' in m, keys: keys.slice(0, 12) }
  } catch (e) {
    return { ok: false, err: String(e).slice(0, 160) }
  }
})
console.log(JSON.stringify(r, null, 1))
await b.close()
