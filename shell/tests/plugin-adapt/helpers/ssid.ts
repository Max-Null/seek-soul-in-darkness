import { chromium } from '@playwright/test'
import type { Browser, BrowserContext, ConsoleMessage, Page } from '@playwright/test'

/** SSiD dev 的 CDP 调试端点（Electron 远程调试端口，环境变量 SSID_CDP 覆盖）。 */
export const CDP_URL = process.env.SSID_CDP ?? 'http://127.0.0.1:9222'

export interface CapturedLog {
  readonly level: string
  readonly text: string
}

/**
 * 连接运行中的 SSiD dev（Electron 实例），不新开浏览器。
 * 用完必须 close()（对 CDP 连接而言即断开）。
 */
export async function connectSsid(): Promise<Browser> {
  return chromium.connectOverCDP(CDP_URL)
}

/**
 * 从 Electron 的多 target 中找出 DSH 内核页面：
 * 排除 file://（titlebar/splash）与插件页，优先 http(s) 主机页面。
 */
export function findDshPage(browser: Browser): Page {
  const context: BrowserContext | undefined = browser.contexts()[0]
  const pages = context?.pages() ?? []
  const httpPages = pages.filter((p) => /^http(s)?:\/\//.test(p.url()))
  const dsh = httpPages.find((p) => !/\/plugins?|mcp|about:/.test(p.url()))
  if (!dsh) throw new Error(`DSH 页面 target 未找到。pages=${pages.map((p) => p.url()).join(' | ')}`)
  return dsh
}

/** 注册 console/异常捕获（在导航前调用）；返回收集器数组。 */
export function captureConsole(page: Page): CapturedLog[] {
  const logs: CapturedLog[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      logs.push({ level: msg.type(), text: msg.text().slice(0, 400) })
    }
  })
  page.on('pageerror', (err) => logs.push({ level: 'exception', text: String(err).slice(0, 400) }))
  return logs
}
