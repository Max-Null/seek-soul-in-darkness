// rc1-clean 新 token：抓页面 → assets shell → dp 对比（FISH_LOGO_VIEWBOX/diffTotals 是否存在）
import { APP_URL } from './helpers/app-url.mjs'
const BASE = APP_URL
const html = await (await fetch(BASE)).text()
const assets = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1])
console.log('assets 脚本:', assets)
for (const a of assets.slice(0, 4)) {
  const t = await (await fetch(new URL(a, BASE).href)).text()
  const i = t.indexOf('const dp=')
  const has = i === -1 ? null : { fish: t.slice(i, i + 2600).includes('FISH_LOGO_VIEWBOX'), diff: t.slice(i, i + 2600).includes('diffTotals') }
  console.log(a.slice(-30), '| len', t.length, '| dp:', JSON.stringify(has))
}
