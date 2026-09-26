/**
 * 保活状态机：把「此刻该不该阻止系统息屏/睡眠」从 Electron 里剥出来。
 *
 * 剥出来的理由是**可测**：真正的风险全在状态转移上，而它们在真实环境里几乎
 * 构造不出来——要凑齐并发 turn、丢事件、乱序结束、配置中途关闭这些序列，靠
 * 手点界面是碰运气。这里只留纯逻辑，副作用（开关 blocker、读配置、计时）全部
 * 由调用方注入。
 *
 * 三个持有来源各自独立，**任一需要就持有**：
 *   1. 执行中的 turn——多会话可并发，所以是**计数**而不是布尔；
 *   2. 遮罩开启——屏幕黑了挂着的提示也就白挂了；
 *   3. turn 全部结束后的**尾巴**窗口——目标模式的连续轮次之间有缝隙，没有尾巴
 *      会在缝隙里释放又立刻重开。
 *
 * 与自建壳 `shell/lib/keep-awake.mjs` 逐条同源（含九条单测覆盖的状态转移）。
 *
 * 分进程差异：自建壳在**同一个进程**里订阅内核 `session/event`，这里的事件来自
 * Host 子进程经 IPC 上报（见 `apps/desktop-host/src/ssid-keep-awake.ts`）。
 * 状态机本身不知道这个差别——它只收 `noteTurnStart` / `noteTurnEnd`。
 */

import { readFileSync } from 'node:fs'
import { ssidNotifyConfigPath } from './notify.ts'

/** 保活相关配置；字段与 `~/.ssid/notify.json` 对应（与通知共用一份配置）。 */
export interface KeepAwakeConfig {
  /** 总开关；缺省/未写视为关。 */
  readonly keepAwake?: unknown
  /** 一轮结束后仍保持多久（覆盖目标模式的轮次空隙）。 */
  readonly keepAwakeTailMs?: unknown
}

/**
 * 读保活配置。
 *
 * 与通知共用 `notify.json`（路径解析交给 {@link ssidNotifyConfigPath}，所以
 * `SSID_NOTIFY_CONFIG` 的隔离覆盖对两者同时生效）。读取失败返回空对象 ——
 * `keepAwake` 不是 `true` 即视为关，与自建壳同一条判据（开关默认关，用户显式打开才保活）。
 * @returns 保活字段；文件不存在或损坏时为空。
 */
export function readKeepAwakeConfig(): KeepAwakeConfig {
  try {
    const parsed = JSON.parse(readFileSync(ssidNotifyConfigPath(), 'utf8')) as Record<string, unknown>
    return { keepAwake: parsed['keepAwake'], keepAwakeTailMs: parsed['keepAwakeTailMs'] }
  } catch {
    return {}
  }
}

/** 状态机的注入副作用。 */
export interface KeepAwakeDeps {
  /** 打开持有，返回 blocker id。 */
  readonly start: () => number
  /** 关闭指定持有。 */
  readonly stop: (id: number) => void
  /** 每次判定时重读配置——用户可能中途改文件，缓存住会让开关看起来失灵。 */
  readonly readConfig: () => KeepAwakeConfig
  /** 落日志钩子（省略则静默）。 */
  readonly log?: (text: string) => void
  /** 定时器（测试注入假实现）。 */
  readonly setTimer?: typeof setTimeout
  /** 清除定时器。 */
  readonly clearTimer?: typeof clearTimeout
}

/** 状态机的对外接口。 */
export interface KeepAwake {
  /** 一轮开始：计数 +1，并撤掉尾巴（连续轮次之间不闪断）。 */
  noteTurnStart: () => void
  /** 一轮结束：计数 -1。**调用方必须无条件调用**，见实现注释。 */
  noteTurnEnd: () => void
  /** 遮罩开关。与 turn 计数正交：关遮罩不该释放还在跑的 turn。 */
  setMask: (on: boolean) => void
  /** 异常路径释放执行侧持有（宿主退出等）：清零计数与尾巴，不等尾巴走完。 */
  releaseTurns: (why: string) => void
  /** 当前内部状态快照（诊断用）。 */
  snapshot: () => { turns: number; mask: boolean; holding: boolean; tail: boolean }
}

/**
 * 建一个保活状态机。
 * @param deps - 注入的副作用；生产环境传 Electron 的 `powerSaveBlocker` 与真实的配置文件读取。
 * @returns 状态机的对外接口。
 */
export function createKeepAwake(deps: KeepAwakeDeps): KeepAwake {
  const { start, stop, readConfig, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = deps
  let turns = 0
  let mask = false
  let blockerId: number | null = null
  let tailTimer: ReturnType<typeof setTimeout> | null = null

  /** 纯状态判据：不看配置，只看有没有持有来源。 */
  const held = (): boolean => mask || turns > 0 || tailTimer !== null

  const clearTail = (): void => {
    if (tailTimer !== null) { clearTimer(tailTimer); tailTimer = null }
  }

  /**
   * 把 blocker 的实际状态对齐到「当前是否需要」——**唯一**改动 blocker 的地方。
   * 其余方法只改状态、然后调它，避免出现两处各自决定开关的分叉。
   */
  const sync = (): void => {
    // 配置关闭时一律释放。少了这一句，尾巴定时器到期时会重新判定为「需要」
    // 并把 blocker 又打开——用户关掉开关却依然不息屏。
    const want = readConfig().keepAwake === true && held()
    if (want && blockerId === null) {
      blockerId = start()
      log(`keep-awake ON id=${String(blockerId)} turns=${String(turns)} mask=${String(mask)}\n`)
    } else if (!want && blockerId !== null) {
      stop(blockerId)
      log(`keep-awake off id=${String(blockerId)}\n`)
      blockerId = null
    }
  }

  return {
    noteTurnStart(): void {
      turns += 1
      clearTail()
      sync()
    },
    noteTurnEnd(): void {
      turns = Math.max(0, turns - 1)
      if (turns > 0) { sync(); return }
      const tailMs = Math.max(0, Number(readConfig().keepAwakeTailMs) || 0)
      clearTail()
      if (tailMs > 0) {
        tailTimer = setTimer(() => { tailTimer = null; sync() }, tailMs)
      }
      sync()
    },
    setMask(on: boolean): void {
      mask = on === true
      sync()
    },
    releaseTurns(why: string): void {
      clearTail()
      turns = 0
      sync()
      log(`keep-awake turns released (${why})\n`)
    },
    snapshot: () => ({ turns, mask, holding: blockerId !== null, tail: tailTimer !== null }),
  }
}
