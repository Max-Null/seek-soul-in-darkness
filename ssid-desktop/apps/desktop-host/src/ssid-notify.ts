/** SSiD 通知发布器：把 DSH 会话事件转发给 Electron 壳，由壳投递为 Windows 原生通知。 */

import type { Context } from '@deepseek-ai/cordis'
// declaration merging：这三个包各自把事件与服务声明进 `Context` / `SessionEventMap`，
// 不 import 则类型不可见——`turn/end` 在 dsh-session、`approval/asked` 在 dsh-user-approval、
// `ctx.userQuestions` 在 dsh-user-questions。与 desktop-host/src/index.ts 的三个 import 同因。
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'

/** 一个通知场景。与思灵壳 `~/.ssid/notify.json` 的字段名一致（`enabled` 是总开关，不在此列）。 */
export type SsidNotifyScene = 'replyDone' | 'approval' | 'question'

/** 交给壳的一条通知事实；判定与渲染都留给壳，Host 只报"发生了什么"。 */
export interface SsidNotifyEvent {
  readonly scene: SsidNotifyScene
  /** 授权申请场景下的工具名。 */
  readonly toolName?: string
  /** 会话完成场景下的回合起点（毫秒）。 */
  readonly startedAt?: number
  /** 会话完成场景下的回合终点（毫秒）。 */
  readonly endedAt?: number
}

/**
 * 注册 SSiD 通知事件源。
 *
 * `turn/end` 与 `approval/asked` 走 `session/event`；「AI 提问」没有对应的会话事件
 * （提问是纯服务调用），只能包装 `userQuestions.ask`——这也是思灵壳在
 * `shell/main.mjs:1629-1635` 采用同一手段的原因。
 * @param ctx - 已启动的 Desktop profile 上下文。
 * @param publish - 同步投递；壳侧负责失焦抑制与文案。
 */
export function installSsidNotifyPublisher(ctx: Context, publish: (event: SsidNotifyEvent) => void): void {
  const turnStarts = new Map<string, number>()
  ctx.on('session/event', (_session, event) => {
    // 逐分支判断 `event.type` 而不是先解构出 type/data：`SessionEventMap` 的成员靠 `type` 收窄，
    // 提前解构会让 `event.data` 退化成全部事件 data 的并集。
    if (event.type === 'turn/start') {
      turnStarts.set(String(event.data.turn), event.time)
      return
    }
    if (event.type === 'turn/end') {
      // 只有正常完成才通知；中断的回合不打扰用户。
      if (event.data.reason.kind !== 'completed') return
      const key = String(event.data.turn)
      const start = turnStarts.get(key)
      turnStarts.delete(key)
      if (start === undefined) return
      publish({ scene: 'replyDone', startedAt: start, endedAt: event.time })
      return
    }
    if (event.type === 'approval/asked') {
      publish({ scene: 'approval', toolName: event.data.toolName })
    }
  })
  ctx.inject(['userQuestions'], (questionCtx) => {
    const questions = questionCtx.userQuestions as { ask?: (request: unknown) => Promise<unknown> } | undefined
    if (questions === undefined || typeof questions.ask !== 'function') return
    const original = questions.ask.bind(questions)
    questionCtx.effect(() => {
      questions.ask = async (request: unknown) => {
        // 在 ask() 之前上报：此刻还不知道要问什么，所以文案不含问题内容。
        publish({ scene: 'question' })
        return original(request)
      }
      return () => { questions.ask = original }
    })
  })
}
