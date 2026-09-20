/**
 * 保活状态机：把「此刻该不该阻止系统息屏/睡眠」从 Electron 里剥出来。
 *
 * 剥出来的理由是**可测**：真正的风险全在状态转移上，而它们在真实环境里几乎
 * 构造不出来——要凑齐并发 turn、丢事件、乱序结束、配置中途关闭这些序列，靠
 * 手点界面是碰运气。这里只留纯逻辑，副作用（开关 blocker、读配置、计时）全部
 * 由调用方注入，测试即可直接编排序列。
 *
 * 三个持有来源各自独立，**任一需要就持有**：
 *   1. 执行中的 turn——多会话可并发，所以是**计数**而不是布尔；
 *   2. 遮罩开启——屏幕黑了挂着的提示也就白挂了；
 *   3. turn 全部结束后的**尾巴**窗口——目标模式的连续轮次之间有缝隙，没有尾巴
 *      会在缝隙里释放又立刻重开。
 *
 * @module shell/lib/keep-awake
 */

/**
 * 建一个保活状态机。
 *
 * @param {object} deps 注入的副作用。生产环境传 Electron 的 powerSaveBlocker
 *   与真实的 notify.json 读取；测试传记录器与假定时器。
 * @param {() => number} deps.start 打开持有，返回 blocker id。
 * @param {(id: number) => void} deps.stop 关闭指定持有。
 * @param {() => { keepAwake?: unknown, keepAwakeTailMs?: unknown }} deps.readConfig
 *   每次判定时重读配置——用户可能中途改文件，缓存住会让开关看起来失灵。
 * @param {(text: string) => void} [deps.log] 落日志钩子（省略则静默）。
 * @param {typeof setTimeout} [deps.setTimer] 定时器（测试注入假实现）。
 * @param {typeof clearTimeout} [deps.clearTimer]
 * @returns 状态机的对外接口。
 */
export function createKeepAwake({ start, stop, readConfig, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let turns = 0
  let mask = false
  let blockerId = null
  let tailTimer = null

  /** 纯状态判据：不看配置，只看有没有持有来源。 */
  const held = () => mask || turns > 0 || tailTimer !== null

  const clearTail = () => {
    if (tailTimer !== null) { clearTimer(tailTimer); tailTimer = null }
  }

  /**
   * 把 blocker 的实际状态对齐到「当前是否需要」——**唯一**改动 blocker 的地方。
   * 其余方法只改状态、然后调它，避免出现两处各自决定开关的分叉。
   */
  const sync = () => {
    // 配置关闭时一律释放。少了这一句，尾巴定时器到期时会重新判定为「需要」
    // 并把 blocker 又打开——用户关掉开关却依然不息屏。
    const want = readConfig().keepAwake === true && held()
    if (want && blockerId === null) {
      blockerId = start()
      log(`keep-awake ON id=${blockerId} turns=${turns} mask=${mask}\n`)
    } else if (!want && blockerId !== null) {
      stop(blockerId)
      log(`keep-awake off id=${blockerId}\n`)
      blockerId = null
    }
  }

  return {
    /** 一轮开始：计数 +1，并撤掉尾巴（连续轮次之间不闪断）。 */
    noteTurnStart() {
      turns += 1
      clearTail()
      sync()
    },
    /**
     * 一轮结束：计数 -1。**调用方必须无条件调用本方法**——不要先用
     * 「reasonKind === 'completed'」之类的条件把它挡掉，也不要因为
     * 「没记到对应的 start」就跳过：漏减一次，保活就再也释放不掉。
     */
    noteTurnEnd() {
      turns = Math.max(0, turns - 1)
      if (turns > 0) { sync(); return }
      const tailMs = Math.max(0, Number(readConfig().keepAwakeTailMs) || 0)
      clearTail()
      if (tailMs > 0) {
        tailTimer = setTimer(() => { tailTimer = null; sync() }, tailMs)
      }
      sync()
    },
    /** 遮罩开关。与 turn 计数正交：关遮罩不该释放还在跑的 turn。 */
    setMask(on) {
      mask = on === true
      sync()
    },
    /**
     * 异常路径释放执行侧持有（内核退出等）：清零计数与尾巴，不等尾巴走完。
     * 遮罩持有**不动**——它与执行无关。
     * @param {string} why 释放原因，落进日志便于回溯。
     */
    releaseTurns(why) {
      clearTail()
      turns = 0
      sync()
      log(`keep-awake turns released (${why})\n`)
    },
    /** 当前内部状态快照（测试与诊断用）。 */
    snapshot: () => ({ turns, mask, holding: blockerId !== null, tail: tailTimer !== null }),
  }
}
