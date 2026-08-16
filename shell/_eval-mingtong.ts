/**
 * 明瞳（制图师）kimi-k3 端到端：boot → 双星委派明瞳读图 →
 * 子会话模型路由验证（moonshotai/kimi-k3）→ 转录内容验证。
 */
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bootKernel } from './kernel.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { installModelSelection } from '@deepseek-ai/dsh-agent'

const LOG = new URL('./_eval-mingtong.log', import.meta.url)
const log = (line: string): void => {
  appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`)
  console.log(line)
}

const shellDir = fileURLToPath(new URL('.', import.meta.url))
const IMAGE = '_mingtong-test.png'
/** 图中文字（测试图由 PowerShell System.Drawing 生成）。 */
const EXPECTED = 'SSID MINGTONG E2E 42'

const kernel = await bootKernel()
const ctx = kernel.ctx
const selection = ctx.get('agentDefaultModel').currentSelection()
const handle = await ctx.agents.create({
  sessionId: SessionId(`ssid-mingtong-e2e-${Date.now()}`),
  meta: { cwd: shellDir },
  agentOptions: { provider: selection.provider, model: selection.model },
  setup: (agentCtx) => {
    installModelSelection(agentCtx, { current: selection, assembled: undefined })
    return ctx.agentPresets.mount(agentCtx, 'ssid-double-star').then(() => undefined)
  },
})
let childRouted = false

/** 诊断输出：子会话模型路由 + 双星最终回复（超时路径也调用）。 */
async function report(parentId: SessionId): Promise<void> {
  // 1) 子会话模型路由：明瞳子会话的 request/header 必须是 moonshotai/kimi-k3
  const children = await ctx.subagents.listChildren(parentId)
  log(`子会话数: ${children.length}`)
  for (const child of children) {
    if (child.kind === 'diagnostic') {
      log(`- [diagnostic:${child.reason}] ${String(child.id)}`)
      continue
    }
    log(`- ${String(child.id)} — ${child.label}`)
    const inspection = await ctx.sessionPersistence.load(child.id)
    for (const event of inspection.events) {
      if (event.type === 'request/header') {
        const config = event.data.header.config as { provider?: string, model?: string }
        log(`  请求路由: provider=${config.provider ?? ''} model=${config.model ?? ''}`)
        if (config.provider === 'moonshotai-cn' && config.model === 'kimi-k3') childRouted = true
      }
    }
  }

  // 2) 双星最终回复里必须带明瞳的转录结论
  const parentInspection = await ctx.sessionPersistence.inspect(parentId)
  const assistants = parentInspection.events.filter(event => event.type === 'assistant/message')
  const last = assistants[assistants.length - 1]
  const parts = last.data.message.content as Array<{ type: string, text?: string }>
  const text = parts.map(part => part.type === 'text' ? part.text ?? '' : `[${part.type}]`).join('\n')
  log('双星最终回复（前 600 字）:')
  log(text.slice(0, 600))
  log(`转录验证: ${text.includes(EXPECTED) ? 'PASS' : 'FAIL'}`)

  log(`模型路由: ${childRouted ? 'PASS (moonshotai-cn/kimi-k3)' : 'FAIL'}`)
}

try {
  const parentId = handle.agent.id
  await handle.agent.followup(createUserMessage({
    content: [{
      type: 'text',
      text: `调用 subagent_cartographer（明瞳）分析工作目录下的图片文件 ${IMAGE}：`
        + '逐字转录图中全部文字，并描述图片布局与配色。完成后把明瞳的结论原样转述，不要自己看图。'
        + '如果委派失败，直接把失败原因写进你的回复即可，不要调用 ask_user_question 提问。',
    }],
    source: { kind: 'user' },
  }))
  log('双星已收到委派任务，等待完成（含明瞳 kimi-k3 真实调用）…')
  try {
    // 双星推理 + 明瞳调用，最多等 5 分钟
    await Promise.race([
      handle.agent.whenIdle(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('等待超时（5 分钟）')), 300_000)),
    ])
  } catch (error) {
    log(`whenIdle 异常: ${error instanceof Error ? error.message : String(error)}`)
  }
  await report(parentId)
} finally {
  await handle.dispose()
}
log('=== mingtong e2e end ===')
await kernel.shutdown(0)
