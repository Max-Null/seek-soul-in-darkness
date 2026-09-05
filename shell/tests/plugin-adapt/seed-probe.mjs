// 把 shell 的 PLATFORM_MODULES 种子注册进 loader → 验证 ui-primitives 可解析
import { chromium } from '@playwright/test'
const b = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const p = (b.contexts()[0]?.pages() ?? []).find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()))
if (!p) throw new Error('no page')
const r = await p.evaluate(async () => {
  // 找 shell 的种子提供者（pp/类似函数）：从 window 各属性里找返回 PLATFORM 表的
  const trySeed = (name, factory) => {
    try {
      if (name in window && typeof window[name] === 'function') {
        const v = window[name]()
        if (v && (v['@deepseek-ai/dsh-client-ui-primitives'] || v['@deepseek-ai/dsh-client-store'])) return v
      }
    } catch { }
    return null
  }
  // shell 内 pp 是闭包内函数——不可达；改从模块表探测：loader 行已知缺，试直接注入
  // 回退：用 import（动态行不应成功）→ 先报告 loader 方法
  return {
    hasLoaderCreate: typeof window.__ModuleLoader__?.create === 'function',
    loaderMode: window.__ModuleLoader__?.mode,
  }
})
console.log(JSON.stringify(r, null, 1))
await b.close()
