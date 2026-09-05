// CDP 读运行时窗口：PLATFORM_MODULES 种子与 ui-primitives 模块状态
import { chromium } from '@playwright/test'
const b = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const p = (b.contexts()[0]?.pages() ?? []).find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()))
if (!p) throw new Error('no page')
const r = await p.evaluate(() => {
  const out = { hasPlatform: typeof window.PLATFORM_MODULES !== 'undefined', seeds: null }
  try { out.seeds = window.PLATFORM_MODULES ? Object.keys(window.PLATFORM_MODULES).slice(0, 20) : null } catch { }
  // ModuleLoader 模块表
  const loader = window.__ModuleLoader__
  out.loader = loader ? Object.keys(loader) : null
  return out
})
console.log(JSON.stringify(r, null, 1))
await b.close()
