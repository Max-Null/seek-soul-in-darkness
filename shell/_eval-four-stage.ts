/**
 * M3 四阶段编排真实任务评测：
 * 预置一个两文件 TS 项目，给跨文件功能任务，驱动双星走完整四阶段
 * （研究→综合→实现→验证），记录子代理调用序列与最终状态。
 */
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootKernel } from './kernel.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { installModelSelection } from '@deepseek-ai/dsh-agent'

const LOG = new URL('./_eval-four-stage.log', import.meta.url)
const log = (line: string): void => {
  appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`)
  console.log(line)
}

// 预置初始项目（两文件，让任务真实跨文件）
function seedProject(root: string): void {
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'tests'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'calc-lib', type: 'module', private: true }, null, 2) + '\n')
  writeFileSync(join(root, 'src/calc.ts'), [
    'export function add(a: number, b: number): number { return a + b }',
    'export function subtract(a: number, b: number): number { return a - b }',
    'export function multiply(a: number, b: number): number { return a * b }',
    'export function divide(a: number, b: number): number { return a / b }',
    '',
  ].join('\n'))
  writeFileSync(join(root, 'src/format.ts'), [
    'export function formatNumber(value: number): string {',
    '  return value.toLocaleString("en-US")',
    '}',
    '',
  ].join('\n'))
  writeFileSync(join(root, 'tests/calc.test.ts'), [
    "import { test } from 'node:test'",
    "import assert from 'node:assert/strict'",
    "import { add, subtract, multiply, divide } from '../src/calc.ts'",
    '',
    "test('add', () => { assert.equal(add(1, 2), 3) })",
    "test('subtract', () => { assert.equal(subtract(5, 2), 3) })",
    "test('multiply', () => { assert.equal(multiply(3, 4), 12) })",
    "test('divide', () => { assert.equal(divide(10, 2), 5) })",
    '',
  ].join('\n'))
}

const TASK = [
  '这是一个跨文件功能任务，请按你的四阶段流程完整执行（研究→综合→实现→验证，不可跳过任何阶段）：',
  '',
  '给这个计算器库添加百分比能力：',
  '1. src/calc.ts 添加 percent(value, total) 函数（value/total*100，total 为 0 时返回 0）',
  '2. src/format.ts 添加 formatPercent(value)（百分比格式化，保留 1 位小数，如 12.5%）',
  '3. tests/ 添加对应测试并运行 node --test 验证通过',
  '',
  '阶段 2 的综合规格按你的习惯落盘到 docs/设计/ 下；阶段 3 让巧匠（subagent_artisan）实现；',
  '阶段 4 用明镜（subagent_strategist）审查巧匠的代码，并亲自 git diff 验证。',
].join('\n')

const kernel = await bootKernel()
const ctx = kernel.ctx
const workDir = mkdtempSync(join(tmpdir(), 'dsh-eval-fourstage-'))
seedProject(workDir)
log(`[four-stage] workDir=${workDir}`)

const defaultModel = ctx.get('agentDefaultModel')
const selection = defaultModel.currentSelection()

const handle = await ctx.agents.create({
  sessionId: SessionId(`eval-four-stage-${Date.now()}`),
  meta: { cwd: workDir },
  agentOptions: { provider: selection.provider, model: selection.model },
  setup: (agentCtx) => {
    installModelSelection(agentCtx, { current: selection, assembled: undefined })
    return ctx.agentPresets.mount(agentCtx, 'ssid-double-star').then(() => undefined)
  },
})

try {
  const agent = handle.agent
  await agent.whenIdle()
  const firstSeq = agent.session.seq
  log('task dispatched')
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: TASK }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()
  log('agent idle')

  // 汇总
  const subagentCalls: string[] = []
  for (const event of agent.session.events) {
    if (event.seq < firstSeq) continue
    if (event.type === 'tool/call' && event.data.name.startsWith('subagent')) {
      subagentCalls.push(event.data.name)
    }
  }
  log(`subagent call sequence: ${subagentCalls.join(' -> ')}`)

  for (const name of ['src/calc.ts', 'src/format.ts', 'tests/calc.test.ts', 'docs/设计/百分比功能-规格.md', 'docs/设计/percentage-spec.md']) {
    try {
      const content = readFileSync(join(workDir, name), 'utf8')
      log(`── ${name} ──\n${content.slice(0, 600)}`)
    } catch {
      log(`── ${name}: <absent>`)
    }
  }

  // 跑测试验证
  const { execSync } = await import('node:child_process')
  try {
    const out = execSync('node --test', { cwd: workDir, encoding: 'utf8', timeout: 60000 })
    log(`── tests ──\n${out.slice(0, 500)}`)
  } catch (cause) {
    const err = cause as { stdout?: string; stderr?: string }
    log(`── tests FAILED ──\n${(err.stdout ?? '') + (err.stderr ?? '').slice(0, 800)}`)
  }
} finally {
  await handle.dispose()
}
log('=== four-stage evaluation end ===')
await kernel.shutdown(0)
