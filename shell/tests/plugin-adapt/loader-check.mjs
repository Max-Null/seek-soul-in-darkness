// 正确验证：经 __ModuleLoader__ 通道加载基线模块，看导出
import { chromium } from '@playwright/test'
const b = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const p = (b.contexts()[0]?.pages() ?? []).find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()))
if (!p) throw new Error('no page')
const r = await p.evaluate(async () => {
  const loader = window.__ModuleLoader__
  const out = { loadType: typeof loader.load, createType: typeof loader.create }
  // 尝试通过 loader 加载基线
  const tryLoad = async (id) => {
    try {
      const res = loader.load(id)
      if (res && typeof res.then === 'function') {
        const m = await Promise.race([res, new Promise((r) => setTimeout(() => r('TIMEOUT'), 3000))])
        if (m === 'TIMEOUT') return { via: 'promise', timeout: true }
        return { via: 'promise', keys: m ? Object.keys(m) : null }
      }
      return { via: 'sync', keys: res ? Object.keys(res) : null }
    } catch (e) { return { err: String(e).slice(0, 150) } }
  }
  out.primitives = await tryLoad('@deepseek-ai/dsh-client-ui-primitives')
  out.slots = await tryLoad('@deepseek-ai/dsh-client-ui-slots')
  return out
})
console.log(JSON.stringify(r, null, 1))
await b.close()
