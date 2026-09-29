/**
 * 三处 Host 环境注入必须早于 `new DesktopHostProcess(...)`。
 *
 * 子进程的 environment 是**构造时的快照**：`host-process.ts` 把传入的 env 存成实例字段，
 * spawn 时原样使用、只补 `ELECTRON_RUN_AS_NODE`，不合并 live `process.env`。因此写在构造
 * 之后的赋值到不了 Host —— 症状是 MCP 条目全部自动停用（界面上没有任何 `mcp__*`）与
 * 隔离根里的历史会话整个看不见，且构造前 Host 若已重启过一次就侥幸生效，表现为时好时坏。
 *
 * 这条约束无法廉价地从行为上测（`main.ts` 是 Electron 主进程入口，整条启动链要拖起
 * Electron 与 Host 子进程），但它**完全由源码结构决定**，所以直接检查源码：每个
 * `backend.start(` 调用点都必须先经过 `prepareHostEnvironment()`。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const mainSource = readFileSync(
  fileURLToPath(new URL('../src/main.ts', import.meta.url)),
  'utf8',
)
const lines = mainSource.split('\n')

/** 一次调用的行号（1 起）与其前若干行拼成的上下文。 */
function callSites(pattern: RegExp, contextLines = 4): { line: number; context: string }[] {
  const sites: { line: number; context: string }[] = []
  for (const [index, text] of lines.entries()) {
    if (!pattern.test(text)) continue
    sites.push({
      line: index + 1,
      context: lines.slice(Math.max(0, index - contextLines), index + 1).join('\n'),
    })
  }
  return sites
}

describe('Host 环境注入的顺序', () => {
  it('每个 backend.start() 之前都已 await prepareHostEnvironment()', () => {
    // 注释里也会出现这个字符串，但它们不含调用特征（左括号后跟 `async (` 或 `()`）。
    const sites = callSites(/backend\.start\((?:async )?\(/)
    expect(sites.length).toBeGreaterThan(0)
    for (const site of sites) {
      expect(
        site.context.includes('prepareHostEnvironment'),
        `main.ts:${String(site.line)} 的 backend.start() 之前没有 prepareHostEnvironment()`,
      ).toBe(true)
    }
  })

  it('prepareHostEnvironment 在第一个 backend.start() 之前定义', () => {
    const definition = lines.findIndex(text => text.includes('const prepareHostEnvironment = '))
    expect(definition, 'main.ts 里找不到 prepareHostEnvironment 的定义').toBeGreaterThan(-1)
    const firstStart = lines.findIndex(text => /backend\.start\((?:async )?\(/.test(text))
    expect(firstStart).toBeGreaterThan(-1)
    expect(definition).toBeLessThan(firstStart)
  })

  it('三处注入都在 prepareHostEnvironment 的函数体内', () => {
    const definition = lines.findIndex(text => text.includes('const prepareHostEnvironment = '))
    // 函数体到下一个顶层 `const ` 或 `  }` 收尾为止；这里取足够宽的窗口即可覆盖三处调用。
    const body = lines.slice(definition, definition + 60).join('\n')
    for (const call of ['installSsidMcpEnv(', 'applySessionRootIsolation(', 'healWorkspaceRegistry(']) {
      expect(body.includes(call), `prepareHostEnvironment 里缺少 ${call}`).toBe(true)
    }
  })
})
