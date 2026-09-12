// 3083 rc1-clean：带 token 抓页面 → 聚合 URL → bundle id 列表（对照 SSiD 是否缺 primitives）
import { APP_URL } from './helpers/app-url.mjs'
const TOKEN_URL = APP_URL
const html = await (await fetch(TOKEN_URL)).text()
const scripts = [...html.matchAll(/src="(\/plugins\/\?\?[^"]+)"/g)].map((m) => m[1])
console.log('页面聚合 script 数:', scripts.length)
const agg = scripts[0]
if (!agg) { console.log('未找到聚合 URL；HTML 片段:', html.slice(0, 300)); process.exit(0) }
const url = new URL(agg, APP_URL).href
console.log('聚合 URL 长度:', url.length)
const text = await (await fetch(url)).text()
const ids = [...text.matchAll(/id: "@deepseek-ai\/dsh-client-([a-z-]+)"/g)].map((m) => m[1])
console.log('client 模块数:', ids.length)
console.log('含 ui-primitives:', ids.includes('ui-primitives'))
console.log('模块列表:', ids.join(', '))
