/**
 * dsh-habit 端到端：boot → 模拟 3 次纠错信号 → 真实 flash 判断 →
 * 候选生成 → confirm → memory 写入 → 验证两级闸门闭环。
 */
import { appendFileSync } from 'node:fs'
import { bootKernel } from './kernel.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm'
import { installModelSelection } from '@deepseek-ai/dsh-agent'

const LOG = new URL('./_eval-habit.log', import.meta.url)
const log = (line: string): void => {
  appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`)
  console.log(line)
}

const kernel = await bootKernel()
const ctx = kernel.ctx
const habit = ctx.get('habit')
const memory = ctx.get('memory')
log(`habit service: ${habit ? 'PRESENT' : 'ABSENT'}`)
log(`memory service: ${memory ? 'PRESENT' : 'ABSENT'}`)

if (habit === undefined) {
  await kernel.shutdown(1)
  process.exit(1)
}

const defaultModel = ctx.get('agentDefaultModel')
const selection = defaultModel.currentSelection()
const handle = await ctx.agents.create({
  sessionId: SessionId(`ssid-habit-e2e-${Date.now()}`),
  agentOptions: { provider: selection.provider, model: selection.model },
  setup: (agentCtx) => {
    installModelSelection(agentCtx, { current: selection, assembled: undefined })
    return ctx.agentPresets.mount(agentCtx, 'ssid-double-star').then(() => undefined)
  },
})
try {
  const session = handle.agent.session
  const correction = '你再检查一下，提交前应该先跑一遍测试再交付'

  // 3 轮纠错信号（用户消息 + assistant 响应交替）
  for (let turn = 1; turn <= 3; turn += 1) {
    session.append('turn/start', { turn })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: correction }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    session.append('step/start', { turn, step: 1 })
    if (turn === 1) {
      session.append('request/header', {
        header: { config: { provider: selection.provider, model: selection.model } },
        reason: 'initial',
      })
    }
    session.append('assistant/message', {
      turn,
      step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: `好的，第 ${turn} 次检查，下次提交前先跑测试。` }],
        source: { provider: selection.provider, model: selection.model },
      }),
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn, step: 1 })
    session.append('turn/end', { turn, reason: { kind: 'completed' } })
  }

  log('3 轮纠错已注入，等待 flash 判断完成（turn/end 触发串行分析）…')
  // 等分析链完成（分析是异步串行的，最多等 60s）
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const candidates = habit.snapshot()
    if (candidates.some(c => c.status === 'pending')) break
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  const candidates = habit.snapshot()
  log(`候选数: ${candidates.length}`)
  for (const candidate of candidates) {
    log(`- [${candidate.status}] ${candidate.confidence} :: ${candidate.habit} (证据 ${candidate.evidenceCount} 条)`)
  }

  // 第一级闸门：确认候选 → 应写入 memory（suggested）
  const pending = candidates.find(c => c.status === 'pending')
  if (pending !== undefined) {
    const confirmed = habit.confirm(pending.id)
    log(`confirm 后状态: ${confirmed?.status}`)
    // 模拟壳层行为（main.mjs 的 IPC handler 做 remember）
    if (memory !== undefined) {
      await memory.remember({ content: `[习惯] ${pending.habit}` })
    }
    const memories = memory?.list?.() ?? []
    log(`memory 条数: ${memories.length}`)
    for (const record of memories) {
      log(`- [${record.status}] ${record.content.slice(0, 80)}`)
    }
  }
} finally {
  await handle.dispose()
}
log('=== habit e2e end ===')
await kernel.shutdown(0)
