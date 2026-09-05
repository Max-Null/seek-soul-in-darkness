// smoke-ui.cjs — SSiD 发布后自动冒烟：打开思灵内嵌 DSH web，验证三插件 UI 痕迹
//
// 用法（在 seek-soul-in-darkness 仓库根或任意目录执行）:
//   node .agents/skills/ssid-release/smoke-ui.cjs                    # 存在性检查（不发消息）
//   node .agents/skills/ssid-release/smoke-ui.cjs --send "把上面的仪表盘用 dsh-ui 的 panel:true 更新到会话面板"
//   node .agents/skills/ssid-release/smoke-ui.cjs --port 59179       # 手动指定端口
//   node .agents/skills/ssid-release/smoke-ui.cjs --session "本周任务统计仪表盘设计"
//
// 前置：思灵已启动（安装目录归档已替换 v0.1.13+）；Playwright 依赖 ssid profile
// （@playwright/mcp 自带 playwright + chromium 二进制）。
// 输出：outdir（默认 .dsh-tmp/ssid-smoke/<时间戳>/）下 3 张截图 + 结果 JSON（stdout）。
const path = require('node:path')
const fs = require('node:fs')
const { execSync } = require('node:child_process')

// ---- 参数 ----
const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const PORT = getArg('--port', null)
const CDP = getArg('--cdp', null) // 打包版：--remote-debugging-port=<n> 启动后 connectOverCDP（v0.1.16 方案）
const SEND = getArg('--send', null)
const SESSION = getArg('--session', null)
const CLEAN_SESSIONS = getArg('--clean-sessions', null) // 逗号分隔会话标题（归档，DSH 无删除入口）
const CLEAN = args.includes('--clean') // 删除本次/指定 outdir 截图
const OUTDIR = getArg('--outdir', null)
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH
  || 'C:/Users/MaxNull/.dsh/profiles/ssid/node_modules/playwright'

// ---- 探测思灵 web 端口（动态分配）----
function findSsidPort() {
  if (PORT) return PORT
  try {
    // 用 ASCII 路径 ssid-shell 匹配进程（避免中文进程名在管道中的编码坑）；
    // ProgressPreference=SilentlyContinue 抑制模块加载 CLIXML 进度流污染 stdout；
    // 遍历全部匹配进程（多进程拓扑，只有主进程监听 web 端口）
    const ps = "$ProgressPreference='SilentlyContinue'; foreach ($p in (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*ssid-shell*' })) { $port = Get-NetTCPConnection -State Listen -OwningProcess $p.Id -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty LocalPort; if ($port) { Write-Output $port; break } }"
    const enc = Buffer.from(ps, 'utf16le').toString('base64')
    const raw = execSync(`powershell -NoProfile -EncodedCommand ${enc}`, { encoding: 'utf8', timeout: 15000 }).trim()
    if (/^\d+$/.test(raw)) return raw
  } catch { /* fall through */ }
  throw new Error('无法自动发现思灵端口：请确认思灵已启动，或用 --port <n> 指定')
}

// ---- 会话清理（DSH 仅支持"归档"，无删除入口）----
async function archiveSession(page, title) {
  try {
    const row = page.getByText(title, { exact: false }).first()
    const box = await row.boundingBox({ timeout: 5000 }).catch(() => null)
    if (!box) return { title, ok: false, why: 'row not found' }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(400)
    const btn = page.locator(`button[aria-label*="${title}"]`).first()
    await btn.click({ timeout: 5000 })
    await page.waitForTimeout(600)
    const item = page.locator('[role="menuitem"]').getByText(/归档会话/, { exact: false }).first()
    await item.click({ timeout: 5000 })
    await page.waitForTimeout(800)
    // 可能的确认弹窗（按钮文本含"归档"）
    const confirm = page.getByText(/^归档$|归档会话$/, { exact: false }).last()
    if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) await confirm.click()
    await page.waitForTimeout(1200)
    const gone = await page.getByText(title, { exact: false }).count() === 0
    return { title, ok: gone, why: gone ? 'archived' : 'still present (maybe confirm needed)' }
  } catch (e) {
    return { title, ok: false, why: String(e).split('\n')[0].slice(0, 120) }
  }
}

// ---- 主流程 ----
;(async () => {
  const { chromium } = require(PLAYWRIGHT)
  let browser, page, url
  if (CDP) {
    // 打包版（v0.1.16 方案）：CDP 连接真实窗口页（自带 web token，裸 URL 会撞认证页）
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`)
    const pages = browser.contexts().flatMap(c => c.pages())
    page = pages.find(p => /^http:\/\/127\.0\.0\.1:\d+\//.test(p.url()))
      || pages.find(p => !p.url().startsWith('file:') && !p.url().includes('devtools'))
    if (!page) throw new Error(`CDP 未找到主视图页（pages=${pages.map(p => p.url()).join(' | ')}）`)
    url = page.url()
    console.log(`[smoke] cdp=${CDP} url=${url} send=${SEND ? 'yes' : 'no'}`)
  } else {
    const port = findSsidPort()
    url = `http://127.0.0.1:${port}/`
    console.log(`[smoke] url=${url} send=${SEND ? 'yes' : 'no'}`)
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
    await page.waitForTimeout(3500)
  }
  const outdir = OUTDIR || path.join('H:/MaxNull/WorkStation/.dsh-tmp', 'ssid-smoke', String(Date.now()))
  fs.mkdirSync(outdir, { recursive: true })

  const base = await page.evaluate(() => ({
    hasComposerSeat: !!document.querySelector('[data-composer-seat]'),
    hasInput: !!(document.querySelector('textarea') || document.querySelector('[contenteditable="true"]')),
    contextDoctor: [...document.querySelectorAll('*')]
      .filter(el => el.childElementCount === 0 && /context\s*doctor/i.test(el.textContent || ''))
      .length > 0,
    url: location.href,
  }))
  await page.screenshot({ path: path.join(outdir, '1-base.png') })

  // 打开目标会话（--session 指定时）检查 dsh-context 标签
  let conv = { tabs: [], contextDoctor: base.contextDoctor, checked: false }
  if (SESSION) {
    const target = page.getByText(SESSION, { exact: false }).first()
    try {
      await target.click({ timeout: 10000 })
    } catch (e) {
      console.log('[smoke] session click FAILED:', String(e).split('\n')[0].slice(0, 200))
    }
    await page.waitForTimeout(5000)
    conv = await page.evaluate(() => ({
      tabs: [...document.querySelectorAll('button, [role="tab"]')]
        .filter(el => /^(对话|轨迹|上下文)$/.test((el.textContent || '').trim()))
        .map(el => (el.textContent || '').trim()),
      contextDoctor: [...document.querySelectorAll('*')]
        .filter(el => el.childElementCount === 0 && /context\s*doctor/i.test(el.textContent || ''))
        .length > 0,
      checked: true,
    }))
  }
  await page.screenshot({ path: path.join(outdir, '2-conversation.png') })

  // 全链路（可选）：发消息 → 等 fence → 触发面板 → 量宽度
  let panel = { sent: false }
  if (SEND) {
    const input = (await page.$('textarea')) || (await page.$('[contenteditable="true"]'))
    if (input) {
      await input.fill(SEND)
      await page.keyboard.press('Enter')
      panel.sent = true
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(5000)
        // 交互障碍：模型/宿主弹提问卡片时自动跳过（选第一项并提交 / 直接跳过）
        try {
          const firstOpt = await page.getByText(/示例趋势|示例数据/).first()
          if (await firstOpt.isVisible({ timeout: 500 }).catch(() => false)) {
            await firstOpt.click()
            const submit = await page.getByText(/提交/).first()
            if (await submit.isVisible({ timeout: 500 }).catch(() => false)) await submit.click()
            console.log('[smoke] question answered (first option)')
          } else {
            const skip = await page.getByText(/跳过本题/).first()
            if (await skip.isVisible({ timeout: 500 }).catch(() => false)) {
              await skip.click()
              console.log('[smoke] question skipped')
            }
          }
        } catch { /* no question visible */ }
        panel = await page.evaluate(() => {
          const p = document.querySelector('[data-genui-panel]')
          const pr = p ? p.getBoundingClientRect() : null
          const seat = document.querySelector('[data-composer-seat]')
          const seatR = seat ? seat.getBoundingClientRect() : null
          const rendered = !!document.querySelector('[data-genui-rendered]')
          return {
            sent: true,
            rendered,
            hasPanel: !!p,
            panelW: pr ? Math.round(pr.width) : null,
            panelX: pr ? Math.round(pr.x) : null,
            seatW: seatR ? Math.round(seatR.width) : null,
            panelTitle: p?.querySelector('[class*="panelTitle"]')?.textContent || null,
          }
        })
        if (panel.hasPanel) break
      }
    }
  }
  await page.screenshot({ path: path.join(outdir, '3-final.png') })

  // ---- 断言 ----
  const checks = {
    '宿主骨架 composerSeat': base.hasComposerSeat,
    '输入框存在': base.hasInput,
    'Context Doctor 控件(hero)': base.contextDoctor,
    ...(conv.checked ? {
      'Context Doctor 控件(会话)': conv.contextDoctor,
      'dsh-context 会话标签(对话/轨迹/上下文)': conv.tabs.filter(t => t === '上下文').length > 0,
    } : {}),
    ...(SEND ? {
      // panel:true fence 只发面板 dock 不做内联渲染；普通 fence 走内联渲染——
      // 两者任一出现即视为 genui 工作
      'genui fence/面板 渲染': panel.rendered === true || panel.hasPanel === true,
      'genui 面板出现': panel.hasPanel === true,
      'genui 面板宽度 ≤ 800px(对齐宿主)': panel.panelW != null && panel.panelW > 0 && panel.panelW <= 800,
      '面板宽 < 宿主座椅宽(非全宽)': panel.panelW != null && panel.seatW != null && panel.panelW < panel.seatW - 100,
    } : {}),
  }
  console.log('---- SWEEP RESULTS ----')
  for (const [k, v] of Object.entries(checks)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}  ${v ? '' : '(需人工核实)'}`)
  console.log(JSON.stringify({ url, base, conv, panel, outdir }, null, 2))
  const allPass = Object.values(checks).every(Boolean)
  console.log(allPass ? '[smoke] ALL PASS' : '[smoke] FAILURES PRESENT — 人工核实 screenshot 后决定是否放行')

  // 会话清理（发布通过后归档验证会话）
  if (CLEAN_SESSIONS) {
    const titles = CLEAN_SESSIONS.split(',').map(s => s.trim()).filter(Boolean)
    console.log(`[smoke] archiving ${titles.length} verification session(s)…`)
    for (const t of titles) console.log('[smoke] archive:', JSON.stringify(await archiveSession(page, t)))
  }
  await browser.close()

  // 截图清理
  if (CLEAN) {
    try {
      fs.rmSync(outdir, { recursive: true, force: true })
      console.log('[smoke] screenshots removed:', outdir)
    } catch (e) {
      console.log('[smoke] clean failed:', e.message)
    }
  }
})().catch(e => { console.error('FATAL', e); process.exit(1) })
