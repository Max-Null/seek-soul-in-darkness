/**
 * SSiD 保活事件发布器（Host 侧）。
 *
 * 保活状态机在主进程（要 `powerSaveBlocker`），而 turn 事件在 Host 子进程里，
 * 所以这里只上报「一轮开始 / 一轮结束」这两个事实，判定留给状态机。
 *
 * **与通知的分道**（自建壳 `shell/main.mjs:1577-1582` 的同一条教训）：
 * 保活**任何** `turn/end` 都要递减计数，通知只在 `reason.kind === 'completed'`
 * 时播报。合并成一个「turn 结束了」的信号会让中断的回合漏减一次计数，保活就再也
 * 释放不掉（屏幕永远不息）。这也是本文件不复用 `ssid-notify.ts` 那条通道的原因。
 */

import type { Context } from '@deepseek-ai/cordis'
// declaration merging：这个包把 `turn/start` / `turn/end` 声明进 `SessionEventMap`，
// 不 import 则事件类型不可见。与 `ssid-notify.ts` 同因。
import type {} from '@deepseek-ai/dsh-session'

/** 保活状态机关心的两个事实。 */
export type SsidKeepAwakePhase = 'turnStart' | 'turnEnd'

/**
 * 注册保活事件源。
 * @param ctx - 已启动的 Desktop profile 上下文。
 * @param publish - 同步上报；主进程据此驱动 `noteTurnStart` / `noteTurnEnd`。
 */
export function installSsidKeepAwakePublisher(ctx: Context, publish: (phase: SsidKeepAwakePhase) => void): void {
  ctx.on('session/event', (_session, event) => {
    // 逐分支判断 `event.type`，不要先解构——`SessionEventMap` 靠 `type` 收窄。
    if (event.type === 'turn/start') { publish('turnStart'); return }
    if (event.type === 'turn/end') {
      // 无条件上报，不看 `reason.kind`：中断的回合也要递减，否则计数只加不减。
      publish('turnEnd')
    }
  })
}
