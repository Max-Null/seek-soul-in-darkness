// 断点验证：Electron 页面 boot 状态（READY / loader 行 / run 失败点）
import { chromium } from '@playwright/test'
const b = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const p = (b.contexts()[0]?.pages() ?? []).find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()))
if (!p) throw new Error('no page')
const r = await p.evaluate(() => {
  const loader = window.__ModuleLoader__
  return {
    ready: typeof globalThis.__DSH_BOOT_READY__,
    readyState: globalThis.__DSH_BOOT_READY__ ? JSON.stringify(Object.keys(globalThis.__DSH_BOOT_READY__)) : null,
    loaderMode: loader?.mode ?? null,
    loaderKeys: loader ? Object.keys(loader) : null,
    // 页面 fail 显示
    failText: document.body?.innerText?.slice(0, 300) ?? null,
    boot: globalThis.__DSH_BOOT__ ? JSON.stringify(globalThis.__DSH_BOOT__).slice(0, 200) : null,
  }
})
console.log(JSON.stringify(r, null, 1))
await b.close()
