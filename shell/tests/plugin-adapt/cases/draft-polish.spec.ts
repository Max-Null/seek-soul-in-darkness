import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { connectSsid, findDshPage, captureConsole, type CapturedLog } from '../helpers/ssid'

/**
 * dsh-draft-polish 实机适配用例（首个正式用例，由 .tmp-verify-polish.mjs 升级）。
 * 适配对象：当前 SSiD dev 内核（随升级矩阵变化：α.2 → 0.1.2-rc.1）。
 * 覆盖：L1 boot 健康 / L2 界面契约（样式注入+aria-label+slot 归属）/ L3 功能（空草稿提示，零 LLM 调用）/ L4 视觉。
 * 失败判定：L1 或 L2 失败 = 内核契约不适配（需迭代）；L3 失败 = 功能回归；L4 失败 = 样式回归（确认后重生成基线）。
 * 记载：2026-09-04 rc.1 适配——L4 首次检测到「润色」按钮 computed style 变化：
 *   background rgb(241,243,245)→rgba(0,0,0,0)、color rgb(28,28,30)→rgb(110,110,115)。
 *   判定：官方 rc.1 按钮令牌演化（插件按官方 token 组装，style 注入/class/功能均正常，非插件缺陷），基线已重生成。
 */

let browser: Browser
let page: Page
let logs: CapturedLog[]

test.beforeAll(async () => {
  browser = await connectSsid()
  page = await findDshPage(browser)
  logs = captureConsole(page)
  // 自愈：无活跃会话时点击「新建会话」（dev 重启后通常无会话打开）
  if ((await page.locator('[contenteditable="true"]').count()) === 0) {
    await page.locator('button[aria-label="新建会话"]').last().click()
  }
  // 等 composer 就绪（会话页已打开）
  await page.waitForSelector('[contenteditable="true"]', { timeout: 30_000 })
})

test.afterAll(async () => {
  await browser.close()
})

test('L1 boot 健康：无 Failed to load plugins、console 0 error（警告仅记录）', async () => {
  const fatal = logs.filter((l) => l.text.includes('Failed to load plugins'))
  expect(fatal, `boot 失败: ${fatal.map((f) => f.text).join('; ')}`).toEqual([])
  const errors = logs.filter((l) => l.level === 'error' || l.level === 'exception')
  expect(errors, `console error: ${errors.map((e) => e.text).join('; ')}`).toEqual([])
})

test('L2 界面契约：插件样式注入 + 润色按钮锚点 + slot 归属', async () => {
  // 样式注入：插件 style 带 data-plugin 标记（HMR/热更新可能累计多个，断言存在性）
  const pluginStyles = page.locator('style[data-plugin="dsh-draft-polish"]')
  expect(await pluginStyles.count()).toBeGreaterThanOrEqual(1)
  // 按钮锚点：aria-label 中英双语 + 旧类名兜底
  const button = page.locator(
    'button[aria-label="润色"], button[aria-label="Polish"], button[aria-label="润色草稿"], .dpp2-btn',
  ).first()
  await expect(button).toBeVisible()
  // slot 归宿：按钮必须位于输入栏 right 槽位（DSH 官方契约锚点）
  const slot = await button.evaluate((el) => el.closest('[data-slot]')?.getAttribute('data-slot') ?? null)
  expect(slot).toBe('conversation.input.right')
  // 布局顺序：润色按钮在发送按钮左侧。
  // 注意：发送按钮与 zone 是兄弟（data-slot 为 display:contents 包装，非子元素），
  // 不能按 zone 内 button 列表排序；用横向 boundingBox 比较（DSH 官方 DOM 契约）。
  const polishBox = await button.boundingBox()
  const send = page.locator(
    'button[aria-label="发送消息"], button[aria-label="Send message"], button[aria-label="停止生成"], button[aria-label="Stop generating"]',
  ).last()
  const sendBox = await send.boundingBox()
  expect(polishBox, '润色按钮必须可定位').not.toBeNull()
  expect(sendBox, '发送按钮必须可定位').not.toBeNull()
  expect(polishBox!.x + polishBox!.width).toBeLessThanOrEqual(sendBox!.x + 2)
})

test('L4 样式契约回归：按钮行 computed style 快照 vs 基线', async () => {
  // 像素截图路线判定为不可行（该 Electron 上 Playwright 截图栈卡死 + CDP clip 参数不支持），
  // L4 改用 computed style 契约快照：跨机器稳定、失败可读、直接对应「样式/布局回归」意图。
  // 采样前失焦 + 鼠标移开：按钮 focus/hover 会切换视觉样式（实心/透明），避免交互残留污染快照。
  await page.mouse.move(0, 0)
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
  // 等 600ms：按钮 hover/focus 带有 CSS transition（背景/颜色过渡），100ms 采样会
  // 命中过渡中间值（如 background rgba(…,0.008) vs rgba(…,0.03)），快照不稳定
  // （2026-09-05 draft-polish 0.2.3 实测）。
  await page.waitForTimeout(600)
  const snapshot = await page.evaluate(() => {
    const zone = document.querySelector('[data-slot="conversation.input.right"]')
    if (!zone) return null
    const props = ['font-size', 'font-family', 'color', 'background-color', 'border-radius', 'height', 'padding', 'display']
    return Array.from(zone.querySelectorAll('button')).map((b) => {
      const cs = getComputedStyle(b)
      const style: Record<string, string> = {}
      for (const p of props) style[p] = cs.getPropertyValue(p)
      return { label: b.getAttribute('aria-label'), style, box: { w: b.clientWidth, h: b.clientHeight } }
    })
  })
  expect(snapshot, 'zone 必须存在').not.toBeNull()

  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const here = dirname(fileURLToPath(import.meta.url))
  const basePath = join(here, '..', 'baselines', 'draft-polish', 'style-snapshot.json')

  if (process.env.UPDATE_SNAPSHOTS === '1') {
    mkdirSync(dirname(basePath), { recursive: true })
    writeFileSync(basePath, JSON.stringify(snapshot, null, 2), 'utf8')
    console.log(`[L4] 样式基线已写入: ${basePath}`)
    return
  }
  expect(readFileSync(basePath, 'utf8').length, `基线缺失: ${basePath}（首次用 UPDATE_SNAPSHOTS=1 生成）`).toBeGreaterThan(0)
  const base = JSON.parse(readFileSync(basePath, 'utf8'))
  expect(snapshot, '样式基线不一致（插件 CSS 回归；确认为正当变化时用 UPDATE_SNAPSHOTS=1 重生成）').toEqual(base)
})

test('L3 功能可用：空草稿点击润色 → 提示「请先输入内容」（零 LLM 调用）', async () => {
  const button = page.locator(
    'button[aria-label="润色"], button[aria-label="Polish"], button[aria-label="润色草稿"], .dpp2-btn',
  ).first()
  await button.click()
  await expect(page.getByText(/请先输入内容|enter content/i).first()).toBeVisible({ timeout: 8_000 })
})
