// rc1-clean 新 token：抓页面 → assets shell → dp 对比（FISH_LOGO_VIEWBOX/diffTotals 是否存在）
const TOKEN = 'BlsVvz_v4cSeFKKH7ygAznIRuACz_3mv4V07-M5jFBU'
const html = await (await fetch(`http://127.0.0.1:3083/?token=${TOKEN}`)).text()
const assets = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1])
console.log('assets 脚本:', assets)
for (const a of assets.slice(0, 4)) {
  const t = await (await fetch('http://127.0.0.1:3083' + a)).text()
  const i = t.indexOf('const dp=')
  const has = i === -1 ? null : { fish: t.slice(i, i + 2600).includes('FISH_LOGO_VIEWBOX'), diff: t.slice(i, i + 2600).includes('diffTotals') }
  console.log(a.slice(-30), '| len', t.length, '| dp:', JSON.stringify(has))
}
