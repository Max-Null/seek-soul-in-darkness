// 抓 SSiD 页面 HTML → 查 PLATFORM_MODULES 种子是否含 ui-primitives
const url = 'http://127.0.0.1:54170/?token=MxZZ_idTf92zvSxvKhFfkWHKFVdiVWcWf8Txy34QTEA'
const html = await (await fetch(url)).text()
console.log('HTML 长度:', html.length)
for (const key of ['ui-primitives', 'ui-slots', 'client-store', 'PLATFORM_MODULES', 'spell_', 'platform']) {
  const i = html.indexOf(key)
  console.log(`"${key}": ${i === -1 ? '未找到' : '命中 @' + i}`)
}
// 打印包含 ui-primitives 或 platform 的片段
const idx = html.indexOf('ui-primitives')
if (idx !== -1) console.log('片段:', html.slice(Math.max(0, idx - 200), idx + 200).replace(/\n/g, ' '))
else {
  const pidx = html.indexOf('platform')
  if (pidx !== -1) console.log('platform 片段:', html.slice(Math.max(0, pidx - 200), pidx + 260).replace(/\n/g, ' '))
}
