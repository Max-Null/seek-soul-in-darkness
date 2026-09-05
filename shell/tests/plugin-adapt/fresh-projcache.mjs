// 新建会话触发内核写投影文件 → 读最新文件获取权威格式（version + title ver）
import { chromium } from '@playwright/test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const b = await chromium.connectOverCDP(process.env.SSID_CDP ?? 'http://127.0.0.1:9222')
const p = (b.contexts()[0]?.pages() ?? []).find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()))
if (!p) throw new Error('no page')

const before = new Set(readdirSync(join(process.env.USERPROFILE, '.dsh', 'storages', 'session_projcache', 'sessions')))
await p.locator('button[aria-label="新建会话"]').last().click()
await p.waitForSelector('[contenteditable="true"]', { timeout: 30_000 }).catch(() => {})
await p.waitForTimeout(4000)

const dir = join(process.env.USERPROFILE, '.dsh', 'storages', 'session_projcache', 'sessions')
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
const fresh = files.filter((f) => !before.has(f))
console.log('新文件:', fresh)
for (const f of fresh.slice(0, 3)) {
  try {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    console.log(f, '=>', JSON.stringify({ version: d.version, titleRow: d.record?.rows?.title, identity: d.record?.identity }, null, 1).slice(0, 400))
  } catch (e) { console.log(f, 'ERR', String(e).slice(0, 60)) }
}
await b.close()
